import {FIRST,START_KM,KNOWN,day,defaults,keyOf,order,analyze} from './model-v16.js?front=3';

export const STORE='kilometerwatch.v16.state';
export const PREVIOUS='kilometerwatch.v16.previous';
export const ORIGINAL='kilometerwatch.v16.before-migration';
export const DAMAGED='kilometerwatch.v16.before-repair';
const MANUAL='kilometerwatch-v7-manuel', ARCHIVE='kilometerwatch-v12-older-readings';
const OLD_SETTINGS='kilometerwatch-v9-settings', RESERVES='kilometerwatch-v13-safety-settings', OFF='kilometerwatch-v10-days-off';
const SNAP='kilometerwatch-v11-snapshot-before-edit', BACKUPS='kilometerwatch-v12-history-backups';
const UNDO='kilometerwatch.lastSave.v1', META='kilometerwatch.cloudMeta.v1';
export const LIVE=[MANUAL,'kilometerwatch.v1','kilometerwatch-readings-v1',ARCHIVE];
const LEGACY=[...LIVE,SNAP,BACKUPS,UNDO,META,OLD_SETTINGS,RESERVES,OFF];
const blank=()=>({schema:16,readings:[],excluded:[],confirmed:{},recovery:[],settings:defaults(),off:[],extra:[],issues:[]});
const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const owns=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const num=(v,min,max)=>Number.isSafeInteger(v) && v>=min && v<=max;
const bounds={workKm:[0,500],tripKm:[1,2000],usualTrips:[0,28],shopping:[0,5000],margin:[0,5000]};
function check(condition,message) {if (!condition) throw Error(message);}
function checkList(value,max=50000) {check(Array.isArray(value) && value.length<=max,'Ugyldig eller for stor liste.');return value;}
function kmValue(value) {
  const n=typeof value==='string' && /^\d{1,7}$/.test(value)?Number(value):value;
  check(num(n,0,2000000),'Ugyldig kilometerstand.');
  return n;
}
function reading(v,legacy=false) {
  check(object(v),'Ugyldig aflæsning.');
  const date=legacy?(v.date??v.reading_date):v.date, km=kmValue(legacy?(v.km??v.odometer):v.km);
  day(date);
  const phase=legacy?'unknown':v.phase;
  check(['start','mid','end','unknown'].includes(phase),'Ukendt aflæsningstidspunkt.');
  const r={date,km,phase};
  if (phase==='start' || v.opening===true || (date===FIRST && km===START_KM)) r.opening=true;
  if (phase==='mid') {
    check(num(v.workLeft,0,1000) && num(v.booked,0,10000) && num(v.extraLeft,0,v.booked),'Ugyldig restkørsel.');
    Object.assign(r,{workLeft:v.workLeft,booked:v.booked,extraLeft:v.extraLeft});
  }
  const label=legacy?(v.type??v.label):v.label;
  if (typeof label==='string' && label.trim()) r.label=label.slice(0,120);
  return r;
}
const foldRows=(a,b)=>{
  const rows=new Map(a.map(r=>[keyOf(r),{...r}]));
  for (const incoming of b) {
    const key=keyOf(incoming), old=rows.get(key);
    if (!old) {rows.set(key,{...incoming});continue;}
    const best=old.phase==='unknown' && incoming.phase!=='unknown'?incoming:old;
    const merged={...best};
    if (old.opening || incoming.opening) merged.opening=true;
    if (!merged.label && (old.label||incoming.label)) merged.label=old.label||incoming.label;
    rows.set(key,merged);
  }
  return [...rows.values()].sort(order);
};
function issue(s,message,block=false) {
  if (!s.issues.some(i=>i.message===message)) s.issues.push({message,block,seen:false});
}
function seed(s,today) {
  const fixed=[{date:FIRST,km:START_KM,phase:'start',opening:true,label:'Årets dokumenterede startstand'},
    {...KNOWN,phase:'unknown',label:'Dokumenteret historisk aflæsning'}].filter(r=>r.date<=today);
  s.readings=foldRows(s.readings,fixed);
}
export function checkSettings(v) {
  check(object(v),'Ugyldige kørselsindstillinger.');
  const week=checkList(v.workWeek,7);
  check(week.every(d=>num(d,0,6)) && new Set(week).size===week.length,'Ugyldige arbejdsdage.');
  const out={workWeek:[...week].sort((a,b)=>a-b)};
  for (const [k,[min,max]] of Object.entries(bounds)) {
    check(num(v[k],min,max),'Et tal i kørselsindstillingerne er uden for intervallet.');
    out[k]=v[k];
  }
  return out;
}
export function checkState(v) {
  check(object(v) && v.schema===16,'Ukendt version af historikken.');
  const s=blank();
  s.settings=checkSettings(v.settings);
  s.readings=foldRows([],checkList(v.readings).map(r=>reading(r)));
  s.recovery=foldRows([],checkList(v.recovery).map(r=>reading(r)));
  const keys=new Set(s.readings.map(keyOf));
  s.recovery=s.recovery.filter(r=>!keys.has(keyOf(r)));
  s.excluded=[...new Set(checkList(v.excluded).map(k=>{
    check(typeof k==='string' && keys.has(k) && k!==FIRST+'/'+START_KM,'Ugyldig udeladt aflæsning.');return k;
  }))];
  check(object(v.confirmed),'Ugyldige datoafklaringer.');
  for (const [d,sig] of Object.entries(v.confirmed)) {
    day(d); check(typeof sig==='string' && /^\d+(,\d+)*$/.test(sig),'Ugyldig rækkefølge.');s.confirmed[d]=sig;
  }
  s.off=checkList(v.off,4000).map(o=>{check(object(o) && day(o.from)<=day(o.to),'Friperiodens slutdato ligger før start.');return {from:o.from,to:o.to};})
    .sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
  const dates=new Set();
  s.extra=checkList(v.extra,4000).map(t=>{
    check(object(t) && num(t.km,1,10000),'Ugyldig ekstrakørsel.');day(t.date);
    check(!dates.has(t.date),'Der må kun være ét samlet antal ekstra km pr. dato.');dates.add(t.date);
    return {date:t.date,km:t.km};
  }).sort(order);
  s.issues=checkList(v.issues,5000).map(i=>{
    check(object(i) && typeof i.message==='string' && i.message.length<=2000 && typeof i.block==='boolean' && typeof i.seen==='boolean','Ugyldig historikbesked.');
    return {message:i.message,block:i.block,seen:i.seen};
  });
  return s;
}
const settingNames={workRoundtrip:'workKm',cphRoundtrip:'tripKm',plannedTrips:'usualTrips',otherPrivate:'shopping',safetyMargin:'margin'};
function oldSettings(s,v) {
  check(object(v),'Ugyldige indstillinger.');
  for (const [old,k] of Object.entries(settingNames)) if (owns(v,old)) {
    const n=Number(v[old]);check(v[old]!==null && v[old]!=='' && num(n,...bounds[k]),'Ugyldig ældre indstilling.');s.settings[k]=n;
  }
  if (owns(v,'workDays')) {
    const n=Number(v.workDays);check(num(n,0,7),'Ugyldigt antal arbejdsdage.');s.settings.workWeek=Array.from({length:n},(_,i)=>i);
  }
}
function legacyRows(v) {
  if (Array.isArray(v)) return v;
  check(object(v),'Ukendt historikformat.');
  const list=v.readings??v.entries??v.data?.readings;
  checkList(list);
  return v.baseline?[v.baseline,...list]:list;
}
function importOldRows(s,value,today,recover,strict,source) {
  const good=[];
  let invalid=0;
  for (const row of checkList(legacyRows(value))) {
    try {
      const r=reading(row,true);check(r.date<=today,'En aflæsning ligger i fremtiden.');good.push(r);
    } catch(e) {if (strict) throw e;invalid++;}
  }
  if (invalid) issue(s,source+' indeholder '+invalid+' ugyldige registreringer. Originalen er bevaret.',!recover);
  const field=recover?'recovery':'readings';
  s[field]=foldRows(s[field],good);
}
function oldOff(s,v) {
  if (object(v) && Object.values(v).some(n=>Number(n)>0))
    issue(s,'v15 gemte fridage som antal uden dato. Angiv de rigtige datoer under Kørselsindstillinger.');
}
function readLegacy(keys,today) {
  const s=blank();
  for (const key of LEGACY) {
    if (typeof keys[key]!=='string') continue;
    try {
      const v=JSON.parse(keys[key]);
      if (LIVE.includes(key)) importOldRows(s,v,today,false,false,key);
      else if (key===SNAP) importOldRows(s,v,today,true,false,key);
      else if (key===BACKUPS) {
        for (const item of checkList(v)) {
          try {importOldRows(s,JSON.parse(item.raw),today,true,false,key);}
          catch {issue(s,'En ældre rullende sikkerhedskopi kunne ikke læses.');}
        }
      } else if (key===UNDO) {
        for (const k of ['before','after']) if (v?.[k]) importOldRows(s,v[k],today,true,false,key);
      } else if (key===META) {
        if (typeof v?.hash==='string') importOldRows(s,JSON.parse(v.hash),today,true,false,key);
      } else if (key===OFF) oldOff(s,v);
      else oldSettings(s,v);
    } catch {issue(s,'Kunne ikke læse '+key+'. Originalen er bevaret.',LIVE.includes(key));}
  }
  if (typeof keys[OLD_SETTINGS]==='string' && typeof keys[RESERVES]!=='string' && s.settings.shopping===0) {
    s.settings.shopping=40;
    issue(s,'v15 brugte 40 km til småture ved en ældre nulindstilling. Du kan ændre reserven under Kørselsindstillinger.');
  }
  return s;
}
function legacyValues(storage,keys=LEGACY) {
  const result={};
  for (const k of keys) {const v=storage.getItem(k);if (v!==null) result[k]=v;}
  return result;
}
export function loadBook(storage,today) {
  const raw=storage.getItem(STORE);
  if (raw!==null) {
    const state=checkState(JSON.parse(raw));
    // A v15 tab can remain open while the installed app upgrades. Pick up later odometer edits.
    const legacy=readLegacy(legacyValues(storage,LIVE),today);
    const rows=foldRows(state.readings,legacy.readings);
    const newIssues=legacy.issues.filter(i=>!state.issues.some(x=>x.message===i.message));
    if (rows.length!==state.readings.length || newIssues.length) {
      state.readings=rows;state.issues.push(...newIssues);
      return commit(storage,raw,state);
    }
    return {state,raw};
  }
  const original=legacyValues(storage);
  const initial=readLegacy(original,today);
  seed(initial,today);
  const state=checkState(initial);
  if (storage.getItem(ORIGINAL)===null) storage.setItem(ORIGINAL,JSON.stringify({app:'KilometerWatch',version:15,keys:original}));
  const encoded=JSON.stringify(state);
  storage.setItem(STORE,encoded);
  return {state,raw:encoded};
}
export function commit(storage,expected,next,repair=false) {
  const state=checkState(next), encoded=JSON.stringify(state);
  const current=storage.getItem(STORE);
  check(current===expected,'Data er ændret i en anden fane. Åbn visningen igen og gentag ændringen.');
  if (encoded===current) return {state,raw:current};
  if (current===null && storage.getItem(ORIGINAL)===null) {
    storage.setItem(ORIGINAL,JSON.stringify({app:'KilometerWatch',version:15,keys:legacyValues(storage)}));
  }
  if (current!==null) {
    if (repair) {
      // Retain every distinct damaged primary value if another recovery is required.
      const old=JSON.parse(storage.getItem(DAMAGED)??'[]');
      check(Array.isArray(old),'Reparationskopien kan ikke opdateres.');
      if (!old.includes(current)) storage.setItem(DAMAGED,JSON.stringify([...old,current]));
    } else storage.setItem(PREVIOUS,current);
  }
  storage.setItem(STORE,encoded);
  return {state,raw:encoded};
}
export function portable(state) {return {app:'KilometerWatch',version:16,exportedAt:new Date().toISOString(),state};}
export function rawBackup(storage) {
  return {app:'KilometerWatch',version:16,source:'Rå kilometerdata',capturedAt:new Date().toISOString(),
    keys:legacyValues(storage,[...LEGACY,STORE,PREVIOUS,ORIGINAL,DAMAGED])};
}
export function parseBackup(v,today) {
  let s, hasPlan=false;
  const presentSettings=new Set();
  function collectSettings(obj) {
    if(!object(obj))return;
    if(owns(obj,'workDays'))presentSettings.add('workWeek');
    for(const [old,k] of Object.entries(settingNames))if(owns(obj,old))presentSettings.add(k);
  }
  check(!v?.app || v.app==='KilometerWatch','Filen tilhører en anden app.');
  if (v?.schema===16 || v?.state || (v?.version===16 && !v.keys)) {
    s=checkState(v.state??v);hasPlan=true;
  } else if (object(v?.keys)) {
    if (typeof v.keys[STORE]==='string') {
      // Never silently substitute an older snapshot for an unreadable primary.
      try {s=checkState(JSON.parse(v.keys[STORE]));hasPlan=true;}
      catch {check(typeof v.keys[PREVIOUS]==='string','Den rå kopis primære v16-historik er ulæselig.');
        s=checkState(JSON.parse(v.keys[PREVIOUS]));hasPlan=true;
        issue(s,'Den rå primærhistorik var ulæselig. Den foregående v16-kopi er valgt. Kontrollér seneste aflæsning.',true);}
    } else {
      check(LEGACY.some(k=>typeof v.keys[k]==='string'),'Ingen kendte kilometerdata i filen.');
      s=readLegacy(v.keys,today);
      for(const key of [OLD_SETTINGS,RESERVES]) {
        if(typeof v.keys[key]==='string') {
          try {collectSettings(JSON.parse(v.keys[key]));}catch { /* readLegacy recorded the issue */ }
        }
      }
      hasPlan=presentSettings.size>0;
    }
  } else {
    s=blank();importOldRows(s,v,today,false,true,'Import');
    if (v?.settings) {oldSettings(s,v.settings);collectSettings(v.settings);hasPlan=presentSettings.size>0;}
    oldOff(s,v?.daysOff);
  }
  s=checkState(s);
  check(s.readings.length || s.recovery.length || s.issues.length || hasPlan,'Kopien indeholder ingen kilometerdata.');
  check(![...s.readings,...s.recovery].some(r=>r.date>today),'Kopien indeholder aflæsninger efter telefonens dato.');
  return {state:s,hasPlan,settingsFields:[...presentSettings],fullPlan:hasPlan && (v?.schema===16 || !!v?.state || typeof v?.keys?.[STORE]==='string')};
}
export function mergeBook(local,imported,usePlan,today) {
  const res=structuredClone(local), s=imported.state, oldKeys=new Set(res.readings.map(keyOf));
  res.readings=foldRows(res.readings,s.readings);
  res.recovery=foldRows(res.recovery,s.recovery);
  for (const k of s.excluded) {
    const isSeedOnly=local.readings.some(r=>keyOf(r)===k && r.label==='Dokumenteret historisk aflæsning' && r.phase==='unknown');
    const restoringFresh=usePlan && imported.fullPlan && !Object.keys(local.confirmed).length && local.readings.every(r=>r.date===FIRST || r.date===KNOWN.date);
    if (!oldKeys.has(k) || (isSeedOnly && restoringFresh)) res.excluded.push(k);
  }
  for (const [d,sig] of Object.entries(s.confirmed)) if (!res.confirmed[d]) res.confirmed[d]=sig;
  for (const i of s.issues) if (!res.issues.some(j=>j.message===i.message)) res.issues.push({...i});
  if (usePlan && imported.hasPlan) {
    if (imported.fullPlan) {
      res.settings=structuredClone(s.settings);res.off=structuredClone(s.off);res.extra=structuredClone(s.extra);
    } else {
      for(const k of imported.settingsFields) res.settings[k]=structuredClone(s.settings[k]);
    }
  }
  seed(res,today);
  return checkState(res);
}
export function repairBase(storage,today) {
  const s=readLegacy(legacyValues(storage),today);seed(s,today);return checkState(s);
}
export function addReading(state,input,today) {
  const r=reading(input);
  check(r.date<=today,'En aflæsning kan ikke ligge i fremtiden.');
  const active=analyze(state,today).rows;
  const earlier=active.filter(o=>o.date<r.date).at(-1), later=active.find(o=>o.date>r.date);
  const same=active.filter(o=>o.date===r.date), top=same.at(-1);
  check(!earlier || r.km>=earlier.km,'Kilometerstanden er lavere end en tidligere aflæsning.');
  check(!later || r.km<=later.km,'Kilometerstanden er højere end en senere aflæsning.');
  if (r.phase==='start') {
    const opening=same.find(o=>o.opening || o.phase==='start');
    check(!opening || opening.km===r.km,'Der er allerede en anden morgenstand. Afklar den i Historik.');
    check(!same.length || r.km<=same[0].km,'Morgenstanden skal være dagens tidligste kilometerstand.');
  } else {
    check(!top || r.km>=top.km,'En lavere stand samme dag kræver, at fejlindtastningen afklares i Historik.');
  }
  const k=keyOf(r);
  check(!state.excluded.includes(k),'Aflæsningen er udeladt. Medtag den igen under Historik.');
  const old=state.readings.find(o=>keyOf(o)===k);
  if (old?.opening) r.opening=true;
  if (old?.label) r.label=old.label;
  state.readings=foldRows([r],state.readings);
  // A driver-entered later value confirms a sequence, but cannot implicitly settle an existing conflict.
  if (same.length<=1 || state.confirmed[r.date]===same.map(o=>o.km).join(',')) {
    state.confirmed[r.date]=[...new Set([...same.map(o=>o.km),r.km])].sort((a,b)=>a-b).join(',');
  }
}
export function locked(fn) {
  if (navigator.locks?.request) return navigator.locks.request('kilometerwatch-writes',fn);
  // A read/write IndexedDB transaction serializes the synchronous localStorage work across tabs.
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('kilometerwatch-write-lock',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('lock');
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result, tx=db.transaction('lock','readwrite');
      let result, failure;
      tx.objectStore('lock').get(0).onsuccess=()=>{try {result=fn();} catch(e) {failure=e;tx.abort();}};
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onabort=tx.onerror=()=>{db.close();reject(failure??tx.error??Error('Lageret kunne ikke åbnes.'));};
    };
  });
}
