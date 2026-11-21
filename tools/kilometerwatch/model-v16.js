// All calendar arithmetic uses civil days. Only the device's local date comes from its clock.
export const GOAL = 22000;
export const LIMIT = 25000;
export const FIRST = '2026-11-02';
export const START_KM = 114695;
export const KNOWN = {date: '2026-11-19', km: 115758};
const DAY_MS = 86400000;
export const defaults = () => ({
  workWeek: [0, 1, 2, 3, 4], workKm: 44, tripKm: 72, usualTrips: 2, shopping: 40, margin: 15
});
export function day(s) {
  if (typeof s !== 'string' || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(s)) throw Error('Ugyldig kalenderdato.');
  const n = Date.parse(s + 'T00:00:00Z') / DAY_MS;
  if (!Number.isInteger(n) || iso(n) !== s) throw Error('Ugyldig kalenderdato.');
  return n;
}
export const iso = n => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const localDate = (d = new Date()) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
export const weekday = n => ((n + 3) % 7 + 7) % 7; // Monday = 0
export const keyOf = r => r.date + '/' + r.km;
export const order = (a,b) => a.date.localeCompare(b.date) || a.km-b.km;
export const fmt = n => new Intl.NumberFormat('da-DK',{maximumFractionDigits:0}).format(n);
export function dateText(s, year = false) {
  return new Intl.DateTimeFormat('da-DK', {timeZone:'UTC', day:'numeric', month:'short', ...(year && {year:'numeric'})}).format(day(s)*DAY_MS);
}
export function yearAt(date) {
  const y = Number(date.slice(0,4)) - (date.slice(5) < '11-02' ? 1 : 0);
  const start = day(y+'-11-02'), end = day((y+1)+'-11-02');
  return {start,end,days:end-start};
}
export function analyze(state, today) {
  const excluded = new Set(state.excluded);
  const rows = state.readings.filter(r=>!excluded.has(keyOf(r))).sort(order);
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date,[]);
    byDate.get(row.date).push(row);
  }
  const conflicts = [];
  let high;
  for (const [date, group] of byDate) {
    const signature = group.map(r=>r.km).join(',');
    const openings=group.filter(r=>r.opening || r.phase==='start');
    if (openings.length>1 || (openings.length && openings[0].km!==group[0].km))
      conflicts.push({kind:'opening',date,rows:group});
    else if (group.length>1 && state.confirmed[date]!==signature)
      conflicts.push({kind:'same',date,rows:group,signature});
    const low=group[0], top=group.at(-1);
    if (high && low.km<high.km) conflicts.push({kind:'fall',rows:[high,low]});
    if (!high || top.km>=high.km) high=top;
  }
  const year=yearAt(today), last=rows.at(-1);
  const opening=byDate.get(iso(year.start))?.find(r=>r.opening || r.phase==='start');
  const previousEnd=byDate.get(iso(year.start-1))?.at(-1);
  const baseline=opening ?? (previousEnd?.phase==='end' ? previousEnd : null);
  if (opening && previousEnd?.phase==='end' && previousEnd.km!==opening.km) {
    conflicts.push({kind:'boundary',rows:[previousEnd,opening]});
  }
  const age=last?day(today)-day(last.date):null;
  const used=baseline && last && last.date>=baseline.date ? last.km-baseline.km : null;
  // Legacy samples have a date only. Explicit closing readings include the completed day.
  // A partial day gives a range without inventing its measurement time.
  const elapsed=last?day(last.date)-year.start+(last.phase==='end'?1:0):0;
  const elapsedHi=elapsed+(last?.phase==='mid'?1:0);
  const pace=elapsed>0 && used!==null && used>=0 ? used*365.2425/elapsed : null;
  const paceLow=pace!==null?used*365.2425/elapsedHi:null;
  let reason='';
  if (conflicts.length) reason='Afklar de modstridende aflæsninger i Historik.';
  else if (state.issues.some(i=>i.block && !i.seen)) reason='Tjek de ulæste historikdata i Historik.';
  else if (age!==null && age<0) reason='En aflæsning ligger efter telefonens dato. Kontrollér datoen i Historik.';
  else if (today<FIRST) reason='Årsperioden begynder 2. november 2026.';
  else if (!baseline) reason='Tilføj en målt startstand for det nye kørselsår i Historik.';
  else if (!last || used===null || (last.date < iso(year.start) && age!==1)) reason='Tilføj en aktuel kilometeraflæsning.';
  else if (age>1) reason='Aflæsningen er '+age+' dage gammel. Indtast kilometerstanden for et nyt råd.';
  else if (last.phase==='unknown' || (age===1 && last.phase!=='end'))
    reason=last.phase==='unknown'?'Sidste måling har kun en dato. Aflæs bilen for at se dit råderum.':'Kørsel efter gårsdagens måling er ukendt. Aflæs bilen for at se dit råderum.';
  return {rows,byDate,conflicts,baseline,last,age,used,pace,paceLow,elapsed,elapsedHi,year,reason};
}
function costs(state, start, end, partial) {
  const days=Math.max(0,end-start), workWeek=new Set(state.settings.workWeek);
  const off=state.off.map(r=>[day(r.from),day(r.to)]);
  const trips=new Map(state.extra.map(t=>[day(t.date),t.km]));
  let work=0, workDays=0, extra=0;
  for (let d=start;d<end;d++) {
    const scheduled=workWeek.has(weekday(d)) && !off.some(([a,b])=>d>=a && d<=b);
    let commute=scheduled?state.settings.workKm:0, booked=trips.get(d)??0;
    if (partial && iso(d)===partial.date) {
      commute=partial.workLeft;
      // A plan is the total for the entire date, including the portion already on the odometer.
      booked=Math.max(0,booked-(partial.booked-partial.extraLeft));
    }
    if (commute>0) workDays++;
    work+=commute; extra+=booked;
  }
  const shopping=Math.ceil(days*state.settings.shopping/7), margin=Math.ceil(days*state.settings.margin/7);
  return {days,work,workDays,shopping,margin,extra,total:work+shopping+margin+extra};
}
export function plan(state, today, period='this') {
  const a=analyze(state,today), now=day(today), y=a.year;
  const first=now+(a.age===0 && a.last?.phase==='end'?1:0);
  const nextMonday=now-weekday(now)+7;
  const start=period==='next'?Math.max(first,nextMonday):first;
  const requestedEnd=period==='next'?nextMonday+7:period==='four'?start+28:nextMonday;
  const end=Math.min(requestedEnd,y.end);
  const base={...a,first,start,end,clipped:requestedEnd>y.end,period};
  if (a.reason) return {...base,ready:false};
  if (end<=start) return {...base,ready:false,reason:start>=y.end?
    'Perioden ligger i næste kørselsår. En målt startstand skal være klar først.':'Ugens kørsel er afsluttet. Vælg næste uge.'};
  const partial=a.age===0 && a.last.phase==='mid'?a.last:null;
  const before=costs(state,first,start,partial), here=costs(state,start,end,partial), after=costs(state,end,y.end,partial);
  const targetAt=d=>Math.floor(GOAL*(d-y.start)/y.days);
  const remaining=GOAL-a.used;
  // Keep the previous window spendable, including essential costs even when the target is tight.
  const bridge=before.days?Math.max(before.total,Math.min(targetAt(start)-a.used,remaining-here.total-after.total)):0;
  const envelope=targetAt(end)-a.used-bridge;
  const annualCap=remaining-bridge-after.total;
  const allowed=Math.max(0,Math.min(envelope,annualCap));
  const fun=Math.max(0,allowed-here.total);
  const possible=Math.floor(fun/state.settings.tripKm);
  const left=fun-possible*state.settings.tripKm;
  const weeks=period==='this'?1:Math.ceil(here.days/7);
  const usual=weeks*state.settings.usualTrips;
  return {...base,ready:true,here,before,after,bridge,envelope,annualCap,allowed,fun,possible,left,usual,
    shortfall:Math.max(0,here.total-allowed),annualShortfall:Math.max(0,before.total+here.total+after.total-remaining),
    limitedByYear:annualCap<envelope,assumesMorning:a.age===1};
}
