function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  // 每周二19:00为分界
  const cutoffHour = 19;
  const cutoffDay = 2; // 0=周日, 1=周一, 2=周二

  const day = d.getDay();
  const hour = d.getHours();

  let daysToSubtract = 0;
  if (day === cutoffDay && hour < cutoffHour) {
    // 周二19点前，还属于上周
    daysToSubtract = 7;
  } else if (day < cutoffDay || (day === cutoffDay && hour >= cutoffHour)) {
    // 周二19点后，或周三~周一，都已进本周
    daysToSubtract = 0;
  }

  const adjustedDate = new Date(d);
  adjustedDate.setDate(adjustedDate.getDate() - daysToSubtract);

  const start = new Date(adjustedDate.getFullYear(), 0, 1);
  const diff = adjustedDate - start;
  return Math.floor(diff / 604800000);
}

function getYear(date = new Date()) {
  const d = new Date(date);
  // 同上逻辑，如果周一还在上周，年也要用调整后的
  const cutoffHour = 19;
  const cutoffDay = 2;

  const day = d.getDay();
  const hour = d.getHours();

  let daysToSubtract = 0;
  if (day === cutoffDay && hour < cutoffHour) {
    daysToSubtract = 7;
  } else if (day < cutoffDay || (day === cutoffDay && hour >= cutoffHour)) {
    daysToSubtract = 0;
  }

  const adjustedDate = new Date(d);
  adjustedDate.setDate(adjustedDate.getDate() - daysToSubtract);
  return adjustedDate.getFullYear();
}

module.exports = {
  getWeekNumber,
  getYear
};
