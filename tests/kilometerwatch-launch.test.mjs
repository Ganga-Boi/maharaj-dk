import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const scope='https://example.test/tools/kilometerwatch/';
const worker=await readFile(new URL('../tools/kilometerwatch/sw.js',import.meta.url),'utf8');
const routing=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../tools/kilometerwatch/manifest.webmanifest',import.meta.url),'utf8'));
const html=body=>new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}});

function navigate(url,network,cached) {
  const handlers={};
  const self={registration:{scope},location:new URL(scope),addEventListener:(type,handler)=>{handlers[type]=handler;}};
  const caches={match:async(key,options)=>{
    assert.equal(key,scope+'drive');
    assert.ok(options.cacheName.startsWith('kilometerwatch-'));
    return cached;
  }};
  runInNewContext(worker,{self,URL,AbortController,Response,setTimeout,clearTimeout,fetch:network,caches});
  let result;
  handlers.fetch({request:{method:'GET',mode:'navigate',url},respondWith:response=>{result=response;}});
  return result;
}

test('direct link serves the same dashboard as the existing installed app',()=>{
  const start=new URL('start',scope),installed=new URL(manifest.start_url,scope);
  assert.equal(installed.href,scope+'drive');
  assert.ok(routing.rewrites.some(rule=>rule.source===start.pathname && rule.destination===installed.pathname));
});

test('initial app markup shows only the main budget and has no accordion menu',async()=>{
  const page=await readFile(new URL('../tools/kilometerwatch/drive.html',import.meta.url),'utf8');
  const visibleSections=[...page.matchAll(/<section\b[^>]*>/g)].map(match=>match[0]).filter(tag=>!(/\bhidden\b/.test(tag)));
  assert.equal(visibleSections.length,1);
  assert.match(visibleSections[0],/id="home"/);
  assert.doesNotMatch(page,/<(?:details|summary|nav)\b/i);
  assert.match(page,/<button id="newReading"[^>]*>Opdatér kilometerstand<\/button>\s*<\/div>\s*<\/section>/);
});

test('online launches on both links revalidate the dashboard even with a saved copy',async()=>{
  for(const path of ['drive','start']){
    let fetched;
    const network=async(url,options)=>{fetched=[url,options.cache];return html('current');};
    const response=await navigate(scope+path,network,html('old'));
    assert.deepEqual(fetched,[scope+'drive','no-cache']);
    assert.equal(await response.text(),'current');
  }
});

test('an offline, unavailable or non-HTML app response falls back to the installed copy',async()=>{
  for(const network of [async()=>{throw new Error('offline');},async()=>new Response(null,{status:503}),async()=>new Response('{}')]){
    const response=await navigate(scope+'start',network,html('installed'));
    assert.equal(await response.text(),'installed');
  }
});

test('unrelated website routes do not get the app dashboard',()=>{
  assert.equal(navigate(new URL('/projects',scope).href,()=>html('app'),html('offline')),undefined);
});
