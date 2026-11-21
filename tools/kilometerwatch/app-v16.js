import {GOAL,LIMIT,FIRST,START_KM,day,iso,localDate,dateText,defaults,fmt,keyOf,analyze,plan} from './model-v16.js';
import {STORE,PREVIOUS,ORIGINAL,LIVE,loadBook,commit,locked,checkState,checkSettings,addReading,portable,rawBackup,parseBackup,mergeBook,repairBase} from './data-v16.js';
const $=id=>document.getElementById(id);
const sectionNames=['home','history','settings','backup','details'];
const periodNames={this:'Denne uge',next:'Næste uge',four:'4 uger'};
const phaseNames={start:'Før første tur',mid:'Undervejs',end:'Efter sidste tur',unknown:'Tidspunkt ukendt'};
const fields=['workKm','tripKm','usualTrips','shopping','margin'];
const km=n=>fmt(n)+' km';
let book, fatal='', period='this', screen='home', pending=null, entryToken=null;
let shownHistory=35, shownRecovery=25, renderedDate='', settingsDirty=false, busy=false;
function write(id,value){$(id).textContent=value;}
function node(tag,content,cls) {const n=document.createElement(tag);n.textContent=content;if(cls)n.className=cls;return n;}
function button(text,fn) {const b=node('button',text,'minor');b.type='button';b.addEventListener('click',fn);return b;}
function message(id,msg) {write(id,msg);$(id).hidden=!msg;}
function inform(msg,error=false) {message('notice',msg);$('notice').classList.toggle('warn',error);if(msg && error)$('notice').scrollIntoView({block:'nearest'});}
function safeGet(key) {try{return localStorage.getItem(key);}catch{return null;}}
function localProblem(e){return e?.name==='QuotaExceededError'?'Telefonens lager har ikke plads til både data og sikkerhedskopi.':(e?.message||'Browserlageret er utilgængeligt.');}
async function reloadBook() {
  try {book=await locked(()=>loadBook(localStorage,localDate()));fatal='';}
  catch(e){book={state:null,raw:safeGet(STORE)};fatal='Historikken kunne ikke åbnes. '+localProblem(e);}
}
async function writeBook(next,expected,repair=false) {
  const result=await locked(()=>commit(localStorage,expected,next,repair));book=result;fatal='';render();
}
async function change(fn,success) {
  if (busy || !book?.state) return;
  const expected=book.raw;busy=true;
  try{const next=structuredClone(book.state);fn(next);await writeBook(next,expected);if(success)inform(success);return true;}
  catch(e){const msg=localProblem(e);if(safeGet(STORE)!==expected){await reloadBook();settingsDirty=false;render();}inform(msg,true);}
  finally{busy=false;}
}
function turnMenu(open) {$('menu').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open));$('menuButton').setAttribute('aria-label',open?'Luk menu':'Åbn menu');}
function pickScreen(name) {
  screen=sectionNames.includes(name)?name:'home';turnMenu(false);inform('');
  for (const s of sectionNames) $(s).hidden=s!==screen;
  document.querySelectorAll('nav [data-go]').forEach(b=>{if(b.dataset.go===screen)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  render();window.scrollTo(0,0);
}
$('menuButton').onclick=()=>turnMenu($('menu').hidden);
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
  const target=b.dataset.go;
  if(target===screen){turnMenu(false);return;}
  if(screen==='settings' && settingsDirty && !confirm('Forlad kørselsindstillinger uden at gemme ændringerne?'))return;
  settingsDirty=false;location.hash=target==='home'?'':target;pickScreen(target);
});
window.addEventListener('hashchange',()=>{const target=location.hash.slice(1)||'home';if(target!==screen)pickScreen(target);});
document.addEventListener('keydown',e=>{if(e.key==='Escape' && !$('menu').hidden){turnMenu(false);$('menuButton').focus();}});
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;render();});
function periodRange(p) {
  if (p.end<=p.start) return periodNames[period];
  return dateText(iso(p.start))+' – '+dateText(iso(p.end-1))+(p.clipped?' · til årsskiftet':'');
}
function yearStatus(p) {
  if (p.conflicts.length || !p.baseline || p.used===null || p.age<0 || p.stateIssue) return ['Afventer afklaring',''];
  if (p.used>=LIMIT) return [p.used===LIMIT?'Grænsen er nået':'Over 25.000 km','bad'];
  if (p.used>=GOAL) return [p.used===GOAL?'Målet er opbrugt':'Over 22.000 km','warn'];
  if (p.pace===null) return ['Afventer flere målinger',''];
  const qualifier=p.elapsed<28?'Foreløbigt skøn':'Skøn ved aflæsningen';
  if (p.paceLow>LIMIT) return ['Tempo over grænsen','bad',qualifier];
  if (p.pace>LIMIT) return ['Usikkert ved grænsen','warn',qualifier];
  if (p.paceLow>GOAL) return ['Tempo over målet','warn',qualifier];
  if (p.pace>GOAL) return ['Tempo omkring målet','warn',qualifier];
  return ['Tempo inden for mål','good',qualifier];
}
function advice(p) {
  if (!p.ready) return p.reason;
  const words=[];
  if (p.assumesMorning) words.push('Fra dagens start. Har du kørt siden i går, så opdatér aflæsningen.');
  if (p.annualShortfall) words.push('Årets planlagte kørsel og reserver overstiger målet.');
  else if (p.shortfall) words.push('Der mangler '+km(p.shortfall)+' til periodens kørsel og reserver.');
  else if (p.usual>p.possible) {
    const short=p.usual-p.possible, skipped=fmt(short)+(short===1?' tur':' ture');
    if (period==='this' || p.clipped) words.push('Har du stadig '+fmt(p.usual)+(p.usual===1?' tur':' ture')+' planlagt, så spring '+(short===1?'én':fmt(short))+' over.');
    else words.push('Spring '+skipped+' over i forhold til dine sædvanlige '+fmt(p.usual)+'.');
  }
  return words.join(' ');
}
function renderHome(p) {
  document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===period)));
  write('range',periodRange(p));write('fun',p.ready?fmt(p.fun):'—');
  $('fun').parentElement.classList.toggle('pending',!p.ready);
  $('tripBox').hidden=!p.ready;
  if (p.ready){write('trips',fmt(p.possible)+(p.possible===1?' mulig København-tur':' mulige København-ture'));
    write('left',p.possible?km(p.left)+' tilbage efter '+(p.possible===1?'turen':'turene')+' à '+km(book.state.settings.tripKm):km(p.left)+' til kortere ture · København kræver '+km(book.state.settings.tripKm));}
  message('advice',advice(p));$('advice').classList.toggle('warn',!p.ready || (p.ready && (p.shortfall>0 || p.usual>p.possible || p.assumesMorning)));
  write('readingLabel',p.conflicts?.length?'Seneste kandidat':'Seneste aflæsning');
  write('lastKm',p.last?km(p.last.km):'—');write('lastDate',p.last?dateText(p.last.date,true):'');
  const status=yearStatus(p);write('yearStatus',status[0]);$('yearStatus').className=status[1];message('yearQualifier',status[2]??'');
}
function ledger(parent,label,value) {const row=node('div','','ledger');row.append(node('span',label),node('strong',value));parent.append(row);}
function renderDetails(p) {
  const b=$('breakdown');b.replaceChildren();write('detailPeriod',periodNames[period]+' · '+periodRange(p));
  if(!p.ready)b.append(node('p',p.reason,'hint'));
  else {
    if (p.before.days) ledger(b,'Afsat inden perioden',km(p.bridge));
    ledger(b,'Samlet råderum i perioden',km(p.allowed));ledger(b,'Arbejde · '+fmt(p.here.workDays)+' køredage','− '+km(p.here.work));
    ledger(b,'Privat ramme inkl. ekstrature og reserver',km(Math.max(0,p.allowed-p.here.work)));
    ledger(b,'Indkøb og småture','− '+km(p.here.shopping));ledger(b,'Sikkerhedsmargin','− '+km(p.here.margin));
    ledger(b,'Planlagte ekstrature','− '+km(p.here.extra));ledger(b,'Til fornøjelser',km(p.fun));
    if(p.shortfall)ledger(b,'Ufinansierede reserver',km(p.shortfall));
    if(p.limitedByYear)b.append(node('p','De faste kilometer efter perioden begrænser råderummet.','hint'));
    if(p.assumesMorning)b.append(node('p','Skøn fra dagens start ud fra gårsdagens afsluttende aflæsning.','hint'));
  }
  write('yearRange',dateText(iso(p.year.start),true)+' – '+dateText(iso(p.year.end-1),true));
  const y=$('yearNumbers');y.replaceChildren();ledger(y,'Årsmål',km(GOAL));ledger(y,'Absolut grænse',km(LIMIT));
  if (p.used===null || p.conflicts.length || p.stateIssue || p.age<0) {write('projection',p.reason);return;}
  ledger(y,'Målt siden periodestart',km(p.used));ledger(y,p.used>GOAL?'Over målet':'Tilbage til målet',km(Math.abs(GOAL-p.used)));
  ledger(y,p.used>LIMIT?'Over grænsen':'Tilbage til grænsen',km(Math.abs(LIMIT-p.used)));
  const partial=p.elapsedHi!==p.elapsed;
  if(p.pace!==null) {
    const rate=partial?fmt(Math.floor(p.paceLow))+'–'+fmt(Math.ceil(p.pace)):fmt(Math.round(p.pace));
    ledger(y,'Årstempo til '+dateText(p.last.date),rate+' km/år');
  }
  const age=p.age>1?' Målingen er '+fmt(p.age)+' dage gammel.':'';
  const basis=partial?'Måletidspunktet ligger mellem '+fmt(p.elapsed)+' og '+fmt(p.elapsedHi)+' hele døgn fra årets start.':
    p.last?.phase==='unknown'?'Dateret måling uden klokkeslæt. Der er '+fmt(p.elapsed)+' dage mellem måledatoerne.':
    'Aflæsningen dækker '+fmt(p.elapsed)+(p.elapsed===1?' hel kalenderdag.':' hele kalenderdage.');
  write('projection',p.pace===null?'Årstempo kræver mindst én hel køredag.':
    basis+' Tempoet er et '+(p.elapsed<28?'foreløbigt ':'')+'skøn for et gennemsnitsår på 365,2425 dage. Enkeltture kan påvirke det.'+age);
}
function row(parent,title,subtitle,action) {
  const item=node('div','','list-row'), t=node('div','');
  t.append(node('strong',title),node('small',subtitle));item.append(t);if(action)item.append(action);parent.append(item);
}
function flag(title,description) {
  const box=node('div','','card flag');box.append(node('h2',title),node('p',description));$('flags').append(box);return box;
}
function toggleRow(r,putBack) {
  const key=keyOf(r);
  if (!putBack && !confirm('Udelad '+km(r.km)+' fra '+dateText(r.date,true)+' fra beregningen? Aflæsningen bevares i historikken.'))return;
  change(s=>{s.excluded=s.excluded.filter(k=>k!==key);if(!putBack)s.excluded.push(key);},putBack?'Aflæsningen er medtaget.':'Aflæsningen er udeladt fra beregningen.');
}
function renderHistory(p) {
  const s=book.state, flags=$('flags');flags.replaceChildren();
  for (const c of p.conflicts) {
    const same=c.kind==='same';
    const title=same?'Flere tal samme dag':c.kind==='boundary'?'To forskellige startstande':c.kind==='opening'?'Flere tal samme dag · kontrollér morgenstanden':'Kilometerstanden falder';
    const msg=c.rows.map(r=>dateText(r.date,true)+' · '+km(r.km)).join(' / ');
    const box=flag(title,msg);
    if(same) box.append(button('Bekræft begge eller alle i km-rækkefølge',()=>change(t=>{t.confirmed[c.date]=c.signature;},'Rækkefølgen er bekræftet.')));
    for(const r of c.rows) if(!(r.date===FIRST && r.km===START_KM))box.append(button('Udelad '+km(r.km),()=>toggleRow(r,false)));
  }
  for(const i of s.issues.filter(i=>!i.seen)) {
    const box=flag(i.block?'Kontrollér historikken':'Bemærkning fra opdateringen',i.message);
    box.append(button('Markér som gennemgået',()=>change(t=>{t.issues.find(x=>x.message===i.message).seen=true;},'Markeret som gennemgået.')));
  }
  if (!p.baseline && localDate()>=FIRST) flag('Startstand for kørselsåret','Tilføj en dokumenteret aflæsning fra før første tur 2. november eller efter sidste tur 1. november.');
  write('historyCount',s.readings.length+' gemte aflæsninger · nyeste først');
  const list=$('historyRows');list.replaceChildren();const excluded=new Set(s.excluded);
  for (const r of s.readings.slice().reverse().slice(0,shownHistory)) {
    const omitted=excluded.has(keyOf(r)), fixed=r.date===FIRST && r.km===START_KM;
    row(list,km(r.km),dateText(r.date,true)+' · '+(omitted?'Udeladt':phaseNames[r.phase])+(r.label?' · '+r.label:''),
      fixed?null:button(omitted?'Medtag igen':'Udelad',()=>toggleRow(r,omitted)));
  }
  if(s.readings.length>shownHistory)list.append(button('Vis flere aflæsninger',()=>{shownHistory+=35;render();}));
  $('recoveryBox').hidden=!s.recovery.length;
  const recovery=$('recoveryRows');recovery.replaceChildren();
  for(const r of s.recovery.slice().reverse().slice(0,shownRecovery)) row(recovery,km(r.km),dateText(r.date,true),
    button('Medtag',()=>change(t=>{t.readings.push(r);t.recovery=t.recovery.filter(x=>keyOf(x)!==keyOf(r));},'Aflæsningen er tilføjet til historikken.')));
  if(s.recovery.length>shownRecovery)recovery.append(button('Vis flere fra kopier',()=>{shownRecovery+=25;render();}));
}
for(const [i,name] of ['Ma','Ti','On','To','Fr','Lø','Sø'].entries()) {
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.value=i;input.setAttribute('aria-label',['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'][i]);
  label.append(input,node('span',name));$('weekdays').append(label);
}
function renderSettings(s) {
  if(!settingsDirty){
    fields.forEach(k=>{$(k).value=s.settings[k];});
    $('weekdays').querySelectorAll('input').forEach(input=>{input.checked=s.settings.workWeek.includes(+input.value);});
  }
  for(const [id,items] of [['offRows',s.off],['extraRows',s.extra]]) {
    const list=$(id);list.replaceChildren();
    for(const item of items) {
      const off=id==='offRows';
      const title=off?dateText(item.from,true)+(item.from===item.to?'':' – '+dateText(item.to,true)):km(item.km);
      const sub=off?'Ingen planlagt pendling':dateText(item.date,true);
      row(list,title,sub,button('Fjern',()=>change(t=>{
        if(off)t.off=t.off.filter(x=>x.from!==item.from||x.to!==item.to);
        else t.extra=t.extra.filter(x=>x.date!==item.date);
      },'Planen er opdateret.')));
    }
  }
}
function render() {
  renderedDate=localDate();
  if(!book)return;
  $('newReading').disabled=$('historyAdd').disabled=$('download').disabled=!!fatal;
  $('previous').disabled=!safeGet(PREVIOUS);$('original').disabled=!safeGet(ORIGINAL) || safeGet(ORIGINAL)==='{"app":"KilometerWatch","version":15,"keys":{}}';
  if (fatal) {
    write('range','Råderum afventer historik');write('fun','—');$('tripBox').hidden=true;message('advice',fatal+' Åbn Sikkerhedskopiering og import.');
    write('lastKm','—');write('lastDate','');write('yearStatus','Afventer historik');message('yearQualifier','');
    if(screen==='history'){$('flags').replaceChildren();flag('Historik utilgængelig',fatal);$('historyRows').replaceChildren();$('recoveryBox').hidden=true;write('historyCount','');}
    if(screen==='details'){$('breakdown').replaceChildren(node('p',fatal));$('yearNumbers').replaceChildren();write('projection','');write('yearRange','');}
    if(screen==='settings'){$('settings').querySelectorAll('input,button:not(.back)').forEach(x=>x.disabled=true);}
    return;
  }
  const s=book.state, p=plan(s,renderedDate,period);
  p.stateIssue=s.issues.some(i=>i.block && !i.seen);
  if (screen==='home')renderHome(p);
  if (screen==='details')renderDetails(p);
  if (screen==='history')renderHistory(p);
  if (screen==='settings'){$('settings').querySelectorAll('input,button').forEach(x=>x.disabled=false);renderSettings(s);}
}
function okNumber(raw) {
  const value=raw.trim();
  if (!/^\d{1,7}$/.test(value) && !/^\d{1,3}([. ]\d{3}){1,2}$/.test(value)) throw Error('Skriv hele kilometerstanden, fx 115758 eller 115.758.');
  return Number(value.replace(/[. ]/g,''));
}
function midFields(clear=false) {
  const mid=$('phase').value==='mid';
  const booked=book.state?.extra.find(t=>t.date===$('entryDate').value)?.km??0;
  $('midFields').hidden=!mid;$('workLeft').required=mid;
  $('extraLeftLabel').hidden=!mid || !booked;$('extraLeft').required=mid && !!booked;$('extraLeft').max=booked;
  $('extraLeft').placeholder='Af '+km(booked)+' planlagt';
  if(clear){$('workLeft').value='';$('extraLeft').value='';}
  return booked;
}
function openEntry() {
  if (!book?.state) return;
  inform('');entryToken=book.raw;$('entryForm').reset();$('entryDate').value=$('entryDate').max=localDate();
  message('entryError','');midFields(true);$('entryDialog').showModal();$('entryKm').focus();
}
$('newReading').onclick=$('historyAdd').onclick=openEntry;
$('cancelEntry').onclick=()=>$('entryDialog').close();
$('phase').onchange=$('entryDate').onchange=()=>midFields(true);
$('entryForm').onsubmit=async e=>{
  e.preventDefault();if(busy || !book.state)return;
  busy=true;
  try{
    const today=localDate(),r={date:$('entryDate').value,km:okNumber($('entryKm').value),phase:$('phase').value};
    if(r.phase==='mid'){r.workLeft=$('workLeft').valueAsNumber;r.booked=midFields();r.extraLeft=r.booked?$('extraLeft').valueAsNumber:0;}
    const next=structuredClone(book.state);
    addReading(next,r,today);
    const prev=analyze(book.state,today).rows.filter(x=>x.date<=r.date).at(-1);
    if(prev && r.km-prev.km>Math.max(1,day(r.date)-day(prev.date))*600+200 && !confirm('Bekræft stigning på '+km(r.km-prev.km)+' siden forrige aflæsning.'))return;
    await writeBook(next,entryToken);$('entryDialog').close();inform('Aflæsning gemt.');
  }catch(err){
    if(safeGet(STORE)!==entryToken){await reloadBook();entryToken=book.raw;render();}
    message('entryError',localProblem(err));
  }finally{busy=false;}
};
$('settingsForm').oninput=()=>{settingsDirty=true;};
$('settingsForm').onsubmit=async e=>{
  e.preventDefault();const s=defaults();fields.forEach(k=>{s[k]=$(k).valueAsNumber;});
  s.workWeek=[...$('weekdays').querySelectorAll('input:checked')].map(x=>Number(x.value));
  if(await change(t=>{t.settings=checkSettings(s);},'Kørselsindstillingerne er gemt.')){settingsDirty=false;render();}
};
$('offFrom').onchange=()=>{const from=$('offFrom').value;if(!$('offTo').value || $('offTo').value<from)$('offTo').value=from;$('offTo').min=from;};
$('offForm').onsubmit=e=>{e.preventDefault();const from=$('offFrom').value,to=$('offTo').value;
  change(t=>{if(day(from)>day(to))throw Error('Slutdato skal være på eller efter startdato.');if(!t.off.some(o=>o.from===from && o.to===to))t.off.push({from,to});},'Friperioden er gemt.');};
