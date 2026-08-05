const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "/.env")
});
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Device = require("./models/Device");
const net = require("net");
const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const SensorReading = require("./models/SensorReading");
const thresholds = require("./thresholds");
const fs = require("fs");
const axios = require('axios');
const { spawn } = require('child_process');
const WebSocket = require('ws');


const { startImageSimulator } = require("./imageSimulator.js");

startImageSimulator();



const atsRuntime = require("./ATS/atsRuntime");

const logFile = path.join(
  require("os").homedir(),
  "Desktop",
  "server-start.log"
);

fs.appendFileSync(
  path.join(require("os").homedir(), "Desktop", "server-start.log"),
  "server_ats.js started\n"
);

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 5000;
const TCP_PORT = process.env.TCP_PORT || 4000;
// const connectedDevices = new Map();
// In-memory latest readings cache (global)
let latestReadings = [];
app.use(bodyParser.json());
const cors = require("cors");
const { isDeepStrictEqual } = require("util");
const { runTests } = require("./ATS/atsRunner");
const { reportWriter } = require("./ATS/reportWriter");
app.use(cors());

// ======= LOGS =======
const FAN = false

// ======= LOGS =======


process.on("uncaughtException", (err) => {
  fs.appendFileSync(
    path.join(require("os").homedir(), "Desktop", "startup-error.log"),
    "\n=== UNCAUGHT EXCEPTION ===\n" +
    err.stack +
    "\n"
  );
});

process.on("unhandledRejection", (err) => {
  fs.appendFileSync(
    path.join(require("os").homedir(), "Desktop", "startup-error.log"),
    "\n=== UNHANDLED REJECTION ===\n" +
    (err?.stack || err) +
    "\n"
  );
});

// WebSocket Server
const WS_PORT = process.env.WS_PORT || 8080;
const wss = new WebSocket.Server({ port: WS_PORT });
const wsClients = new Set();
// let pendingDialogResolver = null;  // Resolves when frontend responds to dialog

// WEBSOCKET CONNECTION HANDLING
wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket client connected from:', req.socket.remoteAddress);
  fs.appendFileSync(logFile, "Websocket connected\n");
  wsClients.add(ws);

  // Send immediate welcome message
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'WebSocket connected successfully',
    timestamp: getFormattedDateTime(),
    clientsCount: wsClients.size
  }));

  // Send current connected devices status
  ws.send(JSON.stringify({
    type: 'DEVICES_STATUS',
    data: {
      connectedDevices: Array.from(atsRuntime.connectedDevices.keys()),
      timestamp: getFormattedDateTime()
    }
  }));

  // Handle messages from frontend (dialog responses)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('📨 WebSocket message received:', message);

      if (message.type === 'DIALOG_RESPONSE') {
        if (typeof message.confirmed === 'boolean') {
          console.log(`📝 Dialog response: ${message.confirmed ? 'OK' : 'Cancel'}`);
          atsRuntime.resolveDialog(message.confirmed);
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    wsClients.delete(ws);
  });
});

wss.on('listening', () => {
  console.log(`✅ WebSocket server running on port ${WS_PORT}`);
  fs.appendFileSync(logFile, "Websocket server running\n");
});

// WEBSOCKET BROADCAST FUNCTION
function broadcastToWebClients(reading) {
  const message = JSON.stringify({
    type: 'NEW_READING',
    data: reading,
    timestamp: getFormattedDateTime()
  });

  let successfulSends = 0;
  let failedSends = 0;

  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        successfulSends++;
      } catch (err) {
        console.error('Failed to send to WebSocket client:', err);
        failedSends++;
        wsClients.delete(client);
      }
    }
  });

  // Log broadcasting stats occasionally
  if (Math.random() < 0.01) { // ~1% of the time
    console.log(`📊 WebSocket: ${successfulSends} sent, ${failedSends} failed, ${wsClients.size} total clients`);
  }
}

// BROADCAST TEST STATUS/PROGRESS TO WEB CLIENT
function broadcastTestStatus(payload) {
  const message = JSON.stringify(payload);

  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error('Failed to send TEST_STATUS:', err);
        wsClients.delete(client);
      }
    }
  });
}

// WebSocket status monitoring
setInterval(() => {
  if (wsClients.size > 0) {
    console.log(`🔌 WebSocket Status: ${wsClients.size} active clients`);
  }
}, 30000); // Every 30 seconds

fs.appendFileSync(logFile, "started backend \n");

// ===================== DEBUG SYSTEM =====================
const debug = {
  enabled: true,
  lastPacketTime: null,
  packetCount: 0,
  errorCount: 0,
  bufferStats: {
    totalBytes: 0,
    discardedBytes: 0,
    malformedPackets: 0
  },

  log: (message, context = '') => {
    if (!debug.enabled) return;
    const timestamp = getFormattedDateTime();
    console.log(`🔍 [${timestamp}] ${message}`, context ? `| ${context}` : '');
  },

  error: (message, error = null) => {
    const timestamp = getFormattedDateTime();
    console.log(`❌ [${timestamp}] ${message}`, error ? `| Error: ${error.message}` : '');
    debug.errorCount++;
  },

  stats: () => {
    const now = new Date();
    const uptime = process.uptime();
    const stats = {
      serverTime: getFormattedDateTime(),
      upTime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      packetReceived: debug.packetCount,
      errors: debug.errorCount,
      lastPacket: debug.lastPacketTime ? `${Math.floor((now - debug.lastPacketTime) / 1000)}s ago` : 'Never',
      bufferStats: debug.bufferStats,
      connectedDevices: atsRuntime.connectedDevices.size,
      latestReadingsCount: latestReadings ? latestReadings.length : 0,
      websocketClients: wsClients.size,
      dateFunction: "getFormattedDateTime() working ✅"
    };
    console.log('📊 DEBUG STATS:', JSON.stringify(stats, null, 2));
    return stats;
  },

  healthCheck: () => {
    const issues = [];

    if (!debug.lastPacketTime) {
      issues.push("No Packets Received yet");
    } else {
      const timeSinceLastPacket = Date.now() - debug.lastPacketTime;
      if (timeSinceLastPacket > 30000) {
        issues.push(`No Packets for ${timeSinceLastPacket / 1000}s`);
      }
    }

    if (debug.errorCount > 10) {
      issues.push("High error count");
    }

    if (debug.bufferStats.malformedPackets > debug.packetCount * 0.5) {
      issues.push("High malformed packet rate");
    }

    return {
      status: issues.length === 0 ? "HEALTHY" : "ISSUES",
      serverTime: getFormattedDateTime(),
      issues: issues
    };
  }
};


