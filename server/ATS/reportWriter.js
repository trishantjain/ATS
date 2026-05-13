const fs = require("fs");
const path = require("path");
const { getFormattedDateTime } = require("../utils/time");
const { getNextReportNumber } = require("../ESP_Testing/reportCounter")

const DESTINATION_MAP = {
    fan: "testResult/fan",
    iMoni: "testResult/iMoni",
    pdu: "testResult/pdu"
};

const REPORT_SUBDIR_MAP = {
    "green-pcb": "green-pcb",
    "full-controller": "full-controller"
};


async function reportWriter({
    runResult,
    destination,
    // outputDir,
    mac = "unknown-device",
    // unitSerialNo = '0000',
    whitePcbSrNo = "",
    unitSerialNo = "",
    testLevel = "full-controller"
}) {
    if (!DESTINATION_MAP[destination]) {
        throw new Error(`Invalid report destination: ${destination}`);
    }

    const reportNo = getNextReportNumber(destination);

    let baseDir = path.join(
        __dirname,
        "..",
        DESTINATION_MAP[destination]
    );

        
    if (destination === "iMoni") {
        baseDir = path.join(
            baseDir,
            REPORT_SUBDIR_MAP[testLevel] || "full-controller"
        );
    }


    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    console.log("runResult: ", runResult);

    const safeMac = String(mac).replace(/:/g, "-");
    // const fileName = `${getFormattedDateTime("file")}_${safeMac}.rpt`;
    // const fileName = `${reportNo}_${getFormattedDateTime("file")}_${safeMac}.rpt`;

    // const safeControllerId = String(deviceId || "unknown-controller").replace(/[^a-zA-Z0-9-_]/g, "");
    const safeUnitSerialNo = String(unitSerialNo || "unknown-unit")
        .replace(/[^a-zA-Z0-9-_]/g, "");

    const fileName = `${reportNo}_${safeUnitSerialNo}_${getFormattedDateTime("file")}_${safeMac}.csv`;

    // const fileName = `${reportNo}_${safeControllerId}_${getFormattedDateTime("file")}_${safeMac}.csv`;
    const filePath = path.join(baseDir, fileName);

    let content = "";

    // ================= HEADER ================= 
    content += `Report No:,${reportNo}\n`;
    content += `Unit Sr No:,${unitSerialNo || "NA"}\n`;
    content += `CPU Sr. No.:,${whitePcbSrNo || "NA"}\n`;
    content += `DateTime:,${getFormattedDateTime()}\n`;
    content += `TestLevel:,${testLevel === "green-pcb" ? "Green PCB" : "SRMS Unit"}\n`;


    if (testLevel !== "green-pcb") {
        content += `DeviceIP:,${mac}\n`;
    }

    content += `TotalTests:,${runResult.summary.total}\n\n`;

    // ================= TABLE HEADER ================= 
    content += "Sr. No.,TestName,Status,FailedStep,TotalSteps,Reason,Remarks\n";

    // Header
    // await fs.promises.writeFile(
    //     filePath,
    //     `Unit Sr. No.`+
    //     `Date & Time\n` +
    //     `Report No: ${reportNo}\n` +
    //     `Type: ${destination}\n` +
    //     `Device: ${safeMac}\n` +
    //     `Timestamp: ${getFormattedDateTime()}\n` +
    //     `Total Tests: ${runResult.summary.total}\n\n`,
    //     { flag: "w" }
    // );

    // ================= PER TEST =================
    // for (const test of runResult.results) {
    //     const testName = test.name || test.testFile || "Unnamed Test";

    //     await fs.promises.appendFile(
    //         filePath,
    //         `Test: ${test.name}\nStatus: ${test.status}\n\n`
    //     );

    //     if (Array.isArray(test.stepResults) && test.stepResults.length > 0) {
    //         await fs.promises.appendFile(
    //             filePath,
    //             "Step,StepStatus,Message\n"
    //         );

    //         for (const step of test.stepResults) {
    //             const stepStatus = step.status === "failed" ? "*FAILED" : step.status.toUpperCase();
    //             const line =
    //                 `${step.step},` +
    //                 `${stepStatus},` +
    //                 `"${(step.message || "").replace(/"/g, '""')}"\n`;

    //             await fs.promises.appendFile(filePath, line);
    //         }
    //     }

    //     await fs.promises.appendFile(filePath, "\n=== TEST END ===\n\n");
    // }

    // ================= TEST DATA ================= 
    runResult.results.forEach((test, index) => {
        // FAILED STEP 
        const failedStep = test.stepResults?.find(
            s => s.status === "failed"
        );

        // LAST PASSED STEP 
        const passedStep = test.stepResults
            ?.filter(s => s.status === "passed")
            ?.slice(-1)[0];

        // REASON 
        const reason =
            failedStep?.message ||
            passedStep?.message ||
            test.output || "";

        // FAILED STEP NUMBER 
        const failedStepNo =
            failedStep?.step || "";

        const totalSteps = test.stepResults?.length || "";

        // CHANGING FAILED STATUS TO '*FAILED' IN FAN REPORT
        const statusForReport =
            destination === "fan" && test.status === "failed"
                ? "*FAILED"
                : test.status.toUpperCase();

        content += [
            index + 1,
            `"${(test.name || "").replace(/"/g, '""')}"`,
            statusForReport,
            failedStepNo,
            totalSteps,
            `"${String(reason).replace(/"/g, '""')}"`,
            ""
        ].join(",") + "\n";
    });

    // WRITE COMPLETE FILE ONCE 
    await fs.promises.writeFile(filePath, content);
    console.log(`✅ Report Generated: ${fileName}`);

    return { filePath, fileName };
}

module.exports = { reportWriter };
