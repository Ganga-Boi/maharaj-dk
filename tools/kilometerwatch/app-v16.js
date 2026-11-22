import {GOAL,LIMIT,FIRST,START_KM,day,iso,localDate,dateText,fmt,keyOf,analyze,overview,COMMUTE_KM,isWorkDate} from './model-v16.js?front=4';
import {STORE,PREVIOUS,ORIGINAL,LIVE,loadBook,commit,locked,checkSettings,addReading,portable,rawBackup,parseBackup,mergeBook,repairBase} from './data-v16.js?front=4';
const $=id=>document.getElementById(id);
const periodNames={this:'Resten af ugen',next:'Næste uge',four:'Næste 4 hele uger'};
const phaseNames={start:'Før første tur',mid:'Undervejs',end:'Efter sidste tur',unknown:'Tidspunkt ukendt'};
const fields=['tripKm','usualTrips','shopping','margin'];
const km=n=>fmt(n)+' km';
let book, fatal='', pending=null, entryToken=null;
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
function yearStatus(p) {
  if (p.conflicts.length || !p.baseline || p.used===null || p.age<0 || p.stateIssue) return ['Afventer afklaring',''];
  if (p.used>=GOAL) return [p.used===GOAL?'Årsmålet er nået':'Over årsmålet',p.used>=LIMIT?'bad':'warn'];
  if (p.pace===null) return ['Afventer flere målinger',''];
  const qualifier=p.elapsed<28?'Foreløbigt skøn':'Skøn';
  if (p.paceLow>GOAL) return ['Tempo over målet',p.paceLow>LIMIT?'bad':'warn',qualifier];
  if (p.pace>GOAL) return ['Tempo omkring målet','warn',qualifier];
  return ['Tempo inden for mål','good',qualifier];
}
function recommendation(p) {
  if (p.annualShortfall) return 'Årets planlagte kørsel overstiger budgettet.';
  if (p.shortfall) return 'Periodens reserver overstiger budgettet med '+km(p.shortfall)+'.';
  const skip=p.usual-p.possible;
  if (skip<=0 || p.possible===0) return '';
  const count=skip===1?'én':fmt(skip), trips=fmt(p.usual)+(p.usual===1?' tur':' ture');
  return 'Hvis du har '+trips+' planlagt, så spring '+count+' over.';
}
function periodCard(p,blocked) {
  const card=node('article','','budget '+(p.period==='this'?'current':'upcoming'));
  card.dataset.window=p.period;
  const heading=node('div','','period-heading');
  heading.append(node('h2',periodNames[p.period]));
  if(p.end>p.start){
    const single=p.end-p.start===1;
    let dates=dateText(iso(p.start),false,single?'long':'short');
    if(!single)dates+=' – '+dateText(iso(p.end-1),false,'short');
    if(p.clipped)dates+=' · til kørselsårets slutning';
    heading.append(node('small',dates));
  }
  card.append(heading);
  if (!p.ready) {
    card.append(node('p',blocked?'Afventer beregning':p.reason,'unavailable'));
    return card;
  }
  const amount=node('p','','amount');
  amount.append(node('strong',fmt(p.fun)),node('span',' km'));
  card.append(amount);
  const trips=p.possible===0?'Ingen København-tur':p.possible===1?'1 tur til København':fmt(p.possible)+' ture til København';
  const detail=node('p','','trip-result');
  const distance=p.possible?' ('+km(p.fun-p.left)+')':'';
  detail.append(node('strong',trips),document.createTextNode(distance+' · '+km(p.left)+(p.possible?' tilovers':' til kortere ture')));
  card.append(detail);
  const advice=recommendation(p);
  if(advice)card.append(node('p',advice,'recommendation'));
  return card;
}
function renderHome(view) {
  const {analysis:p,periods,provisional}=view;
  const blocked=!!p.reason && !provisional;
  let basis='Kilometer til fornøjelse · skøn';
  if(blocked) basis=p.reason;
  else if(provisional) basis=p.age===0?'Kilometer til fornøjelse · skøn. Dagens aflæsning har intet tidspunkt.':
    'Kilometer til fornøjelse ved dagens start. Kørsel siden '+dateText(p.last.date)+' er anslået.';
  else if(p.age===1) basis='Kilometer til fornøjelse · skøn ved dagens start ud fra gårsdagens aflæsning.';
  write('basis',basis);
  $('basis').classList.toggle('warn',blocked || provisional);
  $('budgets').replaceChildren(...periods.map(period=>periodCard(period,blocked)));
  write('readingLabel',p.conflicts.length?'Seneste omstridte aflæsning':'Seneste aflæsning');
  write('lastKm',p.last?km(p.last.km):'—');
  write('lastDate',p.last?dateText(p.last.date,true):'');
  const status=yearStatus(p);
  write('yearStatus',status[0]);$('yearStatus').className=status[1];
  let pace='';
  if(status[2]){
    const value=p.elapsedHi===p.elapsed?fmt(Math.round(p.pace)):fmt(Math.floor(p.paceLow))+'–'+fmt(Math.ceil(p.pace));
    pace=status[2]+' · '+value+' km/år';
  }
  message('yearQualifier',pace);
}
function openFromLink() {
  const key=location.hash.slice(1);
  if(['history','backup','settings'].includes(key)) {
    $(key).open=true;$(key).scrollIntoView();
  } else if(key==='details' || key==='home') $('home').scrollIntoView();
}
window.addEventListener('hashchange',openFromLink);
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
function renderSettings(s) {
  if(!settingsDirty){
    fields.forEach(k=>{$(k).value=s.settings[k];});
  }
  for(const [id,items] of [['offRows',s.off],['extraRows',s.extra]]) {
    const list=$(id);list.replaceChildren();
    for(const item of items) {
      const off=id==='offRows';
      const title=off?dateText(item.from,true)+(item.from===item.to?'':' – '+dateText(item.to,true)):km(item.km);
      const sub=off?'Friperiode':dateText(item.date,true);
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
  $('settings').querySelectorAll('input,button').forEach(el=>{el.disabled=!!fatal;});
  if (fatal) {
    write('basis',fatal+' Du kan gendanne historikken nederst på siden.');
    $('basis').classList.add('warn');
    $('budgets').replaceChildren(...Object.keys(periodNames).map(period=>periodCard({period},true)));
    write('lastKm','—');write('lastDate','');write('readingLabel','Seneste aflæsning');
    write('yearStatus','Afventer historik');message('yearQualifier','');
    $('flags').replaceChildren();flag('Historikken er utilgængelig',fatal);
    $('historyRows').replaceChildren();$('recoveryBox').hidden=true;write('historyCount','');write('yearBalance','');
    return;
  }
  const s=book.state, view=overview(s,renderedDate), a=view.analysis;
  a.stateIssue=s.issues.some(i=>i.block && !i.seen);
  renderHome(view);
  if ($('history').open) {
    renderHistory(a);
    const valid=a.used!==null && !a.stateIssue && !a.conflicts.length && a.age>=0;
    write('yearBalance',valid?km(a.used)+' kørt i kørselsåret ved seneste måling. '+km(Math.abs(GOAL-a.used))+
      (a.used>GOAL?' over årsmålet.':' til årsmålet.'):'');
  }
  if ($('settings').open) renderSettings(s);
}
for (const key of ['history','settings']) $(key).addEventListener('toggle',()=>{if($(key).open)render();});
function okNumber(raw) {
  const value=raw.trim();
  if (!/^\d{1,7}$/.test(value) && !/^\d{1,3}([. ]\d{3}){1,2}$/.test(value)) throw Error('Skriv hele kilometerstanden, fx 115758 eller 115.758.');
  return Number(value.replace(/[. ]/g,''));
}
function midFields(clear=false) {
  const mid=$('phase').value==='mid';
  const booked=book.state?.extra.find(t=>t.date===$('entryDate').value)?.km??0;
  const date=$('entryDate').value;
  const legs=mid && !!date && $('entryDate').validity.valid && isWorkDate(book.state,date);
  $('legLabel').hidden=!legs;$('leg').required=legs;
  $('midFields').hidden=!mid || (!legs && !booked);
  $('extraLeftLabel').hidden=!mid || !booked;$('extraLeft').required=mid && !!booked;$('extraLeft').max=booked;
  $('extraLeft').placeholder='Af '+km(booked)+' planlagt';
  if(clear){$('leg').value='';$('extraLeft').value='';}
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
    if(r.phase==='mid'){
      r.booked=midFields();
      const remaining={both:COMMUTE_KM,home:COMMUTE_KM/2,done:0};
      r.workLeft=$('legLabel').hidden?0:remaining[$('leg').value];
      r.extraLeft=r.booked?$('extraLeft').valueAsNumber:0;
    }
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
  e.preventDefault();const s={...book.state.settings,workKm:COMMUTE_KM};
  fields.forEach(k=>{s[k]=$(k).valueAsNumber;});
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
await reloadBook();render();openFromLink();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{
  inform('Offlinekopien kunne ikke opdateres. Åbn appen igen med forbindelse.',true);
});
