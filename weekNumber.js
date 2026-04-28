// 上海时区偏移 +8h
const SHANGHAI_TZ = 8 * 60 * 60 * 1000;

function getWeekNumber(date = new Date()) {
  const d = new Date(date.getTime());
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start;
  return Math.floor(diff / 604800000);
}

function getYear(date = new Date()) {
  return date.getFullYear();
}

function getCurrentWeekByTuesday19(date = new Date()) {
  const nowInShanghai = new Date(date.getTime() + SHANGHAI_TZ);
  const dayOfWeek = nowInShanghai.getDay();
  const hours = nowInShanghai.getHours();
  const minutes = nowInShanghai.getMinutes();

  const isPastTuesday19 = dayOfWeek > 2 || (dayOfWeek === 2 && (hours > 19 || (hours === 19 && minutes >= 0)));

  const d = new Date(date.getTime());
  if (isPastTuesday19) {
    d.setDate(d.getDate() + 7);
  }
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start;
  return {
    year: d.getFullYear(),
    week: Math.floor(diff / 604800000)
  };
}

module.exports = {
  getWeekNumber,
  getYear,
  getCurrentWeekByTuesday19
};
