function getWeekNumber(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  return Math.floor(diff / 604800000);
}

module.exports = {
  getWeekNumber
};