// 🔌 DB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err.message));

fs.appendFileSync(logFile, "Mongo connected\n");




// ===================== HTTP API Endpoints (unchanged) =====================
/* When a GET request is made to "/ping", it will attempt to ping the MongoDB database using Mongoose. 
   If the ping is successful, it will respond with "pong". If the ping fails, it will log an error message and
   respond with "MongoDB unreachable" along with a status code of 500. 
*/
app.get("/ping", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.send("pong");
  } catch (e) {
    console.error("⚠️ /ping DB check failed:", e.message);
    res.status(500).send("MongoDB unreachable");
  }
});

// WebSocket test endpoint
app.get("/api/websocket-test", (req, res) => {
  const wsStatus = {
    websocketServer: {
      port: WS_PORT,
      clients: wsClients.size,
      status: 'RUNNING',
      // clientSize: wsClients.size
    },
    httpServer: {
      port: 5000,
      status: 'RUNNING'
    },
    tcpServer: {
      port: 4000,
      status: 'RUNNING'
    },
    timestamp: getFormattedDateTime()
  };

  res.json(wsStatus);
});

// ✅ Login route (admin hardcoded via .env)
/* It is checking if the provided username and password in the request body match the admin username and password stored in the
   environment variables. If the credentials match, it generates a JSON Web Token (JWT) with the
   username "admin" and role "admin" and sends it back in the response along with the role "admin". 
*/
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  // Admin login
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      { username: "admin", role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    return res.json({ role: "admin", token });
  }

  // User login from DB
  const user = await User.findOne({ username: username });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ role: user.role, token }); // ✅ return role and token
});

// ✅ Get registered device metadata
app.get("/api/devices-info", async (req, res) => {
  try {
    const devices = await Device.find();
    const normalizedDevices = devices.map(device => ({
      ...device._doc,
      mac: String(device.mac).toLowerCase()
    }));
    res.json(normalizedDevices);
  } catch (err) {
    res.status(500).json({ error: "Error fetching devices" });
  }
});

// ✅ Command endpoint
app.post("/command", (req, res) => {
  const { mac, command } = req.body;
  if (!mac || !command) return res.status(400).json({ message: 'mac and command required' });
  const normalizedMac = String(mac).toLowerCase();
  const device = atsRuntime.connectedDevices.get(normalizedMac);

  if (!device || device.destroyed) {
    atsRuntime.connectedDevices.delete(normalizedMac);
    // atsRuntime.connectedDevices.delete(socket.deviceId);
    return res.status(404).json({ message: `Device ${normalizedMac} not connected` });
  }

  const buffer = Buffer.from(command, "utf-8");
  // deviceSocket.write(buffer, (err) => {
  device.socket.write(buffer, (err) => {
    if (err) {
      console.error(`Failed to send command to ${normalizedMac}:`, err.message);
      return res.status(500).json({ message: `Error sending command to ${normalizedMac}` });
    }
    console.log(`Sent command "${command}" to ${normalizedMac}`);
    res.json({ message: `Command sent to ${normalizedMac}` });
  });
});

// ✅ Get connected MACs
app.get("/api/devices", (req, res) => {
  try {
    res.json(Array.from(atsRuntime.connectedDevices.keys()).map((m) => String(m).toLowerCase()));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list connected devices' });
  }
});

// ✅ Get last 100 readings
app.get("/api/readings", async (req, res) => {
  try {
    // Return latest in-memory readings (no DB persistence during real-time testing)
    const out = [...latestReadings].slice(-400).reverse();
    res.json(out);
  } catch (error) {
    console.error("Error fetching readings:", error);
    res.status(500).json({ error: "Failed to fetch readings" });
  }
});

// ✅ Get latest reading by MAC
app.get("/api/device/:mac", async (req, res) => {
  try {
    const mac = String(req.params.mac).toLowerCase();
    const latest = [...latestReadings].slice().reverse().find(r => r.mac === mac);
    if (!latest) return res.status(404).json({ message: "No data found" });
    res.json(latest);
  } catch (err) {
    console.error("Error fetching device data:", err.message);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// ✅ Get logs saved in PC
app.post("/api/log-command", (req, res) => {
  console.log("Log API Called");
  const { date, mac, command, status, message } = req.body;

  console.log(date, mac, command, status, message);

  const now = new Date();
  const fileName = `${now.getDate()}_${now.getMonth() + 1
    }_${now.getHours()}.out`;
  const logDir = "C:/CommandLogs/out";

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const filePath = path.join(logDir, fileName);
  const timestamp = now.toLocaleString();
  const logEntry = `[${timestamp}] | MAC:${mac} | ${status}  | COMMAND:"${command}" | MESSAGE:"${message}"\n`;

  res.json({ message: "Log received" });

  fs.appendFile(filePath, logEntry, (err) => {
    if (err) {
      console.error("Failed to save log:", err);
    } else {
      console.log(`✅ Log saved: ${filePath}`);
    }
  });
});


// ✅ Serve snapshot images
app.get("/api/snapshots/:imageName", (req, res) => {
  const imageName = req.params.imageName;

  const rawMac = req.query.mac;
  const macSuffix = rawMac.slice(8).replace(/[. ]/g, "_"); // Gets characters 9-16 

  const imagePath = path.join(`C:/snaps/${macSuffix}`, imageName);

  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: "Image not found" });
  }

  res.sendFile(imagePath);
});

// ✅ Get list of available snapshots
app.get("/api/snapshots", (req, res) => {
  const snapshotsOutputDir = "C:/snaps";

  try {
    const rawMac = req.query.mac;

    // Validate MAC address exists
    if (!rawMac) {
      return res.status(400).json({ error: "MAC address is required" });
    }

    const macSuffix = rawMac.slice(8).replace(/[. ]/g, "_"); // Gets characters 9-16 (0-indexed)
    const snapshotsDir = `${snapshotsOutputDir}/${macSuffix}`;

    let files = [];
    try {
      files = fs
        .readdirSync(snapshotsDir)
        .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
        // Sorting images in descending order based on timestamp in filename
        .sort((a, b) => {
          // Extract YYMMDDHHMMSS format for comparison
          const getKey = (filename) => {
            const match = filename.match(/_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\./);
            return match ? match[3] + match[2] + match[1] + match[4] + match[5] + match[6] : '0';
          };
          return getKey(b).localeCompare(getKey(a));
        })
        .slice(0, 15); // Get last 15 images
      console.log("snapshots: ", files)
    } catch (dirErr) {

      console.error("Snapshots directory not found or error reading:", dirErr.message);
      // Return empty array if directory not found
      files = [];
    }
    res.json(files);
  } catch (err) {
    console.error("Error reading snapshots:", err);
    res.status(500).json({ error: "Failed to read snapshots" });
  }
});

