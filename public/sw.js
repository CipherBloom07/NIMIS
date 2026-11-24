const CACHE_NAME='nimis-app-shell-v3';
const APP_BASE=new URL(self.registration.scope);
const INDEX_URL=new URL('index.html',APP_BASE).toString();
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const response=await fetch(INDEX_URL,{cache:'reload'});
  if(!response.ok)throw new Error('NIMIS application shell could not be cached');
  await cache.put(INDEX_URL,response.clone());
  // Pre-cache the official emblem so it remains available offline and after upgrades.
  const logoUrl=new URL('nimis-coat-of-arms.png',APP_BASE).toString();
  try{const logo=await fetch(logoUrl,{cache:'reload'});if(logo.ok)await cache.put(logoUrl,logo)}catch{}
  const html=await response.text();
  const assets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(match=>new URL(match[1],APP_BASE).toString());
  await Promise.all(assets.map(async asset=>{try{const item=await fetch(asset);if(item.ok)await cache.put(asset,item)}catch{}}));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nimis-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.includes('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(INDEX_URL,copy))}
   return response;
  }).catch(async()=> (await caches.match(INDEX_URL))||(await caches.match(new URL('.',APP_BASE).toString()))));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>{
  if(cached)return cached;
  return fetch(request).then(response=>{
   if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}
   return response;
  });
 }));
});