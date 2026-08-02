import {providerManager} from "./provider-manager.js";
import {getLiveLocation} from "./smart-ranking-engine.js";

const REVERSE_URL="https://nominatim.openstreetmap.org/reverse";
const DEFAULT_RADII=[10,25,50,100];
let lastGeoContext=null;
let lastGeoContextAt=0;

const validPoint=value=>{
  const lat=Number(value?.lat??value?.latitude);
  const lng=Number(value?.lng??value?.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng,accuracy:Number(value?.accuracy)||null}:null;
};

function routeStart(route){
  const source=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
  for(const point of source){
    const candidate=validPoint({lat:point?.lat??point?.latitude??point?.[1],lng:point?.lng??point?.longitude??point?.[0]});
    if(candidate)return candidate;
  }
  return null;
}

async function reverseGeocode(location,{language="es,en"}={}){
  const point=validPoint(location);
  if(!point||typeof navigator==="undefined"||!navigator.onLine)return null;
  const params=new URLSearchParams({
    lat:String(point.lat),lon:String(point.lng),format:"jsonv2",addressdetails:"1","accept-language":language,zoom:"12"
  });
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetch(`${REVERSE_URL}?${params}`,{headers:{Accept:"application/json"},signal:controller.signal});
    if(!response.ok)return null;
    const data=await response.json();
    const address=data?.address||{};
    return {
      city:address.city||address.town||address.village||address.municipality||address.county||"",
      state:address.state||address.region||"",
      country:address.country||"",
      countryCode:(address.country_code||"").toUpperCase(),
      displayName:data?.display_name||""
    };
  }catch{return null}
  finally{clearTimeout(timeout)}
}

function cityQuery(query,place){
  const parts=[query,place?.city,place?.state].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function toResults(value){return Array.isArray(value)?value:[]}

function enoughResults(results,minResults){
  return toResults(results).length>=Math.max(1,Number(minResults)||3);
}

export async function buildGeoSearchContext({location,route,language="es,en",maximumAge=120000}={}){
  if(lastGeoContext&&Date.now()-lastGeoContextAt<maximumAge&&!location)return lastGeoContext;
  const supplied=validPoint(location);
  const live=supplied||await getLiveLocation({maximumAge});
  const fallback=routeStart(route);
  const origin=live||fallback||null;
  const place=origin?await reverseGeocode(origin,{language}):null;
  const context={
    location:origin,
    locationSource:supplied?"app":live?"gps":fallback?"ruta":"ninguna",
    city:place?.city||"",
    state:place?.state||"",
    country:place?.country||"",
    countryCode:place?.countryCode||"",
    displayName:place?.displayName||""
  };
  if(origin){lastGeoContext=context;lastGeoContextAt=Date.now();}
  return context;
}

export async function geoSearch(query,{
  location,route,limit=12,language="es,en",radii=DEFAULT_RADII,minResults=3,allowNationalFallback=true
}={}){
  const geo=await buildGeoSearchContext({location,route,language});
  const collected=[];
  const seen=new Set();
  const add=items=>{
    for(const item of toResults(items)){
      const key=item.id||`${item.name}|${item.latitude}|${item.longitude}`;
      if(!seen.has(key)){seen.add(key);collected.push(item);}
    }
  };

  let usedRadius=null;
  if(geo.location){
    for(const radiusKm of radii){
      try{
        const nearby=await providerManager.searchNearby(query,geo.location,{location:geo.location,route,radiusKm,limit,language});
        add(nearby);
        usedRadius=radiusKm;
        if(enoughResults(collected,minResults))break;
      }catch(error){console.warn(`[GeoSearch] radio ${radiusKm} km falló`,error);}
    }
  }

  // Una consulta enriquecida con ciudad ayuda a Nominatim con cadenas comerciales.
  if(!enoughResults(collected,minResults)&&geo.city){
    try{
      const byCity=await providerManager.search(cityQuery(query,geo),{
        location:geo.location,route,limit,language,geoCity:geo.city,geoState:geo.state,skipGlobal:false
      });
      add(byCity);
    }catch(error){console.warn("[GeoSearch] búsqueda por ciudad falló",error);}
  }

  if((!collected.length||!enoughResults(collected,minResults))&&allowNationalFallback){
    try{add(await providerManager.search(query,{location:geo.location,route,limit,language}));}
    catch(error){if(!collected.length)throw error;}
  }

  const deduplicated=providerManager.deduplicate(toResults(collected));
  const ranked=toResults(providerManager.rank(deduplicated,query,{location:geo.location,route,limit}));
  return {
    results:ranked,
    geo:{...geo,radiusKm:usedRadius,queryMode:geo.location?"geo":"global"}
  };
}

export const geoSearchEngine={buildContext:buildGeoSearchContext,search:geoSearch};
