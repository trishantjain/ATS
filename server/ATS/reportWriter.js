const fs = require("fs");
const path = require("path");
const { getFormattedDateTime } = require("../utils/time");
const { getNextReportNumber } = require("../Testing/reportCounter")

const ExcelJS = require("exceljs");

// const workbook = new ExcelJS.Workbook();
// const worksheet = workbook.addWorksheet("Test Report");

const DESTINATION_MAP = {
    fan: "testResult/fan",
    iMoni: "testResult/iMoni",
    pdu: "testResult/pdu"
};

const REPORT_SUBDIR_MAP = {
    "green-pcb": "green-pcb",
    "full-controller": "full-controller"
};

async function generateFanMainReport({
    runResult,
    reportNo,
    unitSerialNo,
    safeMac,
    baseDir
}) {

    const workbook = new ExcelJS.Workbook();

    const worksheet =
        workbook.addWorksheet("Fan ATS Report");

    worksheet.addRow(["Report No", reportNo]);
    worksheet.addRow(["Fan Tray No", unitSerialNo]);
    worksheet.addRow(["Date Time", getFormattedDateTime()]);
    worksheet.addRow([]);

    worksheet.columns = [
        { header: "Fan", width: 10 },
        { header: "Pulses", width: 15 },
        { header: "Status", width: 15 },
        { header: "Remarks", width: 40 }
    ];

    const steps =
        runResult.results[0]?.stepResults || [];

    steps.forEach((step) => {
        worksheet.addRow([
            `Fan ${step.step}`,
            step.message,
            step.status.toUpperCase(),
            step.status === "passed"
                ? "PASS"
                : "FAIL"
        ]);
    });

    const mainDir = path.join(
        baseDir,
        "..",
        "fan-main-report"
    );

    if (!fs.existsSync(mainDir)) {
        fs.mkdirSync(mainDir, { recursive: true });
    }

    const fileName =
        `${reportNo}_${unitSerialNo}_${safeMac}_main.xlsx`;

    await workbook.xlsx.writeFile(
        path.join(mainDir, fileName)
    );
}


