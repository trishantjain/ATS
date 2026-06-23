const { reportWriter } = require('../ATS/reportWriter');

function startFanTestWifi(fanTrayControllerId, espSocket, logCallback) {

    return new Promise((resolve, reject) => {

        if (!espSocket || espSocket.destroyed) {
            return reject(new Error("ESP32 not connected over WiFi"));
        }

        console.log("Fan ID received:", fanTrayControllerId);

        let testCompleted = false;
        let timeoutHandle;

        let buffer = [];
        let capturing = false;

        function cleanup() {

            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }

            espSocket.removeListener('data', onData);
            espSocket.removeListener('error', onError);
            espSocket.removeListener('close', onClose);
        }

        function handleFanTestResult(data) {

            console.log("✅ Parsed ESP Result:", data);

            if (!data || !Array.isArray(data.results)) {
                reject(new Error("Invalid data format from ESP"));
                return;
            }

            const MIN_PULSE = 150;

            const stepResults = data.results.map((fan, idx) => {

                const pulses = Number(fan.pulses);

                const pulsePassed =
                    Number.isFinite(pulses) &&
                    pulses > MIN_PULSE;

                return {
                    step: idx + 1,
                    status: pulsePassed ? "passed" : "failed",
                    message: `Fan ${fan.fan} Pulses=${fan.pulses}`
                };
            });

            const testPassed =
                stepResults.every(x => x.status === "passed");

            const runResult = {
                summary: {
                    total: stepResults.length,
                    passed: stepResults.filter(x => x.status === "passed").length,
                    failed: stepResults.filter(x => x.status === "failed").length
                },
                results: [
                    {
                        name: "Fan Tray Assembly Test",
                        status: testPassed ? "passed" : "failed",
                        stepResults
                    }
                ]
            };

            reportWriter({
                runResult,
                destination: "fan",
                mac: "ESP32-WIFI",
                unitSerialNo: fanTrayControllerId
            })
                .then(res => {

                    testCompleted = true;

                    cleanup();

                    resolve({
                        success: true,
                        message: `Report saved: ${res.filePath}`,
                        result: runResult
                    });

                })
                .catch(err => {

                    testCompleted = true;

                    cleanup();

                    reject(new Error(`Report error: ${err.message}`));
                });
        }

        function processLine(line) {

            line = line.trim();

            console.log("📡 ESP:", line);

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

                    reject(
                        new Error(`JSON Parse Error: ${err.message}`)
                    );
                }

                return;
            }

            if (capturing) {
                buffer.push(line);
            }
        }

        let partialBuffer = "";

        function onData(data) {

            partialBuffer += data.toString();

            const lines = partialBuffer.split('\n');

            partialBuffer = lines.pop();

            lines.forEach(processLine);
        }

        function onError(err) {

            if (testCompleted) return;

            testCompleted = true;

            cleanup();

            reject(
                new Error(`Socket error: ${err.message}`)
            );
        }

        function onClose() {

            if (testCompleted) return;

            testCompleted = true;

            cleanup();

            reject(
                new Error("ESP32 WiFi connection closed")
            );
        }

        espSocket.on('data', onData);
        espSocket.on('error', onError);
        espSocket.on('close', onClose);

        timeoutHandle = setTimeout(() => {

            if (!testCompleted) {

                testCompleted = true;

                cleanup();

                reject(
                    new Error("Test timeout - no response from ESP32")
                );
            }

        }, 240000);

        console.log("🚀 Sending START");

        espSocket.write("START\n");
    });
}

module.exports = {
    startFanTestWifi
};