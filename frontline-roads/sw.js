const CACHE_NAME='frontline-roads-civilization';
const APP_SHELL=[
  './','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png',
  './game-core.js?v=36','./game-world.js?v=36','./game-combat.js?v=36','./game-map-v36.js?v=36','./game-ui.js?v=36',
  './civilization-payload-core.js','./civilization-payload-runtime.js','./civilization-bootstrap.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
    const windows=await self.clients.matchAll({type:'window'});
    await Promise.all(windows.map(client=>client.navigate(client.url)));
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isDocument=event.request.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
  if(isDocument){
    event.respondWith((async()=>{
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        const cache=await caches.open(CACHE_NAME);
        await cache.put(event.request,response.clone());
        return response;
      }catch{
        return await caches.match(event.request)||await caches.match('./index.html')||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    const networkPromise=fetch(event.request).then(response=>{
      if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));
      return response;
    });
    return cached||networkPromise.catch(()=>Response.error());
  })());
});