app.get("/api/thresholds", (req, res) => {
  res.json(thresholds);
});


function getIMoniTestDir(testLevel) {
  if (testLevel === "green-pcb") {
    return path.join(__dirname, "tests/iMoni/green-pcb");
  }

  return path.join(__dirname, "tests/iMoni/full-controller");
}


// ✅ List all available test files (COMMENTED OUT - uncomment if needed in future)
app.get("/api/tests/list", async (req, res) => {
  const testDir = path.join(__dirname, "tests");

  try {
    const files = await fs.promises.readdir(testDir);
    const testFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.srv'].includes(ext);
    });

    res.json({
      testDirectory: testDir,
      availableTests: testFiles,
      count: testFiles.length,
      timestamp: getFormattedDateTime()
    });
  } catch (err) {
    console.error("❌ Error listing tests:", err.message);
    res.status(500).json({ error: `Failed to list tests: ${err.message}` });
  }
});

// ✅ Run a single test file (COMMENTED OUT - uncomment if needed in future)
app.post("/api/tests/run", async (req, res) => {
  console.log("▶️ /api/tests/run endpoint called");

  let {
    mac: selectedMac,
    selectedTests,
    controllerId,
    unitSerialNo,
    cpuSrNo,
    basePcbSrNo,
    cameraSrNo,
    psuSrNo,
    generateReport,
    testLevel = "green-pcb"
  } = req.body;
  console.log("Requested test file:", selectedTests);
  console.log(cpuSrNo)
  console.log(basePcbSrNo)
  console.log(cameraSrNo)
  console.log(psuSrNo)

  if (!selectedTests || selectedTests.length === 0) {
    return res.status(400).json({ error: "selectedTests is required" });
  }

  console.log("Test File passed: ", selectedTests);

  // Normalize to array
  if (!Array.isArray(selectedTests)) {
    selectedTests = [selectedTests];
  }

  // const testPath = path.join(__dirname, "tests/iMoni", selectedTests);
  // const baseDir = path.join(__dirname, "tests/iMoni");
  const baseDir = getIMoniTestDir(testLevel);


  // // Prevent path traversal
  // if (!path.normalize(testPath).startsWith(baseDir)) {
  //   return res.status(400).json({ error: "Invalid test file path" });
  // }

  // // Check if file exists
  // if (!fs.existsSync(testPath)) {
  //   return res.status(404).json({
  //     error: "Test file not found",
  //     path: testPath,
  //     timestamp: getFormattedDateTime()
  //   });
  // }

  // console.log(`Running test file: ${testPath}`);

  // Validate filenames only
  for (const testFile of selectedTests) {
    const resolvedPath = path.join(baseDir, testFile);
    console.log("Resolved Path: ", resolvedPath);
    if (!resolvedPath.startsWith(baseDir)) {
      return res.status(400).json({ error: "Invalid test file path" });
    }
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Test file not found: ${testFile}` });
    }
  }

  try {
    console.log("Starting test execution... \nIn runTests function");
    atsRuntime.resetStop();
    const testResult = await runTests({
      testFiles: selectedTests,
      onStatus: broadcastTestStatus,
      testLevel,
      testDir: baseDir
    });

    console.log("Test execution completed.", testResult);

    // const runResult = {
    //   testResult,
    //   destination: "iMoni",
    //   mac
    // };

    const firstMac = Array.from(atsRuntime.connectedDevices.keys())[0] || 'unknown-device';

    await reportWriter({
      runResult: testResult,
      destination: "iMoni",
      mac: firstMac,
      deviceId: controllerId,
      unitSerialNo,
      cpuSrNo,
      basePcbSrNo,
      cameraSrNo,
      psuSrNo,
      generateReport,
      testLevel
    });


    res.json({
      timestamp: getFormattedDateTime(),
      ...testResult
    });
  } catch (err) {
    console.error("❌ Error running tests:", err.message, err.stack);
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Test file not found" });
    }
    if (err.code === "EISDIR") {
      return res.status(400).json({ error: "Path is a directory" });
    }
    res.status(500).json({ error: `Failed to run tests: ${err.message} \n${err.stack}` });
  }
});

// ✅ STOP TEST EXECUTION
app.post("/api/tests/stop", (req, res) => {
  console.log("🛑 /api/tests/stop endpoint called");
  atsRuntime.requestStop();

  // Broadcast stop message to all WebSocket clients
  broadcastTestStatus({
    type: 'TESTS_STOPPED',
    message: 'Tests stopped by user',
    timestamp: getFormattedDateTime()
  });

  res.json({ success: true, message: 'Test stop requested' });
});

// ✅ Run all tests sequentially (one by one)
app.post("/api/tests/run-all", async (req, res) => {
  console.log("📋 /api/tests/run-all endpoint called - ATS Mode");
  atsRuntime.resetStop();  // Reset stop flag when starting new test

  try {
    const {
      mac,
      cpuSrNo,
      basePcbSrNo,
      cameraSrNo,
      psuSrNo,
      unitSerialNo,
      testLevel = "full-controller",
      skipFrontendTests,
      generateReport,
      frontendResults
    } = req.body;
    // const testDir = path.join(__dirname, "tests/iMoni");
    const testDir = getIMoniTestDir(testLevel);


    // const summaryLines = [];

    // Create test directory if not exists 
    if (!fs.existsSync(testDir)) {
      return res.status(400).json({
        error: "Test folder not found",
        timestamp: getFormattedDateTime()
      });
    }

    // Create test directory if it doesn't exist
    // if (!fs.existsSync(testDir)) {
    //   res.json({ msg: "Test Folder not found" });
    // }

    // Fetching test files
    const files = await fs.promises.readdir(testDir);

    // Sort files numerically (1_criticalload.srv, 2_nexttest.srv, etc.)
    let testFiles = files
      .filter(file => path.extname(file).toLowerCase() === ".srv")
      .sort((a, b) => {
        // Extract numbers from filenames for sorting
        const numA = parseInt(a.split('_')[0]) || 0;
        const numB = parseInt(b.split('_')[0]) || 0;
        return numA - numB;
      });

    console.log(`Found ${testFiles.length} test file(s):`, testFiles);

    if (testFiles.length === 0) {
      return res.status(400).json({
        error: "No test files found in test directory",
        timestamp: getFormattedDateTime()
      });
    }

    // Prepare a single report file for this run
    // const testResultDir = path.join(__dirname, "testResult/iMoni");
    // if (!fs.existsSync(testResultDir)) {
    //   fs.mkdirSync(testResultDir, { recursive: true });
    // }
    const testResult = await runTests({
      testFiles,
      onStatus: broadcastTestStatus,
      testDir,
      testLevel
    });

    let mergedResults = [];

    if (frontendResults && Array.isArray(frontendResults) && frontendResults.length > 0) { mergedResults = [...frontendResults, ...(testResult.results || [])]; } else { mergedResults = testResult.results || []; }

    // ================= FINAL RESPONSE ================= 
    const passedCount = mergedResults.filter(r => r.status === "passed").length;
    const failedCount = mergedResults.filter(r => r.status !== "passed").length;
    const response = {
      timestamp: getFormattedDateTime(),
      summary: {
        total: mergedResults.length,
        passed: passedCount,
        failed: failedCount,
        frontendTests: frontendResults?.length || 0,
        serverTests: testFiles.length
      },
      results: mergedResults
    };

    // ================= GENERATE REPORT ================= 
    const reportMac = mac || Array.from(atsRuntime.connectedDevices.keys())[0] || "unknown-device";

    await reportWriter({
      runResult: response,
      destination: "iMoni",
      mac: reportMac,
      cpuSrNo,
      basePcbSrNo,
      cameraSrNo,
      psuSrNo,
      unitSerialNo,
      generateReport,
      testLevel
    });

    // ================= FINAL WS EVENT ================= 
    broadcastTestStatus({
      type: "ALL_TESTS_COMPLETED",
      summary: response.summary,
      timestamp: getFormattedDateTime()
    });
    console.log(`📊 ATS Tests completed: ${passedCount} passed, ${failedCount} failed`); return res.json(response);

  } catch (err) {
    console.error("❌ Error running all tests:", err.message);
    res.status(500).json({
      error: `Failed to run tests: ${err.message}`,
      timestamp: getFormattedDateTime()
    });
  }
});


app.post('/api/tests/fan-test', async (req, res) => {
  console.log("/api/tests/fan-test API called");

  // RESETING STOP TEST FLAG
  atsRuntime.resetStop();

  try {

    const { mac, controllerId } = req.body;

    const listenerPath = path.join(__dirname, "ESP_Testing", "espFanListener.js");

    const fanProcess = spawn("node", [listenerPath, controllerId || "unknown-controller"], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"]
    });

    fanProcess.stdout.on("data", (data) => {
      console.log(`[fan-listener] ${data}`);
    });

    fanProcess.stderr.on("data", (data) => {
      console.error(`[fan-listener-error] ${data}`);
    });

    fanProcess.on("close", (code) => {
      console.log(`espFanListener exited with code ${code}`);
    });


  } catch (err) {
    console.error("❌ Error running all tests:", err.message);
    res.status(500).json({
      error: `Failed to run tests: ${err.message}`,
      timestamp: getFormattedDateTime()
    });
  }
});


// ✅ FAN ASSEMBLY TEST API
app.post('/api/tests/pdu-test', async (req, res) => {
  console.log("/api/tests/pdu-test API called");

  // RESETING STOP TEST FLAG
  atsRuntime.resetStop();

  try {
    const { mac, frontendPDUResults } = req.body;

    console.log("Frontend PDU Results: ", frontendPDUResults);
    console.log("MAC Address: ", mac);

    const testResultDir = path.join(__dirname, "testResult/pdu");
    if (!fs.existsSync(testResultDir)) {
      fs.mkdirSync(testResultDir, { recursive: true });
    }

    const reportMac = mac ? String(mac).replace(/:/g, '-') : 'unknown-device';
    const testReportFileName = `${getFormattedDateTime('file')}_${reportMac}.rpt`;
    const testReportFilePath = path.join(testResultDir, testReportFileName);

    // const totalTests = testFiles.length;

    // await fs.promises.writeFile(
    //   testReportFilePath,
    //   `ATS Test Run - ${getFormattedDateTime()}\nDevice: ${reportMac}\nTotal Tests: ${totalTests}\n\n`,
    //   { flag: 'w' }
    // );

    // const results = [];
    let content = `PDU Test Run - ${getFormattedDateTime()}\nDevice: ${reportMac}\n\n`;

    frontendPDUResults.forEach(r => {
      content += `Step ${r.step}: ${r.passed ? 'PASS' : 'FAIL'}\n`;
      content += `Message: ${r.message}\n\n`;
    });

    await fs.promises.writeFile(testReportFilePath, content);
    res.json({ ok: true });

  } catch (err) {
    console.error("❌ Error running all tests:", err.message);
    res.status(500).json({
      error: `Failed to run tests: ${err.message}`,
      timestamp: getFormattedDateTime()
    });
  }
});

// ✅ TEST LIST GET API 
app.get('/api/tests/:testType', async (req, res) => {
  try {
    const testType = req.params.testType;
    const testLevel = req.query.testLevel;

    // const testDir = path.join(__dirname, `/tests/${testType}`);
    let testDir;

    if (testType === "iMoni") {
      testDir = getIMoniTestDir(testLevel);
    } else {
      testDir = path.join(__dirname, `/tests/${testType}`);
    }


    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      res.json({ msg: "Test Folder not found" });
    }

    // Fetching test files
    const files = await fs.promises.readdir(testDir);

    let testFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.srv'].includes(ext);
      })
      .sort((a, b) => {
        // Extract numbers from filenames for sorting
        const numA = parseInt(a.split('_')[0]) || 0;
        const numB = parseInt(b.split('_')[0]) || 0;
        return numA - numB;
      });

    console.log("Files fettched: ", testFiles);
    res.status(200).send(testFiles);
  } catch (err) {
    console.error("Error in Fan Test List API", err);
  }
});



const eMS_LOGS = process.env.eMS_LOGS === "true";
console.log(`[BOOT] eMS_LOGS is`, eMS_LOGS);

const INC_LOGS_CMD = process.env.INC_LOGS_CMD === "true";
const OUT_LOGS_CMD = process.env.OUT_LOGS_CMD === "true";
const ALARM_LOGS_CMD = process.env.ALARM_LOGS_CMD === "true";
const SNAP_CMD = process.env.SNAP_CMD === "true";

const IncLogDir = process.env.INC_LOG_DIR || "C:/CommandLogs/inc";
const outLogDir = process.env.OUT_LOG_DIR || "C:/CommandLogs/out";
const alarmLogDir = process.env.ALARM_LOG_DIR || "C:/CommandLogs/alarm";
const snapshotOutputDir = process.env.SNAP_DIR || "C:/snaps";


function dirCheck(dir, enabled) {
  if (!enabled) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create dir ${dir}:`, err.message);
  }
}

