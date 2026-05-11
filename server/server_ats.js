require("dotenv").config();
const bcrypt = require("bcrypt");
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
const path = require("path");
const axios = require('axios');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const atsRuntime = require("./ATS/atsRuntime");

const app = express();
// const connectedDevices = new Map();
// In-memory latest readings cache (global)
let latestReadings = [];
app.use(bodyParser.json());
const cors = require("cors");
const { isDeepStrictEqual } = require("util");
const { runTests } = require("./ATS/atsRunner");
const { reportWriter } = require("./ATS/reportWriter");
app.use(cors());

// WebSocket Server
const WS_PORT = process.env.WS_PORT || 8080;
const wss = new WebSocket.Server({ port: WS_PORT });
const wsClients = new Set();
// let pendingDialogResolver = null;  // Resolves when frontend responds to dialog

// WEBSOCKET CONNECTION HANDLING
wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket client connected from:', req.socket.remoteAddress);
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
  const imagePath = path.join("C:/snaps", imageName);

  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: "Image not found" });
  }

  res.sendFile(imagePath);
});

// ✅ Get list of available snapshots
app.get("/api/snapshots", (req, res) => {
  const snapshotsDir = "C:/snaps";

  try {
    const files = fs
      .readdirSync(snapshotsDir)
      .filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file))
      .sort()
      .slice(-15);

    res.json(files);
  } catch (err) {
    console.error("Error reading snapshots:", err);
    res.status(500).json({ error: "Failed to read snapshots" });
  }
});

