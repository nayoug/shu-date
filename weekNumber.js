// 上海时区偏移 +8h
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SHANGHAI_TZ = 8 * 60 * 60 * 1000;
const TUESDAY = 2;
const MATCH_OPEN_HOUR = 19;

function getWeekNumber(date = new Date()) {
  const d = new Date(date.getTime());
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start;
  return Math.floor(diff / 604800000);
}

function getYear(date = new Date()) {
  return date.getFullYear();
}

function getShanghaiLocalMs(date) {
  return date.getTime() + SHANGHAI_TZ;
}

function getWeekInfoFromShanghaiLocalMs(localMs) {
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const startOfYearLocalMs = Date.UTC(year, 0, 1);
  return {
    year,
    week: Math.floor((localMs - startOfYearLocalMs) / WEEK_MS)
  };
}

function getThisWeekTuesday19LocalMs(localMs) {
  const localDate = new Date(localMs);
  const daysSinceTuesday = (localDate.getUTCDay() - TUESDAY + 7) % 7;
  return Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate() - daysSinceTuesday,
    MATCH_OPEN_HOUR,
    0,
    0,
    0
  );
}

function getCurrentWeekByTuesday19(date = new Date()) {
  const localMs = getShanghaiLocalMs(date);
  const thisTuesday19LocalMs = getThisWeekTuesday19LocalMs(localMs);
  const targetTuesdayLocalMs = localMs >= thisTuesday19LocalMs
    ? thisTuesday19LocalMs + WEEK_MS
    : thisTuesday19LocalMs;

  return getWeekInfoFromShanghaiLocalMs(targetTuesdayLocalMs);
}

function getLastClosedWeekByTuesday19(date = new Date()) {
  const localMs = getShanghaiLocalMs(date);
  const thisTuesday19LocalMs = getThisWeekTuesday19LocalMs(localMs);
  const targetTuesdayLocalMs = localMs >= thisTuesday19LocalMs
    ? thisTuesday19LocalMs
    : thisTuesday19LocalMs - WEEK_MS;

  return getWeekInfoFromShanghaiLocalMs(targetTuesdayLocalMs);
}

module.exports = {
  getWeekNumber,
  getYear,
  getCurrentWeekByTuesday19,
  getLastClosedWeekByTuesday19
};