dirCheck(IncLogDir, INC_LOGS_CMD);
dirCheck(outLogDir, OUT_LOGS_CMD);
dirCheck(alarmLogDir, ALARM_LOGS_CMD);
dirCheck(snapshotOutputDir, SNAP_CMD);



// 📡 TCP Server
const BULK_SAVE_LIMIT = 1000;
let alreadyReplied = 0;

// Device command waiter queue with MAC tracking
// const deviceCommandWaiters = [];

// Track which MAC addresses have pending test waits
// let testWaitingForMAC = null;
// let testStopRequested = false;  // Flag to stop ongoing test

// function setTestWaitForMAC(mac) {
//   testWaitingForMAC = mac;
//   console.log(`🔔 Test now waiting for response from MAC: ${mac}`);
// }

// function clearTestWaitForMAC() {
//   testWaitingForMAC = null;
// }

// function requestTestStop() {
//   testStopRequested = true;
//   clearTestWaitForMAC();
//   // Clear all pending waiters
//   while (deviceCommandWaiters.length > 0) {
//     const waiter = deviceCommandWaiters.shift();
//     waiter({ stopped: true });  // Resolve with stopped flag
//   }
//   console.log('🛑 Test stop requested - all waiters cleared');
// }

// function resetTestStopFlag() {
//   testStopRequested = false;
// }