app.get("/api/thresholds", (req, res) => {
  res.json(thresholds);
});

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
  let { selectedTests, controllerId } = req.body;
  console.log("Requested test file:", selectedTests);

  if (!selectedTests || selectedTests.length === 0) {
    return res.status(400).json({ error: "selectedTests is required" });
  }

  console.log("Test File passed: ", selectedTests);

  // Normalize to array
  if (!Array.isArray(selectedTests)) {
    selectedTests = [selectedTests];
  }

  // const testPath = path.join(__dirname, "tests/iMoni", selectedTests);
  const baseDir = path.join(__dirname, "tests/iMoni");

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
      onStatus: broadcastTestStatus
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
      deviceId: controllerId
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
    const { mac, controllerId, skipFrontendTests, frontendResults } = req.body;
    const testDir = path.join(__dirname, "tests/iMoni");

    const summaryLines = [];

    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      res.json({ msg: "Test Folder not found" });
    }

    // Fetching test files
    const files = await fs.promises.readdir(testDir);

    // Sort files numerically (1_criticalload.srv, 2_nexttest.srv, etc.)
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
    const testResult = await runTests({ testFiles, onStatus: broadcastTestStatus });

    let mergedResults = [];

    // Generating Test Report File
    // const reportMac = mac ? String(mac).replace(/:/g, '-') : 'unknown-device';
    // const testReportFileName = `${getFormattedDateTime('file')}_${reportMac}.rpt`;
    // const testReportFilePath = path.join(testResultDir, testReportFileName);

    // // Calculate total tests including frontend results
    // const totalTests = testFiles.length + (frontendResults?.length || 0);

    // await fs.promises.writeFile(
    //   testReportFilePath,
    //   `ATS Test Run - ${getFormattedDateTime()}\nDevice: ${reportMac}\nTotal Tests: ${totalTests}\n\n`,
    //   { flag: 'w' }
    // );


    // // Write frontend test results to report first
    // if (frontendResults && Array.isArray(frontendResults)) {
    //   for (const fr of frontendResults) {
    //     const reportLine = `Test: ${fr.name} , Status: ${fr.status}\n`;
    //     await fs.promises.appendFile(testReportFilePath, reportLine);
    //     results.push(fr);
    //     console.log(`    📝 Frontend test saved: ${fr.name} - ${fr.status}`);
    //   }
    // }

    // // Run test files one by one
    // for (const testFile of testFiles) {
    //   // Check if stop was requested before starting next test
    //   if (atsRuntime.testStopRequested) {
    //     console.log('    🛑 Test execution stopped by user - skipping remaining tests');
    //     break;
    //   }

    //   const testFilePath = path.join(testDir, testFile);
    //   console.log(`🔬 Processing test file: ${testFile}`);

    //   try {
    //     let testResult = {
    //       testFile,
    //       status: "pending",
    //       output: "",
    //       duration: 0,
    //       name: "",
    //       message: "",
    //       expectedOutcome: null,
    //       receivedOutcome: null,
    //       passed: false,
    //       commands: []
    //     };

    //     const startTime = Date.now();

    //     // Parse .srv test file
    //     try {
    //       const fileContent = await fs.promises.readFile(testFilePath, "utf-8");
    //       const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

    //       // OBJECT: SINGLE TEST DETAILS
    //       let testConfig = {
    //         name: "",
    //         message: "",
    //         expectedOutcome: null,
    //         commands: [],
    //         pre: "",
    //         pass: "",
    //         fail: "",
    //         timeout: 20,
    //         retryCount: 0,
    //         type: "",
    //         steps: []
    //       };

    //       let currentStep = null;

    //       // Parse .srv file
    //       for (const line of lines) {
    //         // Check for step header [step:N]
    //         const stepMatch = line.match(/^\[step:(\d+)\]$/);
    //         if (stepMatch) {
    //           // Save previous step if exists
    //           if (currentStep) {
    //             testConfig.steps.push(currentStep);
    //           }
    //           // Start new step
    //           currentStep = {
    //             stepNumber: parseInt(stepMatch[1]),
    //             msg: "",
    //             waitFor: "",
    //             waitTime: 20,
    //             expectedValue: "",
    //             onPass: "",
    //             onFail: ""
    //           };
    //           continue;
    //         }

    //         // PROPERTIES INSIDE THE STEPS
    //         if (currentStep) {
    //           if (line.startsWith('msg=')) {
    //             currentStep.msg = line.substring(4).replace(/["\']/g, '');
    //           } else if (line.startsWith('waitFor=')) {
    //             currentStep.waitFor = line.substring(8).replace(/["\']/g, '');
    //           } else if (line.startsWith('waitTime=')) {
    //             currentStep.waitTime = parseInt(line.substring(9).replace(/["\']/g, '')) || 20;
    //           } else if (line.startsWith('expectedValue=')) {
    //             currentStep.expectedValue = line.substring(14).replace(/["\']/g, '');
    //           } else if (line.startsWith('increasedBy=')) {
    //             currentStep.increasedBy = parseFloat(line.substring(12).replace(/["\']/g, '')) || 0;
    //           } else if (line.startsWith('onPass=')) {
    //             currentStep.onPass = line.substring(7).replace(/["\']/g, '');
    //           } else if (line.startsWith('onFail=')) {
    //             currentStep.onFail = line.substring(7).replace(/["\']/g, '');
    //           } else if (line.startsWith('cameraUrl=')) {
    //             currentStep.cameraUrl = line.substring(10).replace(/["\']/g, '');
    //           }
    //         }
    //         // PROPERTIES BEFORE THE STEPS
    //         else {
    //           if (line.startsWith('name=')) {
    //             testConfig.name = line.substring(5).replace(/["\']/g, '');
    //           } else if (line.startsWith('msg=')) {
    //             testConfig.message = line.substring(4).replace(/["\']/g, '');
    //           } else if (line.startsWith('pre=')) {
    //             testConfig.pre = line.substring(4).replace(/["\']/g, '');
    //           } else if (line.startsWith('pass=')) {
    //             testConfig.pass = line.substring(5).replace(/["\']/g, '');
    //           } else if (line.startsWith('fail=')) {
    //             testConfig.fail = line.substring(5).replace(/["\']/g, '');
    //           } else if (line.startsWith('type=')) {
    //             testConfig.type = line.substring(5).replace(/["\']/g, '');
    //           } else if (line.startsWith('retryCount=')) {
    //             testConfig.retryCount = parseInt(line.substring(11).replace(/["\']/g, '')) || 0;
    //           } else if (line && !line.includes('=')) {
    //             testConfig.commands.push(line);
    //           }
    //         }
    //       }

    //       // Don't forget to add the last step
    //       if (currentStep) {
    //         testConfig.steps.push(currentStep);
    //       }

    //       // Sending test files details from config to result
    //       testResult.name = testConfig.name || path.parse(testFile).name;
    //       testResult.message = testConfig.message || testConfig.pre || "No message";
    //       testResult.expectedOutcome = testConfig.expectedOutcome;
    //       testResult.commands = testConfig.commands;

    //       console.log(`    ▶️ Starting ATS test: ${testResult.name}`);
    //       console.log(`    📝 Message to display: ${testResult.message}`);
    //       console.log(`    🎯 Expected Outcome: ${testResult.expectedOutcome}`);
    //       console.log(`    📋 Steps defined: ${testConfig.steps.length}`);

    //       // Send TEST STARTING status to WebSocket clients
    //       broadcastTestStatus({
    //         type: 'TEST_STARTED',
    //         testFile: testFile,
    //         name: testResult.name,
    //         message: testResult.message,
    //         pre: testConfig.pre,
    //         expectedOutcome: testResult.expectedOutcome,
    //         totalSteps: testConfig.steps.length,
    //         timestamp: getFormattedDateTime()
    //       });

    //       // Get the first connected device MAC to wait for
    //       const connectedMACs = Array.from(atsRuntime.connectedDevices.keys());

    //       if (connectedMACs.length === 0) {
    //         testResult.output = "❌ Test FAILED: No connected devices available";
    //         testResult.status = "failed";
    //         testResult.passed = false;
    //       }
    //       else if (testConfig.type === 'sensor') {
    //         console.log(`   🔄Running sensor code part`)
    //         const testDeviceMAC = connectedMACs[0];
    //         let allStepsPassed = true;
    //         const stepResults = [];

    //         console.log(`   🔄 Running step-based test with ${testConfig.steps.length} steps`);

    //         for (let i = 0; i < testConfig.steps.length; i++) {
    //           // Check if stop was requested
    //           if (atsRuntime.testStopRequested) {
    //             console.log('    🛑 Test stopped by user request');
    //             testResult.status = 'stopped';
    //             testResult.output = 'Test stopped by user';
    //             break;
    //           }

    //           const step = testConfig.steps[i];
    //           const stepNumber = step.stepNumber || (i + 1);

    //           console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);
    //           console.log(`    Waiting for: ${step.waitFor} = ${step.expectedValue}`);
    //           console.log(`    Timeout: ${step.waitTime}s`);

    //           // Broadcast step started (same for all step types)
    //           broadcastTestStatus({
    //             type: 'STEP_STARTED',
    //             testFile: testFile,
    //             name: testResult.name,
    //             stepNumber: stepNumber,
    //             totalSteps: testConfig.steps.length,
    //             message: step.msg,
    //             waitFor: step.waitFor,
    //             increasedBy: step.increasedBy,
    //             waitTime: step.waitTime || 20,
    //             timestamp: getFormattedDateTime()
    //           });

    //           // Wait for sensor value to increase by the defined amount
    //           const stepResult = await new Promise((resolve) => {
    //             let initialSensorValue = null;  // Capture initial value from first reading
    //             const requiredIncrease = step.increasedBy || 0;

    //             const timeout = setTimeout(() => {
    //               atsRuntime.clearTestWaitForMAC();
    //               if (currentStepHandler) {
    //                 const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
    //                 if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //               }
    //               resolve({
    //                 success: false,
    //                 reason: `TIMEOUT - Value did not increase by ${requiredIncrease} within ${step.waitTime}s`,
    //                 received: initialSensorValue
    //               });
    //             }, (step.waitTime || 20) * 1000);

    //             atsRuntime.setTestWaitForMAC(testDeviceMAC);

    //             let currentStepHandler = null;

    //             // Handler to check if sensor value increased by required amount
    //             const stepHandler = (reading) => {
    //               if (!reading || typeof reading !== 'object') {
    //                 return false;
    //               }

    //               const currentValue = parseFloat(reading[step.waitFor]);

    //               if (isNaN(currentValue)) {
    //                 console.log(`   ⚠️ Invalid sensor value for ${step.waitFor}: ${reading[step.waitFor]}`);
    //                 return false;
    //               }

    //               // Capture initial value on first reading
    //               if (initialSensorValue === null) {
    //                 initialSensorValue = currentValue;
    //                 console.log(`   📊 Initial ${step.waitFor} value: ${initialSensorValue}`);
    //                 console.log(`   🎯 Waiting for increase of: ${requiredIncrease}`);
    //                 return false;  // Keep waiting for subsequent readings
    //               }

    //               const currentIncrease = currentValue - initialSensorValue;
    //               console.log(`   🔍 Checking: ${step.waitFor} = ${currentValue} (initial: ${initialSensorValue}, increase: ${currentIncrease.toFixed(2)}, required: ${requiredIncrease})`);

    //               // Check if value has increased by required amount
    //               if (currentIncrease >= requiredIncrease) {
    //                 clearTimeout(timeout);
    //                 atsRuntime.clearTestWaitForMAC();
    //                 const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
    //                 if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //                 resolve({
    //                   success: true,
    //                   received: `${currentValue} (increased by ${currentIncrease.toFixed(2)} from ${initialSensorValue})`
    //                 });
    //                 return true;
    //               }

    //               return false; // Keep waiting
    //             };

    //             currentStepHandler = stepHandler;
    //             atsRuntime.deviceCommandWaiters.push(stepHandler);
    //           });

    //           // Process step result
    //           if (stepResult.success) {
    //             console.log(`   ✅ Step ${stepNumber} PASSED: ${step.onPass || 'Success'}`);
    //             stepResults.push({
    //               step: stepNumber,
    //               status: 'passed',
    //               message: step.onPass || 'Step passed',
    //               received: stepResult.received
    //             });

    //             // sending message to UI after test completion
    //             broadcastTestStatus({
    //               type: 'STEP_COMPLETED',
    //               testFile: testFile,
    //               name: testResult.name,
    //               stepNumber: stepNumber,
    //               totalSteps: testConfig.steps.length,
    //               status: 'passed',
    //               message: step.onPass || 'Step passed',
    //               timestamp: getFormattedDateTime()
    //             });
    //           } else {
    //             console.log(`   ❌ Step ${stepNumber} FAILED: ${step.onFail || stepResult.reason}`);
    //             allStepsPassed = false;
    //             stepResults.push({
    //               step: stepNumber,
    //               status: 'failed',
    //               message: step.onFail || stepResult.reason,
    //               received: stepResult.received
    //             });

    //             broadcastTestStatus({
    //               type: 'STEP_COMPLETED',
    //               testFile: testFile,
    //               name: testResult.name,
    //               stepNumber: stepNumber,
    //               totalSteps: testConfig.steps.length,
    //               status: 'failed',
    //               message: step.onFail || stepResult.reason,
    //               timestamp: getFormattedDateTime()
    //             });

    //             // Stop on first failure (or continue based on config)
    //             break;
    //           }
    //         }

    //         // Set overall test result
    //         testResult.passed = allStepsPassed;
    //         testResult.status = allStepsPassed ? 'passed' : 'failed';

    //         // 1️⃣ Write human-readable test header
    //         await fs.promises.appendFile(
    //           testReportFilePath,
    //           `Test: ${testResult.name}\nStatus: ${testResult.status}\n\n`
    //         );

    //         // 2️⃣ Write CSV header ONCE
    //         await fs.promises.appendFile(
    //           testReportFilePath,
    //           'Step,StepStatus,Message\n'
    //         );

    //         for (const step of stepResults) {
    //           const line =
    //             `${step.step},` +
    //             `${step.status.toUpperCase()},` +
    //             `"${step.message.replace(/"/g, '""')}"\n`;

    //           await fs.promises.appendFile(testReportFilePath, line);
    //         }

    //         // Blank line after each test (important for readability)
    //         await fs.promises.appendFile(testReportFilePath, '\n');

    //         testResult.output = allStepsPassed
    //           ? (testConfig.pass || `✅ All ${testConfig.steps.length} steps passed`)
    //           : (testConfig.fail || `❌ Test failed at step ${stepResults.length}`);
    //         testResult.stepResults = stepResults;

    //         await fs.promises.appendFile(
    //           testReportFilePath,
    //           '=== TEST END ===\n\n'
    //         );

    //         try {
    //           await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
    //           console.log(`✅ Test report appended to: ${testReportFileName}`);
    //         } catch (err) {
    //           console.log(`🔴 Error writing test report: ${err} 🔴`);
    //         }
    //       }
    //       else if (testConfig.type === 'camera') {
    //         console.log(`    📷 Running camera test`);
    //         const stepResults = [];
    //         let allStepsPassed = true;

    //         for (let i = 0; i < testConfig.steps.length; i++) {
    //           // Check if stop was requested
    //           if (atsRuntime.testStopRequested) {
    //             console.log('    🛑 Test stopped by user request');
    //             testResult.status = 'stopped';
    //             testResult.output = 'Test stopped by user';
    //             break;
    //           }

    //           const step = testConfig.steps[i];
    //           const stepNumber = step.stepNumber || (i + 1);

    //           console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);

    //           // Broadcast step started
    //           broadcastTestStatus({
    //             type: 'STEP_STARTED',
    //             testFile: testFile,
    //             name: testResult.name,
    //             stepNumber: stepNumber,
    //             totalSteps: testConfig.steps.length,
    //             message: step.msg,
    //             waitFor: step.waitFor,
    //             waitTime: step.waitTime || 60,
    //             timestamp: getFormattedDateTime()
    //           });

    //           // Camera capture step
    //           if (step.waitFor === 'capture') {
    //             console.log(`   📸 Capturing image from camera...`);

    //             const cameraUrl = step.cameraUrl || 'http://192.168.0.120/CGI/command/snap?channel=01';
    //             const now = new Date();
    //             const timestamp = now.toISOString()
    //               .replace(/[-:]/g, '')
    //               .replace(/T/, '_')
    //               .replace(/\..+/, '')
    //               .slice(0, 15);

    //             const fileName = `test_${timestamp}.jpg`;
    //             const outputDir = 'C:/snaps';
    //             const outputPath = path.join(outputDir, fileName);

    //             if (!fs.existsSync(outputDir)) {
    //               fs.mkdirSync(outputDir, { recursive: true });
    //             }

    //             try {
    //               // Capture image from camera
    //               const response = await axios({
    //                 method: 'GET',
    //                 url: cameraUrl,
    //                 responseType: 'stream',
    //                 timeout: 10000
    //               });

    //               // Save the image
    //               await new Promise((resolve, reject) => {
    //                 const writer = fs.createWriteStream(outputPath);
    //                 response.data.pipe(writer);
    //                 writer.on('finish', resolve);
    //                 writer.on('error', reject);
    //               });

    //               console.log(`    ✅ Image captured: ${fileName}`);
    //               console.log(`    📁 Image saved at: ${outputPath}`);

    //               // FIRST: Set up the dialog resolver BEFORE broadcasting
    //               const dialogPromise = new Promise((resolve) => {
    //                 const timeout = setTimeout(() => {
    //                   console.log(`    ⏰ Dialog timeout after ${step.waitTime || 60}s`);
    //                   // atsRuntime.setDialogResolver = null;
    //                   resolve({ confirmed: false, reason: 'TIMEOUT' });
    //                 }, (step.waitTime || 60) * 1000);

    //                 atsRuntime.setDialogResolver((confirmed) => {
    //                   console.log(`    📨 Dialog response received: ${confirmed}`);
    //                   clearTimeout(timeout);
    //                   resolve({ confirmed, reason: confirmed ? 'USER_CONFIRMED' : 'USER_CANCELLED' });
    //                 });
    //               });

    //               // THEN: Broadcast to show dialog on frontend
    //               console.log(`   📤 Broadcasting CAMERA_IMAGE_CAPTURED to ${wsClients.size} clients`);

    //               // Broadcast image captured - send to frontend for display
    //               broadcastTestStatus({
    //                 type: 'CAMERA_IMAGE_CAPTURED',
    //                 testFile: testFile,
    //                 name: testResult.name,
    //                 stepNumber: stepNumber,
    //                 totalSteps: testConfig.steps.length,
    //                 imagePath: outputPath,
    //                 imageName: fileName,
    //                 message: step.msg || 'Camera image captured. Please verify.',
    //                 waitTime: step.waitTime || 60,
    //                 timestamp: getFormattedDateTime()
    //               });

    //               // Wait for user dialog confirmation
    //               console.log(`   ⏳ Waiting for user confirmation...`);

    //               const dialogResult = await dialogPromise;

    //               // Process dialog result
    //               if (dialogResult.confirmed) {
    //                 console.log(`   ✅ Step ${stepNumber} PASSED: User confirmed camera working`);
    //                 stepResults.push({
    //                   step: stepNumber,
    //                   status: 'passed',
    //                   message: step.onPass || 'Camera test passed - User confirmed',
    //                   received: `Image: ${fileName}`
    //                 });

    //                 broadcastTestStatus({
    //                   type: 'STEP_COMPLETED',
    //                   testFile: testFile,
    //                   name: testResult.name,
    //                   stepNumber: stepNumber,
    //                   totalSteps: testConfig.steps.length,
    //                   status: 'passed',
    //                   message: step.onPass || 'Camera test passed',
    //                   timestamp: getFormattedDateTime()
    //                 });
    //               } else {
    //                 console.log(`   ❌ Step ${stepNumber} FAILED: ${dialogResult.reason}`);
    //                 allStepsPassed = false;
    //                 stepResults.push({
    //                   step: stepNumber,
    //                   status: 'failed',
    //                   message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
    //                   received: `Image: ${fileName}`
    //                 });

    //                 broadcastTestStatus({
    //                   type: 'STEP_COMPLETED',
    //                   testFile: testFile,
    //                   name: testResult.name,
    //                   stepNumber: stepNumber,
    //                   totalSteps: testConfig.steps.length,
    //                   status: 'failed',
    //                   message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
    //                   timestamp: getFormattedDateTime()
    //                 });

    //                 break; // Stop on failure
    //               }

    //             } catch (err) {
    //               console.log(`   ❌ Step ${stepNumber} FAILED: Camera error - ${err.message}`);
    //               allStepsPassed = false;
    //               stepResults.push({
    //                 step: stepNumber,
    //                 status: 'failed',
    //                 message: step.onFail || `Camera capture failed: ${err.message}`,
    //                 received: null
    //               });

    //               broadcastTestStatus({
    //                 type: 'STEP_COMPLETED',
    //                 testFile: testFile,
    //                 name: testResult.name,
    //                 stepNumber: stepNumber,
    //                 totalSteps: testConfig.steps.length,
    //                 status: 'failed',
    //                 message: `Camera capture failed: ${err.message}`,
    //                 timestamp: getFormattedDateTime()
    //               });

    //               break; // Stop on failure
    //             }
    //           }
    //         }

    //         // Set overall test result
    //         testResult.passed = allStepsPassed;
    //         testResult.status = allStepsPassed ? 'passed' : 'failed';
    //         testResult.output = allStepsPassed
    //           ? (testConfig.pass || `✅ Camera test passed`)
    //           : (testConfig.fail || `❌ Camera test failed`);
    //         testResult.stepResults = stepResults;

    //         const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
    //         try {
    //           await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
    //           console.log(`✅ Test report appended to: ${testReportFileName}`);
    //         } catch (err) {
    //           console.log(`🔴 Error writing test report: ${err} 🔴`);
    //         }
    //       }
    //       // ========== STEP-BASED TEST EXECUTION ==========
    //       else if (testConfig.steps.length > 0) {
    //         const testDeviceMAC = connectedMACs[0];
    //         let allStepsPassed = true;
    //         const stepResults = [];

    //         console.log(`   🔄 Running step-based test with ${testConfig.steps.length} steps`);

    //         for (let i = 0; i < testConfig.steps.length; i++) {
    //           // Check if stop was requested
    //           if (atsRuntime.testStopRequested) {
    //             console.log('    🛑 Test stopped by user request');
    //             testResult.status = 'stopped';
    //             testResult.output = 'Test stopped by user';
    //             break;
    //           }

    //           const step = testConfig.steps[i];
    //           const stepNumber = step.stepNumber || (i + 1);

    //           console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);
    //           console.log(`    Waiting for: ${step.waitFor} = ${step.expectedValue}`);
    //           console.log(`    Timeout: ${step.waitTime}s`);

    //           // Broadcast step started (same for all step types)
    //           broadcastTestStatus({
    //             type: 'STEP_STARTED',
    //             testFile: testFile,
    //             name: testResult.name,
    //             stepNumber: stepNumber,
    //             totalSteps: testConfig.steps.length,
    //             message: step.msg,
    //             waitFor: step.waitFor,
    //             expectedValue: step.expectedValue,
    //             waitTime: step.waitTime || 20,
    //             timestamp: getFormattedDateTime()
    //           });

    //           // Handle dialog steps separately - wait for user confirmation
    //           // if (step.waitFor === "dialog") {
    //           //   console.log(`   ⏳ Waiting for user dialog confirmation...`);

    //           //   const dialogResult = await new Promise((resolve) => {
    //           //     const timeout = setTimeout(() => {
    //           //       pendingDialogResolver = null;
    //           //       resolve(false);  // Timeout = cancel
    //           //     }, (step.waitTime || 60) * 1000);  // Longer timeout for user interaction

    //           //     pendingDialogResolver = (confirmed) => {
    //           //       clearTimeout(timeout);
    //           //       resolve(confirmed);
    //           //     };
    //           //   });

    //           //   // Process dialog result
    //           //   if (dialogResult) {
    //           //     console.log(`   ✅ Step ${stepNumber} PASSED: User confirmed`);
    //           //     stepResults.push({
    //           //       step: stepNumber,
    //           //       status: 'passed',
    //           //       message: step.onPass || 'User confirmed',
    //           //       received: 'dialog:confirmed'
    //           //     });

    //           //     broadcastTestStatus({
    //           //       type: 'STEP_COMPLETED',
    //           //       testFile: testFile,
    //           //       name: testResult.name,
    //           //       stepNumber: stepNumber,
    //           //       totalSteps: testConfig.steps.length,
    //           //       status: 'passed',
    //           //       message: step.onPass || 'User confirmed',
    //           //       timestamp: getFormattedDateTime()
    //           //     });
    //           //   } else {
    //           //     console.log(`   ❌ Step ${stepNumber} FAILED: User cancelled or timeout`);
    //           //     allStepsPassed = false;
    //           //     stepResults.push({
    //           //       step: stepNumber,
    //           //       status: 'failed',
    //           //       message: step.onFail || 'User cancelled or timeout',
    //           //       received: 'dialog:cancelled'
    //           //     });

    //           //     broadcastTestStatus({
    //           //       type: 'STEP_COMPLETED',
    //           //       testFile: testFile,
    //           //       name: testResult.name,
    //           //       stepNumber: stepNumber,
    //           //       totalSteps: testConfig.steps.length,
    //           //       status: 'failed',
    //           //       message: step.onFail || 'User cancelled or timeout',
    //           //       timestamp: getFormattedDateTime()
    //           //     });

    //           //     break;  // Stop on dialog failure
    //           //   }

    //           //   continue;  // Skip to next step (don't run device waiter)
    //           // }


    //           // Wait for the expected value (device readings)
    //           const stepResult = await new Promise((resolve) => {
    //             const timeout = setTimeout(() => {
    //               atsRuntime.clearTestWaitForMAC();
    //               if (currentStepHandler) {
    //                 const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
    //                 if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //               }
    //               resolve({ success: false, reason: 'TIMEOUT', received: null });
    //             }, (step.waitTime || 20) * 1000);

    //             atsRuntime.setTestWaitForMAC(testDeviceMAC);  //Setting device for testing so it can wait for device readings 

    //             let currentStepHandler = null;

    //             // Handler wait for expecting outputs inside the steps
    //             const stepHandler = (reading) => {
    //               if (!reading || typeof reading !== 'object') {
    //                 return false;
    //               }

    //               // Check if multi-property (contains semicolons)
    //               const isMultiProperty = step.waitFor.includes(';');

    //               if (isMultiProperty) {
    //                 // Multi-property check: ALL properties must match
    //                 const properties = step.waitFor.split(';').map(p => p.trim());
    //                 const expectedValues = step.expectedValue.split(';').map(v => v.trim());

    //                 let allMatch = true;

    //                 // Checking values defined in single step
    //                 for (let j = 0; j < properties.length; j++) {
    //                   const prop = properties[j];
    //                   const expectedVal = expectedValues[j] || expectedValues[0];
    //                   const receivedVal = String(reading[prop]).toUpperCase().trim();
    //                   const normalizedExpected = String(expectedVal).toUpperCase().trim();

    //                   console.log(`   🔍 Checking: ${prop} = "${reading[prop]}" (expected: "${expectedVal}")`);

    //                   if (receivedVal !== normalizedExpected) {
    //                     allMatch = false;
    //                   }
    //                 }

    //                 if (allMatch) {
    //                   clearTimeout(timeout);
    //                   atsRuntime.clearTestWaitForMAC();
    //                   const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
    //                   if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //                   resolve({ success: true, received: 'All properties matched' });
    //                   return true;
    //                 }

    //                 console.log(`⏳ Not all properties matched yet, continuing to wait...`);
    //                 return false;
    //               } else {
    //                 // Single property check
    //                 const receivedValue = reading[step.waitFor];
    //                 const normalizedReceived = String(receivedValue).toUpperCase().trim();
    //                 const normalizedExpected = String(step.expectedValue).toUpperCase().trim();

    //                 console.log(`   🔍 Checking: ${step.waitFor} = "${receivedValue}" (expected: "${step.expectedValue}")`);

    //                 // Checking expected Value
    //                 if (normalizedReceived === normalizedExpected) {
    //                   clearTimeout(timeout);
    //                   atsRuntime.clearTestWaitForMAC();
    //                   const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
    //                   if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //                   resolve({ success: true, received: receivedValue });
    //                   return true;
    //                 }

    //                 return false; // Keep waiting
    //               }
    //             };

    //             currentStepHandler = stepHandler;
    //             atsRuntime.deviceCommandWaiters.push(stepHandler);
    //           });

    //           // Process step result
    //           if (stepResult.success) {
    //             console.log(`   ✅ Step ${stepNumber} PASSED: ${step.onPass || 'Success'}`);
    //             stepResults.push({
    //               step: stepNumber,
    //               status: 'passed',
    //               message: step.onPass || 'Step passed',
    //               received: stepResult.received
    //             });

    //             // sending message to UI after test completion
    //             broadcastTestStatus({
    //               type: 'STEP_COMPLETED',
    //               testFile: testFile,
    //               name: testResult.name,
    //               stepNumber: stepNumber,
    //               totalSteps: testConfig.steps.length,
    //               status: 'passed',
    //               message: step.onPass || 'Step passed',
    //               timestamp: getFormattedDateTime()
    //             });
    //           } else {
    //             console.log(`   ❌ Step ${stepNumber} FAILED: ${step.onFail || stepResult.reason}`);
    //             allStepsPassed = false;
    //             stepResults.push({
    //               step: stepNumber,
    //               status: 'failed',
    //               message: step.onFail || stepResult.reason,
    //               received: stepResult.received
    //             });

    //             broadcastTestStatus({
    //               type: 'STEP_COMPLETED',
    //               testFile: testFile,
    //               name: testResult.name,
    //               stepNumber: stepNumber,
    //               totalSteps: testConfig.steps.length,
    //               status: 'failed',
    //               message: step.onFail || stepResult.reason,
    //               timestamp: getFormattedDateTime()
    //             });

    //             // Stop on first failure (or continue based on config)
    //             break;
    //           }
    //         }

    //         // Set overall test result
    //         testResult.passed = allStepsPassed;
    //         testResult.status = allStepsPassed ? 'passed' : 'failed';
    //         testResult.output = allStepsPassed
    //           ? (testConfig.pass || `✅ All ${testConfig.steps.length} steps passed`)
    //           : (testConfig.fail || `❌ Test failed at step ${stepResults.length}`);
    //         testResult.stepResults = stepResults;

    //         const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
    //         try {
    //           await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
    //           console.log(`✅ Test report appended to: ${testReportFileName}`);
    //         } catch (err) {
    //           console.log(`🔴 Error writing test report: ${err} 🔴`);
    //         }
    //       }
    //       // ========== EO-BASED TEST EXECUTION (Original Logic) ==========
    //       else {
    //         const testDeviceMAC = connectedMACs[0]; // Wait for first connected device


    //         let deviceResponse = null;

    //         // Precompute expectation (property-based or numeric)
    //         const expectation = testResult.expectedOutcome?.toString() || "";

    //         // Support multi-property EO: "prop1:val1;prop2:val2"
    //         const multiPropertyExpectation = expectation.includes(':') && expectation.includes(';')
    //           ? expectation.split(';').map(pair => {
    //             const [prop, val] = pair.trim().split(':');
    //             return { property: prop.trim(), expectedValue: val.trim() };
    //           })
    //           : null;

    //         // Single property EO: "prop:val"
    //         const singlePropertyExpectation = expectation.includes(':') && !expectation.includes(';')
    //           ? expectation.split(':')
    //           : null;

    //         // Track handler for cleanup
    //         let currentHandler = null;

    //         // Create a promise that resolves only when the expected condition is met
    //         const waitForResponse = new Promise((resolve) => {
    //           const timeout = setTimeout(() => {
    //             atsRuntime.clearTestWaitForMAC();
    //             // Cleanup handler on timeout
    //             if (currentHandler) {
    //               const idx = atsRuntime.deviceCommandWaiters.indexOf(currentHandler);
    //               if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //             }
    //             resolve("TIMEOUT");
    //           }, 20000); // 20 second timeout

    //           // Set this MAC as the one we're waiting for
    //           atsRuntime.setTestWaitForMAC(testDeviceMAC);

    //           // Listen for device readings; resolve only on match
    //           const responseHandler = (reading) => {
    //             // Ignore non-object readings
    //             if (!reading || typeof reading !== 'object') {
    //               return false; // keep waiting
    //             }

    //             // Multi-property check: ALL properties must match
    //             if (multiPropertyExpectation) {
    //               console.log(`🔍 Multi-property check (${multiPropertyExpectation.length} properties):`);

    //               let allMatch = true;
    //               const results = [];

    //               for (const { property, expectedValue } of multiPropertyExpectation) {
    //                 const receivedValue = reading[property];
    //                 const normalizedReceived = String(receivedValue).toUpperCase().trim();
    //                 const normalizedExpected = String(expectedValue).toUpperCase().trim();
    //                 const matches = normalizedReceived === normalizedExpected;

    //                 console.log(`⚡ATS ===  ${property}: Expected="${expectedValue}" | Received="${receivedValue}" | Match=${matches}⚡`);
    //                 results.push({ property, expectedValue, receivedValue, matches });

    //                 if (!matches) {
    //                   allMatch = false;
    //                 }
    //               }

    //               if (allMatch) {
    //                 testPassed = true;
    //                 console.log(`✅ ALL properties matched!`);
    //                 clearTimeout(timeout);
    //                 atsRuntime.clearTestWaitForMAC();
    //                 // Cleanup handler on success
    //                 const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
    //                 if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //                 resolve(reading);
    //                 return true;
    //               }

    //               console.log(`⏳ Not all properties matched yet, continuing to wait...`);
    //               return false;
    //             }

    //             // Single property check
    //             if (singlePropertyExpectation) {
    //               const [propertyName, expectedValue] = singlePropertyExpectation;
    //               const receivedValue = reading[propertyName];

    //               console.log(`🔍 Property check: ${propertyName} | Expected: "${expectedValue}" | Received: "${receivedValue}" | Type: ${typeof receivedValue}`);

    //               // More flexible comparison
    //               if (receivedValue !== undefined) {
    //                 const normalizedReceived = String(receivedValue).toUpperCase().trim();
    //                 const normalizedExpected = String(expectedValue).toUpperCase().trim();

    //                 if (normalizedReceived === normalizedExpected) {
    //                   testPassed = true;
    //                   clearTimeout(timeout);
    //                   atsRuntime.clearTestWaitForMAC();
    //                   // Cleanup handler on success
    //                   const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
    //                   if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //                   resolve(reading);
    //                   return true;
    //                 }
    //               }
    //               return false;
    //             }

    //             // Fallback: any object response resolves for numeric EO cases
    //             clearTimeout(timeout);
    //             atsRuntime.clearTestWaitForMAC();
    //             // Cleanup handler on fallback
    //             const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
    //             if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
    //             resolve(reading);
    //             return true;
    //           };

    //           // Store reference for timeout cleanup
    //           currentHandler = responseHandler;
    //           // Store the handler to be called when this device responds
    //           atsRuntime.deviceCommandWaiters.push(responseHandler);
    //         });

    //         deviceResponse = await waitForResponse;

    //         if (deviceResponse === "TIMEOUT") {
    //           testResult.receivedOutcome = "TIMEOUT";
    //           testResult.output = "No device response received within 10 seconds";
    //           testResult.status = "failed";
    //           testResult.passed = false;
    //         } else if (!deviceResponse || typeof deviceResponse !== 'object') {
    //           testResult.receivedOutcome = String(deviceResponse);
    //           testResult.output = `❌ Test FAILED: Invalid device response type (expected object, got ${typeof deviceResponse})`;
    //           testResult.status = "failed";
    //           testResult.passed = false;
    //         } else {
    //           testResult.receivedOutcome = deviceResponse;

    //           let testPassed = false;

    //           const expectation = testResult.expectedOutcome?.toString() || "";

    //           // Multi-property check (contains both : and ;)
    //           if (expectation.includes(':') && expectation.includes(';')) {
    //             const properties = expectation.split(';').map(pair => {
    //               const [prop, val] = pair.trim().split(':');
    //               return { property: prop.trim(), expectedValue: val.trim() };
    //             });

    //             console.log(`📊 Multi-property comparison (${properties.length} properties):`);

    //             let allMatch = true;
    //             const comparisonResults = [];

    //             for (const { property, expectedValue } of properties) {
    //               const receivedValue = deviceResponse[property];
    //               const normalizedReceived = String(receivedValue).toUpperCase().trim();
    //               const normalizedExpected = String(expectedValue).toUpperCase().trim();
    //               const matches = normalizedReceived === normalizedExpected;

    //               console.log(`   ${property}: Expected="${expectedValue}" | Received="${receivedValue}" | Match=${matches}`);
    //               comparisonResults.push(`${property}=${receivedValue}`);

    //               if (!matches) {
    //                 allMatch = false;
    //               }
    //             }

    //             if (allMatch) {
    //               testPassed = true;
    //               testResult.output = `✅ Test PASSED: All properties matched (${comparisonResults.join(', ')})`;
    //             } else {
    //               testResult.output = `❌ Test FAILED: Not all properties matched (${comparisonResults.join(', ')})`;
    //             }
    //           }
    //           // Single property check (contains : but not ;)
    //           else if (expectation.includes(':')) {
    //             const [propertyName, expectedValue] = expectation.split(':');
    //             const receivedValue = deviceResponse[propertyName];

    //             console.log(`📊 Single property comparison: ${propertyName} | Expected: ${expectedValue} | Received: ${receivedValue}`);

    //             // Normalize for comparison
    //             const normalizedReceived = String(receivedValue).toUpperCase().trim();
    //             const normalizedExpected = String(expectedValue).toUpperCase().trim();

    //             if (receivedValue !== undefined && normalizedReceived === normalizedExpected) {
    //               testPassed = true;
    //               testResult.output = `✅ Test PASSED: Property '${propertyName}' = ${receivedValue} (expected ${expectedValue})`;
    //             } else {
    //               testResult.output = `❌ Test FAILED: Property '${propertyName}' = ${receivedValue} (expected ${expectedValue})`;
    //             }
    //           } else {
    //             // No property specified in EO - invalid format
    //             console.warn(`⚠️ EO format not recognized: "${expectation}" - expected format: "property:value" or "prop1:val1;prop2:val2"`);
    //             testResult.output = `❌ Test FAILED: Invalid EO format "${expectation}" - use property:value syntax`;
    //             testPassed = false;
    //           }

    //           summaryLines.push(
    //             `Test: ${testResult.name} | ${testResult.status.toUpperCase()}`
    //           );

    //           testResult.status = testPassed ? "passed" : "failed";
    //           testResult.passed = testPassed;
    //         }

    //         const reportContent = `Test: ${testResult.name} , Status: ${testResult.status}`;
    //         // try {
    //         //   await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
    //         //   console.log(`✅ Test report appended to: ${testReportFileName}`);
    //         // } catch (err) {
    //         //   console.log(`🔴 Error writing test report: ${err} 🔴`);
    //         // }
    //       } // End of EO-based test execution

    //       // Send test completion status
    //       broadcastTestStatus({
    //         type: 'TEST_COMPLETED',
    //         testFile: testFile,
    //         name: testResult.name,
    //         status: testResult.status,
    //         output: testResult.output,
    //         timestamp: getFormattedDateTime()
    //       });

    //     } catch (err) {
    //       console.error(`Error parsing test file ${testFile}:`, err);
    //       testResult.status = "failed";
    //       testResult.output = `Test file parsing error: ${err.message}`;
    //       testResult.passed = false;
    //     }

    //     // await fs.promises.appendFile(
    //     //   testReportFilePath,
    //     //   `\n================ SUMMARY ================\n\n` +
    //     //   summaryLines.join('\n') +
    //     //   `\n\n================ DETAILS ================\n\n`
    //     // );


    //     testResult.duration = Date.now() - startTime;
    //     results.push(testResult);
    //     console.log(`✅ Test completed: ${testFile} - ${testResult.status}`);

    //   } catch (err) {
    //     console.error(`Error processing ${testFile}:`, err);
    //     results.push({
    //       testFile,
    //       status: "failed",
    //       output: `Processing error: ${err.message}`,
    //       passed: false
    //     });
    //   }
    // }

    // const passedCount = results.filter(r => r.passed || r.status === 'passed').length;
    // const failedCount = results.filter(r => !r.passed && r.status !== 'passed').length;

    // const response = {
    //   timestamp: getFormattedDateTime(),
    //   summary: {
    //     total: results.length,
    //     passed: passedCount,
    //     failed: failedCount,
    //     frontendTests: frontendResults?.length || 0,
    //     serverTests: testFiles.length
    //   },
    //   results
    // };

    // // Send final summary
    // broadcastTestStatus({
    //   type: 'ALL_TESTS_COMPLETED',
    //   summary: response.summary,
    //   timestamp: getFormattedDateTime()
    // });

    // console.log(`📊 ATS Tests completed: ${passedCount} passed, ${failedCount} failed`);
    // res.json(response);

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
      deviceId: controllerId
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

