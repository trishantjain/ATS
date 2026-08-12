const path = require("path");
const fs = require("fs");
const atsRuntime = require("./atsRuntime");
const { getFormattedDateTime } = require("../utils/time");
const { spawn } = require("child_process");

async function executeSingleTest({
    testFile,
    mac,
    onStatus,
    frontendResults = [],
    testDir,
    testLevel = "full-controller"
}) {
    console.log(`🚀 Starting ATS Test`);
    console.log(`\n=========== 🚀 Starting ATS Test ===========`);
    console.log(`🔬 Processing test file: ${testFile}`);

    // Check if stop was requested before starting next test
    if (atsRuntime.testStopRequested) {
        console.log('    🛑 Test execution stopped by user - skipping remaining tests');
        return {
            testFile,
            status: "stopped",
            output: "Test stopped by user",
            passed: false
        };
    }


    console.log(`🔬 Processing test file: ${testFile}`);

    // const testDir = path.join(__dirname, "../tests/iMoni");
    const resolvedTestDir = testDir || path.join(__dirname, "../tests/iMoni");
    const testFilePath = path.join(resolvedTestDir, testFile);
    console.log(`Path resolved for test file in atsRunner: ${testFilePath}`);

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
            commands: [],
            stepResults: []
        };

        const startTime = Date.now();

        // Parse .srv test file
        try {
            const fileContent = await fs.promises.readFile(testFilePath, "utf-8");
            const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

            // OBJECT: SINGLE TEST DETAILS
            let testConfig = {
                name: "",
                message: "",
                expectedOutcome: null,
                commands: [],
                pre: "",
                pass: "",
                fail: "",
                timeout: 20,
                continueOnFail: 0,
                retryCount: 0,
                type: "",
                steps: []
            };

            let currentStep = null;

            // Parse .srv file
            for (const line of lines) {
                // Check for step header [step:N]
                const stepMatch = line.match(/^\[step:(\d+)\]$/);
                if (stepMatch) {
                    // Save previous step if exists
                    if (currentStep) {
                        testConfig.steps.push(currentStep);
                    }
                    // Start new step
                    currentStep = {
                        stepNumber: parseInt(stepMatch[1]),
                        type: "",
                        msg: "",
                        waitFor: "",
                        waitTime: 20,
                        expectedValue: "",
                        onPass: "",
                        onFail: ""
                    };
                    continue;
                }

                console.log(`   🔍 Evaluating lines: ${line}`);
                // PROPERTIES INSIDE THE STEPS
                if (currentStep) {
                    if (line.startsWith('msg=')) {
                        currentStep.msg = line.substring(4).replace(/["\']/g, '');
                    } else if (line.startsWith('action=')) {
                        currentStep.action = line.substring(7).replace(/["\']/g, '') + getFormattedDateTime() + "$";
                    } else if (line.startsWith('waitFor=')) {
                        currentStep.waitFor = line.substring(8).replace(/["\']/g, '');
                    } else if (line.startsWith('waitTime=')) {
                        currentStep.waitTime = parseInt(line.substring(9).replace(/["\']/g, '')) || 20;
                    } else if (line.startsWith('expectedValue=')) {
                        currentStep.expectedValue = line.substring(14).replace(/["\']/g, '');
                    } else if (line.startsWith('increasedBy=')) {
                        currentStep.increasedBy = parseFloat(line.substring(12).replace(/["\']/g, '')) || 0;
                    } else if (line.startsWith('onPass=')) {
                        currentStep.onPass = line.substring(7).replace(/["\']/g, '');
                    } else if (line.startsWith('onFail=')) {
                        currentStep.onFail = line.substring(7).replace(/["\']/g, '');
                    } else if (line.startsWith('cameraIp=')) {
                        currentStep.cameraIp = line.substring(9).replace(/["\']/g, '');
                    }
                    else if (line.startsWith('type=')) {
                        currentStep.type = line.substring(5).replace(/["']/g, '');
                    }
                }
                // PROPERTIES BEFORE THE STEPS
                else {
                    if (line.startsWith('name=')) {
                        testConfig.name = line.substring(5).replace(/["\']/g, '');
                    } else if (line.startsWith('msg=')) {
                        testConfig.message = line.substring(4).replace(/["\']/g, '');
                    } else if (line.startsWith('pre=')) {
                        testConfig.pre = line.substring(4).replace(/["\']/g, '');
                    } else if (line.startsWith('pass=')) {
                        testConfig.pass = line.substring(5).replace(/["\']/g, '');
                    } else if (line.startsWith('fail=')) {
                        testConfig.fail = line.substring(5).replace(/["\']/g, '');
                    } else if (line.startsWith('type=')) {
                        testConfig.type = line.substring(5).replace(/["\']/g, '');
                    } else if (line.startsWith('continueOnFail=')) {
                        testConfig.continueOnFail = parseInt(line.substring('continueOnFail='.length).replace(/["\']/g, ''), 10) || 0;
                    } else if (line.startsWith('retryCount=')) {
                        testConfig.retryCount = parseInt(line.substring(11).replace(/["\']/g, '')) || 0;
                    } else if (line && !line.includes('=')) {
                        testConfig.commands.push(line);
                    }
                }
            }

            // Don't forget to add the last step
            if (currentStep) {
                testConfig.steps.push(currentStep);
            }

            // Sending test files details from config to result
            testResult.name = testConfig.name || path.parse(testFile).name;
            testResult.message = testConfig.message || testConfig.pre || "No message";
            testResult.expectedOutcome = testConfig.expectedOutcome;
            testResult.commands = testConfig.commands;

            console.log(`    ▶️ Starting ATS test: ${testResult.name}`);
            console.log(`    📝 Message to display: ${testResult.message}`);
            console.log(`    🎯 Expected Outcome: ${testResult.expectedOutcome}`);
            console.log(`    📋 Steps defined: ${testConfig.steps.length}`);

            // Send TEST STARTING status to WebSocket clients
            onStatus?.({
                type: 'TEST_STARTED',
                testFile: testFile,
                name: testResult.name,
                message: testResult.message,
                pre: testConfig.pre,
                expectedOutcome: testResult.expectedOutcome,
                totalSteps: testConfig.steps.length,
                timestamp: getFormattedDateTime()
            });

            // Get the first connected device MAC to wait for
            const connectedMACs = Array.from(atsRuntime.connectedDevices.keys());

            if (connectedMACs.length === 0) {
                testResult.output = "❌ Test FAILED: No connected devices available";
                testResult.status = "failed";
                testResult.passed = false;
            }
            // ========== SENSOR TEST TYPE HANDLING ==========
            else if (testConfig.type === 'sensor') {
                console.log(`           📟 Sensor test detected in test type`);
                console.log(`           🔄 Running sensor code part`);
                const testDeviceMAC = connectedMACs[0];
                let allStepsPassed = true;
                const stepResults = [];

                console.log(`           🔄 Running step-based test with ${testConfig.steps.length} steps`);

                for (let i = 0; i < testConfig.steps.length; i++) {
                    // Check if stop was requested
                    if (atsRuntime.testStopRequested) {
                        console.log('    🛑 Test stopped by user request');
                        return {
                            testFile,
                            status: "stopped",
                            output: "Test stopped by user",
                            passed: false
                        };
                    }

                    const step = testConfig.steps[i];
                    const stepNumber = step.stepNumber || (i + 1);

                    console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);
                    console.log(`    Waiting for: ${step.waitFor} = ${step.expectedValue}`);
                    console.log(`    Timeout: ${step.waitTime}s`);

                    // Broadcast step started (same for all step types)
                    onStatus?.({
                        type: 'STEP_STARTED',
                        testFile: testFile,
                        name: testResult.name,
                        stepNumber: stepNumber,
                        totalSteps: testConfig.steps.length,
                        message: step.msg,
                        waitFor: step.waitFor,
                        increasedBy: step.increasedBy,
                        waitTime: step.waitTime || 20,
                        timestamp: getFormattedDateTime()
                    });

                    if (step.type === "instruction") {
                        console.log(`📖 Instruction Step ${stepNumber}`);

                        const instructionResult = await new Promise((resolve) => {

                            let finished = false;

                            const stopResolver = () => {

                                if (finished) return;

                                finished = true;

                                clearTimeout(timer);

                                console.log(
                                    `🛑 Instruction step ${stepNumber} stopped by user`
                                );

                                atsRuntime.unregisterStopResolver(
                                    stopResolver
                                );

                                resolve({
                                    stopped: true
                                });
                            };

                            const timer = setTimeout(() => {

                                if (finished) return;

                                finished = true;

                                atsRuntime.unregisterStopResolver(
                                    stopResolver
                                );

                                resolve({
                                    stopped: false
                                });

                            }, (step.waitTime || 10) * 1000);

                            atsRuntime.registerStopResolver(
                                stopResolver
                            );
                        });

                        // 🛑 User stopped during instruction
                        if (instructionResult.stopped) {

                            return {
                                testFile,
                                status: "stopped",
                                output: "Test stopped by user",
                                passed: false,
                                stepResults
                            };
                        }

                        stepResults.push({
                            step: stepNumber,
                            status: "passed",
                            message: step.onPass || "Instruction completed"
                        });

                        onStatus?.({
                            type: "STEP_COMPLETED",
                            testFile,
                            name: testResult.name,
                            stepNumber,
                            totalSteps: testConfig.steps.length,
                            status: "passed",
                            message: step.onPass || "Instruction completed",
                            timestamp: getFormattedDateTime()
                        });

                        continue;
                    }

                    // Wait for sensor value to increase by the defined amount
                    const stepResult = await new Promise((resolve) => {
                        let initialSensorValue = null;  // Capture initial value from first reading
                        const requiredIncrease = step.increasedBy || 0;
                        console.log("    🎯 Required Increase in current sensor test: ", requiredIncrease);

                        let currentStepHandler = null;
                        let finished = false;

                        const cleanup = () => {
                            clearTimeout(timeout);
                            // clearInterval(stopWatcher);

                            if (currentStepHandler) {
                                const idx =
                                    atsRuntime.deviceCommandWaiters.indexOf(
                                        currentStepHandler
                                    );

                                if (idx > -1) {
                                    atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                }
                            }

                            atsRuntime.clearTestWaitForMAC();

                            atsRuntime.unregisterStopResolver(stopResolver);
                        };

                        // 🛑 Global STOP handler
                        const stopResolver = () => {
                            if (finished) return;

                            finished = true;

                            console.log(
                                `🛑 Sensor step stopped by user: ${testFile}`
                            );

                            cleanup();

                            resolve({
                                success: false,
                                reason: "STOP_REQUESTED"
                            });
                        };

                        // ⏱️ Normal timeout
                        const timeout = setTimeout(() => {
                            if (finished) return;

                            finished = true;

                            console.log(
                                `❌ Sensor step timeout: value did not increase by ${requiredIncrease}`
                            );

                            cleanup();
                            // if (currentStepHandler) {
                            //     const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
                            //     if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                            // }
                            // atsRuntime.clearTestWaitForMAC();
                            resolve({
                                success: false,
                                reason: `TIMEOUT - Value did not increase by ${requiredIncrease} within ${step.waitTime}s`,
                                received: initialSensorValue
                            });
                        }, (step.waitTime || 20) * 1000);

                        // Register this sensor step with global STOP
                        atsRuntime.registerStopResolver(stopResolver);

                        // const stopWatcher = setInterval(() => {
                        //     if (atsRuntime.testStopRequested) {
                        //         if (currentStepHandler) {
                        //             const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);

                        //             if (idx > -1) {
                        //                 atsRuntime.deviceCommandWaiters.splice(idx, 1);
                        //             }
                        //         }
                        //         clearTimeout(timeout);
                        //         clearInterval(stopWatcher);

                        //         atsRuntime.clearTestWaitForMAC();

                        //         resolve({
                        //             success: false,
                        //             reason: "STOP_REQUESTED"
                        //         });
                        //     }
                        // }, 100);


                        atsRuntime.setTestWaitForMAC(testDeviceMAC);

                        // let currentStepHandler = null;

                        // Handler to check sensor presence for Green PCB, or increase for full controller
                        const stepHandler = (reading) => {
                            if (!reading || typeof reading !== 'object') {
                                return false;
                            }

                            console.log("🧾 FULL READING OBJECT:", Object.keys(reading));

                            const currentValue = parseFloat(reading[step.waitFor]);
                            console.log("   📥 Current sensor value for", step.waitFor, ": ", reading[step.waitFor]);

                            if (isNaN(currentValue)) {
                                console.log(`   ⚠️ Invalid sensor value for ${step.waitFor}: ${reading[step.waitFor]}`);
                                return false;
                            }

                            // ==========================================
                            // GREEN PCB
                            // ==========================================
                            if (testLevel === "green-pcb") {
                                finished = true;

                                cleanup();

                                resolve({
                                    success: true,
                                    received: `${step.waitFor}=${currentValue}`
                                });

                                return true;
                            }

                            // ==========================================
                            // FIRST SENSOR READING
                            // ==========================================
                            if (initialSensorValue === null) {
                                initialSensorValue = currentValue;
                                console.log(`   📊 Initial ${step.waitFor} value: ${initialSensorValue}`);
                                console.log(`   🎯 Waiting for increase of: ${requiredIncrease}`);
                                return false;  // Keep waiting for subsequent readings
                            }

                            // ==========================================
                            // CHECK SENSOR INCREASE
                            // ==========================================
                            const currentIncrease = currentValue - initialSensorValue;
                            console.log(`   🔍 Checking: ${step.waitFor} = ${currentValue} (initial: ${initialSensorValue}, increase: ${currentIncrease.toFixed(2)}, required: ${requiredIncrease})`);

                            // ==========================================
                            // REQUIRED INCREASE REACHED
                            // ==========================================
                            if (currentIncrease >= requiredIncrease) {
                                finished = true;
                                cleanup();

                                resolve({
                                    success: true,
                                    received: `${currentValue} (increased by ${currentIncrease.toFixed(2)} from ${initialSensorValue})`
                                });

                                return true;
                            }

                            return false; // Keep waiting
                        };

                        currentStepHandler = stepHandler;
                        atsRuntime.deviceCommandWaiters.push(stepHandler);
                        // atsRuntime.deviceCommandWaiters.push(stepHandler);
                        console.log(
                            "🧪 SENSOR HANDLER REGISTERED",
                            atsRuntime.deviceCommandWaiters.length
                        );

                    });

                    // 🛑 User stopped the test
                    if (stepResult.reason === "STOP_REQUESTED") {

                        console.log(
                            `🛑 ${testFile} stopped by user`
                        );

                        return {
                            testFile,
                            status: "stopped",
                            output: "Test stopped by user",
                            passed: false,
                            stepResults
                        };
                    }

                    // Process step result
                    if (stepResult.success) {
                        console.log(`   ✅ Step ${stepNumber} PASSED: ${step.onPass || 'Success'}`);
                        stepResults.push({
                            step: stepNumber,
                            status: 'passed',
                            message: step.onPass || 'Step passed',
                            received: stepResult.received
                        });

                        // sending message to UI after test completion
                        onStatus?.({
                            type: 'STEP_COMPLETED',
                            testFile: testFile,
                            name: testResult.name,
                            stepNumber: stepNumber,
                            totalSteps: testConfig.steps.length,
                            status: 'passed',
                            message: step.onPass || 'Step passed',
                            timestamp: getFormattedDateTime()
                        });
                    } else {
                        console.log(`   ❌ Step ${stepNumber} FAILED: ${step.onFail || stepResult.reason}`);
                        allStepsPassed = false;
                        stepResults.push({
                            step: stepNumber,
                            status: 'failed',
                            message: step.onFail || stepResult.reason,
                            received: stepResult.received
                        });

                        onStatus?.({
                            type: 'STEP_COMPLETED',
                            testFile: testFile,
                            name: testResult.name,
                            stepNumber: stepNumber,
                            totalSteps: testConfig.steps.length,
                            status: 'failed',
                            message: step.onFail || stepResult.reason,
                            timestamp: getFormattedDateTime()
                        });

                        // Stop on first failure (or continue based on config)
                        if (testConfig.continueOnFail) {
                            continue;   // next step
                        }
                        break;        // stop this test -> next test file
                    }
                }

                // Set overall test result
                testResult.passed = allStepsPassed;
                testResult.status = allStepsPassed ? 'passed' : 'failed';
                testResult.output = allStepsPassed
                    ? (testConfig.pass || `✅ All ${testConfig.steps.length} steps passed`)
                    : (testConfig.fail || `❌ Test failed at step ${stepResults.length}`);
                testResult.stepResults = stepResults;

                const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
                try {
                    // await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                    // console.log(`✅ Test report appended to: ${testReportFileName}`);
                } catch (err) {
                    console.log(`🔴 Error writing test report: ${err.stack} 🔴`);
                }
            }
            // ========== CAMERA TEST TYPE HANDLING ==========
            else if (testConfig.type === 'camera') {
                console.log(`    📷 Running camera test`);
                const stepResults = [];
                let allStepsPassed = true;

                for (let i = 0; i < testConfig.steps.length; i++) {
                    // Check if stop was requested
                    if (atsRuntime.testStopRequested) {
                        console.log('    🛑 Test stopped by user request');
                        return {
                            testFile,
                            status: "stopped",
                            output: "Test stopped by user",
                            passed: false
                        };
                    }

                    const step = testConfig.steps[i];
                    const stepNumber = step.stepNumber || (i + 1);

                    console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);

                    // Broadcast step started
                    onStatus?.({
                        type: 'STEP_STARTED',
                        testFile: testFile,
                        name: testResult.name,
                        stepNumber: stepNumber,
                        totalSteps: testConfig.steps.length,
                        message: step.msg,
                        waitFor: step.waitFor,
                        waitTime: step.waitTime || 60,
                        timestamp: getFormattedDateTime()
                    });

                    // Camera capture step
                    if (step.waitFor === 'capture') {
                        try {
                            console.log("   Capturing image using ReadImage executable...");

                            const cameraIp =
                                step.cameraIp ||
                                process.env.CAMERA_IP ||
                                "192.168.0.120";

                            const timestamp = getFormattedDateTime("filename");
                            const fileName = `test_${timestamp}.jpg`;

                            const outputDir = process.env.SNAP_DIR || "C:/Snaps";
                            const outputPath = path.join(outputDir, fileName);

                            const exePath =
                                process.env.READIMAGE_EXE_PATH ||
                                path.join(__dirname, "..", "ReadImage_recovered_5.exe");

                            const timeoutMs = Number.parseInt(
                                process.env.READIMAGE_TIMEOUT_MS || "45000",
                                10
                            );

                            if (!fs.existsSync(outputDir)) {
                                fs.mkdirSync(outputDir, { recursive: true });
                            }

                            if (!fs.existsSync(exePath)) {
                                throw new Error(`ReadImage executable not found at: ${exePath}`);
                            }

                            let args = [String(cameraIp), String(outputPath)];

                            if (process.env.READIMAGE_ARGS_JSON) {
                                const parsed = JSON.parse(process.env.READIMAGE_ARGS_JSON);

                                if (!Array.isArray(parsed)) {
                                    throw new Error("READIMAGE_ARGS_JSON must be a JSON array");
                                }

                                args = parsed.map((arg) =>
                                    String(arg)
                                        .replaceAll("{ip}", String(cameraIp))
                                        .replaceAll("{out}", String(outputPath))
                                );
                            }

                            await new Promise((resolve, reject) => {

                                let finished = false;

                                const child = spawn(exePath, args, {
                                    windowsHide: true,
                                    stdio: ["ignore", "pipe", "pipe"]
                                });

                                let stdout = "";
                                let stderr = "";

                                const stopResolver = () => {

                                    if (finished) return;

                                    finished = true;

                                    console.log(
                                        `🛑 Camera test stopped by user`
                                    );

                                    clearTimeout(timer);

                                    try {
                                        child.kill();
                                    } catch (err) {
                                        console.log(
                                            "⚠️ Could not kill ReadImage process:",
                                            err.message
                                        );
                                    }

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    resolve({
                                        stopped: true
                                    });
                                };

                                child.stdout.on("data", (data) => {
                                    stdout += data.toString();
                                });

                                child.stderr.on("data", (data) => {
                                    stderr += data.toString();
                                });

                                child.on("error", (err) => {

                                    if (finished) return;

                                    finished = true;

                                    clearTimeout(timer);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    reject(err);
                                });

                                const timer = setTimeout(() => {

                                    if (finished) return;

                                    finished = true;

                                    try {
                                        child.kill();
                                    } catch {
                                        // ignore
                                    }

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    reject(
                                        new Error(
                                            `ReadImage timed out after ${timeoutMs}ms ` +
                                            `(exe=${exePath}, ip=${cameraIp}, out=${outputPath})`
                                        )
                                    );

                                }, Number.isFinite(timeoutMs) ? timeoutMs : 45000);

                                atsRuntime.registerStopResolver(
                                    stopResolver
                                );

                                child.on("close", (code) => {

                                    if (finished) return;

                                    finished = true;

                                    clearTimeout(timer);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    if (code === 0) {
                                        resolve({
                                            stopped: false
                                        });

                                    } else {
                                        reject(
                                            new Error(
                                                `ReadImage exited with code ${code}` +
                                                `${stderr ? `: ${stderr.trim()}` : ""}` +
                                                `${stdout ? ` | stdout: ${stdout.trim()}` : ""}`
                                            )
                                        );
                                    }
                                });
                            });

                            if (atsRuntime.testStopRequested) {
                                return {
                                    testFile,
                                    status: "stopped",
                                    output: "Test stopped by user",
                                    passed: false,
                                    stepResults
                                };
                            }

                            let stat;
                            try {
                                stat = fs.statSync(outputPath);
                            } catch {
                                throw new Error(
                                    `ReadImage completed but output file was not created: ${outputPath}`
                                );
                            }

                            if (!stat.isFile() || stat.size === 0) {
                                throw new Error(`ReadImage output file is empty or invalid: ${outputPath}`);
                            }

                            console.log(`    Image captured: ${fileName}`);
                            console.log(`    Image saved at: ${outputPath}`);

                            const dialogPromise = new Promise((resolve) => {

                                let finished = false;

                                const stopResolver = () => {

                                    if (finished) return;

                                    finished = true;

                                    clearTimeout(timeout);

                                    atsRuntime.setDialogResolver(null);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    console.log(
                                        `🛑 Camera confirmation stopped by user`
                                    );

                                    resolve({
                                        confirmed: false,
                                        reason: "STOP_REQUESTED"
                                    });
                                };

                                const timeout = setTimeout(() => {

                                    if (finished) return;

                                    finished = true;

                                    atsRuntime.setDialogResolver(null);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    console.log(
                                        `    Dialog timeout after ${step.waitTime || 60}s`
                                    );

                                    resolve({
                                        confirmed: false,
                                        reason: "TIMEOUT"
                                    });

                                }, (step.waitTime || 60) * 1000);

                                atsRuntime.registerStopResolver(
                                    stopResolver
                                );

                                atsRuntime.setDialogResolver((confirmed) => {

                                    if (finished) return;

                                    finished = true;

                                    console.log(
                                        `    Dialog response received: ${confirmed}`
                                    );

                                    clearTimeout(timeout);

                                    atsRuntime.setDialogResolver(null);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    resolve({
                                        confirmed,
                                        reason: confirmed
                                            ? "USER_CONFIRMED"
                                            : "USER_CANCELLED"
                                    });
                                });
                            });

                            onStatus?.({
                                type: "CAMERA_IMAGE_CAPTURED",
                                testFile,
                                name: testResult.name,
                                stepNumber,
                                totalSteps: testConfig.steps.length,
                                imagePath: outputPath,
                                imageName: fileName,
                                message: step.msg || "Camera image captured. Please verify.",
                                waitTime: step.waitTime || 60,
                                timestamp: getFormattedDateTime()
                            });

                            console.log("   Waiting for user confirmation...");

                            const dialogResult = await dialogPromise;

                            if (dialogResult.reason === "STOP_REQUESTED") {
                                return {
                                    testFile,
                                    status: "stopped",
                                    output: "Test stopped by user",
                                    passed: false,
                                    stepResults
                                };
                            }

                            if (dialogResult.confirmed) {
                                stepResults.push({
                                    step: stepNumber,
                                    status: "passed",
                                    message: step.onPass || "Camera test passed - User confirmed",
                                    received: `Image: ${fileName}`
                                });

                                onStatus?.({
                                    type: "STEP_COMPLETED",
                                    testFile,
                                    name: testResult.name,
                                    stepNumber,
                                    totalSteps: testConfig.steps.length,
                                    status: "passed",
                                    message: step.onPass || "Camera test passed",
                                    timestamp: getFormattedDateTime()
                                });
                            } else {
                                allStepsPassed = false;

                                stepResults.push({
                                    step: stepNumber,
                                    status: "failed",
                                    message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
                                    received: `Image: ${fileName}`
                                });

                                onStatus?.({
                                    type: "STEP_COMPLETED",
                                    testFile,
                                    name: testResult.name,
                                    stepNumber,
                                    totalSteps: testConfig.steps.length,
                                    status: "failed",
                                    message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
                                    timestamp: getFormattedDateTime()
                                });

                                break;
                            }
                        } catch (err) {
                            console.log(`   Step ${stepNumber} FAILED: Camera error - ${err.message}`);

                            allStepsPassed = false;

                            stepResults.push({
                                step: stepNumber,
                                status: "failed",
                                message: step.onFail || `Camera capture failed: ${err.message}`,
                                received: null
                            });

                            onStatus?.({
                                type: "STEP_COMPLETED",
                                testFile,
                                name: testResult.name,
                                stepNumber,
                                totalSteps: testConfig.steps.length,
                                status: "failed",
                                message: `Camera capture failed: ${err.message}`,
                                timestamp: getFormattedDateTime()
                            });

                            continue;
                        }
                    }


                    // Set overall test result
                    testResult.passed = allStepsPassed;
                    testResult.status = allStepsPassed ? 'passed' : 'failed';
                    testResult.output = allStepsPassed
                        ? (testConfig.pass || `✅ Camera test passed`)
                        : (testConfig.fail || `❌ Camera test failed`);
                    testResult.stepResults = stepResults;

                    const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
                    try {
                        // await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                        console.log(`✅ Test report appended`);
                    } catch (err) {
                        console.log(`🔴 Error writing test report: ${err.stack} 🔴`);
                    }
                }
            }
            // ========== STEP-BASED TEST EXECUTION ==========
            else if (testConfig.steps.length > 0) {
                const testDeviceMAC = connectedMACs[0];
                let allStepsPassed = true;
                const stepResults = [];

                console.log(`   🔄 Running step-based test with ${testConfig.steps.length} steps`);

                for (let i = 0; i < testConfig.steps.length; i++) {
                    // Check if stop was requested
                    if (atsRuntime.testStopRequested) {
                        console.log('    🛑 Test stopped by user request');
                        return {
                            testFile,
                            status: "stopped",
                            output: "Test stopped by user",
                            passed: false
                        };
                    }

                    const step = testConfig.steps[i];
                    const stepNumber = step.stepNumber || (i + 1);

                    console.log(` \n📍 Step ${stepNumber}: ${step.msg}`);
                    console.log(`    Waiting for: ${step.waitFor} = ${step.expectedValue}`);
                    console.log(`    Timeout: ${step.waitTime}s`);
                    console.log(`    Action: ${step.action}`)

                    console.log(`\n🟦 STEP ${stepNumber} STARTED`);
                    // Broadcast step started (same for all step types)
                    onStatus?.({
                        type: 'STEP_STARTED',
                        testFile: testFile,
                        name: testResult.name,
                        stepNumber: stepNumber,
                        totalSteps: testConfig.steps.length,
                        message: step.msg,
                        waitFor: step.waitFor,
                        expectedValue: step.expectedValue,
                        waitTime: step.waitTime || 20,
                        timestamp: getFormattedDateTime()
                    });

                    // Handle dialog steps separately - wait for user confirmation
                    // if (step.waitFor === "dialog") {
                    //   console.log(`   ⏳ Waiting for user dialog confirmation...`);

                    //   const dialogResult = await new Promise((resolve) => {
                    //     const timeout = setTimeout(() => {
                    //       pendingDialogResolver = null;
                    //       resolve(false);  // Timeout = cancel
                    //     }, (step.waitTime || 60) * 1000);  // Longer timeout for user interaction

                    //     pendingDialogResolver = (confirmed) => {
                    //       clearTimeout(timeout);
                    //       resolve(confirmed);
                    //     };
                    //   });

                    //   // Process dialog result
                    //   if (dialogResult) {
                    //     console.log(`   ✅ Step ${stepNumber} PASSED: User confirmed`);
                    //     stepResults.push({
                    //       step: stepNumber,
                    //       status: 'passed',
                    //       message: step.onPass || 'User confirmed',
                    //       received: 'dialog:confirmed'
                    //     });

                    //     onStatus?.({
                    //       type: 'STEP_COMPLETED',
                    //       testFile: testFile,
                    //       name: testResult.name,
                    //       stepNumber: stepNumber,
                    //       totalSteps: testConfig.steps.length,
                    //       status: 'passed',
                    //       message: step.onPass || 'User confirmed',
                    //       timestamp: getFormattedDateTime()
                    //     });
                    //   } else {
                    //     console.log(`   ❌ Step ${stepNumber} FAILED: User cancelled or timeout`);
                    //     allStepsPassed = false;
                    //     stepResults.push({
                    //       step: stepNumber,
                    //       status: 'failed',
                    //       message: step.onFail || 'User cancelled or timeout',
                    //       received: 'dialog:cancelled'
                    //     });

                    //     onStatus?.({
                    //       type: 'STEP_COMPLETED',
                    //       testFile: testFile,
                    //       name: testResult.name,
                    //       stepNumber: stepNumber,
                    //       totalSteps: testConfig.steps.length,
                    //       status: 'failed',
                    //       message: step.onFail || 'User cancelled or timeout',
                    //       timestamp: getFormattedDateTime()
                    //     });

                    //     break;  // Stop on dialog failure
                    //   }

                    //   continue;  // Skip to next step (don't run device waiter)
                    // }


                    // Wait for the expected value (device readings)
                    const stepResult = await new Promise((resolve) => {
                        let isCurrentlyMatching = false;
                        let lastReceivedValue = null;
                        let finished = false;
                        let currentStepHandler = null;

                        // 🧹 Cleanup everything belonging to this step
                        const cleanup = () => {

                            clearTimeout(timeout);

                            if (currentStepHandler) {
                                const idx =
                                    atsRuntime.deviceCommandWaiters.indexOf(
                                        currentStepHandler
                                    );

                                if (idx > -1) {
                                    atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                }
                            }

                            atsRuntime.clearTestWaitForMAC();

                            atsRuntime.unregisterStopResolver(stopResolver);
                        };

                        // 🛑 GLOBAL STOP
                        const stopResolver = () => {

                            if (finished) return;

                            finished = true;

                            console.log(
                                `🛑 ${testFile} Step ${stepNumber} stopped by user`
                            );

                            cleanup();

                            resolve({
                                success: false,
                                reason: "STOP_REQUESTED",
                                received: lastReceivedValue
                            });
                        };

                        // atsRuntime.registerStopResolver(stopResolver);

                        const timeout = setTimeout(() => {
                            if (finished) return;

                            finished = true;

                            cleanup();

                            // if (currentStepHandler) {
                            //     const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
                            //     if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                            // }
                            // atsRuntime.clearTestWaitForMAC();
                            if (isCurrentlyMatching) {
                                console.log("✅ Step passed after full waitTime");

                                resolve({
                                    success: true,
                                    received: lastReceivedValue
                                });
                            } else {
                                console.log("❌ Step failed after full waitTime");

                                resolve({
                                    success: false,
                                    reason: 'VALUE_NOT_MATCHING_AT_END',
                                    received: lastReceivedValue
                                });
                            }
                        }, (step.waitTime || 20) * 1000);

                        // const timeout = setTimeout(() => {
                        //     atsRuntime.clearTestWaitForMAC();
                        //     if (currentStepHandler) {
                        //         const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
                        //         if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                        //     }
                        //     resolve({ success: false, reason: 'TIMEOUT', received: null });
                        // }, (step.waitTime || 20) * 1000);

                        // Register this step for immediate STOP
                        atsRuntime.registerStopResolver(stopResolver);

                        atsRuntime.setTestWaitForMAC(testDeviceMAC);  //Setting device for testing so it can wait for device readings 

                        // let currentStepHandler = null;

                        // Handler wait for expecting outputs inside the steps
                        const stepHandler = (reading) => {
                            if (finished) {
                                return false;
                            }

                            if (!reading || typeof reading !== 'object') {
                                return false;
                            }

                            // ==========================================
                            // PROPERTY CHECKING CODE
                            // ==========================================
                            const isMultiProperty = step.waitFor.includes(';');

                            if (isMultiProperty) {
                                // Multi-property check: ALL properties must match
                                const properties = step.waitFor.split(';').map(p => p.trim());
                                const expectedValues = step.expectedValue.split(';').map(v => v.trim());

                                let allMatch = true;

                                // Checking values defined in single step
                                for (let j = 0; j < properties.length; j++) {
                                    const prop = properties[j];
                                    const expectedVal = expectedValues[j] || expectedValues[0];
                                    const receivedVal = String(reading[prop]).toUpperCase().trim();
                                    const normalizedExpected = String(expectedVal).toUpperCase().trim();

                                    console.log(`   🔍 Checking: ${prop} = "${reading[prop]}" (expected: "${expectedVal}")`);

                                    // if (receivedVal !== normalizedExpected) {
                                    //     allMatch = false;
                                    // }

                                    isCurrentlyMatching = properties.every((prop, i) => {
                                        const expected = (expectedValues[i] || expectedValues[0]).toUpperCase().trim();
                                        const received = String(reading[prop]).toUpperCase().trim();
                                        return received === expected;
                                    });

                                    lastReceivedValue = reading;
                                }

                                // if (allMatch) {
                                //     clearTimeout(timeout);
                                //     atsRuntime.clearTestWaitForMAC();
                                //     const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
                                //     if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                //     resolve({ success: true, received: 'All properties matched' });
                                //     return true;
                                // }

                                console.log(`⏳ Not all properties matched yet, continuing to wait...`);
                                return false;
                            } else {
                                // Single property check
                                const receivedValue = reading[step.waitFor];
                                lastReceivedValue = receivedValue;

                                const normalizedReceived = String(receivedValue).toUpperCase().trim();
                                const normalizedExpected = String(step.expectedValue).toUpperCase().trim();

                                console.log(`   🔍 Checking: ${step.waitFor} = "${receivedValue}" (expected: "${step.expectedValue}")`);

                                isCurrentlyMatching = (normalizedReceived === normalizedExpected);
                                // Checking expected Value
                                // if (normalizedReceived === normalizedExpected) {
                                //     clearTimeout(timeout);
                                //     atsRuntime.clearTestWaitForMAC();
                                //     const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);    
                                //     if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                //     resolve({ success: true, received: receivedValue });
                                //     return true;
                                // }

                                return false; // Keep waiting
                            }
                        };

                        currentStepHandler = stepHandler;
                        atsRuntime.deviceCommandWaiters.push(stepHandler);


                        if (step.action) {
                            console.log("🚀 Sending command:", step.action);

                            testResult.commands.push(step.action);

                            fetch("http://localhost:5000/command", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ mac: connectedMACs, command: step.action }),
                            });
                        }
                    });

                    // 🛑 User stopped the test
                    if (stepResult.reason === "STOP_REQUESTED") {

                        console.log(
                            `🛑 ${testFile} stopped by user`
                        );

                        return {
                            testFile,
                            status: "stopped",
                            output: "Test stopped by user",
                            passed: false,
                            stepResults
                        };
                    }

                    // Process step result
                    if (stepResult.success) {
                        console.log(`   ✅ Step ${stepNumber} PASSED: ${step.onPass || 'Success'}`);
                        stepResults.push({
                            step: stepNumber,
                            status: 'passed',
                            message: step.onPass || 'Step passed',
                            received: stepResult.received
                        });

                        // sending message to UI after test completion
                        onStatus?.({
                            type: 'STEP_COMPLETED',
                            testFile: testFile,
                            name: testResult.name,
                            stepNumber: stepNumber,
                            totalSteps: testConfig.steps.length,
                            status: 'passed',
                            message: step.onPass || 'Step passed',
                            timestamp: getFormattedDateTime()
                        });
                    }
                    // ELSE FOR (Single Step Failed)
                    else {
                        console.log(`   ❌ Step ${stepNumber} FAILED: ${step.onFail || stepResult.reason}`);
                        allStepsPassed = false;
                        stepResults.push({
                            step: stepNumber,
                            status: 'failed',
                            message: step.onFail || stepResult.reason,
                            received: stepResult.received
                        });

                        // BROADCASTING MESSAGE
                        // FOR: STEP COMPLETED RESULT 
                        onStatus?.({
                            type: 'STEP_COMPLETED',
                            testFile: testFile,
                            name: testResult.name,
                            stepNumber: stepNumber,
                            totalSteps: testConfig.steps.length,
                            status: 'failed',
                            message: step.onFail || stepResult.reason,
                            timestamp: getFormattedDateTime()
                        });

                        // Stop on first failure (or continue based on config)
                        // break;

                        // continue;
                        if (testConfig.continueOnFail) {
                            continue;   // next step
                        }
                        break;          // stop this test -> next test file
                    }
                }

                // Set overall test result
                testResult.passed = allStepsPassed;
                testResult.status = allStepsPassed ? 'passed' : 'failed';


                testResult.output = allStepsPassed
                    ? (testConfig.pass || `✅ All ${testConfig.steps.length} steps passed`)
                    : (testConfig.fail || `❌ Test failed at step ${stepResults.length}`);
                testResult.stepResults = stepResults;

                const reportContent = `Test: ${testResult.name} , Status: ${testResult.status} , Steps: ${stepResults.length}/${testConfig.steps.length}`;
                try {
                    // await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                    console.log(`✅ Test report appended`);
                } catch (err) {
                    console.log(`🔴 Error writing test report: ${err.stack} 🔴`);
                }
            }
            // ========== EO-BASED TEST EXECUTION (Original Logic) ==========
            else {
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

                // Track handler for cleanup
                let currentHandler = null;

                // Create a promise that resolves only when the expected condition is met
                let eoStopped = false;

                const waitForResponse = new Promise((resolve) => {

                    const stopResolver = () => {

                        if (eoStopped) return;

                        eoStopped = true;

                        console.log(
                            `🛑 EO test stopped by user: ${testFile}`
                        );

                        clearTimeout(timeout);

                        if (currentHandler) {

                            const idx =
                                atsRuntime.deviceCommandWaiters.indexOf(
                                    currentHandler
                                );

                            if (idx > -1) {
                                atsRuntime.deviceCommandWaiters.splice(
                                    idx,
                                    1
                                );
                            }
                        }

                        atsRuntime.clearTestWaitForMAC();

                        atsRuntime.unregisterStopResolver(
                            stopResolver
                        );

                        resolve("STOP_REQUESTED");
                    };

                    const timeout = setTimeout(() => {

                        if (eoStopped) return;

                        eoStopped = true;

                        if (currentHandler) {

                            const idx =
                                atsRuntime.deviceCommandWaiters.indexOf(
                                    currentHandler
                                );

                            if (idx > -1) {
                                atsRuntime.deviceCommandWaiters.splice(
                                    idx,
                                    1
                                );
                            }
                        }

                        atsRuntime.clearTestWaitForMAC();

                        atsRuntime.unregisterStopResolver(
                            stopResolver
                        );

                        resolve("TIMEOUT");

                    }, 20000);

                    atsRuntime.registerStopResolver(
                        stopResolver
                    );

                    atsRuntime.setTestWaitForMAC(
                        testDeviceMAC
                    );

                    // Set this MAC as the one we're waiting for
                    atsRuntime.setTestWaitForMAC(testDeviceMAC);

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

                                console.log(`⚡ATS ===  ${property}: Expected="${expectedValue}" | Received="${receivedValue}" | Match=${matches}⚡`);
                                results.push({ property, expectedValue, receivedValue, matches });

                                if (!matches) {
                                    allMatch = false;
                                }
                            }

                            if (allMatch) {
                                testPassed = true;
                                console.log(`✅ ALL properties matched!`);
                                clearTimeout(timeout);

                                atsRuntime.unregisterStopResolver(
                                    stopResolver
                                );

                                const idx = atsRuntime.deviceCommandWaiters.indexOf(
                                    responseHandler
                                );
                                if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                atsRuntime.clearTestWaitForMAC();
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
                                    testPassed = true;
                                    clearTimeout(timeout);

                                    atsRuntime.unregisterStopResolver(
                                        stopResolver
                                    );

                                    const idx = atsRuntime.deviceCommandWaiters.indexOf(
                                        responseHandler
                                    );
                                    if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                    atsRuntime.clearTestWaitForMAC();
                                    resolve(reading);
                                    return true;
                                }
                            }
                            return false;
                        }

                        // Fallback: any object response resolves for numeric EO cases
                        clearTimeout(timeout);

                        atsRuntime.unregisterStopResolver(
                            stopResolver
                        );

                        const idx = atsRuntime.deviceCommandWaiters.indexOf(
                            responseHandler
                        ); if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                        atsRuntime.clearTestWaitForMAC();
                        resolve(reading);
                        return true;
                    };

                    // Store reference for timeout cleanup
                    currentHandler = responseHandler;
                    // Store the handler to be called when this device responds
                    atsRuntime.deviceCommandWaiters.push(responseHandler);
                });

                deviceResponse = await waitForResponse;

                // 🛑 User stopped EO test
                if (deviceResponse === "STOP_REQUESTED") {

                    console.log(
                        `🛑 ${testFile} stopped by user`
                    );

                    return {
                        testFile,
                        status: "stopped",
                        output: "Test stopped by user",
                        passed: false
                    };
                }

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
                        // No property specified in EO - invalid format
                        console.warn(`⚠️ EO format not recognized: "${expectation}" - expected format: "property:value" or "prop1:val1;prop2:val2"`);
                        testResult.output = `❌ Test FAILED: Invalid EO format "${expectation}" - use property:value syntax`;
                        testPassed = false;
                    }

                    testResult.status = testPassed ? "passed" : "failed";
                    testResult.passed = testPassed;
                }

                const reportContent = `Test: ${testResult.name} , Status: ${testResult.status}`;
                try {
                    // await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                    console.log(`✅ Test report appended`);
                } catch (err) {
                    console.log(`🔴 Error writing test report: ${err.stack} 🔴`);
                }
            } // End of EO-based test execution

            // Send test completion status
            onStatus?.({
                type: 'TEST_COMPLETED',
                testFile: testFile,
                name: testResult.name,
                status: testResult.status,
                output: testResult.output,
                timestamp: getFormattedDateTime()
            });

        } catch (err) {
            console.error(`Error parsing test file ${testFile}:`, err.stack);
            testResult.status = "failed";
            testResult.output = `Test file parsing error: ${err.message}`;
            testResult.passed = false;
        }

        testResult.duration = Date.now() - startTime;

        console.log(`Completed: ${testFile}`);

        return testResult;
    } catch (err) {
        console.error(`Error processing ${testFile}:`, err.stack);
        return {

            testFile,
            status: "failed",
            output: `Processing error: ${err.message}`,
            passed: false

        };
    }
}

// TEST GROUP
const TEST_GROUPS = [
    // Group 1
    [
        "1_Fans.srv",
        "2_Door.srv",
        "4_Leakage.srv",
        "5_Logging.srv"

    ],

    // Group 2
    [
        "11_fan_fail.srv",
        "3_Fire.srv",
    ],

    // Group 3
    [
        "7_Lock_Rack.srv",
        "9_outside_Temp.srv"
    ],

    // Group 4
    [
        "8_humidity.srv",
        "10_camera.srv",
        "6_Lock_eMS.srv"
    ],

];

const runTests = async (options) => {
    // 🔄 Reset stop state for a NEW ATS execution
    atsRuntime.resetStop();

    const results = [];

    const selectedTests = options.testFiles || [];

    console.log("\n========================================");
    console.log("🚀 ATS GROUPED TEST EXECUTION");
    console.log("Selected tests:", selectedTests);
    console.log("========================================\n");

    for (let groupIndex = 0; groupIndex < TEST_GROUPS.length; groupIndex++) {

        // Stop before starting another group
        if (atsRuntime.testStopRequested) {
            console.log(
                "🛑 Stop requested - stopping remaining test groups"
            );
            break;
        }

        const group = TEST_GROUPS[groupIndex];

        // Only take tests selected by the user
        const testsInGroup = group.filter(testFile =>
            selectedTests.includes(testFile)
        );

        // Nothing from this group was selected
        if (testsInGroup.length === 0) {
            continue;
        }

        console.log("\n========================================");
        console.log(`🚀 STARTING TEST GROUP ${groupIndex + 1}`);
        console.log("Tests:", testsInGroup);
        console.log("========================================\n");

        /*
         * All tests in this group run simultaneously.
         */
        const groupResults = await Promise.all(
            testsInGroup.map(testFile =>
                executeSingleTest({
                    ...options,
                    testFile
                })
            )
        );

        // Add this group's results
        results.push(...groupResults);

        if (atsRuntime.testStopRequested) {
            console.log(
                `🛑 TEST GROUP ${groupIndex + 1} STOPPED BY USER`
            );
        } else {
            console.log(
                `✅ TEST GROUP ${groupIndex + 1} COMPLETED`
            );
        }
        console.log("Group results:", groupResults);
        console.log("----------------------------------------\n");
    }

    // Final counts
    const passedCount = results.filter(
        result =>
            result.status === "passed" ||
            result.passed === true
    ).length;

    const failedCount = results.filter(
        result =>
            result.status === "failed" ||
            result.passed === false
    ).length;

    const stoppedCount = results.filter(
        result =>
            result.status === "stopped"
    ).length;

    console.log("\n========================================");
    console.log("🏁 ATS TEST EXECUTION COMPLETED");
    console.log("========================================");
    console.log(`Total tests : ${results.length}`);
    console.log(`Passed      : ${passedCount}`);
    console.log(`Failed      : ${failedCount}`);
    console.log(`Stopped     : ${stoppedCount}`);
    console.log("========================================\n");

    return {
        summary: {
            total: results.length,
            passed: passedCount,
            failed: failedCount,
            stopped: stoppedCount
        },
        results
    };
};

module.exports = { runTests };
