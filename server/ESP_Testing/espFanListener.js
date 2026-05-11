const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { reportWriter } = require('../ATS/reportWriter'); // adjust path

// GETTING FAN CONTROLLER ID
const fanTrayControllerId = process.argv[2] || "unknown-controller";


function handleFanTestResult(data) {
    console.log("✅ Parsed ESP Result:", data);

    // Safety check
    if (!data || !Array.isArray(data.results)) {
        console.error("❌ Invalid data format from ESP");
        return;
    }

    const MIN_FAN_RPM = 2300;
    const MAX_FAN_RPM = 2900;

    const stepResults = data.results.map((fan, idx) => {
        const rpm = Number(fan.rpm);
        const rpmPassed = Number.isFinite(rpm) && rpm >= MIN_FAN_RPM && rpm <= MAX_FAN_RPM;

        return {
            step: idx + 1,
            status: rpmPassed ? "passed" : "failed",
            message: `Fan ${fan.fan} RPM=${fan.rpm}`
        };
    });

    const passed = stepResults.every(s => s.status === "passed");

    const runResult = {
        summary: {
            total: stepResults.length,
            passed: stepResults.filter(s => s.status === "passed").length,
            failed: stepResults.filter(s => s.status === "failed").length
        },
        results: [
            {
                name: "Fan Tray Test",
                status: passed ? "passed" : "failed",
                stepResults
            }
        ]
    };

    console.log("📝 Writing report...");

    reportWriter({
        runResult,
        destination: "fan",
        mac: "ESP32-JIG",
        deviceId: fanTrayControllerId
    })
        .then(res => {
            console.log("📄 Report saved:", res.filePath);
        })
        .catch(err => {
            console.error("❌ Report error:", err);
        });
}

// 🔥 CHANGE THIS to your COM port
const port = new SerialPort({
    path: 'COM19',
    baudRate: 115200,
    autoOpen: false
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

let buffer = [];
let capturing = false;

// ✅ OPEN PORT + AUTO TRIGGER
port.open((err) => {
    if (err) {
        return console.error("❌ Error opening port:", err.message);
    }

    console.log("🔌 Serial connected");

    // 🔥 AUTO TRIGGER
    setTimeout(() => {
        console.log("🚀 Sending START_FAN_TEST");
        port.write("START_FAN_TEST\n");
    }, 2000);
});

// 🔥 Listen to ESP output
parser.on('data', (line) => {
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
            const jsonString = buffer.join('');
            const data = JSON.parse(jsonString);

            handleFanTestResult(data);

        } catch (err) {
            console.error("❌ JSON Parse Error:", err.message);
        }

        return;
    }

    if (capturing) {
        buffer.push(line);
    }
});