// ✅ FAN ASSEMBLY TEST API
// app.post('/api/tests/fan-test', async (req, res) => {
//   console.log("/api/tests/fan-test API called");

//   // RESETING STOP TEST FLAG
//   atsRuntime.resetStop();

//   try {
//     const { mac, controllerId } = req.body;

//     const testDir = path.join(__dirname, "tests/fan");

//     // Create test directory if it doesn't exist
//     if (!fs.existsSync(testDir)) {
//       res.json({ msg: "Test Folder not found" });
//     }

//     // Fetching test files
//     const files = await fs.promises.readdir(testDir);

//     console.log("Files fettched: ", files);

//     // Sort files numerically (1_criticalload.srv, 2_nexttest.srv, etc.)
//     let testFiles = files
//       .filter(file => {
//         const ext = path.extname(file).toLowerCase();
//         return ['.srv'].includes(ext);
//       })
//       .sort((a, b) => {
//         // Extract numbers from filenames for sorting
//         const numA = parseInt(a.split('_')[0]) || 0;
//         const numB = parseInt(b.split('_')[0]) || 0;
//         return numA - numB;
//       });

//     console.log(`Found ${testFiles.length} test file(s):`, testFiles);

//     if (testFiles.length === 0) {
//       return res.status(400).json({
//         error: "No test files found in test directory",
//         timestamp: getFormattedDateTime()
//       });
//     }

