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

function getCurrentWeekWindowLocalMs(date = new Date()) {
  const localMs = getShanghaiLocalMs(date);
  const thisTuesday19LocalMs = getThisWeekTuesday19LocalMs(localMs);
  const startLocalMs = localMs >= thisTuesday19LocalMs
    ? thisTuesday19LocalMs
    : thisTuesday19LocalMs - WEEK_MS;

  return {
    startLocalMs,
    endLocalMs: startLocalMs + WEEK_MS
  };
}

function getLastClosedWeekWindowLocalMs(date = new Date()) {
  const localMs = getShanghaiLocalMs(date);
  const thisTuesday19LocalMs = getThisWeekTuesday19LocalMs(localMs);
  const endLocalMs = localMs >= thisTuesday19LocalMs
    ? thisTuesday19LocalMs
    : thisTuesday19LocalMs - WEEK_MS;

  return {
    startLocalMs: endLocalMs - WEEK_MS,
    endLocalMs
  };
}

function getCurrentWeekByTuesday19(date = new Date()) {
  const { endLocalMs } = getCurrentWeekWindowLocalMs(date);

  return getWeekInfoFromShanghaiLocalMs(endLocalMs);
}

function getLastClosedWeekByTuesday19(date = new Date()) {
  const { endLocalMs } = getLastClosedWeekWindowLocalMs(date);

  return getWeekInfoFromShanghaiLocalMs(endLocalMs);
}

function getLegacyCurrentWeekByTuesday19(date = new Date()) {
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
    week: Math.floor(diff / WEEK_MS)
  };
}

function weekKey(weekInfo) {
  return `${weekInfo.year}-${weekInfo.week}`;
}

function isSameWeekInfo(a, b) {
  return a?.year === b?.year && a?.week === b?.week;
}

function dateFromShanghaiLocalMs(localMs) {
  return new Date(localMs - SHANGHAI_TZ);
}

function getCompatibleWeekKeysForWindow(startLocalMs, endLocalMs) {
  const keys = new Map();

  const addKey = weekInfo => {
    keys.set(weekKey(weekInfo), weekInfo);
  };

  addKey(getWeekInfoFromShanghaiLocalMs(endLocalMs));

  for (let sampleLocalMs = startLocalMs; sampleLocalMs < endLocalMs; sampleLocalMs += DAY_MS) {
    addKey(getLegacyCurrentWeekByTuesday19(dateFromShanghaiLocalMs(sampleLocalMs)));
  }
  addKey(getLegacyCurrentWeekByTuesday19(dateFromShanghaiLocalMs(endLocalMs - 1)));

  return Array.from(keys.values());
}

function getConfirmationWindowInfo(startLocalMs, endLocalMs) {
  const canonicalWeek = getWeekInfoFromShanghaiLocalMs(endLocalMs);
  const weekKeys = getCompatibleWeekKeysForWindow(startLocalMs, endLocalMs);
  const legacyWeekKeys = weekKeys.filter(weekInfo => !isSameWeekInfo(weekInfo, canonicalWeek));

  return {
    startAt: dateFromShanghaiLocalMs(startLocalMs),
    endAt: dateFromShanghaiLocalMs(endLocalMs),
    canonicalWeek,
    weekKeys,
    legacyWeekKeys
  };
}

function getTuesday19LocalMsForWeekInfo(year, week) {
  const bucketStartLocalMs = Date.UTC(year, 0, 1) + week * WEEK_MS;

  for (let offsetDays = 0; offsetDays < 7; offsetDays += 1) {
    const candidateLocalMs = bucketStartLocalMs + offsetDays * DAY_MS + MATCH_OPEN_HOUR * 60 * 60 * 1000;
    const candidateLocalDate = new Date(candidateLocalMs);
    const candidateWeekInfo = getWeekInfoFromShanghaiLocalMs(candidateLocalMs);

    if (
      candidateLocalDate.getUTCDay() === TUESDAY
      && candidateWeekInfo.year === year
      && candidateWeekInfo.week === week
    ) {
      return candidateLocalMs;
    }
  }

  return null;
}

