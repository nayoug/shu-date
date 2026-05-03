const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getCurrentWeekByTuesday19,
  getLastClosedWeekByTuesday19
} = require('./weekNumber');

function weekKey(weekInfo) {
  return `${weekInfo.year}-${weekInfo.week}`;
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