// Function to get formatted Date and Time
/*
  Pass any string to function to get Date & Time in below format: 
  20_01_26_12_45_52
  Without passing any argument will get below Data & Time format: 
  20/01/26 12:45:52
*/
function getFormattedDateTime(outType = 'string') {
  // Pass any string to function if you want output in second way
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dd = pad(today.getDate());
  const mm = pad(today.getMonth() + 1);
  const yy = String(today.getFullYear()).slice(-2);
  const HH = pad(today.getHours());
  const MM = pad(today.getMinutes());
  const SS = pad(today.getSeconds());

  if (outType === 'string') {
    return `${dd}/${mm}/${yy} ${HH}:${MM}:${SS}`;
  } else {
    return `${dd}_${mm}_${yy}_${HH}_${MM}_${SS}`;
  }
}

function sendX(socket) {
  const msg = `%X000${getFormattedDateTime()}$`;
  console.log(`⬅️ Sending back: ${msg}`);
  const ok = socket.write(msg);
  if (!ok) {
    console.warn("⚠️ Backpressure: socket buffer is full, write queued");
  }
}

const logStreams = {};

// TCP Server
function getLogStream(filePath) {
  if (!logStreams[filePath]) {
    // make sure directory exists
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    logStreams[filePath] = fs.createWriteStream(filePath, {
      flags: "a" // append mode
    });

    logStreams[filePath].on("error", (err) => {
      console.error("Log stream error:", err.message);
    });
  }

  return logStreams[filePath];
}

function writeLog(filePath, data) {
  const stream = getLogStream(filePath);
  stream.write(data + "\n");
}

