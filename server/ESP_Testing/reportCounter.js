const fs = require("fs");
const path = require("path");

const counterFile = path.join(__dirname, "reportCounter.json");

function getNextReportNumber(type = "fan") {
  let data = { fan: 0 };

  try {
    if (fs.existsSync(counterFile)) {
      data = JSON.parse(fs.readFileSync(counterFile, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading counter file:", err);
  }

  if (!data[type]) data[type] = 0;

  data[type] += 1;

  try {
    fs.writeFileSync(counterFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing counter file:", err);
  }

  return `${type.toUpperCase()}-${String(data[type]).padStart(4, "0")}`;
}

module.exports = { getNextReportNumber };