// Public NIMIS shell only; never cache login callbacks, API or user records.
const CACHE_NAME='nimis-app-shell-v4-security';
const APP_BASE=new URL(self.registration.scope);
const INDEX_URL=new URL('index.html',APP_BASE).toString();
function cacheable(request){
 const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.search||
    request.headers.has('Authorization')||request.headers.has('X-Nimis-Dev-Actor')||
    url.pathname.includes('/api/'))return false;
 if(request.mode==='navigate')return url.pathname===APP_BASE.pathname||
   url.pathname===new URL('index.html',APP_BASE).pathname;
 return /\.(?:js|css|png|svg|webp|ico|woff2)$/.test(url.pathname);
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const response=await fetch(INDEX_URL,{cache:'reload'});
  if(!response.ok)throw new Error('NIMIS public shell unavailable');
  const cache=await caches.open(CACHE_NAME);
  if(!/private|no-store/i.test(response.headers.get('Cache-Control')||'')){
    await cache.put(INDEX_URL,response.clone());
  }
  const logoUrl=new URL('nimis-coat-of-arms.png',APP_BASE).toString();
  try{
    const logo=await fetch(logoUrl,{cache:'reload'});
    if(logo.ok)await cache.put(logoUrl,logo);
  }catch{}
  const html=await response.text();
  const assets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
    .map(x=>new URL(x[1],APP_BASE).toString());
  await Promise.all(assets.map(async url=>{
    if(!cacheable(new Request(url)))return;
    try{const item=await fetch(url);if(item.ok)await cache.put(url,item)}catch{}
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
   keys.filter(key=>key.startsWith('nimis-app-shell-')&&key!==CACHE_NAME)
     .map(key=>caches.delete(key))
 )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(!cacheable(request))return;
 if(request.mode==='navigate'){
   event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match(INDEX_URL)));
   return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
   if(response.ok&&response.type==='basic'&&!response.headers.has('Set-Cookie')&&
     !/private|no-store/i.test(response.headers.get('Cache-Control')||'')){
     const clone=response.clone();
     event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));
   }
   return response;
 })));
});
