const APP_CACHE="roadtrip-ai-v3-2-2-a4-app-shell";
const RUNTIME_CACHE="roadtrip-ai-v3-2-2-a4-runtime";
const MAP_CACHE="roadtrip-ai-v3-2-2-a4-map-assets";
const APP_ASSETS=[
  "./","./index.html","./manifest.json","./css/app.css","./js/app.js",
  "./js/storage.js","./js/maps.js","./js/maps-engine.js","./js/seed.js","./js/dev-panel.js",
  "./js/official-parking.js","./js/smart-search.js","./js/ui.js","./js/cache.js","./js/api.js",
  "./js/route-engine.js","./js/schedule-engine.js","./js/navigation-engine.js",
  "./js/search/search-provider.js","./js/search/provider-config.js","./js/search/provider-manager.js",
  "./js/search/smart-ranking-engine.js","./js/search/geosearch-engine.js",
  "./js/search/offline-cache.js","./js/search/providers/osm-provider.js","./js/search/providers/roadtrip-provider.js",
  "./js/search/providers/google-provider.js","./js/search/providers/apple-provider.js","./js/travel-score.js",
  "./js/planner-engine.js","./js/walking-engine.js","./js/places-engine.js","./js/weather-engine.js",
  "./js/traffic-engine.js","./js/fuel-engine.js","./js/budget-engine.js","./js/hotel-engine.js",
  "./js/restaurant-engine.js","./assets/icons/icon-192.png","./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(APP_CACHE);
    await Promise.allSettled(APP_ASSETS.map(asset=>cache.add(asset)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  const keep=new Set([APP_CACHE,RUNTIME_CACHE,MAP_CACHE]);
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>!keep.has(key)).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
async function networkFirst(request,cacheName,timeoutMs=5000){
  const cache=await caches.open(cacheName);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(request,{signal:controller.signal});
    if(response?.ok)await cache.put(request,response.clone());
    return response;
  }catch{
    return (await cache.match(request,{ignoreSearch:true}))||(request.mode==="navigate"?await caches.match("./index.html"):Response.error());
  }finally{clearTimeout(timeout)}
}
async function staleWhileRevalidate(request,cacheName){
  const cache=await caches.open(cacheName),cached=await cache.match(request,{ignoreSearch:true});
  const update=fetch(request).then(async response=>{if(response?.ok||response?.type==="opaque")await cache.put(request,response.clone());return response;}).catch(()=>null);
  return cached||await update||Response.error();
}
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  const isApp=url.origin===self.location.origin;
  const isMap=/tile\.openstreetmap\.org|unpkg\.com\/leaflet|maps\.googleapis\.com|googleusercontent\.com/i.test(url.href);
  const isSearchApi=/nominatim\.openstreetmap\.org|places\.googleapis\.com|maps\.apple\.com/i.test(url.href);
  if(event.request.mode==="navigate"||isApp&&/\.(?:js|css|html)$/.test(url.pathname)){
    event.respondWith(networkFirst(event.request,APP_CACHE,4500));return;
  }
  if(isSearchApi){event.respondWith(networkFirst(event.request,RUNTIME_CACHE,7000));return;}
  if(isMap||event.request.destination==="image"){
    event.respondWith(staleWhileRevalidate(event.request,MAP_CACHE));return;
  }
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request).then(async response=>{
    if(response?.ok){const cache=await caches.open(RUNTIME_CACHE);await cache.put(event.request,response.clone());}
    return response;
  }).catch(()=>Response.error())));
});
