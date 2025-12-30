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
const WebSocket = require('ws');

const app = express();
const connectedDevices = new Map();
// In-memory latest readings cache (global)
let latestReadings = [];
app.use(bodyParser.json());
const cors = require("cors");
app.use(cors());

// WebSocket Server
const WS_PORT = process.env.WS_PORT || 8080;
const wss = new WebSocket.Server({ port: WS_PORT });
const wsClients = new Set();

// WebSocket connection handling with improved logging
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
      connectedDevices: Array.from(connectedDevices.keys()),
      timestamp: getFormattedDateTime()
    }
  }));

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

// Improved WebSocket broadcast function
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

// Broadcast test status/progress to web clients
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
      connectedDevices: connectedDevices.size,
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

// ===================== HTTP API Endpoints =====================
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

  res.json({ role: user.role, token });
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
  const deviceSocket = connectedDevices.get(normalizedMac);

  if (!deviceSocket || deviceSocket.destroyed) {
    connectedDevices.delete(normalizedMac);
    return res.status(404).json({ message: `Device ${normalizedMac} not connected` });
  }

  const buffer = Buffer.from(command, "utf-8");
  deviceSocket.write(buffer, (err) => {
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
    res.json(Array.from(connectedDevices.keys()).map((m) => String(m).toLowerCase()));
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

// Debug endpoints
// app.get("/api/debug/stats", (req, res) => {
//   res.json(debug.stats());
// });

// app.get("/api/debug/health", (req, res) => {
//   res.json(debug.healthCheck());
// });

// app.post("/api/debug/toggle", (req, res) => {
//   debug.enabled = !debug.enabled;
//   res.json({
//     enabled: debug.enabled,
//     message: `Debug ${debug.enabled ? 'enabled' : 'disabled'}`,
//     timestamp: getFormattedDateTime()
//   });
// });

// FIXED: Corrected connected-devices endpoint
// app.post("/api/debug/connected-devices", (req, res) => {
//   const devices = Array.from(connectedDevices.entries()).map(([mac, socket]) => ({
//     mac,
//     connected: !socket.destroyed,
//     remoteAddress: socket.remoteAddress,
//     remotePort: socket.remotePort,
//     lastSeen: getFormattedDateTime()
//   }));

//   res.json(devices);
// });

// app.post("/api/debug/reset-counters", (req, res) => {
//   debug.errorCount = 0;
//   debug.packetCount = 0;
//   debug.bufferStats.malformedPackets = 0;
//   debug.bufferStats.discardedBytes = 0;
//   debug.bufferStats.totalBytes = 0;
//   debug.lastPacketTime = null;

//   res.json({
//     message: "All counters reset",
//     resetTime: getFormattedDateTime()
//   });
// });

// app.get("/api/debug/packet-stream", (req, res) => {
//   res.json({
//     currentTime: getFormattedDateTime(),
//     totalPackets: debug.packetCount,
//     lastPacketTime: debug.lastPacketTime ? getFormattedDateTime(new Date(debug.lastPacketTime)) : "Never",
//     activeConnections: connectedDevices.size,
//     bufferStatus: {
//       currentReadings: latestReadings.length,
//       maxBufferSize: BULK_SAVE_LIMIT
//     }
//   });
// });

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
app.post("/api/test/run", async (req, res) => {
  const { testFile } = req.body;

  if (!testFile) {
    return res.status(400).json({ error: "testFile is required" });
  }

  const testPath = path.join(__dirname, "test", testFile);
  const baseDir = path.join(__dirname, "test");

  // Prevent path traversal
  if (!path.normalize(testPath).startsWith(baseDir)) {
    return res.status(400).json({ error: "Invalid test file path" });
  }

  try {
    const stat = await fs.promises.stat(testPath);

    if (stat.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory, not a test file" });
    }

    const fileExt = path.extname(testFile).toLowerCase();
    let testResult = { testFile, status: "pending", output: "" };

    // Handle JavaScript test files
    if (fileExt === ".js") {
      try {
        delete require.cache[require.resolve(testPath)];
        const testModule = require(testPath);

        if (typeof testModule === "function") {
          const result = await testModule();
          testResult.status = "passed";
          testResult.output = result || "Test executed successfully";
        } else if (testModule.run && typeof testModule.run === "function") {
          const result = await testModule.run();
          testResult.status = "passed";
          testResult.output = result || "Test executed successfully";
        } else {
          testResult.status = "passed";
          testResult.output = "Test file loaded successfully";
        }
      } catch (err) {
        testResult.status = "failed";
        testResult.output = err.message;
      }
    }
    // Handle text/CSV/JSON files (read and return)
    else if ([".txt", ".csv", ".json"].includes(fileExt)) {
      const fileContent = await fs.promises.readFile(testPath, "utf-8");
      testResult.status = "passed";
      testResult.output = fileContent;
      testResult.fileType = fileExt;
    }

    res.json({
      timestamp: getFormattedDateTime(),
      ...testResult
    });
  } catch (err) {
    console.error("❌ Error running test:", err.message);
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "Test file not found" });
    }
    if (err.code === "EISDIR") {
      return res.status(400).json({ error: "Path is a directory" });
    }
    res.status(500).json({ error: `Failed to run test: ${err.message}` });
  }
});

