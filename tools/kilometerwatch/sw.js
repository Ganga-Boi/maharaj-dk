// Install a complete application shell before switching the installed PWA to it.
const CACHE='kilometerwatch-v16-calendar-maharaj-1';
const ASSETS=['./drive','./manifest.webmanifest','./style-v16.css','./model-v16.js','./data-v16.js','./app-v16.js','./icon-192.png','./icon-512.png'];
const urls=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('kilometerwatch-') && key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET' || url.origin!==self.location.origin)return;
  const isHome=req.mode==='navigate' && [new URL('./',self.registration.scope).pathname,new URL('./drive',self.registration.scope).pathname].includes(url.pathname);
  if(!isHome && !urls.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(isHome?new URL('./drive',self.registration.scope).href:req)) || fetch(req);
  })());
});
