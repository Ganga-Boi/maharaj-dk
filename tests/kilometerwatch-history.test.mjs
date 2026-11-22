import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze, defaults, overview} from '../tools/kilometerwatch/model-v16.js';
import {STORE, PREVIOUS, ORIGINAL, addReading, loadBook, mergeBook, parseBackup, portable} from '../tools/kilometerwatch/data-v16.js';

const today='2026-11-22';
const baseline={date:'2026-11-02',km:114695,phase:'start',opening:true,label:'Årets dokumenterede startstand'};
const misplaced={date:'2026-11-19',km:115758,phase:'unknown',label:'Dokumenteret historisk aflæsning'};
const documented=[
  {date:'2026-11-17',km:115758,phase:'end'},
  {date:'2026-11-18',km:115758,phase:'start'},
  {date:'2026-11-19',km:115923,phase:'end'}
];
const compact=rows=>rows.map(({date,km,phase})=>({date,km,phase}));
const storageFor=(values={})=>{
  const valuesByKey=new Map(Object.entries(values));
  return {getItem:key=>valuesByKey.get(key)??null,setItem:(key,value)=>valuesByKey.set(key,value)};
};
const oldState=(readings=[baseline,misplaced])=>({
  schema:16,readings,excluded:[],confirmed:{},recovery:[],settings:defaults(),off:[],extra:[],issues:[]
});

test('the battery test is dated history on a clean install',()=>{
  const {state}=loadBook(storageFor(),today);
  const result=overview(state,today);
  assert.deepEqual(compact(result.analysis.rows).slice(1),documented);
  assert.equal(result.analysis.age,3);
  assert.equal(result.analysis.used,1228);
  assert.equal(result.provisional,true);
  assert.equal(state.excluded.length,0);
});

test('a returning user keeps manual readings, plans and a backup of the original state',()=>{
  const latest={date:today,km:116010,phase:'start',opening:true};
  const earlier={date:'2026-06-26',km:106675,phase:'unknown'};
  const state=oldState([earlier,baseline,misplaced,latest]);
  state.off=[{from:'2026-11-23',to:'2026-11-24'}];
  state.settings.margin=25;
  const raw=JSON.stringify(state);
  const storage=storageFor({[STORE]:raw,[ORIGINAL]:'original'});
  const migrated=loadBook(storage,today);
  assert.deepEqual(analyze(migrated.state,today).last,latest);
  assert.deepEqual(compact(analyze(migrated.state,today).rows).slice(2,-1),documented);
  assert.deepEqual(migrated.state.readings[0],earlier);
  assert.deepEqual(migrated.state.off,state.off);
  assert.deepEqual(migrated.state.settings,state.settings);
  assert.deepEqual(migrated.state.excluded,['2026-11-19/115758']);
  assert.match(migrated.state.readings.find(r=>r.date===misplaced.date&&r.km===misplaced.km).label,/Forkert dato/);
  assert.equal(storage.getItem(PREVIOUS),raw);
  assert.equal(storage.getItem(ORIGINAL),'original');
  assert.deepEqual(loadBook(storage,today),migrated);
  assert.equal(storage.getItem(PREVIOUS),raw);
});

test('an old copy with the incorrect date cannot bring it back into calculations',()=>{
  const state=loadBook(storageFor(),today).state;
  const backup=parseBackup(portable(oldState()),today);
  const restored=mergeBook(state,backup,true,today);
  assert.deepEqual(compact(analyze(restored,today).rows).slice(1),documented);
  assert.deepEqual(mergeBook(restored,backup,true,today),restored);
  assert.throws(()=>addReading(state,{...misplaced,phase:'start'},today),/Batteritesten daterer/);
});

test('the live v15 keys retain their original bytes during migration',()=>{
  const key='kilometerwatch-v7-manuel';
  const value=JSON.stringify([{date:misplaced.date,km:misplaced.km},{date:today,km:116010}]);
  const storage=storageFor({[key]:value});
  const first=loadBook(storage,today);
  assert.equal(analyze(first.state,today).last.km,116010);
  assert.ok(first.state.excluded.includes('2026-11-19/115758'));
  assert.equal(storage.getItem(key),value);
  assert.equal(JSON.parse(storage.getItem(ORIGINAL)).keys[key],value);
  assert.deepEqual(loadBook(storage,today),first);
});

test('an unrelated conflicting reading is kept and continues to require review',()=>{
  const recorded={date:today,km:115800,phase:'start',opening:true};
  const storage=storageFor({[STORE]:JSON.stringify(oldState([baseline,misplaced,recorded]))});
  const view=overview(loadBook(storage,today).state,today);
  assert.deepEqual(view.analysis.last,recorded);
  assert.ok(view.analysis.conflicts.some(conflict=>conflict.kind==='fall'));
  assert.ok(view.periods.every(p=>!p.ready));
});

test('an older clock never imports a recorded date that is still in the future',()=>{
  const storage=storageFor();
  assert.deepEqual(compact(loadBook(storage,'2026-11-17').state.readings).slice(1),documented.slice(0,1));
  assert.deepEqual(compact(loadBook(storage,'2026-11-18').state.readings).slice(1),documented.slice(0,2));
  assert.deepEqual(compact(loadBook(storage,'2026-11-19').state.readings).slice(1),documented);
});
