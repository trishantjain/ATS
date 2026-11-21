const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { reportWriter } = require("../ATS/reportWriter"); // adjust path

// GETTING FAN CONTROLLER ID FROM THE COMMAND LINE
const fanTrayControllerId = process.argv[2] || "unknown-controller";
const serialPortPath =
  process.argv[3] || process.env.ESP_FAN_COM_PORT || "COM5";
const allowedFanCommands = ["START", "TEST_1", "TEST_2", "TEST_3", "TEST_4", "TEST_5", "TEST_6"];
const fanCommand = String(process.argv[4] || "").trim().toUpperCase();
let finished = false;

if (!allowedFanCommands.includes(fanCommand)) {
  console.error(`❌ Invalid fan command: ${fanCommand}`);
  console.log(
    `FAN_RESULT_JSON:${JSON.stringify({
      success: false,
      error: `Invalid fan command: ${fanCommand}`,
    })}`,
  );
  process.exit(1);
}

function handleFanTestResult(data) {
  console.log("✅ Parsed ESP Result:", data);

  // Safety check
  if (!data || !Array.isArray(data.results)) {
    console.error("❌ Invalid data format from ESP");
    console.log(
      `FAN_RESULT_JSON:${JSON.stringify({
        success: false,
        error: "Invalid data format from ESP",
      })}`,
    );
    finishListener(1);
    return;
  }

  const stepResults = data.results.map((fan, idx) => {
    const passed =
      String(fan.status ?? "")
        .trim()
        .toUpperCase() === "PASS";
    const fanNumber = String(fan.fan ?? idx + 1);

    return {
      step: idx + 1,
      fan: fanNumber,
      status: passed ? "passed" : "failed",
      message: `Fan ${fanNumber} Pulses=${fan.pulses ?? "N/A"} ESP_Status=${fan.status ?? "N/A"}`,
    };
  });

  const passed = stepResults.every((s) => s.status === "passed");

  const runResult = {
    summary: {
      total: stepResults.length,
      passed: stepResults.filter((s) => s.status === "passed").length,
      failed: stepResults.filter((s) => s.status === "failed").length,
    },
    results: [
      {
        name: "Fan Tray Assembly Test",
        status: passed ? "passed" : "failed",
        stepResults,
      },
    ],
  };

  console.log("📝 Writing report...");

  reportWriter({
    runResult,
    destination: "fan",
    mac: "ESP32-JIG",
    unitSerialNo: fanTrayControllerId,
  })
    .then((res) => {
      console.log("📄 Report saved:", res.filePath);
      console.log(
        `FAN_RESULT_JSON:${JSON.stringify({
          success: true,
          passed,
          summary: runResult.summary,
          steps: runResult.results[0].stepResults,
          reportNo: res.reportNo,
          reportPath: res.filePath,
        })}`,
      );
      finishListener(0);
    })
    .catch((err) => {
      console.error("❌ Report error:", err);
      console.log(
        `FAN_RESULT_JSON:${JSON.stringify({
          success: false,
          error: err.message,
        })}`,
      );
      finishListener(1);
    });
}

// 🔥 CHANGE THIS to your COM port
const port = new SerialPort({
  path: serialPortPath,
  baudRate: 115200,
  autoOpen: false,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

let buffer = [];
let capturing = false;
let listenerTimeout;

function finishListener(exitCode) {
  if (finished) return;
  finished = true;
  clearTimeout(listenerTimeout);

  const disconnectFromMongo = () => {
    mongoose
      .disconnect()
      .catch((err) => {
        console.error("❌ MongoDB disconnect error:", err.message);
      })
      .finally(() => {
        process.exitCode = exitCode;
      });
  };

  if (port.isOpen) {
    port.close((err) => {
      if (err) console.error("❌ Error closing serial port:", err.message);
      disconnectFromMongo();
    });
    return;
  }

  disconnectFromMongo();
}

async function startListener() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not configured in server/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("🗄️ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.log(
      `FAN_RESULT_JSON:${JSON.stringify({
        success: false,
        error: `MongoDB connection error: ${err.message}`,
      })}`,
    );
    finishListener(1);
    return;
  }

  // ✅ OPEN PORT + AUTO TRIGGER
  port.open((err) => {
    if (err) {
      console.error("❌ Error opening port:", err.message);
      console.log(
        `FAN_RESULT_JSON:${JSON.stringify({
          success: false,
          error: `Error opening port: ${err.message}`,
        })}`,
      );
      finishListener(1);
      return;
    }

    console.log("🔌 Serial connected");

    // Send the command selected in the browser
    setTimeout(() => {
      console.log(`🚀 Sending ${fanCommand}`);
      port.write(`${fanCommand}\n`);
    }, 2000);
  });
}

startListener();

listenerTimeout = setTimeout(() => {
  if (!finished) {
    console.error("❌ Test timeout - no result from ESP32");
    console.log(
      `FAN_RESULT_JSON:${JSON.stringify({
        success: false,
        error: "Test timeout - no result from ESP32",
      })}`,
    );
    finishListener(1);
  }
}, 240000);

// 🔥 Listen to ESP output
parser.on("data", (line) => {
  line = line.trim();
  console.log("📡 ESP:", line);

  if (line === "###TEST_RESULT_START###") {
    capturing = true;
    buffer = [];
    return;
  }

  if (line === "###TEST_RESULT_END###") {
    capturing = false;

    try {
      const jsonString = buffer.join("");
      const data = JSON.parse(jsonString);

      handleFanTestResult(data);
    } catch (err) {
      console.error("❌ JSON Parse Error:", err.message);
      console.log(
        `FAN_RESULT_JSON:${JSON.stringify({
          success: false,
          error: `JSON Parse Error: ${err.message}`,
        })}`,
      );
      finishListener(1);
    }

    return;
  }

  if (capturing) {
    buffer.push(line);
  }
});
