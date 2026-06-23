const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { reportWriter } = require('../ATS/reportWriter');

/**
 * Start fan test with given Fan ID and COM port
 * @param {string} fanTrayControllerId - Fan ID (e.g., "Fan-Tray-001")
 * @param {string} portName - COM port name (e.g., "COM19")
 * @returns {Promise} - Resolves when test completes
 */
function startFanTest(fanTrayControllerId, portName, logCallback) {
    return new Promise((resolve, reject) => {
        console.log("Fan ID received:", fanTrayControllerId);
        let testCompleted = false;

        // GETTING COM PORT 
        const port = new SerialPort({
            path: portName,
            baudRate: 115200,
            autoOpen: false
        });

        const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        let buffer = [];
        let capturing = false;
        let timeoutHandle;

        // FUNCTION TO HANDLE FAN RESULTS
        function handleFanTestResult(data) {
            console.log("✅ Parsed ESP Result:", data);

            if (!data || !Array.isArray(data.results)) {
                console.error("❌ Invalid data format from ESP");
                reject(new Error("Invalid data format from ESP"));
                return;
            }

            // const MIN_FAN_RPM = 2300;
            // const MAX_FAN_RPM = 2900;

            const MIN_PULSE = 150;

            const stepResults = data.results.map((fan, idx) => {
                // const rpm = Number(fan.rpm);
                // const rpmPassed = Number.isFinite(rpm) && rpm >= MIN_FAN_RPM && rpm <= MAX_FAN_RPM;

                const pulses = Number(fan.pulses);  // or fan.pulses if you renamed it
                const pulsePassed = Number.isFinite(pulses) && pulses > MIN_PULSE;

                return {
                    step: idx + 1,
                    status: pulsePassed ? "passed" : "failed",
                    message: `Fan ${fan.fan} Pulses=${fan.pulses}`
                };
            });

            const testPassed = stepResults.every(s => s.status === "passed");

            const runResult = {
                summary: {
                    total: stepResults.length,
                    passed: stepResults.filter(s => s.status === "passed").length,
                    failed: stepResults.filter(s => s.status === "failed").length
                },
                results: [
                    {
                        name: "Fan Tray Assembly Test",
                        status: testPassed ? "passed" : "failed",
                        stepResults
                    }
                ]
            };

            console.log("📝 Writing report...");

            reportWriter({
                runResult,
                destination: "fan",
                mac: "ESP32-JIG",
                unitSerialNo: fanTrayControllerId
                // deviceId: fanTrayControllerId
            })
                .then(res => {
                    console.log("📄 Report saved:", res.filePath);
                    testCompleted = true;
                    cleanup();
                    resolve({
                        success: true,
                        message: `Report saved: ${res.filePath}`,
                        result: runResult
                    });
                })
                .catch(err => {
                    console.error("❌ Report error:", err);
                    testCompleted = true;
                    cleanup();
                    reject(new Error(`Report error: ${err.message}`));
                });
        }

        // Cleanup function
        function cleanup() {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            parser.removeAllListeners();
            port.close((err) => {
                if (err) console.error("Error closing port:", err);
            });
        }

        // Open serial port
        port.open((err) => {
            if (err) {
                reject(new Error(`Error opening port: ${err.message}`));
                return;
            }

            console.log(`🔌 Serial connected to ${portName}`);

            // Auto trigger after 2 seconds
            setTimeout(() => {
                console.log("🚀 Sending START");
                port.write("START\n");
            }, 2000);

            // Set timeout for test (30 seconds)
            timeoutHandle = setTimeout(() => {
                if (!testCompleted) {
                    testCompleted = true;
                    cleanup();
                    reject(new Error("Test timeout - no response from ESP32"));
                }
            }, 240000);
        });

        // Listen to ESP output
        parser.on('data', (line) => {
            line = line.trim();
            console.log("📡 ESP:", line);

            // mainWindow.webContents.send("esp-log", line);
            if (logCallback) {
                logCallback(line);
            }

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
                    testCompleted = true;
                    cleanup();
                    reject(new Error(`JSON Parse Error: ${err.message}`));
                }

                return;
            }

            if (capturing) {
                buffer.push(line);
            }
        });

        parser.on('error', (err) => {
            testCompleted = true;
            cleanup();
            reject(new Error(`Parser error: ${err.message}`));
        });

        port.on('error', (err) => {
            testCompleted = true;
            cleanup();
            reject(new Error(`Port error: ${err.message}`));
        });
    });
}

module.exports = { startFanTest };