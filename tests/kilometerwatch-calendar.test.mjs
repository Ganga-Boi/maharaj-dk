import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, day, defaults, iso, overview, plan, weekday} from '../tools/kilometerwatch/model-v16.js';
import {addReading} from '../tools/kilometerwatch/data-v16.js';

const openingKm = 50000;
const sunday = '2026-11-22';
const monday = '2026-11-23';
const sundayKm = openingKm + 1228;

function withSundayReading() {
  const state = {
    readings: [{date:'2026-11-02', km:openingKm, phase:'start'}],
    excluded: [], confirmed: {}, issues: [], settings: defaults(), off: [], extra: []
  };
  addReading(state, {date:sunday, km:sundayKm, phase:'start'}, sunday);
  return state;
}

test('Sunday, next week and the four full weeks use their respective calendar dates', () => {
  const {periods} = overview(withSundayReading(), sunday);
  assert.deepEqual(periods.map(p => [iso(p.start), iso(p.end-1)]), [
    [sunday, sunday], [monday, '2026-11-29'], [monday, '2026-12-20']
  ]);
  assert.deepEqual(periods.map(p => [p.fun,p.possible,p.left]), [[28,0,28],[147,2,3],[588,8,12]]);
  assert.equal(periods[1].here.work, 220);
  assert.equal(periods[1].here.shopping+periods[1].here.margin, 55);
});

test('annual pace uses the measured 1,228 km and 20 elapsed days', () => {
  const result = analyze(withSundayReading(), sunday);
  assert.equal(result.used, 1228);
  assert.equal(result.elapsed, 20);
  assert.equal(Math.round(result.pace), 22426);
});

test('actual Sunday spending transfers exactly once, whether read at closing or on Monday morning', () => {
  // The opening Sunday budget is 37 km in all, including 9 km of reserves.
  for (const [driven, expected] of [[0,184], [9,175], [37,147], [50,134]]) {
    const state = withSundayReading();
    const before = plan(state, sunday, 'next');
    addReading(state, {date:sunday, km:sundayKm+driven, phase:'end'}, sunday);
    assert.equal(plan(state, sunday, 'this').ready, false);
    assert.equal(plan(state, sunday, 'next').fun, expected);
    assert.equal(plan(state, sunday, 'next').fun-before.fun, 37-driven);
    assert.equal(plan(state, monday, 'this').fun, expected);
    addReading(state, {date:monday, km:sundayKm+driven, phase:'start'}, monday);
    assert.equal(plan(state, monday, 'this').fun, expected);
    const firstReadingMonday = withSundayReading();
    addReading(firstReadingMonday, {date:monday, km:sundayKm+driven, phase:'start'}, monday);
    assert.equal(plan(firstReadingMonday, monday, 'this').fun, expected);
  }
});

test('an open Sunday never lends the same kilometres to next week before an actual reading', () => {
  const state = withSundayReading();
  assert.equal(plan(state, sunday, 'next').fun, 147);
  const saved = JSON.stringify(state);
  const missing = overview(state, monday);
  assert.equal(missing.provisional, true);
  assert.ok(missing.periods[0].fun < 184);
  assert.equal(JSON.stringify(state), saved);
});

test('the four-week window always covers four Monday–Sunday weeks across weekdays, leap day and clock changes', () => {
  for(const start of ['2026-11-19','2026-12-28','2027-03-24','2027-10-25','2028-02-26']) {
    for(let offset=0;offset<7;offset++){
      const date=iso(day(start)+offset);
      const next=plan(withSundayReading(),date,'next');
      const four=plan(withSundayReading(),date,'four');
      assert.ok(four.start>day(date) && four.start<=day(date)+7);
      assert.equal(four.start,next.start);
      assert.equal(weekday(four.start),0);
      assert.equal(weekday(four.end-1),6);
      assert.equal(four.end-four.start,28);
    }
  }
});

test('crossing the driving year never labels a partial allowance as four complete weeks', () => {
  const state=withSundayReading(), date='2027-10-10';
  addReading(state,{date,km:openingKm+20000,phase:'start'},date);
  assert.equal(plan(state,date,'next').ready,true);
  const four=plan(state,date,'four');
  assert.equal(iso(four.start),'2027-10-11');
  assert.equal(iso(four.end-1),'2027-11-07');
  assert.equal(four.ready,false);
  assert.match(four.reason,/2\. nov\./);
});