//     // Prepare a single report file for this run
//     const testResultDir = path.join(__dirname, "testResult/fan");
//     if (!fs.existsSync(testResultDir)) {
//       fs.mkdirSync(testResultDir, { recursive: true });
//     }

//     const reportMac = mac ? String(mac).replace(/:/g, '-') : 'unknown-device';
//     const testReportFileName = `${getFormattedDateTime('file')}_${reportMac}.rpt`;
//     const testReportFilePath = path.join(testResultDir, testReportFileName);

//     const totalTests = testFiles.length;

//     await fs.promises.writeFile(
//       testReportFilePath,
//       `FAN Test Run - ${getFormattedDateTime()}\nDevice: ${reportMac}\nTotal Tests: ${totalTests}\n\n`,
//       { flag: 'w' }
//     );

//     const results = [];

//     for (const testFile of testFiles) {
//       if (atsRuntime.testStopRequested) {
//         console.log('    🛑 Test execution stopped by user - skipping remaining tests');
//         break;
//       }

//       const testFilePath = path.join(testDir, testFile);
//       console.log(`🔬 Processing test file: ${testFile}`);

//       try {
//         // TEST RESULT OBJECT
//         let testResult = {
//           testFile,
//           status: "pending",
//           output: "",
//           duration: 0,
//           name: "",
//           message: "",
//           expectedOutcome: null,
//           receivedOutcome: null,
//           passed: false,
//           commands: []
//         };

