const fs = require("fs");
const path = require("path");
const { getFormattedDateTime } = require("../utils/time");
const {getNextReportNumber} = require("../ESP_Testing/reportCounter")

const DESTINATION_MAP = {
    fan: "testResult/fan",
    iMoni: "testResult/iMoni",
    pdu: "testResult/pdu"
};

async function reportWriter({
    runResult,
    destination,
    // outputDir,
    mac = "unknown-device"
}) {
    if (!DESTINATION_MAP[destination]) {
        throw new Error(`Invalid report destination: ${destination}`);
    }

    const reportNo = getNextReportNumber(destination);

    const baseDir = path.join(
        __dirname,
        "..",
        DESTINATION_MAP[destination]
    );

    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    console.log("runResult: ", runResult);

    const safeMac = String(mac).replace(/:/g, "-");
    // const fileName = `${getFormattedDateTime("file")}_${safeMac}.rpt`;
    const fileName = `${reportNo}_${getFormattedDateTime("file")}_${safeMac}.rpt`;
    const filePath = path.join(baseDir, fileName);

    // Header
    await fs.promises.writeFile(
        filePath,
        `ATS Test Run\n` +
        `Report No: ${reportNo}\n` +
        `Type: ${destination}\n` +
        `Device: ${safeMac}\n` +
        `Timestamp: ${getFormattedDateTime()}\n` +
        `Total Tests: ${runResult.summary.total}\n\n`,
        { flag: "w" }
    );

    // ===== PER TEST =====
    for (const test of runResult.results) {
        const testName = test.name || test.testFile || "Unnamed Test";

        await fs.promises.appendFile(
            filePath,
            `Test: ${test.name}\nStatus: ${test.status}\n\n`
        );

        if (Array.isArray(test.stepResults) && test.stepResults.length > 0) {
            await fs.promises.appendFile(
                filePath,
                "Step,StepStatus,Message\n"
            );

            for (const step of test.stepResults) {
                const line =
                    `${step.step},` +
                    `${step.status.toUpperCase()},` +
                    `"${(step.message || "").replace(/"/g, '""')}"\n`;

                await fs.promises.appendFile(filePath, line);
            }
        }

        await fs.promises.appendFile(filePath, "\n=== TEST END ===\n\n");
    }

    return { filePath, fileName };
}

module.exports = { reportWriter };
