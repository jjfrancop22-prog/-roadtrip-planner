const C="roadtrip-ai-v3-1-0-smart-navigation";
const A=[
  "./","./index.html","./manifest.json","./css/app.css?v=2.5.0-b","./js/app.js?v=2.5.0-b",
  "./js/storage.js","./js/maps.js","./js/maps-engine.js","./js/seed.js","./js/dev-panel.js",
  "./js/official-parking.js","./js/smart-search.js","./js/ui.js","./js/cache.js","./js/api.js",
  "./js/route-engine.js","./js/schedule-engine.js",
  "./js/navigation-engine.js","./js/travel-score.js","./js/planner-engine.js",
  "./js/walking-engine.js","./js/places-engine.js","./js/weather-engine.js","./js/traffic-engine.js",
  "./js/fuel-engine.js","./js/budget-engine.js","./js/hotel-engine.js","./js/restaurant-engine.js",
  "./assets/icons/icon-192.png","./assets/icons/icon-512.png","./assets/icons/icon-maskable-512.png"
];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  const fresh=e.request.mode==="navigate"||/\.(?:js|css|html)$/.test(url.pathname);
  if(fresh){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(C).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{const copy=x.clone();caches.open(C).then(c=>c.put(e.request,copy));return x})));
});