//         const startTime = Date.now();

//         try {
//           // Fetching File content
//           const fileContent = await fs.promises.readFile(testFilePath, "utf-8");
//           const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

//           let testConfig = {
//             name: "",
//             message: "",
//             // expectedOutcome: null,
//             commands: [],
//             // pre: "",
//             pass: "",
//             fail: "",
//             timeout: 20,
//             retryCount: 0,
//             type: "",
//             steps: []
//           };

//           let currentStep = null;

//           // Parse .srv file
//           for (const line of lines) {
//             // Check for step header [step:N]
//             const stepMatch = line.match(/^\[step:(\d+)\]$/);
//             if (stepMatch) {
//               // Save previous step if exists
//               if (currentStep) {
//                 testConfig.steps.push(currentStep);
//               }
//               // Start new step
//               currentStep = {
//                 stepNumber: parseInt(stepMatch[1]),
//                 msg: "",
//                 action: "",
//                 waitFor: "",
//                 waitTime: 20,
//                 expectedValue: "",
//                 onPass: "",
//                 onFail: ""
//               };
//               continue;
//             }

//             // Properties inside the steps
//             if (currentStep) {
//               if (line.startsWith('msg=')) {
//                 currentStep.msg = line.substring(4).replace(/["\']/g, '');
//               } else if (line.startsWith('action=')) {
//                 currentStep.action = line.substring(7).replace(/["\']/g, '') + getFormattedDateTime() + "$";
//               } else if (line.startsWith('waitFor=')) {
//                 currentStep.waitFor = line.substring(8).replace(/["\']/g, '');
//               } else if (line.startsWith('waitTime=')) {
//                 currentStep.waitTime = parseInt(line.substring(9).replace(/["\']/g, '')) || 20;
//               } else if (line.startsWith('expectedValue=')) {
//                 currentStep.expectedValue = line.substring(14).replace(/["\']/g, '');
//               } else if (line.startsWith('increasedBy=')) {
//                 currentStep.increasedBy = parseFloat(line.substring(12).replace(/["\']/g, '')) || 0;
//               } else if (line.startsWith('onPass=')) {
//                 currentStep.onPass = line.substring(7).replace(/["\']/g, '');
//               } else if (line.startsWith('onFail=')) {
//                 currentStep.onFail = line.substring(7).replace(/["\']/g, '');
//               } else if (line.startsWith('cameraUrl=')) {
//                 currentStep.cameraUrl = line.substring(10).replace(/["\']/g, '');
//               }
//             } else {
//               // Properties before the steps
//               if (line.startsWith('name=')) {
//                 testConfig.name = line.substring(5).replace(/["\']/g, '');
//               } else if (line.startsWith('msg=')) {
//                 testConfig.message = line.substring(4).replace(/["\']/g, '');
//               } else if (line.startsWith('pre=')) {
//                 testConfig.pre = line.substring(4).replace(/["\']/g, '');
//               } else if (line.startsWith('pass=')) {
//                 testConfig.pass = line.substring(5).replace(/["\']/g, '');
//               } else if (line.startsWith('fail=')) {
//                 testConfig.fail = line.substring(5).replace(/["\']/g, '');
//               } else if (line.startsWith('type=')) {
//                 testConfig.type = line.substring(5).replace(/["\']/g, '');
//               } else if (line.startsWith('retryCount=')) {
//                 testConfig.retryCount = parseInt(line.substring(11).replace(/["\']/g, '')) || 0;
//               } else if (line && !line.includes('=')) {
//                 testConfig.commands.push(line);
//               }
//             }
//           }