const tcpServer = net.createServer((socket) => {
  socket.buffer = Buffer.alloc(0);
  const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;

  debug.log(`New TCP Connection from`, clientInfo);

  socket.on("data", async (data) => {
    let packetCount = 0;
    const dataStart = Date.now();
    // buffer = Buffer.concat([buffer, data]);
    socket.buffer = Buffer.concat([socket.buffer, data]);
    const PACKET_LEN = 58;

    try {
      // console.packetCount++;
      // debug.lastPacketTime = Date.now();
      // debug.bufferStats.discardedBytes.totalBytes += data.length;

      // console.log(`Raw data received ${data.toString('hex')} with length (${data.length} bytes) from`, clientInfo);
      fs.appendFileSync(logFile, "Data received\n");

      // console.log(`Raw data hex preview:`, data.toString('hex').substring(0, 100) + '...');

      // buffer = Buffer.concat([buffer, data]);
      // console.log(`Total buffer size: ${buffer.length} bytes`);

      while (socket.buffer.length >= 58) {
        packetCount++;
        // const packet = socket.buffer.slice(0, PACKET_LEN);

        // console.log(`[eMS_LOGS] Parsing packet #${packetCount} in this data event, buffer.length=${buffer.length}`);

        // if (buffer.length < 4) break;

        if (!socket.preambleHandled && socket.buffer.length >= 4) {
          const preamble = socket.buffer.slice(0, 4).toString('ascii');
          if (preamble === 'tcp2') {
            socket.buffer = socket.buffer.slice(4);
            socket.preambleHandled = true;
          }
        }

        const header = socket.buffer.slice(0, 8).toString('ascii');

        if (!/^[0-9a-fA-F]{8}$/.test(header)) {
          // corrupted / misaligned packet → resync like MAC server
          socket.buffer = socket.buffer.slice(1);
          continue;
        }

        const ipHexAscii = socket.buffer.slice(0, 8).toString('ascii');

        // Convert hex pairs → decimal
        const ip = ipHexAscii
          .match(/.{2}/g)
          .map(h => parseInt(h, 16))
          .join('.');

        // Reject obvious garbage IPs
        if (!ip.startsWith('192.168.')) {
          console.warn('🚫 Dropping invalid IP:', ip);
          socket.buffer = socket.buffer.slice(1);
          continue;
        }

        // wait for full packet
        if (socket.buffer.length < 58) break;

        const packet = socket.buffer.slice(0, 58);
        socket.buffer = socket.buffer.slice(58);

        // const ip = `${packet[0]}.${packet[1]}.${packet[2]}.${packet[3]}`;

        //! =============== CODE FOR MAC CHECKING =============== 
        // const bufStr = buffer.toString("utf-8");

        // // Search for first valid MAC pattern in buffer string
        // const macPattern = /[0-9]{3}(.[0-9]{3})(.[0-9]{1})(.[0-9]{3})/;
        // const match = bufStr.match(macPattern);

        // if (!match) {
        //   console.warn(
        //     `No IP found in buffer, discarding ${buffer.length} bytes`
        //   );
        //   buffer = Buffer.alloc(0);
        //   break;
        // }

        // const macStartIndex = bufStr.indexOf(match[0]);

        // if (macStartIndex > 0) {
        //   console.warn(`Discarding ${macStartIndex} bytes of junk before MAC`);
        //   buffer = buffer.slice(macStartIndex);
        //   continue;
        // }

        // if (socket.buffer.length < 58) {
        //   // Wait for more data for complete packet
        //   break;


        // Extract one full packet starting at MAC
        // const packet = buffer.slice(0, 58);

        // const macRaw = packet.subarray(0, 17);
        // let macRawStr = macRaw.toString("utf-8");
        // console.log(
        //   `Received MAC: [${macRawStr}], length: ${macRawStr.length}`
        // );

        // Sanitize and verify MAC
        // const sanitizedMac = macRawStr.replace(/[^0-9A-Fa-f:]/g, "");
        // const macRegex = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
        // if (sanitizedMac.length !== 17 || !macRegex.test(sanitizedMac)) {
        //   console.warn(`⚠️ Dropping malformed MAC: INVALID_${Date.now()}`);
        //   buffer = buffer.slice(58);
        //   continue;
        // }
        //! =============== CODE FOR MAC CHECKING =============== 
        // const mac = sanitizedMac.toLowerCase();

        // console.log("Extracted IP: ", extractedIP);
        const mac = ip; //! Converting to LowerCase()
        const humidity = +packet.readFloatLE(17).toFixed(2);
        const insideTemperature = +packet.readFloatLE(21).toFixed(2);
        const outsideTemperature = +packet.readFloatLE(25).toFixed(2); // "+" converts string to number as toFixed return string

        const lockStatus = packet[29] === 1 ? "OPEN" : "CLOSED";
        const doorStatus = packet[30] === 1 ? "OPEN" : "CLOSED";
        const waterLogging = !!packet[31]; // "!!" -> converts true/false to 1/0
        const waterLeakage = !!packet[32];

        const output = +packet.readInt16LE(33).toFixed(2);
        const outputVoltage = output / 100;
        const hupsDVC = (+packet.readInt16LE(35).toFixed(2)) / 100;
        const input = +packet.readInt16LE(37).toFixed(2);
        const inputVoltage = input / 100;
        const hupsBatVolt = packet.readInt16LE(39);
        const batteryBackup = +packet.readFloatLE(41).toFixed(2);

        const alarmActive = !!packet[45];
        const fireAlarm = packet[46];
        const fanLevel1Running = !!packet[47];
        const fanLevel2Running = !!packet[48];
        const fanLevel3Running = !!packet[49];
        const fanLevel4Running = !!packet[50];

        const padding = packet[51]; // unused
        const fanStatusBits = packet.readUInt16LE(52);

        const pwsFailCount = packet[54]; // Password Failure Count
        const hupsStat = packet[55]; // unused
        const hupsRes = packet[56]; // unused
        const failMask = packet[57]; // unused

        const packetTimestamp = new Date();

        // console.log("BAT Volt: ", hupsBatVolt);
        // console.log("DV Current: ", hupsDVC);


        // Getting HUPS Alarms
        const hupsAlarms = []
        /* 
            Extracting Individual HUPS Alarms from 'hupsStat' using bitwise operations. 
            Each alarm is represented by a single bit within the 'hupsStat' integer. 
            The loop iterates 8 times (for 8 alarms), extracting each bit and 
            storing the alarm status in the 'hupsAlarms' array.
        */
        for (let i = 0; i < 8; i++) {
          hupsAlarms[i] = (hupsStat >> (i) & 0x01);
        }

        // console.log("HUPS Alarms: ", hupsAlarms);

        /*
          Extracting Individual Fan Status from 'fanStatusBits' using bitwise operations. 
          Each fan's status is represented by 2 bits within the 'fanStatusBits' integer. 
          The loop iterates 6 times (for 6 fans), extracting the relevant 2 bits for each fan and 
          storing the status in the 'fanStatus' array.
        */
        const fanStatus = [];
        for (let i = 0; i < 6; i++) {
          fanStatus[i] = (fanStatusBits >> (i * 2)) & 0x03; // 0=off, 1=healthy, 2=faulty
        }

        if (FAN) console.log("Fan Status: ", fanStatus);
        if (FAN) console.log(fanLevel1Running, fanLevel2Running, fanLevel3Running, fanLevel4Running);

        // console.log("Fan Status: ", fanStatus);

        if (padding === 0x31 && !alreadyReplied) {
          sendX(socket);
          alreadyReplied = 40;
        }

        console.log("Padding: ", padding);
        // ========== CAMERA LOGIC ==========
        if ((padding == 0x43)) {
          console.log("⚡Camera Function runs ...⚡")

          // ===================== NEW CAMERA LOGIC | DFR CAMERA =====================

          // RESOLVING PATH FOR EXE FILE
          // const exePath = process.env.READIMAGE_EXE_PATH || path.join(__dirname, "ReadImage.exe");
          const now = new Date();
          const timestamp = getFormattedDateTime("filename")
          // console.log(timestamp);
          const snapshotFileName = `image_${timestamp}.jpg`;
          const snapshotOutputDir_MAC = path.join(snapshotOutputDir, mac.slice(8).replace(/[. ]/g, '_'));
          const outputPath = path.join(snapshotOutputDir_MAC, snapshotFileName);
          const exePath = process.env.READIMAGE_EXE_PATH || path.join(__dirname, "ReadImage_recovered_5.exe");


          if (!fs.existsSync(snapshotOutputDir_MAC)) {
            fs.mkdirSync(snapshotOutputDir_MAC, { recursive: true });
          }

          // HANDLING EXE FILE READ TIMEOUT
          const timeoutMs = Number.parseInt(process.env.READIMAGE_TIMEOUT_MS || "45000", 10);

          if (!fs.existsSync(exePath)) {
            throw new Error(`ReadImage executable not found at: ${exePath}`);
          }

          /**
           * Prepare arguments for the executable
           * Default format:
           *   ReadImage.exe <cameraIp> <outputPath>
           *
           * Can be overridden using environment variable:
           *   READIMAGE_ARGS_JSON
           * Example:
           *   ["--ip","{ip}","--out","{out}"]
           */
          let args = [String(ip), String(outputPath)];
          if (process.env.READIMAGE_ARGS_JSON) {
            try {
              const parsed = JSON.parse(process.env.READIMAGE_ARGS_JSON);

              // Ensure it is an array
              if (!Array.isArray(parsed)) throw new Error("READIMAGE_ARGS_JSON must be a JSON array");

              // Replace placeholders with actual values
              args = parsed.map((a) =>
                String(a).replaceAll("{ip}",
                  String(ip)).replaceAll("{out}",
                    String(outputPath)));
            } catch (e) {
              throw new Error(`Invalid READIMAGE_ARGS_JSON: ${e.message}`);
            }
          }


          await new Promise((resolve, reject) => {

            const child = spawn(exePath, args, {
              windowsHide: true,  // Hide console window on Windows
              stdio: ["ignore", "pipe", "pipe"]   // Ignore stdin, capture stdout/stder
            });

            let stderr = "";
            child.stderr.on("data", (d) => {
              stderr += d.toString();
            });

            // Handle spawn errors
            child.on("error", (err) => {
              reject(err);
            });

            // Timeout handling
            const timer = setTimeout(() => {
              try { child.kill(); } catch { /* ignore */ }
              reject(new Error(`ReadImage timed out after ${timeoutMs}ms (exe=${exePath}, ip=${ip}, out=${outputPath})`));
            }, Number.isFinite(timeoutMs) ? timeoutMs : 45000);


            // Process completion handler
            child.on("close", (code) => {
              clearTimeout(timer);

              // SUCCESS
              if (code === 0) return resolve();
              console.log("Capturing Image")

              // Failure with exit code and optional stderr
              reject(new Error(`ReadImage exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
            });
          });



          /**
          * Validate output file
          * - Must exist
          * - Must not be empty
          */
          console.log("Image Check")
          let stat;
          try {
            stat = fs.statSync(outputPath);

          } catch {
            throw new Error(`ReadImage completed but output file was not created: ${outputPath}`);
          }

          // Ensure file is valid
          if (!stat.isFile() || stat.size === 0) {
            throw new Error(`ReadImage output file is empty or invalid: ${outputPath}`);
          }

          // 🔥 VALIDATE IMAGE
          // const isValid = await validateImage(outputPath);

          // if (!isValid) {
          //   throw new Error("Corrupted image detected by sharp");
          // }

          // const fileCheck = await imageSizeCheck(outputPath);

          // if (fileCheck.fileSize.kb < 50) {
          //     throw new Error("Invalid Image | Size is less than 50kb");
          // }

          // ===================== NEW CAMERA LOGIC | DFR CAMERA =====================
          console.log("⚡Image saved⚡")
        }




        // ===================== Logging Incoming Data from Simulator =====================
        if (INC_LOGS_CMD) {
          const now = new Date();
          const fileName = `${now.getDate()}_${now.getMonth() + 1
            }_${now.getHours()}.inc`;

          // const sensorData = {
          //   humidity: humidity,
          //   insideTemperature: insideTemperature,
          //   outsideTemperature: outsideTemperature,
          //   inputVoltage: inputVoltage,
          //   outputVoltage: outputVoltage,
          //   batteryBackup: batteryBackup,
          // };

          const IncLogFilePath = path.join(IncLogDir, fileName);
          const timestamp = now.toLocaleString();
          const IncLogEntry = `[${timestamp}] | MAC:${mac} | Humid=${humidity} | IT=${insideTemperature} | OT=${outsideTemperature} | IV=${inputVoltage} | OV=${outputVoltage} | BB=${batteryBackup}`;

          // File writing happens after response
          // fs.appendFile(IncLogFilePath, IncLogEntry, (err) => {
          //   if (err) {
          //     console.error("Failed to save log:", err);
          //   } else {
          //     if (eMS_LOGS) console.log(`✅ Log saved: ${IncLogFilePath}`);
          //   }
          // });

          writeLog(
            `${IncLogFilePath}`,
            IncLogEntry
          );

        }
        // ===================== Logging Incoming Data from Simulator =====================


        if (alreadyReplied) alreadyReplied--;
        const floats = [
          humidity,
          insideTemperature,
          outsideTemperature,
          outputVoltage,
          inputVoltage,
          batteryBackup,
        ];

        if (floats.some((val) => isNaN(val) || Math.abs(val) > 100000)) {
          console.warn(`⚠️ Skipping packet from ${mac}: bad float value(s)`);
          // buffer = buffer.slice(58);
          // continue;
        }

        if (Math.random() < 0.01) {
          console.log(
            `📡 ${mac} | Temp: ${insideTemperature}°C | Humidity: ${humidity}% | Voltage: ${inputVoltage}V | Fan stat=${fanStatusBits.toString(
              16
            )}h`
          );
        }

        // Threshold-based alarms
        const thresholdAlarms = {
          insideTemperatureAlarm:
            insideTemperature > thresholds.insideTemperature.max ||
            insideTemperature < thresholds.insideTemperature.min,
          outsideTemperatureAlarm:
            outsideTemperature > thresholds.outsideTemperature.max ||
            outsideTemperature < thresholds.outsideTemperature.min,
          humidityAlarm:
            humidity > thresholds.humidity.max ||
            humidity < thresholds.humidity.min,
          inputVoltageAlarm:
            inputVoltage > thresholds.inputVoltage.max ||
            inputVoltage < thresholds.inputVoltage.min,
          outputVoltageAlarm:
            outputVoltage > thresholds.outputVoltage.max ||
            outputVoltage < thresholds.outputVoltage.min,
          batteryBackupAlarm: batteryBackup < thresholds.batteryBackup.min,
        };

        console.log("🌀 === ALARMS STARTED === 🌀")

        const activeAlarms = [];

        if (thresholdAlarms.insideTemperatureAlarm) {
          activeAlarms.push(`Inside Temperature: ${insideTemperature}`);
        }
        if (thresholdAlarms.outsideTemperatureAlarm) {
          activeAlarms.push(`Outside Temperature: ${outsideTemperature}`);
        }
        if (thresholdAlarms.humidityAlarm) {
          activeAlarms.push(`Humidity: ${humidity}`);
        }
        if (thresholdAlarms.inputVoltageAlarm) {
          activeAlarms.push(`Input Voltage: ${inputVoltage}`);
        }
        if (thresholdAlarms.outputVoltageAlarm) {
          activeAlarms.push(`Output Voltage: ${outputVoltage}`);
        }
        if (thresholdAlarms.batteryBackupAlarm) {
          activeAlarms.push(`Battery Backup: ${batteryBackup}`);
        }

        if (waterLogging) {
          activeAlarms.push("Water Logging Alarm");
          console.log("Water Logging Alarm")
        }

        if (waterLeakage) {
          activeAlarms.push("Water Leakage Alarm");
          console.log("Water Leakage Alarm")
        }

        if (doorStatus == "OPEN") {
          activeAlarms.push("Door Alarm");
          console.log("Door Alarm")
        }

        if (lockStatus == "OPEN") {
          activeAlarms.push("Lock Alarm");
          console.log("Lock Alarm")
        }

        if (fireAlarm) {
          activeAlarms.push("Fire Alarm");
          console.log("Fire Alarm")
        }

        // Single console output
        if (activeAlarms.length > 0) {
          // const alarmLogDir = "C:/CommandLogs/alarm"

          // if (!fs.existsSync(alarmLogDir)) {
          //   fs.mkdirSync(alarmLogDir, { recursive: true });
          // }

          const now = new Date();
          const timestamp = now.toLocaleString();

          const alarmFileName = `${now.getDate()}_${now.getMonth() + 1
            }_${now.getHours()}_Alarm.inc`;

          if (fanStatus.includes(2)) {
            var logAlarm = `[${timestamp}] | MAC: ${mac}| ${activeAlarms} | Fan Status: ${fanStatus}\n`;
          } else {
            var logAlarm = `[${timestamp}] | MAC: ${mac}| ${activeAlarms}\n`;
          }

          const alarmFilePath = path.join(alarmLogDir, alarmFileName);

          // fs.appendFile(alarmFilePath, logAlarm, (err) => {
          //   if (err) {
          //     console.error("Failed to save log:", err);
          //   } else {
          //     if (eMS_LOGS) console.log(`✅ Log saved: ${alarmFilePath}`);
          //   }
          // });

          writeLog(
            `${alarmFilePath}`,
            logAlarm
          );
        }

        socket.deviceId = mac;
        // atsRuntime.connectedDevices.set(mac, socket);
        atsRuntime.connectedDevices.set(mac, {
          mac,
          socket,
          lastSeen: Date.now()
        });

        // Build a lightweight reading object and broadcast to web clients
        const reading = {
          mac,
          humidity,
          insideTemperature,
          outsideTemperature,
          lockStatus,
          doorStatus,
          waterLogging,
          waterLeakage,
          outputVoltage,
          hupsDVC,
          inputVoltage,
          hupsBatVolt,
          batteryBackup,
          alarmActive,
          fireAlarm,
          fanGroupStatus: [
            fanLevel1Running,
            fanLevel2Running,
            fanLevel3Running,
            fanLevel4Running,
          ],
          fanLevel1Running,
          fanLevel2Running,
          fanLevel3Running,
          fanLevel4Running,
          pwsFailCount,
          fan1Status: fanStatus[0],
          fan2Status: fanStatus[1],
          fan3Status: fanStatus[2],
          fan4Status: fanStatus[3],
          fan5Status: fanStatus[4],
          fan6Status: fanStatus[5],
          mainStatus: hupsAlarms[0],
          rectStatus: hupsAlarms[1],
          inveStatus: hupsAlarms[2],
          overStatus: hupsAlarms[3],
          mptStatus: hupsAlarms[4],
          mosfStatus: hupsAlarms[5],
          hupsRes,
          ...thresholdAlarms,
          // Set timestamp to IST
          timestamp: packetTimestamp
        };

        if (atsRuntime.connectedDevices.has(mac)) {
          atsRuntime.connectedDevices.get(mac).lastSeen = Date.now();
        }


        // Track connected device socket and broadcast to any connected frontend clients
        // atsRuntime.connectedDevices.set(mac, socket);
        try {
          broadcastToWebClients(reading);
        } catch (err) {
          console.error('WebSocket broadcast failed:', err);
        }

        // Keep an in-memory cache of recent readings for API access (capped)
        latestReadings.push(reading);
        if (latestReadings.length > 400) latestReadings.shift();

        // Notify waiting test ASYNC - don't block reading flow
        if (atsRuntime.testWaitingForMAC && mac === atsRuntime.testWaitingForMAC && atsRuntime.deviceCommandWaiters.length > 0) {
          setImmediate(() => {
            if (atsRuntime.deviceCommandWaiters.length > 0) {
              const waiter = atsRuntime.deviceCommandWaiters[0];
              const shouldResolve = waiter(reading);
              if (shouldResolve) {
                atsRuntime.deviceCommandWaiters.shift();
                console.log(`✅ Test waiter resolved for MAC ${mac}`);
              }
            }
          });
        }
        socket.buffer = socket.buffer.slice(PACKET_LEN);

        debugger;
        if (eMS_LOGS) console.log(`✅ Packet processed successfully for MAC: ${mac}`, `Time: ${getFormattedDateTime()}`);
      }
    } catch (err) {
      console.error("Packet parsing failed:", err.message);
      socket.destroy();
    }
  });

  socket.on("end", () => {
    for (const [mac, sock] of atsRuntime.connectedDevices.entries()) {
      if (sock === socket) {
        atsRuntime.connectedDevices.delete(socket.deviceId);
        // atsRuntime.connectedDevices.delete(socket.deviceId);
        console.log(`Device ${mac} disconnected`);
      }
    }
  });

  socket.on("error", (err) => {
    if (err.code !== "ECONNRESET") {
      console.error("Socket error:", err.message);
    }
  });
});

const frontendBuildDir =
  process.env.FRONTEND_BUILD_DIR ||
  path.join(__dirname, "..", "iot-dashboard-frontend", "build");

if (fs.existsSync(path.join(frontendBuildDir, "index.html"))) {
  app.use(express.static(frontendBuildDir));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendBuildDir, "index.html"));
  });
} else {
  console.warn(`Frontend build not found at: ${frontendBuildDir}`);
}

// Start servers
tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`✅ TCP server listening on port ${TCP_PORT}`);
});

app.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`✅ HTTP server running on port ${HTTP_PORT}`);
});

console.log("🚀 All servers started successfully!");
