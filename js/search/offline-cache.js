const DB_NAME="roadtrip-ai-smart-offline-v2";
const DB_VERSION=1;
const SEARCH_STORE="searches";
const PLACE_STORE="places";
const META_STORE="meta";
const FRESH_MS=14*24*60*60*1000;
const STALE_MS=180*24*60*60*1000;

const normalize=value=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g," ").trim();

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in globalThis)){reject(new Error("IndexedDB no disponible"));return;}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(SEARCH_STORE)){
        const store=db.createObjectStore(SEARCH_STORE,{keyPath:"key"});
        store.createIndex("savedAt","savedAt");
      }
      if(!db.objectStoreNames.contains(PLACE_STORE)){
        const store=db.createObjectStore(PLACE_STORE,{keyPath:"cacheId"});
        store.createIndex("updatedAt","updatedAt");
        store.createIndex("nameKey","nameKey");
      }
      if(!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE,{keyPath:"key"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("No se pudo abrir la caché offline"));
  });
}

async function transaction(storeName,mode,work){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,mode);
    const store=tx.objectStore(storeName);
    let result;
    try{result=work(store);}catch(error){db.close();reject(error);return;}
    tx.oncomplete=()=>{db.close();resolve(result?.result??result);};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Error de caché offline"));};
    tx.onabort=()=>{db.close();reject(tx.error||new Error("Operación de caché cancelada"));};
  });
}

const point=value=>{
  const lat=Number(value?.lat??value?.latitude),lng=Number(value?.lng??value?.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
};
const haversineKm=(a,b)=>{
  const R=6371,toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
};
function routePoints(route){
  const source=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
  return source.map(item=>point({lat:item?.lat??item?.latitude??item?.[1],lng:item?.lng??item?.longitude??item?.[0]})).filter(Boolean);
}
function placeId(place){
  const p=point(place);
  return String(place?.id||place?.providerPlaceId||`${normalize(place?.name)}|${p?.lat?.toFixed(5)||""}|${p?.lng?.toFixed(5)||""}`);
}
function serializable(place){
  const copy={...place};
  delete copy.raw;
  return JSON.parse(JSON.stringify(copy));
}

export function buildSearchCacheKey(query,{location}={}){
  const p=point(location);
  return `${normalize(query)}|${p?`${p.lat.toFixed(2)},${p.lng.toFixed(2)}`:"no-location"}`;
}

export async function saveOfflineSearch(key,query,results,context={}){
  const now=Date.now();
  const cleanResults=Array.isArray(results)?results.map(serializable):[];
  // Nunca guardar búsquedas vacías: una respuesta vacía no debe bloquear una búsqueda online posterior.
  if(!cleanResults.length)return false;
  await transaction(SEARCH_STORE,"readwrite",store=>store.put({
    key,query:normalize(query),savedAt:now,location:point(context.location),results:cleanResults
  }));
  await saveOfflinePlaces(cleanResults,{source:"search"});
  await trimOfflineCache();
  return true;
}

export async function getOfflineSearch(key,{allowStale=false}={}){
  const entry=await transaction(SEARCH_STORE,"readonly",store=>store.get(key)).catch(()=>null);
  if(!entry)return null;
  // Ignorar entradas antiguas o defectuosas que contengan cero resultados.
  if(!Array.isArray(entry.results)||!entry.results.length)return null;
  const age=Date.now()-entry.savedAt;
  if(age>(allowStale?STALE_MS:FRESH_MS))return null;
  return {...entry,stale:age>FRESH_MS,ageMs:age};
}

export async function saveOfflinePlaces(places,{source="route"}={}){
  if(!Array.isArray(places)||!places.length)return;
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PLACE_STORE,"readwrite"),store=tx.objectStore(PLACE_STORE),now=Date.now();
    for(const place of places){
      if(!place?.name)continue;
      const clean=serializable(place),p=point(clean);
      store.put({
        ...clean,cacheId:placeId(clean),nameKey:normalize(clean.name),searchText:normalize(`${clean.name} ${clean.address||""} ${clean.city||""} ${clean.category||""}`),
        latitude:p?.lat??null,longitude:p?.lng??null,lat:p?.lat??null,lng:p?.lng??null,
        cachedSource:source,updatedAt:now
      });
    }
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  }).catch(()=>{});
}

