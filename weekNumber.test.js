const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getCurrentWeekByTuesday19,
  getLastClosedWeekByTuesday19,
  getCompatibleWeekKeysForWeek,
  getCompatibleCurrentWeekKeysByTuesday19,
  getCompatibleLastClosedWeekKeysByTuesday19,
  isWeekKeyIncluded
} = require('./weekNumber');

function weekKey(weekInfo) {
  return `${weekInfo.year}-${weekInfo.week}`;
}

function sortedWeekKeys(weekKeys) {
  return weekKeys.map(weekKey).sort();
}

test('keeps one confirmation cycle stable between Tuesday 19:00 boundaries', () => {
  const dates = [
    '2026-04-28T19:00:00+08:00',
    '2026-04-29T20:00:00+08:00',
    '2026-04-30T20:00:00+08:00',
    '2026-05-03T20:00:00+08:00',
    '2026-05-05T18:59:00+08:00'
  ];

  assert.deepEqual(
    dates.map(date => weekKey(getCurrentWeekByTuesday19(new Date(date)))),
    ['2026-17', '2026-17', '2026-17', '2026-17', '2026-17']
  );
});

test('advances the current confirmation cycle at Tuesday 19:00 Shanghai time', () => {
  assert.equal(
    weekKey(getCurrentWeekByTuesday19(new Date('2026-05-05T18:59:00+08:00'))),
    '2026-17'
  );
  assert.equal(
    weekKey(getCurrentWeekByTuesday19(new Date('2026-05-05T19:00:00+08:00'))),
    '2026-18'
  );
});

test('weekly cron targets the cycle that just closed at Tuesday 19:00', () => {
  assert.equal(
    weekKey(getLastClosedWeekByTuesday19(new Date('2026-05-05T19:00:00+08:00'))),
    '2026-17'
  );
  assert.equal(
    weekKey(getLastClosedWeekByTuesday19(new Date('2026-05-05T19:05:00+08:00'))),
    '2026-17'
  );
});

test('compatible keys include legacy keys from the active confirmation window', () => {
  const keys = getCompatibleCurrentWeekKeysByTuesday19(new Date('2026-04-30T20:00:00+08:00'));

  assert.equal(isWeekKeyIncluded(keys, 2026, 17), true);
  assert.equal(isWeekKeyIncluded(keys, 2026, 18), true);
});

test('last closed compatible keys cover users confirmed before the cron boundary', () => {
  const keys = getCompatibleLastClosedWeekKeysByTuesday19(new Date('2026-05-05T19:00:00+08:00'));

  assert.equal(isWeekKeyIncluded(keys, 2026, 17), true);
  assert.equal(isWeekKeyIncluded(keys, 2026, 18), true);
});

test('explicit rerun compatible keys match the matching window for that week', () => {
  assert.deepEqual(
    sortedWeekKeys(getCompatibleWeekKeysForWeek(2026, 17)),
    sortedWeekKeys(getCompatibleLastClosedWeekKeysByTuesday19(new Date('2026-05-05T19:00:00+08:00')))
  );
});

test('handles Tuesday 19:00 confirmation cycles across year boundaries', () => {
  assert.equal(
    weekKey(getCurrentWeekByTuesday19(new Date('2026-12-29T18:59:00+08:00'))),
    '2026-51'
  );
  assert.equal(
    weekKey(getCurrentWeekByTuesday19(new Date('2026-12-29T19:00:00+08:00'))),
    '2027-0'
  );
  assert.equal(
    weekKey(getCurrentWeekByTuesday19(new Date('2027-01-05T18:59:00+08:00'))),
    '2027-0'
  );
  assert.equal(
    weekKey(getLastClosedWeekByTuesday19(new Date('2027-01-05T19:00:00+08:00'))),
    '2027-0'
  );
});
