// Function to get formatted Date and Time
/*
  Pass any string to function to get Date & Time in below format: 
  20_01_26_12_45_52
  Without passing any argument will get below Data & Time format: 
  20/01/26 12:45:52
*/
function getFormattedDateTime(outType = 'string') {
  // Pass any string to function if you want output in second way
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dd = pad(today.getDate());
  const mm = pad(today.getMonth() + 1);
  const yy = String(today.getFullYear()).slice(-2);
  const HH = pad(today.getHours());
  const MM = pad(today.getMinutes());
  const SS = pad(today.getSeconds());

  if (outType === 'string') {
    return `${dd}/${mm}/${yy} ${HH}:${MM}:${SS}`;
  } else {
    return `${dd}_${mm}_${yy}_${HH}_${MM}_${SS}`;
  }
}

module.exports = { getFormattedDateTime };