export async function findOfflinePlaces(query,{location,route,limit=12}={}){
  const items=await transaction(PLACE_STORE,"readonly",store=>store.getAll()).catch(()=>[]);
  const q=normalize(query),words=q.split(" ").filter(Boolean),origin=point(location),routePts=routePoints(route);
  return (items||[]).map(item=>{
    const text=item.searchText||normalize(`${item.name} ${item.address||""}`),name=normalize(item.name),p=point(item);
    let textScore=name===q?100:name.startsWith(q)?90:name.includes(q)?78:text.includes(q)?60:0;
    textScore+=words.filter(word=>text.includes(word)).length*8;
    if(textScore<=0)return null;
    const distanceKm=origin&&p?haversineKm(origin,p):Number(item.distanceKm);
    const routeDistanceKm=routePts.length&&p?Math.min(...routePts.map(rp=>haversineKm(rp,p))):Number(item.routeDistanceKm);
    const proximity=Number.isFinite(distanceKm)?Math.max(0,100-distanceKm*2):35;
    const routeScore=Number.isFinite(routeDistanceKm)?Math.max(0,100-routeDistanceKm*4):35;
    return {...item,distanceKm:Number.isFinite(distanceKm)?distanceKm:null,routeDistanceKm:Number.isFinite(routeDistanceKm)?routeDistanceKm:null,
      estimatedDriveMinutes:Number.isFinite(distanceKm)?Math.max(1,Math.round(distanceKm/55*60)):null,
      onRoute:Number.isFinite(routeDistanceKm)?routeDistanceKm<=8:false,
      smartScore:Math.round(textScore*.50+proximity*.30+routeScore*.20),offlineCached:true};
  }).filter(Boolean).sort((a,b)=>b.smartScore-a.smartScore||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)).slice(0,Math.max(1,Number(limit)||12));
}

export async function cacheRoutePlaces(stops=[]){
  const places=(stops||[]).map(stop=>({
    ...stop,id:stop.id||`route:${normalize(stop.name)}:${stop.lat||stop.latitude}:${stop.lng||stop.longitude}`,
    providerId:stop.providerId||"roadtrip-ai",provider:stop.provider||"RoadTrip AI Places",
    latitude:Number(stop.lat??stop.latitude),longitude:Number(stop.lng??stop.longitude),
    category:stop.type||stop.category||"attraction",offlineRoutePlace:true
  })).filter(place=>place.name&&Number.isFinite(place.latitude)&&Number.isFinite(place.longitude));
  await saveOfflinePlaces(places,{source:"active-route"});
  return places.length;
}

export async function trimOfflineCache(){
  const searches=await transaction(SEARCH_STORE,"readonly",store=>store.getAll()).catch(()=>[]);
  const remove=(searches||[]).sort((a,b)=>b.savedAt-a.savedAt).slice(80);
  if(remove.length)await transaction(SEARCH_STORE,"readwrite",store=>remove.forEach(item=>store.delete(item.key))).catch(()=>{});
  const places=await transaction(PLACE_STORE,"readonly",store=>store.getAll()).catch(()=>[]);
  const old=(places||[]).filter(item=>Date.now()-item.updatedAt>STALE_MS).slice(0,500);
  if(old.length)await transaction(PLACE_STORE,"readwrite",store=>old.forEach(item=>store.delete(item.cacheId))).catch(()=>{});
}

export async function offlineCacheStats(){
  const [searches,places]=await Promise.all([
    transaction(SEARCH_STORE,"readonly",store=>store.count()).catch(()=>0),
    transaction(PLACE_STORE,"readonly",store=>store.count()).catch(()=>0)
  ]);
  return {offlineSearches:Number(searches)||0,offlinePlaces:Number(places)||0,online:navigator.onLine};
}