$('extraForm').onsubmit=e=>{e.preventDefault();const date=$('extraDate').value,amount=$('extraKm').valueAsNumber;
  change(t=>{day(date);t.extra=t.extra.filter(x=>x.date!==date);t.extra.push({date,km:amount});},'Ekstrakørsel er gemt for datoen.');};
function download(name,data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name+'-'+localDate()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('download').onclick=()=>{if(book.state)download('KilometerWatch-v16',portable(book.state));};
$('downloadRaw').onclick=()=>{try{download('KilometerWatch-raadata',rawBackup(localStorage));}catch(e){inform(localProblem(e),true);}};
function preview(data,source) {
  try{
    const today=localDate(), imported=parseBackup(data,today);
    if(fatal && !imported.state.readings.length)throw Error('Gendannelse kræver en kopi med læsbare aflæsninger.');
    const base=book.state??repairBase(localStorage,today), merged=mergeBook(base,imported,false,today), p=analyze(merged,today);
    pending={imported,base,token:book.raw,repair:!!fatal};message('importError','');
    write('importTitle',source);
    write('importStats',imported.state.readings.length+' aflæsninger i kopien · '+(merged.readings.length-base.readings.length)+' nye i din historik.');
    write('importLast',p.last?'Seneste efter sammenfletning er '+km(p.last.km)+' · '+dateText(p.last.date,true)+'.':'Ingen aktiv aflæsning.');
    const notes=[];
    if(p.conflicts.length)notes.push(p.conflicts.length+' uoverensstemmelser kræver afklaring i Historik.');
    if(imported.state.recovery.length)notes.push(imported.state.recovery.length+' aflæsninger findes kun i ældre kopier.');
    if(imported.state.issues.some(i=>!i.seen))notes.push('Kopien har historikbeskeder til gennemgang.');
    if(fatal)notes.push('Originalen gemmes før gendannelse. Tjek om kopien indeholder din seneste aflæsning.');
    message('importFlags',notes.join(' '));
    $('planLabel').hidden=!imported.hasPlan;$('usePlan').checked=!!fatal && imported.hasPlan;
    write('planText',imported.fullPlan?'Brug også kopiens indstillinger, fridage og ekstrature. Dette erstatter din nuværende køreplan.':'Brug også kopiens kørselsindstillinger.');
    $('importDialog').showModal();
  }catch(err){inform('Kopien kunne ikke åbnes. '+localProblem(err),true);}
}
$('pickFile').onclick=()=>$('file').click();
$('file').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>24*1024*1024)throw Error('Filen er for stor.');preview(JSON.parse(await f.text()),'Gennemse import');}
  catch(err){inform('Kopien kunne ikke læses. '+localProblem(err),true);}finally{e.target.value='';}
};
function previewLocal(k,title) {try{const value=localStorage.getItem(k);if(value===null)throw Error('Kopien findes ikke.');preview(JSON.parse(value),title);}catch(e){inform(localProblem(e),true);}}
$('previous').onclick=()=>previewLocal(PREVIOUS,'Gennemse lokal sikkerhedskopi');
$('original').onclick=()=>previewLocal(ORIGINAL,'Kopi fra før opdatering');
$('cancelImport').onclick=()=>$('importDialog').close();
$('importDialog').addEventListener('close',()=>{pending=null;});
$('applyImport').onclick=async()=>{
  if(busy || !pending)return;busy=true;
  try{const {imported,base,token,repair}=pending;
    await writeBook(mergeBook(base,imported,$('usePlan').checked,localDate()),token,repair);
    $('importDialog').close();inform('Kopien er sammenflettet. Se aflæsningerne i Historik.');
  }catch(e){
    if(pending && safeGet(STORE)!==pending.token){
      $('importDialog').close();await reloadBook();render();inform('Data er ændret i en anden fane. Gennemse kopien igen.',true);
    }else message('importError',localProblem(e));
  }finally{busy=false;}
};
window.addEventListener('storage',async e=>{
  if(e.key!==STORE && e.key!==null && !LIVE.includes(e.key))return;
  if($('entryDialog').open || $('importDialog').open || settingsDirty){inform('En anden fane har ændret data. Kontrollér ændringerne, før du gemmer.',true);return;}
  await reloadBook();render();
});
function checkDate(){if(renderedDate!==localDate())render();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDate();});
window.addEventListener('focus',checkDate);setInterval(checkDate,30000);
await reloadBook();pickScreen(location.hash.slice(1));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{
  inform('Offlinekopien kunne ikke opdateres. Åbn appen igen med forbindelse.',true);
});