function getCompatibleWeekKeysForWeek(year, week) {
  const endLocalMs = getTuesday19LocalMsForWeekInfo(year, week);

  if (endLocalMs === null) {
    return [{ year, week }];
  }

  return getCompatibleWeekKeysForWindow(endLocalMs - WEEK_MS, endLocalMs);
}

function getCurrentConfirmationWindowByTuesday19(date = new Date()) {
  const { startLocalMs, endLocalMs } = getCurrentWeekWindowLocalMs(date);
  return getConfirmationWindowInfo(startLocalMs, endLocalMs);
}

function getLastClosedConfirmationWindowByTuesday19(date = new Date()) {
  const { startLocalMs, endLocalMs } = getLastClosedWeekWindowLocalMs(date);
  return getConfirmationWindowInfo(startLocalMs, endLocalMs);
}

function getConfirmationWindowForWeek(year, week) {
  const endLocalMs = getTuesday19LocalMsForWeekInfo(year, week);

  if (endLocalMs === null) {
    const canonicalWeek = { year, week };
    return {
      startAt: null,
      endAt: null,
      canonicalWeek,
      weekKeys: [canonicalWeek],
      legacyWeekKeys: []
    };
  }

  return getConfirmationWindowInfo(endLocalMs - WEEK_MS, endLocalMs);
}

function getCompatibleCurrentWeekKeysByTuesday19(date = new Date()) {
  const { startLocalMs, endLocalMs } = getCurrentWeekWindowLocalMs(date);
  return getCompatibleWeekKeysForWindow(startLocalMs, endLocalMs);
}

function getCompatibleLastClosedWeekKeysByTuesday19(date = new Date()) {
  const { startLocalMs, endLocalMs } = getLastClosedWeekWindowLocalMs(date);
  return getCompatibleWeekKeysForWindow(startLocalMs, endLocalMs);
}

function isWeekKeyIncluded(weekKeys, year, week) {
  return weekKeys.some(weekInfo => weekInfo.year === year && weekInfo.week === week);
}

function isDateInConfirmationWindow(date, confirmationWindow) {
  if (!date || !confirmationWindow?.startAt || !confirmationWindow?.endAt) {
    return false;
  }

  const confirmedAt = date instanceof Date ? date : new Date(date);
  const confirmedMs = confirmedAt.getTime();

  return !Number.isNaN(confirmedMs)
    && confirmedMs >= confirmationWindow.startAt.getTime()
    && confirmedMs < confirmationWindow.endAt.getTime();
}

function isConfirmationIncludedInWindow(confirmationWindow, year, week, confirmedAt = null) {
  const parsedYear = Number.parseInt(year, 10);
  const parsedWeek = Number.parseInt(week, 10);

  if (Number.isNaN(parsedYear) || Number.isNaN(parsedWeek)) {
    return false;
  }

  const candidate = { year: parsedYear, week: parsedWeek };

  if (isSameWeekInfo(candidate, confirmationWindow?.canonicalWeek)) {
    return isDateInConfirmationWindow(confirmedAt, confirmationWindow);
  }

  if (isWeekKeyIncluded(confirmationWindow?.legacyWeekKeys || [], parsedYear, parsedWeek)) {
    return confirmedAt == null || isDateInConfirmationWindow(confirmedAt, confirmationWindow);
  }

  return false;
}

module.exports = {
  getWeekNumber,
  getYear,
  getCurrentWeekByTuesday19,
  getLastClosedWeekByTuesday19,
  getCompatibleWeekKeysForWeek,
  getCurrentConfirmationWindowByTuesday19,
  getLastClosedConfirmationWindowByTuesday19,
  getConfirmationWindowForWeek,
  getCompatibleCurrentWeekKeysByTuesday19,
  getCompatibleLastClosedWeekKeysByTuesday19,
  isConfirmationIncludedInWindow,
  isWeekKeyIncluded
};