//           // Don't forget to add the last step
//           if (currentStep) {
//             testConfig.steps.push(currentStep);
//           }

//           // Sending test files details from config to result
//           testResult.name = testConfig.name || path.parse(testFile).name;
//           testResult.message = testConfig.message || testConfig.pre || "No message";
//           testResult.expectedOutcome = testConfig.expectedOutcome;
//           testResult.commands = testConfig.commands;

//           console.log(`    ▶️ Starting ATS test: ${testResult.name}`);
//           console.log(`    📝 Message to display: ${testResult.message}`);
//           console.log(`    🎯 Expected Outcome: ${testResult.expectedOutcome}`);
//           console.log(`    📋 Steps defined: ${testConfig.steps.length}`);

//           // BROADCASTING MESSAGE
//           // FOR: TEST STARTED
//           broadcastTestStatus({
//             type: 'TEST_STARTED',
//             testFile: testFile,
//             name: testResult.name,
//             message: testResult.message,
//             pre: testConfig.pre,
//             expectedOutcome: testResult.expectedOutcome,
//             totalSteps: testConfig.steps.length,
//             timestamp: getFormattedDateTime()
//           });

//           // Get the first connected device MAC to wait for
//           const connectedMACs = Array.from(atsRuntime.connectedDevices.keys());

