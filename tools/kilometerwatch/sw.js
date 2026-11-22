// Install a complete application shell before switching the installed PWA to it.
const CACHE='kilometerwatch-v16-calendar-maharaj-7';
const ASSETS=['./drive','./manifest.webmanifest','./style-v16.css?front=6','./model-v16.js?front=4','./data-v16.js?front=7','./app-v16.js?front=7','./icon-192.png','./icon-512.png'];
const urls=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
const home=new URL('./drive',self.registration.scope).href;
const launchPaths=new Set(['./','./drive','./start'].map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('kilometerwatch-') && key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
async function openApp() {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3000);
  let response;
  try {
    response=await fetch(home,{cache:'no-cache',signal:controller.signal});
    if(response.ok && response.headers.get('content-type')?.includes('text/html'))return response;
  } catch {
    // A slow or unavailable connection can still open the fully installed release.
  } finally {clearTimeout(timeout);}
  return await caches.match(home,{cacheName:CACHE}) || response || Response.error();
}
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET' || url.origin!==self.location.origin)return;
  if(req.mode==='navigate' && launchPaths.has(url.pathname)) {
    event.respondWith(openApp());
    return;
  }
  if(!urls.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(req)) || fetch(req);
  })());
});
