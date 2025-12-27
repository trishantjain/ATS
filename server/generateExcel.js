const { writeFile, readFile } = require('fs').promises;
const ExcelJs = require('exceljs');


async function generateExcel(system, time, newRow) {
    const testData = await readFile('test_list.txt', 'utf-8');
    console.log(testData);

    const timestamp = time;
    const sysid = system;

    const data = newRow;
    console.log

    const workbook = new ExcelJs.Workbook();
    const worksheet = workbook.addWorksheet(`${sysid}_${timestamp}`);

    worksheet.columns = [
        { header: 'Sr_No', key: 'Sr_No', width: 10 },
        { header: 'Test', key: 'Test', width: 30 },
        { header: 'Result', key: 'Result', width: 10 },
        { header: 'Remarks', key: 'Remarks', width: 10 }
    ];

    worksheet.addRows(data);
    await workbook.xlsx.writeFile(`${sysid}_${timestamp}.xlsx`);

    console.log('data added successfully!')
}

generateExcel("33_44_12", "25_12_25_14_19", [ {Sr_No: 1, Test: "visual", Result: "Pass", Remarks: "Pass"},{Sr_No: 1, Test: "visual2", Result: "Pass", Remarks: "Pass"} ]);