// ✅ Run all tests sequentially (one by one)
app.post("/api/tests/run-all", async (req, res) => {
  console.log("📋 /api/tests/run-all endpoint called - ATS Mode");

  try {
    const testDir = path.join(__dirname, "tests");

    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      // fs.mkdirSync(testDir, { recursive: true });
      // console.log(`Created test directory: ${testDir}`);

      // return res.json({
      //   timestamp: getFormattedDateTime(),
      //   summary: {
      //     total: 0,
      //     passed: 0,
      //     failed: 0
      //   },
      //   results: [],
      //   message: "Test directory created (no test files found)"
      // });

      res.json({ msg: "Test Folder not found" });
    }

    const files = await fs.promises.readdir(testDir);

    // Sort files numerically (1_criticalload.srv, 2_nexttest.srv, etc.)
    const testFiles = files
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

    const results = [];

    // Run test files one by one
    for (const testFile of testFiles) {
      const testFilePath = path.join(testDir, testFile);
      console.log(`🔬 Processing test file: ${testFile}`);

      try {
        let testResult = {
          testFile,
          status: "pending",
          output: "",
          duration: 0,
          name: "",
          message: "",
          expectedOutcome: null,
          receivedOutcome: null,
          passed: false,
          commands: []
        };

        const startTime = Date.now();

        // Parse .srv test file
        try {
          const fileContent = await fs.promises.readFile(testFilePath, "utf-8");
          const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line);

          let testConfig = {
            name: "",
            message: "",
            expectedOutcome: null,
            commands: []
          };

          // Parse .srv file
          for (const line of lines) {
            if (line.startsWith('name=')) {
              testConfig.name = line.substring(5).replace(/["\']/g, '');
            } else if (line.startsWith('msg=')) {
              testConfig.message = line.substring(4).replace(/["\']/g, '');
            } else if (line.startsWith('EO=')) {
              // Keep as string to support both numeric and property-based comparisons (e.g., lockStatus:OPEN)
              testConfig.expectedOutcome = line.substring(3).replace(/["\']/g, '');
            } else if (line && !line.includes('=')) {
              // It's a command (if any in the test file)
              testConfig.commands.push(line);
            }
          }

          testResult.name = testConfig.name || path.parse(testFile).name;
          testResult.message = testConfig.message || "No message";
          testResult.expectedOutcome = testConfig.expectedOutcome;
          testResult.commands = testConfig.commands;

          console.log(`▶️ Starting ATS test: ${testResult.name}`);
          console.log(`📝 Message to display: ${testResult.message}`);
          console.log(`🎯 Expected Outcome: ${testResult.expectedOutcome}`);

          // Send test status to WebSocket clients
          broadcastTestStatus({
            type: 'TEST_STARTED',
            testFile: testFile,
            name: testResult.name,
            message: testResult.message,
            expectedOutcome: testResult.expectedOutcome,
            timestamp: getFormattedDateTime()
          });

          // Wait for device response with timeout (10 seconds)
          console.log(`⏳ Waiting for device response (max 10 seconds)...`);

          // Get the first connected device MAC to wait for
          const connectedMACs = Array.from(connectedDevices.keys());

          if (connectedMACs.length === 0) {
            testResult.output = "❌ Test FAILED: No connected devices available";
            testResult.status = "failed";
            testResult.passed = false;
          } else {
            const testDeviceMAC = connectedMACs[0]; // Wait for first connected device

            let deviceResponse = null;

            // Precompute expectation (property-based or numeric)
            const expectation = testResult.expectedOutcome?.toString() || "";

            // Support multi-property EO: "prop1:val1;prop2:val2"
            const multiPropertyExpectation = expectation.includes(':') && expectation.includes(';')
              ? expectation.split(';').map(pair => {
                const [prop, val] = pair.trim().split(':');
                return { property: prop.trim(), expectedValue: val.trim() };
              })
              : null;

            // Single property EO: "prop:val"
            const singlePropertyExpectation = expectation.includes(':') && !expectation.includes(';')
              ? expectation.split(':')
              : null;

            // Create a promise that resolves only when the expected condition is met
            const waitForResponse = new Promise((resolve) => {
              const timeout = setTimeout(() => {
                clearTestWaitForMAC();
                resolve("TIMEOUT");
              }, 10000); // 10 second timeout

              // Set this MAC as the one we're waiting for
              setTestWaitForMAC(testDeviceMAC);

              // Listen for device readings; resolve only on match
              const responseHandler = (reading) => {
                // Ignore non-object readings
                if (!reading || typeof reading !== 'object') {
                  return false; // keep waiting
                }

                // Multi-property check: ALL properties must match
                if (multiPropertyExpectation) {
                  console.log(`🔍 Multi-property check (${multiPropertyExpectation.length} properties):`);

                  let allMatch = true;
                  const results = [];

                  for (const { property, expectedValue } of multiPropertyExpectation) {
                    const receivedValue = reading[property];
                    const normalizedReceived = String(receivedValue).toUpperCase().trim();
                    const normalizedExpected = String(expectedValue).toUpperCase().trim();
                    const matches = normalizedReceived === normalizedExpected;

                    console.log(`⚡ATC ===  ${property}: Expected="${expectedValue}" | Received="${receivedValue}" | Match=${matches}⚡`);
                    results.push({ property, expectedValue, receivedValue, matches });

                    if (!matches) {
                      allMatch = false;
                    }
                  }

                  if (allMatch) {
                    console.log(`✅ ALL properties matched!`);
                    clearTimeout(timeout);
                    clearTestWaitForMAC();
                    resolve(reading);
                    return true;
                  }

                  console.log(`⏳ Not all properties matched yet, continuing to wait...`);
                  return false;
                }

                // Single property check
                if (singlePropertyExpectation) {
                  const [propertyName, expectedValue] = singlePropertyExpectation;
                  const receivedValue = reading[propertyName];

                  console.log(`🔍 Property check: ${propertyName} | Expected: "${expectedValue}" | Received: "${receivedValue}" | Type: ${typeof receivedValue}`);

                  // More flexible comparison
                  if (receivedValue !== undefined) {
                    const normalizedReceived = String(receivedValue).toUpperCase().trim();
                    const normalizedExpected = String(expectedValue).toUpperCase().trim();

                    if (normalizedReceived === normalizedExpected) {
                      clearTimeout(timeout);
                      clearTestWaitForMAC();
                      resolve(reading);
                      return true;
                    }
                  }
                  return false;
                }

                // Fallback: any object response resolves for numeric EO cases
                clearTimeout(timeout);
                clearTestWaitForMAC();
                resolve(reading);
                return true;
              };

              // Store the handler to be called when this device responds
              deviceCommandWaiters.push(responseHandler);
            });

            deviceResponse = await waitForResponse;

            if (deviceResponse === "TIMEOUT") {
              testResult.receivedOutcome = "TIMEOUT";
              testResult.output = "No device response received within 10 seconds";
              testResult.status = "failed";
              testResult.passed = false;
            } else if (!deviceResponse || typeof deviceResponse !== 'object') {
              testResult.receivedOutcome = String(deviceResponse);
              testResult.output = `❌ Test FAILED: Invalid device response type (expected object, got ${typeof deviceResponse})`;
              testResult.status = "failed";
              testResult.passed = false;
            } else {
              testResult.receivedOutcome = deviceResponse;

              // Handle three types of EO comparisons:
              // 1. Simple numeric: EO=1
              // 2. Single property: EO=lockStatus:OPEN
              // 3. Multi-property: EO=fanLevel1Running:true;fanLevel2Running:true

              let testPassed = false;

              const expectation = testResult.expectedOutcome?.toString() || "";

              // Multi-property check (contains both : and ;)
              if (expectation.includes(':') && expectation.includes(';')) {
                const properties = expectation.split(';').map(pair => {
                  const [prop, val] = pair.trim().split(':');
                  return { property: prop.trim(), expectedValue: val.trim() };
                });

                console.log(`📊 Multi-property comparison (${properties.length} properties):`);

                let allMatch = true;
                const comparisonResults = [];

                for (const { property, expectedValue } of properties) {
                  const receivedValue = deviceResponse[property];
                  const normalizedReceived = String(receivedValue).toUpperCase().trim();
                  const normalizedExpected = String(expectedValue).toUpperCase().trim();
                  const matches = normalizedReceived === normalizedExpected;

                  console.log(`   ${property}: Expected="${expectedValue}" | Received="${receivedValue}" | Match=${matches}`);
                  comparisonResults.push(`${property}=${receivedValue}`);

                  if (!matches) {
                    allMatch = false;
                  }
                }

                if (allMatch) {
                  testPassed = true;
                  testResult.output = `✅ Test PASSED: All properties matched (${comparisonResults.join(', ')})`;
                } else {
                  testResult.output = `❌ Test FAILED: Not all properties matched (${comparisonResults.join(', ')})`;
                }
              }
              // Single property check (contains : but not ;)
              else if (expectation.includes(':')) {
                const [propertyName, expectedValue] = expectation.split(':');
                const receivedValue = deviceResponse[propertyName];

                console.log(`📊 Single property comparison: ${propertyName} | Expected: ${expectedValue} | Received: ${receivedValue}`);

                // Normalize for comparison
                const normalizedReceived = String(receivedValue).toUpperCase().trim();
                const normalizedExpected = String(expectedValue).toUpperCase().trim();

                if (receivedValue !== undefined && normalizedReceived === normalizedExpected) {
                  testPassed = true;
                  testResult.output = `✅ Test PASSED: Property '${propertyName}' = ${receivedValue} (expected ${expectedValue})`;
                } else {
                  testResult.output = `❌ Test FAILED: Property '${propertyName}' = ${receivedValue} (expected ${expectedValue})`;
                }
              } else {
                // Simple numeric comparison
                const receivedValue = parseInt(deviceResponse) || 0;
                const expectedValue = parseInt(testResult.expectedOutcome) || 0;

                console.log(`🔢 Numeric comparison: Expected: ${expectedValue} | Received: ${receivedValue}`);

                if (receivedValue === expectedValue) {
                  testPassed = true;
                  testResult.output = `✅ Test PASSED: Device responded with ${receivedValue}, expected ${expectedValue}`;
                } else {
                  testResult.output = `❌ Test FAILED: Device responded with ${receivedValue}, expected ${expectedValue}`;
                }
              }

              testResult.status = testPassed ? "passed" : "failed";
              testResult.passed = testPassed;
            }
          }

          // Send test completion status
          broadcastTestStatus({
            type: 'TEST_COMPLETED',
            testFile: testFile,
            name: testResult.name,
            status: testResult.status,
            output: testResult.output,
            timestamp: getFormattedDateTime()
          });

          // Create test report log
          const testResultDir = path.join(__dirname, "testResult");

          // Use testDeviceMAC if available (from waiter), otherwise use placeholder
          const reportMac = typeof testDeviceMAC !== 'undefined' ? testDeviceMAC.replace(/:/g, '-') : 'unknown-device';
          const testReportFileName = `${getFormattedDateTime('file')}_${reportMac}.rpt`;
          const testReportFilePath = path.join(testResultDir, testReportFileName);

          if (!fs.existsSync(testResultDir)) {
            fs.mkdirSync(testResultDir, { recursive: true });
          }

          const reportContent = `Test: ${testResult.name} Status: ${testResult.status}`;
          fs.appendFile(testReportFilePath, reportContent, (err) => {
            if (err) {
              console.log(`🔴 Error creating test report: ${err} 🔴`);
            } else {
              console.log(`✅ Test report created: ${testReportFileName}`);
            }
          });
          // const logTestResult = await fs.promises.mkdir(testResultDir);



        } catch (err) {
          console.error(`Error parsing test file ${testFile}:`, err);
          testResult.status = "failed";
          testResult.output = `Test file parsing error: ${err.message}`;
          testResult.passed = false;
        }

        testResult.duration = Date.now() - startTime;
        results.push(testResult);
        console.log(`✅ Test completed: ${testFile} - ${testResult.status}`);

      } catch (err) {
        console.error(`Error processing ${testFile}:`, err);
        results.push({
          testFile,
          status: "failed",
          output: `Processing error: ${err.message}`,
          passed: false
        });
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;

    const response = {
      timestamp: getFormattedDateTime(),
      summary: {
        total: results.length,
        passed: passedCount,
        failed: failedCount
      },
      results
    };

    // Send final summary
    broadcastTestStatus({
      type: 'ALL_TESTS_COMPLETED',
      summary: response.summary,
      timestamp: getFormattedDateTime()
    });

    console.log(`📊 ATS Tests completed: ${passedCount} passed, ${failedCount} failed`);
    res.json(response);

  } catch (err) {
    console.error("❌ Error running all tests:", err.message);
    res.status(500).json({
      error: `Failed to run tests: ${err.message}`,
      timestamp: getFormattedDateTime()
    });
  }
});
// 📡 TCP Server
const BULK_SAVE_LIMIT = 1000;
let alreadyReplied = 0;

// Device command waiter queue with MAC tracking
const deviceCommandWaiters = [];

// Track which MAC addresses have pending test waits
let testWaitingForMAC = null;

function setTestWaitForMAC(mac) {
  testWaitingForMAC = mac;
  console.log(`🔔 Test now waiting for response from MAC: ${mac}`);
}

function clearTestWaitForMAC() {
  testWaitingForMAC = null;
}


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


// TCP Server
const tcpServer = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;

  debug.log(`New TCP Connection from`, clientInfo);

  socket.on("data", async (data) => {
    console.log(
      `Received packet (${data.length} bytes):`,
      data.toString("hex")
    );
    buffer = Buffer.concat([buffer, data]);

    try {
      debug.packetCount++;
      debug.lastPacketTime = Date.now();
      debug.bufferStats.totalBytes += data.length;

      debug.log(`Raw data received (${data.length} bytes) from`, clientInfo);
      debug.log(`Raw data hex preview:`, data.toString('hex').substring(0, 100) + '...');

      buffer = Buffer.concat([buffer, data]);
      debug.log(`Total buffer size: ${buffer.length} bytes`);

      while (buffer.length >= 58) {
        const bufStr = buffer.toString("utf-8");

        // Search for first valid MAC pattern in buffer string
        const macPattern = /[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/;
        const match = bufStr.match(macPattern);

        if (!match) {
          console.warn(
            `No MAC found in buffer, discarding ${buffer.length} bytes`
          );
          buffer = Buffer.alloc(0);
          break;
        }

        const macStartIndex = bufStr.indexOf(match[0]);

        if (macStartIndex > 0) {
          console.warn(`Discarding ${macStartIndex} bytes of junk before MAC`);
          buffer = buffer.slice(macStartIndex);
          continue;
        }

        if (buffer.length < 58) {
          break;
        }

        // Extract one full packet starting at MAC
        const packet = buffer.slice(0, 58);
        console.log(packet);

        const macRaw = packet.subarray(0, 17);
        let macRawStr = macRaw.toString("utf-8");
        console.log(
          `Received MAC: [${macRawStr}], length: ${macRawStr.length}`
        );

        // Sanitize and verify MAC
        const sanitizedMac = macRawStr.replace(/[^0-9A-Fa-f:]/g, "");
        const macRegex = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
        if (sanitizedMac.length !== 17 || !macRegex.test(sanitizedMac)) {
          console.warn(`⚠️ Dropping malformed MAC: INVALID_${Date.now()}`);
          buffer = buffer.slice(58);
          continue;
        }

        const mac = sanitizedMac.toLowerCase();
        const humidity = +buffer.readFloatLE(17).toFixed(2);
        const insideTemperature = +buffer.readFloatLE(21).toFixed(2);
        const outsideTemperature = +buffer.readFloatLE(25).toFixed(2);
        const lockStatus = buffer[29] === 1 ? "OPEN" : "CLOSED";
        const doorStatus = buffer[30] === 1 ? "OPEN" : "CLOSED";
        const waterLogging = !!buffer[31];
        const waterLeakage = !!buffer[32];
        const outputVoltage = +buffer.readInt16LE(33).toFixed(2);
        const hupsDVC = buffer.readInt16LE(35);
        const inputVoltage = +buffer.readInt16LE(37).toFixed(2);
        const hupsBatVolt = buffer.readInt16LE(39);
        const batteryBackup = +buffer.readFloatLE(41).toFixed(2);
        const alarmActive = !!buffer[45];
        const fireAlarm = buffer[46];
        const fanLevel1Running = !!buffer[47];
        const fanLevel2Running = !!buffer[48];
        const fanLevel3Running = !!buffer[49];
        const fanLevel4Running = !!buffer[50];
        const padding = buffer[51];

        console.log("Fan Status: ", fanLevel2Running)

        if (padding === 0x31 && !alreadyReplied) {
          sendX(socket);
          alreadyReplied = 40;
        }

        if ((padding === 0x43)) {
          sendX(socket);

          // console.log("📸 Capture pictures command received");

          const now = new Date();
          const timestamp = now.toISOString()
            .replace(/[-:]/g, '')
            .replace(/T/, '_')
            .replace(/\..+/, '')
            .slice(0, 15);

          const fileName = `image_${timestamp}.jpg`;
          const outputDir = 'C:/snaps';
          const outputPath = path.join(outputDir, fileName);

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          const url = `http://192.168.0.120/CGI/command/snap?channel=01`;

          axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
          })
            .then((response) => {
              const writer = fs.createWriteStream(outputPath);
              response.data.pipe(writer);

              return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
              });
            })
            .then(() => {
              console.log(`✅ Snapshot captured: ${fileName}`);
            })
            .catch((error) => {
              console.error(`❌ Error capturing snapshot: ${error.message}`);
            });
        }

        // Logging Incoming Data from Simulator
        const now = new Date();
        const fileName = `${now.getDate()}_${now.getMonth() + 1
          }_${now.getHours()}.inc`;
        const logDir = "C:/CommandLogs/inc";

        const sensorData = {
          humidity: humidity,
          insideTemperature: insideTemperature,
          outsideTemperature: outsideTemperature,
          inputVoltage: inputVoltage,
          outputVoltage: outputVoltage,
          batteryBackup: batteryBackup,
        };

        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        const filePath = path.join(logDir, fileName);
        const timestamp = now.toLocaleString();
        const logEntry = `[${timestamp}] | MAC:${mac} | Data:${JSON.stringify(
          sensorData
        )}"\n`;

        fs.appendFile(filePath, logEntry, (err) => {
          if (err) {
            console.error("Failed to save log:", err);
          } else {
            console.log(`✅ Log saved: ${filePath}`);
          }
        });

        if (alreadyReplied) alreadyReplied--;
        const fanStatusBits = buffer.readUInt16LE(52);
        const fanStatus = [];
        for (let i = 0; i < 6; i++) {
          fanStatus[i] = (fanStatusBits >> (i * 2)) & 0x03; // 0=off,1=healthy,2=faulty
        }
        // console.log("fanStatus", fanStatusBits);

        const pwsFailCount = buffer[54];
        // console.log("Password Bit: ", pwsFailCount);
        // HUPS alarm bits (same logic as in server.js)
        const hupsStat = buffer[55];
        const hupsAlarms = [];
        for (let i = 0; i < 8; i++) {
          hupsAlarms[i] = (hupsStat >> i) & 0x01;
        }
        // console.log("hupsAlarms: ", hupsAlarms);
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
          buffer = buffer.slice(58);
          continue;
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
        }

        if (waterLeakage) {
          activeAlarms.push("Water Leakage Alarm");
        }

        if (doorStatus) {
          activeAlarms.push("Door Alarm");
        }

        if (lockStatus) {
          activeAlarms.push("Lock Alarm");
        }

        if (fireAlarm) {
          activeAlarms.push("Fire Alarm");
        }

        // Single console output
        if (activeAlarms.length > 0) {
          const alarmLogDir = "C:/CommandLogs/alarm"

          if (!fs.existsSync(alarmLogDir)) {
            fs.mkdirSync(alarmLogDir, { recursive: true });
          }

          const alarmFileName = `${now.getDate()}_${now.getMonth() + 1
            }_${now.getHours()}_Alarm.inc`;

          let logAlarm;
          if (fanStatus.includes(2)) {
            logAlarm = `[${timestamp}] | MAC: ${mac}| ${activeAlarms} | Fan Status: ${fanStatus}\n`;
          } else {
            logAlarm = `[${timestamp}] | MAC: ${mac}| ${activeAlarms}\n`;
          }

          const alarmFilePath = path.join(alarmLogDir, alarmFileName);

          fs.appendFile(alarmFilePath, logAlarm, (err) => {
            if (err) {
              console.error("Failed to save log:", err);
            } else {
              console.log(`✅ Log saved: ${alarmFilePath}`);
            }
          });
        }

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
          inputVoltage,
          batteryBackup,
          alarmActive,
          fireAlarm,
          fanLevel1Running,
          fanLevel2Running,
          fanLevel3Running,
          fanLevel4Running,
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
          ...thresholdAlarms,
          timestamp: new Date().toISOString(),
        };

        console.log("Fan 3 Status", fanStatus)

        // Track connected device socket and broadcast to any connected frontend clients
        connectedDevices.set(mac, socket);
        try {
          broadcastToWebClients(reading);
        } catch (err) {
          console.error('WebSocket broadcast failed:', err);
        }

        // Notify waiting test ONLY if this MAC is the one we're waiting for
        if (testWaitingForMAC && mac === testWaitingForMAC && deviceCommandWaiters.length > 0) {
          const waiter = deviceCommandWaiters[0]; // peek without removing
          const shouldResolve = waiter(reading);   // waiter returns true when it handled the reading

          if (shouldResolve) {
            deviceCommandWaiters.shift();
            console.log(`✅ Test waiter resolved for MAC ${mac} with matching response`);
          }
        }

        // Keep an in-memory cache of recent readings for API access (capped)
        latestReadings.push(reading);
        if (latestReadings.length > 400) latestReadings.shift();

        buffer = buffer.slice(58);
        debug.log(`✅ Packet processed successfully for MAC: ${mac}`, `Time: ${getFormattedDateTime()}`);
      }
    } catch (err) {
      debug.error(`Critical error in data handler from ${clientInfo}`, err);
      console.error("Packet parsing failed:", err.message);
      socket.destroy();
    }
  });

  socket.on("end", () => {
    for (const [mac, sock] of connectedDevices.entries()) {
      if (sock === socket) {
        connectedDevices.delete(mac);
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

// Periodic bulk save
// No periodic DB bulk save during real-time testing (removed)

// Start servers
tcpServer.listen(4000, "0.0.0.0", () => {
  console.log("✅ TCP server listening on port 4000");
});

app.listen(5000, "0.0.0.0", () => {
  console.log("✅ HTTP server running on port 5000");
});

console.log("🚀 All servers started successfully!");