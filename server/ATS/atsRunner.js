const path = require("path");
const fs = require("fs");
const atsRuntime = require("./atsRuntime");
const { getFormattedDateTime } = require("../utils/time");

const runTests = async ({ testFiles, mac, onStatus, frontendResults = [] }) => {
    console.log(`\n=========== 🚀 Starting ATS Test Run: ${testFiles.length} test(s) ===========`);
    const results = [];

    // Run test files one by one
    console.log("Test files in atsRunner:", testFiles);
    for (const testFile of testFiles) {
        // Check if stop was requested before starting next test
        if (atsRuntime.testStopRequested) {
            console.log('    🛑 Test execution stopped by user - skipping remaining tests');
            break;
        }


        console.log(`🔬 Processing test file: ${testFile}`);

        const testDir = path.join(__dirname, "../tests/iMoni");
        const testFilePath = path.join(testDir, testFile);
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
                commands: []
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
                        } else if (line.startsWith('cameraUrl=')) {
                            currentStep.cameraUrl = line.substring(10).replace(/["\']/g, '');
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

                console.log("   📂 Sending Test Started Broadcast");

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

                console.log(`    📡 Connected devices: ${atsRuntime.connectedDevices.length}`);

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
                            testResult.status = 'stopped';
                            testResult.output = 'Test stopped by user';
                            break;
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

                        // Wait for sensor value to increase by the defined amount
                        const stepResult = await new Promise((resolve) => {
                            let initialSensorValue = null;  // Capture initial value from first reading
                            const requiredIncrease = step.increasedBy || 0;

                            const timeout = setTimeout(() => {
                                atsRuntime.clearTestWaitForMAC();
                                if (currentStepHandler) {
                                    const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
                                    if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                }
                                resolve({
                                    success: false,
                                    reason: `TIMEOUT - Value did not increase by ${requiredIncrease} within ${step.waitTime}s`,
                                    received: initialSensorValue
                                });
                            }, (step.waitTime || 20) * 1000);

                            atsRuntime.setTestWaitForMAC(testDeviceMAC);

                            let currentStepHandler = null;

                            // Handler to check if sensor value increased by required amount
                            const stepHandler = (reading) => {
                                if (!reading || typeof reading !== 'object') {
                                    return false;
                                }

                                const currentValue = parseFloat(reading[step.waitFor]);

                                if (isNaN(currentValue)) {
                                    console.log(`   ⚠️ Invalid sensor value for ${step.waitFor}: ${reading[step.waitFor]}`);
                                    return false;
                                }

                                // Capture initial value on first reading
                                if (initialSensorValue === null) {
                                    initialSensorValue = currentValue;
                                    console.log(`   📊 Initial ${step.waitFor} value: ${initialSensorValue}`);
                                    console.log(`   🎯 Waiting for increase of: ${requiredIncrease}`);
                                    return false;  // Keep waiting for subsequent readings
                                }

                                const currentIncrease = currentValue - initialSensorValue;
                                console.log(`   🔍 Checking: ${step.waitFor} = ${currentValue} (initial: ${initialSensorValue}, increase: ${currentIncrease.toFixed(2)}, required: ${requiredIncrease})`);

                                // Check if value has increased by required amount
                                if (currentIncrease >= requiredIncrease) {
                                    clearTimeout(timeout);
                                    atsRuntime.clearTestWaitForMAC();
                                    const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
                                    if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
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
                        });

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
                            break;
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
                        await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                        console.log(`✅ Test report appended to: ${testReportFileName}`);
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
                            testResult.status = 'stopped';
                            testResult.output = 'Test stopped by user';
                            break;
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
                            console.log(`   📸 Capturing image from camera...`);

                            const cameraUrl = step.cameraUrl || 'http://192.168.0.120/CGI/command/snap?channel=01';
                            const now = new Date();
                            const timestamp = now.toISOString()
                                .replace(/[-:]/g, '')
                                .replace(/T/, '_')
                                .replace(/\..+/, '')
                                .slice(0, 15);

                            const fileName = `test_${timestamp}.jpg`;
                            const outputDir = 'C:/snaps';
                            const outputPath = path.join(outputDir, fileName);

                            if (!fs.existsSync(outputDir)) {
                                fs.mkdirSync(outputDir, { recursive: true });
                            }

                            try {
                                // Capture image from camera
                                const response = await axios({
                                    method: 'GET',
                                    url: cameraUrl,
                                    responseType: 'stream',
                                    timeout: 10000
                                });

                                // Save the image
                                await new Promise((resolve, reject) => {
                                    const writer = fs.createWriteStream(outputPath);
                                    response.data.pipe(writer);
                                    writer.on('finish', resolve);
                                    writer.on('error', reject);
                                });

                                console.log(`    ✅ Image captured: ${fileName}`);
                                console.log(`    📁 Image saved at: ${outputPath}`);

                                // FIRST: Set up the dialog resolver BEFORE broadcasting
                                const dialogPromise = new Promise((resolve) => {
                                    const timeout = setTimeout(() => {
                                        console.log(`    ⏰ Dialog timeout after ${step.waitTime || 60}s`);
                                        pendingDialogResolver = null;
                                        resolve({ confirmed: false, reason: 'TIMEOUT' });
                                    }, (step.waitTime || 60) * 1000);

                                    pendingDialogResolver = (confirmed) => {
                                        console.log(`    📨 Dialog response received: ${confirmed}`);
                                        clearTimeout(timeout);
                                        pendingDialogResolver = null;
                                        resolve({ confirmed, reason: confirmed ? 'USER_CONFIRMED' : 'USER_CANCELLED' });
                                    };
                                });

                                // THEN: Broadcast to show dialog on frontend
                                console.log(`   📤 Broadcasting CAMERA_IMAGE_CAPTURED to ${wsClients.size} clients`);

                                // Broadcast image captured - send to frontend for display
                                onStatus?.({
                                    type: 'CAMERA_IMAGE_CAPTURED',
                                    testFile: testFile,
                                    name: testResult.name,
                                    stepNumber: stepNumber,
                                    totalSteps: testConfig.steps.length,
                                    imagePath: outputPath,
                                    imageName: fileName,
                                    message: step.msg || 'Camera image captured. Please verify.',
                                    waitTime: step.waitTime || 60,
                                    timestamp: getFormattedDateTime()
                                });

                                // Wait for user dialog confirmation
                                console.log(`   ⏳ Waiting for user confirmation...`);

                                const dialogResult = await dialogPromise;

                                // Process dialog result
                                if (dialogResult.confirmed) {
                                    console.log(`   ✅ Step ${stepNumber} PASSED: User confirmed camera working`);
                                    stepResults.push({
                                        step: stepNumber,
                                        status: 'passed',
                                        message: step.onPass || 'Camera test passed - User confirmed',
                                        received: `Image: ${fileName}`
                                    });

                                    onStatus?.({
                                        type: 'STEP_COMPLETED',
                                        testFile: testFile,
                                        name: testResult.name,
                                        stepNumber: stepNumber,
                                        totalSteps: testConfig.steps.length,
                                        status: 'passed',
                                        message: step.onPass || 'Camera test passed',
                                        timestamp: getFormattedDateTime()
                                    });
                                } else {
                                    console.log(`   ❌ Step ${stepNumber} FAILED: ${dialogResult.reason}`);
                                    allStepsPassed = false;
                                    stepResults.push({
                                        step: stepNumber,
                                        status: 'failed',
                                        message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
                                        received: `Image: ${fileName}`
                                    });

                                    onStatus?.({
                                        type: 'STEP_COMPLETED',
                                        testFile: testFile,
                                        name: testResult.name,
                                        stepNumber: stepNumber,
                                        totalSteps: testConfig.steps.length,
                                        status: 'failed',
                                        message: step.onFail || `Camera test failed - ${dialogResult.reason}`,
                                        timestamp: getFormattedDateTime()
                                    });

                                    break; // Stop on failure
                                }

                            } catch (err) {
                                console.log(`   ❌ Step ${stepNumber} FAILED: Camera error - ${err.message} \n${err.stack}`);
                                allStepsPassed = false;
                                stepResults.push({
                                    step: stepNumber,
                                    status: 'failed',
                                    message: step.onFail || `Camera capture failed: ${err.message}`,
                                    received: null
                                });

                                onStatus?.({
                                    type: 'STEP_COMPLETED',
                                    testFile: testFile,
                                    name: testResult.name,
                                    stepNumber: stepNumber,
                                    totalSteps: testConfig.steps.length,
                                    status: 'failed',
                                    message: `Camera capture failed: ${err.message}`,
                                    timestamp: getFormattedDateTime()
                                });

                                break; // Stop on failure
                            }
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
                        await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                        console.log(`✅ Test report appended to: ${testReportFileName}`);
                    } catch (err) {
                        console.log(`🔴 Error writing test report: ${err.stack} 🔴`);
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
                            testResult.status = 'stopped';
                            testResult.output = 'Test stopped by user';
                            break;
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
                            const timeout = setTimeout(() => {
                                atsRuntime.clearTestWaitForMAC();
                                if (currentStepHandler) {
                                    const idx = atsRuntime.deviceCommandWaiters.indexOf(currentStepHandler);
                                    if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                }
                                resolve({ success: false, reason: 'TIMEOUT', received: null });
                            }, (step.waitTime || 20) * 1000);

                            atsRuntime.setTestWaitForMAC(testDeviceMAC);  //Setting device for testing so it can wait for device readings 

                            let currentStepHandler = null;

                            // Handler wait for expecting outputs inside the steps
                            const stepHandler = (reading) => {
                                if (!reading || typeof reading !== 'object') {
                                    return false;
                                }

                                // Check if multi-property (contains semicolons)
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

                                        if (receivedVal !== normalizedExpected) {
                                            allMatch = false;
                                        }
                                    }

                                    if (allMatch) {
                                        clearTimeout(timeout);
                                        atsRuntime.clearTestWaitForMAC();
                                        const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
                                        if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                        resolve({ success: true, received: 'All properties matched' });
                                        return true;
                                    }

                                    console.log(`⏳ Not all properties matched yet, continuing to wait...`);
                                    return false;
                                } else {
                                    // Single property check
                                    const receivedValue = reading[step.waitFor];
                                    const normalizedReceived = String(receivedValue).toUpperCase().trim();
                                    const normalizedExpected = String(step.expectedValue).toUpperCase().trim();

                                    console.log(`   🔍 Checking: ${step.waitFor} = "${receivedValue}" (expected: "${step.expectedValue}")`);

                                    // Checking expected Value
                                    if (normalizedReceived === normalizedExpected) {
                                        clearTimeout(timeout);
                                        atsRuntime.clearTestWaitForMAC();
                                        const idx = atsRuntime.deviceCommandWaiters.indexOf(stepHandler);
                                        if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                        resolve({ success: true, received: receivedValue });
                                        return true;
                                    }

                                    return false; // Keep waiting
                                }
                            };

                            currentStepHandler = stepHandler;
                            atsRuntime.deviceCommandWaiters.push(stepHandler);
                        });

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
                            break;
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
                        await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                        console.log(`✅ Test report appended to: ${testReportFileName}`);
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
                    const waitForResponse = new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            atsRuntime.clearTestWaitForMAC();
                            // Cleanup handler on timeout
                            if (currentHandler) {
                                const idx = atsRuntime.deviceCommandWaiters.indexOf(currentHandler);
                                if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                            }
                            resolve("TIMEOUT");
                        }, 20000); // 20 second timeout

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
                                    atsRuntime.clearTestWaitForMAC();
                                    // Cleanup handler on success
                                    const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
                                    if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
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
                                        atsRuntime.clearTestWaitForMAC();
                                        // Cleanup handler on success
                                        const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
                                        if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                                        resolve(reading);
                                        return true;
                                    }
                                }
                                return false;
                            }

                            // Fallback: any object response resolves for numeric EO cases
                            clearTimeout(timeout);
                            atsRuntime.clearTestWaitForMAC();
                            // Cleanup handler on fallback
                            const idx = atsRuntime.deviceCommandWaiters.indexOf(responseHandler);
                            if (idx > -1) atsRuntime.deviceCommandWaiters.splice(idx, 1);
                            resolve(reading);
                            return true;
                        };

                        // Store reference for timeout cleanup
                        currentHandler = responseHandler;
                        // Store the handler to be called when this device responds
                        atsRuntime.deviceCommandWaiters.push(responseHandler);
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
                        await fs.promises.appendFile(testReportFilePath, `${reportContent}\n`);
                        console.log(`✅ Test report appended to: ${testReportFileName}`);
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
            results.push(testResult);
            console.log(`✅ Test completed: ${testFile} - ${testResult.status}`);

        } catch (err) {
            console.error(`Error processing ${testFile}:`, err.stack);
            results.push({
                testFile,
                status: "failed",
                output: `Processing error: ${err.message}`,
                passed: false
            });
        }
    }

    const passedCount = results.filter(r => r.passed || r.status === 'passed').length;
    const failedCount = results.filter(r => !r.passed && r.status !== 'passed').length;

    const response = {
        timestamp: getFormattedDateTime(),
        summary: {
            total: results.length,
            passed: passedCount,
            failed: failedCount,
            frontendTests: frontendResults?.length || 0,
            serverTests: testFiles.length
        },
        results
    };

    return {
        summary: {
            total: results.length,
            passed: passedCount,
            failed: failedCount
        },
        results
    };
};

module.exports = { runTests };