//           console.log("Connected Device: ", connectedMACs);
//           if (connectedMACs.length === 0) {
//             testResult.output = "❌ Test FAILED: No connected devices available";
//             testResult.status = "failed";
//             testResult.passed = false;
//           } else if (testConfig.steps.length > 0) {
//             console.log("Steps Length: ", testConfig.steps.length);
//             console.log("🔴INTO TESTING PHASE🔴")

//             const testDeviceMAC = connectedMACs[0];
//             let allStepsPassed = true;

//             console.log("Step result calculation starts")
//             const stepResults = [];

//             for (let i = 0; i < testConfig.steps.length; i++) {
//               // CHECKING IF STEP STOP IS REQUESTED
//               if (atsRuntime.testStopRequested) {
//                 console.log('    🛑 Test stopped by user request');
//                 testResult.status = 'stopped';
//                 testResult.output = 'Test stopped by user';
//                 break;
//               }

//               const step = testConfig.steps[i];
//               const stepNumber = step.stepNumber || (i + 1);

//               console.log("Starting Step test")
//               console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);
//               console.log(`    Waiting for: ${step.waitFor} = ${step.expectedValue}`);
//               console.log(`    Timeout: ${step.waitTime}s`);
//               console.log(`    Action: ${step.action}`)

//               console.log(`\n🟦 STEP ${stepNumber} STARTED`);
//               // BROADCASTING MESSAGE
//               // FOR: STEP STARTED
//               broadcastTestStatus({
//                 type: 'STEP_STARTED',
//                 testFile: testFile,
//                 name: testResult.name,
//                 stepNumber: stepNumber,
//                 totalSteps: testConfig.steps.length,
//                 message: step.msg,
//                 waitFor: step.waitFor,
//                 expectedValue: step.expectedValue,
//                 waitTime: step.waitTime || 20,
//                 timestamp: getFormattedDateTime()
//               });

//               console.log("🟢Send Step Broadcast message to frontend🟢")

//               // WAITING FOR EXPECTED VALUE (device readings)
//               const stepResult = await new Promise((resolve) => {
//                 // Tracking matching state
//                 let isCurrentlyMatching = false;
//                 let lastReceivedValue = null;

//                 const timeout = setTimeout(() => {
//                   atsRuntime.clearTestWaitForMAC();
//                   if (currentStepHandler) {
//                     const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
//                     if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
//                   }
//                   if (isCurrentlyMatching) {
//                     console.log("✅ Step passed after full waitTime");

//                     resolve({
//                       success: true,
//                       received: lastReceivedValue
//                     });
//                   } else {
//                     console.log("❌ Step failed after full waitTime");

//                     resolve({
//                       success: false,
//                       reason: 'VALUE_NOT_MATCHING_AT_END',
//                       received: lastReceivedValue
//                     });
//                   }
//                 }, (step.waitTime || 20) * 1000);


//                 atsRuntime.setTestWaitForMAC(testDeviceMAC);  //Setting device for testing so it can wait for device readings 
//                 console.log("🟨 Setting wait MAC:", testDeviceMAC);



//                 // Handler wait for expecting outputs inside the steps
//                 const stepHandler = (reading) => {
//                   if (!reading || typeof reading !== 'object') {
//                     return false;
//                   }

//                   // let isMatch = false;

//                   console.log("📥 Reading received:", reading);

//                   // Check if multi-property (contains semicolons)
//                   const isMultiProperty = step.waitFor.includes(';');

//                   if (isMultiProperty) {
//                     // Multi-property check: ALL properties must match
//                     const properties = step.waitFor.split(';').map(p => p.trim());
//                     const expectedValues = step.expectedValue.split(';').map(v => v.trim());

//                     // let matchStartTime = null;
//                     let allMatch = true;

//                     console.log("🔎 Expected values:", expectedValues);


//                     // Checking values defined in single step
//                     for (let j = 0; j < properties.length; j++) {
//                       const prop = properties[j];
//                       const expectedVal = expectedValues[j] || expectedValues[0];
//                       const receivedVal = String(reading[prop]).toUpperCase().trim();
//                       const normalizedExpected = String(expectedVal).toUpperCase().trim();

//                       console.log(`   🔍 Checking: ${prop} = "${reading[prop]}" (expected: "${expectedVal}")`);

//                       // if (receivedVal !== normalizedExpected) {
//                       //   allMatch = false;
//                       // }

//                       isCurrentlyMatching = properties.every((prop, i) => {
//                         const expected = (expectedValues[i] || expectedValues[0]).toUpperCase().trim();
//                         const received = String(reading[prop]).toUpperCase().trim();
//                         return received === expected;
//                       });

//                       lastReceivedValue = reading;

//                     }

//                     // // CHECKING ALL PROPERTIES MATCHED OF SINGLE STEP
//                     // if (allMatch) {
//                     //   clearTimeout(timeout);
//                     //   clearTestWaitForMAC();
//                     //   const idx = deviceCommandWaiters.indexOf(stepHandler);
//                     //   if (idx > -1) deviceCommandWaiters.splice(idx, 1);
//                     //   resolve({ success: true, received: 'All properties matched' });
//                     //   return true;
//                     // }

//                     console.log("🔎 All properties matched?", allMatch);

//                     console.log(`⏳ Not all properties matched yet, continuing to wait...`);
//                     return false;
//                   }
//                   // SINGLE PROPERTY CHECK
//                   else {
//                     const receivedValue = reading[step.waitFor];
//                     lastReceivedValue = receivedValue;

//                     const normalizedReceived = String(receivedValue).toUpperCase().trim();
//                     const normalizedExpected = String(step.expectedValue).toUpperCase().trim();

//                     console.log(`   🔍 Checking: ${step.waitFor} = "${receivedValue}" (expected: "${step.expectedValue}")`);

//                     isCurrentlyMatching = (normalizedReceived === normalizedExpected);

//                     // // COMPARING VALUES 
//                     // if (normalizedReceived === normalizedExpected) {
//                     //   clearTimeout(timeout);
//                     //   clearTestWaitForMAC();
//                     //   const idx = deviceCommandWaiters.indexOf(stepHandler);
//                     //   if (idx > -1) deviceCommandWaiters.splice(idx, 1);
//                     //   resolve({ success: true, received: receivedValue });
//                     //   return true;
//                     // }

//                     return false; // Keep waiting
//                   }
//                 };

//                 currentStepHandler = stepHandler;
//                 atsRuntime.deviceCommandWaiters.push(stepHandler);

//                 console.log("🟩 Step handler registered. Total handlers:", atsRuntime.deviceCommandWaiters.length);


//                 if (step.action) {
//                   console.log("🚀 Sending command:", step.action);
//                   fetch("http://localhost:5000/command", {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ mac: connectedMACs, command: step.action }),
//                   });
//                 }

//               });



//               // CHECKING SINGLE STEP RESULT
//               if (stepResult.success) {
//                 console.log(`    ✅ Step ${stepNumber} PASSED: ${step.onPass || 'Success'}`);
//                 // PASSING STEP RESULT TO 'stepResult' ARRAY
//                 stepResults.push({
//                   step: stepNumber,
//                   status: 'passed',
//                   message: step.onPass || 'Step passed',
//                   received: stepResult.received
//                 });

//                 // BROADCASTING MESSAGE
//                 // FOR: STEP COMPLETED RESULT
//                 broadcastTestStatus({
//                   type: 'STEP_COMPLETED',
//                   testFile: testFile,
//                   name: testResult.name,
//                   stepNumber: stepNumber,
//                   totalSteps: testConfig.steps.length,
//                   status: 'passed',
//                   message: step.onPass || 'Step passed',
//                   timestamp: getFormattedDateTime()
//                 });
//               }
//               // ELSE FOR (Single Step Failed)
//               else {
//                 console.log(`   ❌ Step ${stepNumber} FAILED: ${step.onFail || stepResult.reason}`);
//                 allStepsPassed = false;
//                 stepResults.push({
//                   step: stepNumber,
//                   status: 'failed',
//                   message: step.onFail || stepResult.reason,
//                   received: stepResult.received
//                 });