async function reportWriter({
    runResult,
    destination,
    // outputDir,
    mac = "unknown-device",
    // unitSerialNo = '0000',
    cpuSrNo = "",
    basePcbSrNo = "",
    cameraSrNo = "",
    psuSrNo = "",
    unitSerialNo = "",
    generateReport,
    testLevel = "full-controller"
}) {
    if (!DESTINATION_MAP[destination]) {
        throw new Error(`Invalid report destination: ${destination}`);
    }

    let reportNo = "";
    let baseDir;
    // if (testLevel === "green-pcb") {
    //     reportNo = getNextReportNumber("iMoni-Base");
    // } else if(testLevel==="full-controller"){
    //     reportNo = getNextReportNumber("iMoni-SRMS");
    // }

    baseDir = path.join(
        __dirname,
        "..",
        DESTINATION_MAP[destination]
    );


    if (destination === "iMoni") {
        const reportFolder = "RPT";

        baseDir = path.join(
            baseDir,
            REPORT_SUBDIR_MAP[testLevel] || "full-controller",
            reportFolder
        );
    }


    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    console.log("runResult: ", runResult);


    let templatePath;

    if (destination === "fan") {
        templatePath = path.join(__dirname, "./template/fan_template.xlsx");
        reportNo = getNextReportNumber("FAN");
    }
    else if (testLevel === "green-pcb") {
        templatePath = path.join(__dirname, "./template/green-pcb_template.xlsx");
        reportNo = getNextReportNumber("iMoni-Base");
    }
    else {
        templatePath = path.join(__dirname, "./template/srms_template.xlsx");
        reportNo = getNextReportNumber("iMoni-SRMS");
    }

    const safeMac = String(mac).replace(/:/g, "-");
    // const fileName = `${getFormattedDateTime("file")}_${safeMac}.rpt`;
    // const fileName = `${reportNo}_${getFormattedDateTime("file")}_${safeMac}.rpt`;

    // const safeControllerId = String(deviceId || "unknown-controller").replace(/[^a-zA-Z0-9-_]/g, "");
    const safeUnitSerialNo = String(unitSerialNo || "unknown-unit")
        .replace(/[^a-zA-Z0-9-_]/g, "");

    let fileName

    if (testLevel === "green-pcb") {
        fileName = `${reportNo}_${basePcbSrNo}_${getFormattedDateTime("file")}_${safeMac}.xlsx`;
    } else {
        fileName = `${reportNo}_${safeUnitSerialNo}_${getFormattedDateTime("file")}_${safeMac}.xlsx`;
    }

    // const fileName = `${reportNo}_${safeControllerId}_${getFormattedDateTime("file")}_${safeMac}.csv`;
    const filePath = path.join(baseDir, fileName);

    const workbook = new ExcelJS.Workbook();



    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.getWorksheet(1);

    // ================= HEADER =================

    // HEADER FOR FAN TESTING
    if (destination === "fan") {
        worksheet.getCell("B2").value = reportNo;
        worksheet.getCell("B3").value = unitSerialNo || "NA";
        worksheet.getCell("B4").value = getFormattedDateTime();
        worksheet.getCell("B5").value = runResult.summary.total;
    }
    // HEADER FOR IMONI (GREEN PCB) TESTING
    else if ((destination === "iMoni") && (testLevel === "green-pcb")) {
        worksheet.getCell("B2").value = reportNo;
        worksheet.getCell("B3").value = basePcbSrNo || "NA";
        // worksheet.getCell("B4").value = whitePcbSrNo || "NA";
        worksheet.getCell("B4").value = getFormattedDateTime();
        // worksheet.getCell("B5").value = runResult.summary.testLevel;
        worksheet.getCell("B5").value =
            testLevel === "green-pcb"
                ? "iMoni Base PCB"
                : "iMoni Assembly";
        // worksheet.getCell("B7").value = mac;
        worksheet.getCell("B6").value = runResult.summary.total;
    }
    // HEADER FOR IMONI (SRMS) TESTING
    else if ((destination === "iMoni") && (testLevel !== "green-pcb")) {
        worksheet.getCell("B2").value = reportNo;
        worksheet.getCell("B3").value = unitSerialNo || "NA";

        worksheet.getCell("B4").value = getFormattedDateTime();

        worksheet.getCell("B5").value =
            testLevel === "green-pcb"
                ? "iMoni Base PCB"
                : "iMoni Assembly";

        worksheet.getCell("B6").value = mac;

        worksheet.getCell("C7").value = cpuSrNo || "NA";
        worksheet.getCell("D7").value = basePcbSrNo || "NA";
        worksheet.getCell("E7").value = cameraSrNo || "NA";
        worksheet.getCell("F7").value = psuSrNo || "NA";

        worksheet.getCell("B7").value = runResult.summary.total;

    }


    // ================= TABLE HEADER =================
    // if (destination === "fan") {
    //     const headerRow = worksheet.addRow([
    //         "Fan",
    //         "StepStatus",
    //         "Message",
    //         // "FailedStep",
    //         // "TotalSteps",
    //         // "Reason",
    //         "Remarks"
    //     ]);

    //     headerRow.font = { bold: true };
    // }
    // // HEADER FOR IMONI TESTING
    // else if (destination === "iMoni") {
    //     const headerRow = worksheet.addRow([
    //         "Sr. No.",
    //         "TestName",
    //         "Status",
    //         "FailedStep",
    //         "TotalSteps",
    //         "Reason",
    //         "Remarks"
    //     ]);

    //     headerRow.font = { bold: true };
    // }


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

    if (destination === "fan") {
        // currentRow = 11;
        let row = 11;

        const steps = runResult.results[0]?.stepResults || [];

        steps.forEach((step) => {

            worksheet.getCell(`A${row}`).value =
                `Fan ${step.step}`;

            worksheet.getCell(`B${row}`).value =
                step.status.toUpperCase();

            worksheet.getCell(`C${row}`).value =
                step.status === "passed"
                    ? "RPM=OK"
                    : "RPM=FAIL";

            worksheet.getCell(`D${row}`).value = "";

            row++;
        });

        worksheet.getCell("B8").value =
            runResult.summary.failed > 0
                ? "Failed"
                : "Passed";
    }
    else if (testLevel === "green-pcb") {
        currentRow = 9;
    }
    else {
        currentRow = 10;
    }

    // ================= TEST DATA ================= 
    if (destination !== "fan") {
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


            // worksheet.addRow([
            //     index + 1,
            //     test.name || "",
            //     statusForReport,
            //     failedStepNo,
            //     totalSteps,
            //     String(reason),
            //     ""
            // ]);

            // worksheet.insertRow(currentRow++, [
            //     index + 1,
            //     test.name || "",
            //     statusForReport,
            //     failedStepNo,
            //     totalSteps,
            //     String(reason),
            //     ""
            // ]);
            let row = currentRow;

            worksheet.getCell(`A${row}`).value = index + 1;
            worksheet.getCell(`B${row}`).value = test.name || "";
            worksheet.getCell(`C${row}`).value = statusForReport;
            // worksheet.getCell(`D${row}`).value = failedStepNo;
            worksheet.getCell(`D${row}`).value = totalSteps;
            worksheet.getCell(`E${row}`).value = String(reason);
            worksheet.getCell(`F${row}`).value = "";

            currentRow++;

        });
    }


    // WRITE COMPLETE FILE ONCE 
    // await fs.promises.writeFile(filePath, content);
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Report Generated: ${fileName}`);

    if (destination === "fan") {
        await generateFanMainReport({
            runResult,
            reportNo,
            unitSerialNo,
            safeMac,
            baseDir
        });
    }


    // await workbook.xlsx.writeFile(filePath);
    // console.log(`✅ Report Generated: ${fileName}`);

    // ================= GENERATE ALL PASSED REPORT =================
    if (destination === "iMoni" && generateReport) {

        const allPassedDir = path.join(
            __dirname,
            "..",
            DESTINATION_MAP[destination],
            REPORT_SUBDIR_MAP[testLevel] || "full-controller",
            "AllPassed"
        );

        if (!fs.existsSync(allPassedDir)) {
            fs.mkdirSync(allPassedDir, { recursive: true });
        }

        // Select correct All Passed template
        let allPassedTemplate;

        if (testLevel === "green-pcb") {
            allPassedTemplate = path.join(
                __dirname,
                "./template/green-pcb_allpassed_template.xlsx"
            );
        } else {
            allPassedTemplate = path.join(
                __dirname,
                "./template/srms_allpassed_template.xlsx"
            );
        }

        const passedWorkbook = new ExcelJS.Workbook();
        await passedWorkbook.xlsx.readFile(allPassedTemplate);

        const passedWorksheet = passedWorkbook.getWorksheet(1);

        if ((destination === "iMoni") && (testLevel === "green-pcb")) {

            passedWorksheet.getCell("B2").value = reportNo;
            passedWorksheet.getCell("B3").value = basePcbSrNo || "NA";
            passedWorksheet.getCell("B4").value = getFormattedDateTime();
            passedWorksheet.getCell("B5").value = "iMoni Base PCB";
            // passedWorksheet.getCell("B6").value = runResult.summary.total;

        }
        else {

            passedWorksheet.getCell("B2").value = reportNo;
            passedWorksheet.getCell("B3").value = unitSerialNo || "NA";
            passedWorksheet.getCell("B4").value = getFormattedDateTime();
            passedWorksheet.getCell("B5").value = "iMoni Assembly";
            passedWorksheet.getCell("B6").value = mac;

            // passedWorksheet.getCell("B7").value = runResult.summary.total;

            passedWorksheet.getCell("C7").value = cpuSrNo || "NA";
            passedWorksheet.getCell("D7").value = basePcbSrNo || "NA";
            passedWorksheet.getCell("E7").value = cameraSrNo || "NA";
            passedWorksheet.getCell("F7").value = psuSrNo || "NA";
        }


        const allPassedFilePath = path.join(
            allPassedDir,
            fileName
        );

        await passedWorkbook.xlsx.writeFile(allPassedFilePath);

        console.log(`✅ All Passed Report Generated: ${fileName}`);
    }

    return { filePath, fileName };
}

module.exports = { reportWriter };