//                 // BROADCASTING MESSAGE
//                 // FOR: STEP COMPLETED RESULT
//                 broadcastTestStatus({
//                   type: 'STEP_COMPLETED',
//                   testFile: testFile,
//                   name: testResult.name,
//                   stepNumber: stepNumber,
//                   totalSteps: testConfig.steps.length,
//                   status: 'failed',
//                   message: step.onFail || stepResult.reason,
//                   timestamp: getFormattedDateTime()
//                 });

//                 // STOPPING ON SINGLE STEP FAILING
//                 // break;
//                 continue
//               }
//             }

//             // Set overall test result
//             testResult.passed = allStepsPassed;
//             testResult.status = allStepsPassed ? 'passed' : 'failed';


//             try {
//               // 1️⃣ Write human-readable test header
//               await fs.promises.appendFile(
//                 testReportFilePath,
//                 `Test: ${testResult.name}\nStatus: ${testResult.status}\n\n`
//               );

//               // 2️⃣ Write CSV header ONCE
//               await fs.promises.appendFile(
//                 testReportFilePath,
//                 'Step,StepStatus,Message\n'
//               );

//               for (const step of stepResults) {
//                 const line =
//                   `${step.step},` +
//                   `${step.status.toUpperCase()},` +
//                   `"${step.message.replace(/"/g, '""')}"\n`;

//                 await fs.promises.appendFile(testReportFilePath, line);
//               }

//               // Blank line after each test (important for readability)
//               await fs.promises.appendFile(testReportFilePath, '\n');


//               testResult.output = allStepsPassed
//                 ? (testConfig.pass || `✅ All ${testConfig.steps.length} steps passed`)
//                 : (testConfig.fail || `❌ Test failed at step ${stepResults.length}`);
//               testResult.stepResults = stepResults;

//               await fs.promises.appendFile(
//                 testReportFilePath,
//                 '=== TEST END ===\n\n'
//               );

//               // const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
//               // await fs.promises.appendFile(testReportFilePath, `${reportBlock}\n`);
//               console.log(`✅ Test report appended to: ${testReportFileName}`);
//             } catch (err) {
//               console.log(`🔴 Error writing test report: ${err} 🔴`);
//             }
//           }

//           // Send test completion status
//           broadcastTestStatus({
//             type: 'TEST_COMPLETED',
//             testFile: testFile,
//             name: testResult.name,
//             status: testResult.status,
//             output: testResult.output,
//             timestamp: getFormattedDateTime()
//           });

//         } catch (err) {
//           console.error(`Error parsing test file ${testFile}:`, err);
//           testResult.status = "failed";
//           testResult.output = `Test file parsing error: ${err.message}`;
//           testResult.passed = false;
//         }

//         testResult.duration = Date.now() - startTime;
//         results.push(testResult);
//         console.log(`✅ Test completed: ${testFile} - ${testResult.status}`);

//       } catch (err) {
//         console.error(`Error processing ${testFile}:`, err);
//         results.push({
//           testFile,
//           status: "failed",
//           output: `Processing error: ${err.message}`,
//           passed: false
//         });
//       }
//     }

//     const passedCount = results.filter(r => r.passed || r.status === 'passed').length;
//     const failedCount = results.filter(r => !r.passed && r.status !== 'passed').length;

//     const response = {
//       timestamp: getFormattedDateTime(),
//       summary: {
//         total: results.length,
//         passed: passedCount,
//         failed: failedCount,
//         serverTests: testFiles.length
//       },
//       results
//     };


//     // Send final summary
//     broadcastTestStatus({
//       type: 'ALL_TESTS_COMPLETED',
//       summary: response.summary,
//       timestamp: getFormattedDateTime()
//     });

//     console.log(`📊 ATS Tests completed: ${passedCount} passed, ${failedCount} failed`);
//     res.json(response);

//   } catch (err) {
//     console.error("❌ Error running all tests:", err.message);
//     res.status(500).json({
//       error: `Failed to run tests: ${err.message}`,
//       timestamp: getFormattedDateTime()
//     });
//   }
// });

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

    const testDir = path.join(__dirname, `/tests/${testType}`);

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

      console.log(`Raw data received ${data.toString('hex')} with length (${data.length} bytes) from`, clientInfo);
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
        const hupsDVC = packet.readInt16LE(35);
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

        console.log(fanStatus);
        console.log(fanLevel1Running, fanLevel2Running, fanLevel3Running, fanLevel4Running);

        // console.log("Fan Status: ", fanStatus);

        if (padding === 0x31 && !alreadyReplied) {
          sendX(socket);
          alreadyReplied = 40;
        }

        // ========== CAMERA LOGIC ==========
        if ((padding === 0x43) && (doorStatus === "OPEN")) {
          console.log("⚡Camera Function runs ...⚡")

          let timestamp = getFormattedDateTime("path");
          const snapshotFileName = `image_${timestamp}.jpg`;


          /* 
            Function that captures snapshots from Hi-Focus and Sparsh Cameras. 
          */
          try {
            console.log("⏰ Snapshot for Hi-Focus Camera ⏰");

            const cameraDetails = await Device.findOne({ mac }, 'ipCamera').lean();
            const cameraMake = cameraDetails.ipCamera.type.trim();
            console.log("Camera Make: ", cameraMake);

            if (cameraMake === 'H') {
              console.log("⏰ Snapshot for HiFocus Camera ⏰");

              const ip = cameraDetails.ipCamera.ip.trim();
              const snapshotOutputDir_MAC = path.join(snapshotOutputDir, mac.slice(8).replace(/[: ]/g, '_'));

              // Using ffmpeg to capture snapshot from the HI-Focus Camera
              const args = [
                '-rtsp_transport', 'tcp',
                '-i', `rtsp://${ip}/media/video1`,
                '-frames:v', '1',
                `${snapshotOutputDir_MAC}/${snapshotFileName}`
              ];

              const ffmpeg = spawn('ffmpeg', args);

              // For Debugging
              ffmpeg.stderr.on('data', (data) => {
                console.log(`ffmpeg: ${data}`);
              });

              ffmpeg.on('close', (code) => {
                if (code === 0) {
                  if (eMS_LOGS) console.log("Captured successfully...");
                } else {
                  console.error(`ffmpeg process exited with code ${code}`);
                }
              });

              ffmpeg.on('error', (err) => {
                console.error(`❌ Failed to start ffmpeg:`, err.message);
              });

            } else {
              console.log("⏰ Snapshot for Sparsh Camera ⏰");

              console.log("Timestamp: ", timestamp);

              // Extracting Camera IP from DB for Sparsh Camera
              let camIP = cameraDetails.ipCamera.ip.trim();

              // Added 3 seconds delay for first snapshot capture to wait for opening the door 
              setTimeout(() => {
                let url = `https://${camIP}/CGI/command/snap?channel=01`;
                console.log("📸 Capturing from URL:", url);

                const snapshotOutputDir_MAC = path.join(snapshotOutputDir, mac.slice(8).replace(/[. ]/g, '_'));
                const snapshotOutputPath = path.join(snapshotOutputDir_MAC, snapshotFileName);

                if (eMS_LOGS) console.log("🔴outputDir: ", snapshotOutputDir, "🔴");

                try {
                  if (!fs.existsSync(snapshotOutputDir)) {
                    fs.mkdirSync(snapshotOutputDir, { recursive: true });
                    console.log(`📁 Created directory: ${snapshotOutputDir}`);
                  }
                } catch (err) {
                  console.error(`❌ Failed to create directory ${snapshotOutputDir}:`, err.message);
                }

                axios({
                  method: 'GET',
                  url: url,
                  responseType: 'stream',
                  timeout: 10000
                })
                  .then((response) => {
                    const writer = fs.createWriteStream(snapshotOutputPath);
                    response.data.pipe(writer);

                    return new Promise((resolve, reject) => {
                      writer.on('finish', resolve);
                      writer.on('error', reject);
                    });
                  })
                  .then(() => {
                    if (eMS_LOGS) console.log(`✅ Snapshot captured: ${snapshotFileName}`);
                  })
                  .catch((error) => {
                    console.error(`❌ Error capturing snapshot: ${error.message}`);
                  });
              }, 3000); // 3 second delay
            }
          } catch (err) {
            console.error(`Error occured while caputuring snapshots: ${err}`)
          }
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

        if (lockStatus == "OPEN" ) {
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

// Start servers
tcpServer.listen(4000, "0.0.0.0", () => {
  console.log("✅ TCP server listening on port 4000");
});

app.listen(5000, "0.0.0.0", () => {
  console.log("✅ HTTP server running on port 5000");
});

console.log("🚀 All servers started successfully!");