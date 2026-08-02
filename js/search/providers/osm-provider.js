import {SearchProvider} from "../search-provider.js";

const NOMINATIM_SEARCH_URL="https://nominatim.openstreetmap.org/search";
const NOMINATIM_LOOKUP_URL="https://nominatim.openstreetmap.org/lookup";
const MIN_REQUEST_INTERVAL=1100;
let lastRequestAt=0;

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function throttle(){
  const elapsed=Date.now()-lastRequestAt;
  if(elapsed<MIN_REQUEST_INTERVAL) await wait(MIN_REQUEST_INTERVAL-elapsed);
  lastRequestAt=Date.now();
}

async function fetchJson(url){
  await throttle();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal});
    if(!response.ok) throw new Error(`OpenStreetMap respondió ${response.status}`);
    return await response.json();
  }finally{
    clearTimeout(timeout);
  }
}

function normalizeOsmPlace(item){
  const address=item.address||{};
  return {
    id:`osm:${item.osm_type||"place"}:${item.osm_id||item.place_id}`,
    providerId:"openstreetmap",
    provider:"OpenStreetMap",
    providerPlaceId:String(item.place_id??item.osm_id??""),
    osmType:item.osm_type||"",
    osmId:item.osm_id??null,
    name:item.name||item.namedetails?.name||item.display_name?.split(",")[0]||"Lugar",
    displayName:item.display_name||"",
    address:item.display_name||"",
    latitude:Number(item.lat),
    longitude:Number(item.lon),
    lat:Number(item.lat),
    lng:Number(item.lon),
    category:item.category||item.class||"place",
    type:item.type||"place",
    importance:Number(item.importance||0),
    rating:null,
    isOpen:null,
    photos:[],
    city:address.city||address.town||address.village||address.municipality||"",
    county:address.county||"",
    state:address.state||address.region||"",
    country:address.country||"",
    countryCode:(address.country_code||"").toUpperCase(),
    postcode:address.postcode||"",
    boundingBox:Array.isArray(item.boundingbox)?item.boundingbox.map(Number):null,
    extraTags:item.extratags||{},
    fee:item.extratags?.fee||"",
    access:item.extratags?.access||"",
    operator:item.extratags?.operator||"",
    capacity:item.extratags?.capacity||"",
    parking:item.extratags?.parking||"",
    raw:item
  };
}

export class OSMProvider extends SearchProvider {
  constructor(){
    super({
      id:"openstreetmap",
      name:"OpenStreetMap",
      priority:10,
      capabilities:{search:true,nearby:true,alongRoute:true,details:true}
    });
  }

  async search(query,{limit=8,language="es,en",viewbox,bounded=false}={}){
    const clean=String(query||"").trim();
    if(clean.length<3) return [];
    const params=new URLSearchParams({
      q:clean,format:"jsonv2",addressdetails:"1",namedetails:"1",extratags:"1",
      limit:String(Math.min(Math.max(Number(limit)||8,1),10)),dedupe:"1","accept-language":language
    });
    if(viewbox) params.set("viewbox",Array.isArray(viewbox)?viewbox.join(","):String(viewbox));
    if(bounded) params.set("bounded","1");
    const data=await fetchJson(`${NOMINATIM_SEARCH_URL}?${params}`);
    return Array.isArray(data)?data.map(normalizeOsmPlace):[];
  }

  async searchNearby(query,location,{radiusKm=25,limit=8,language="es,en"}={}){
    const lat=Number(location?.lat??location?.latitude);
    const lng=Number(location?.lng??location?.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return this.search(query,{limit,language});
    const latDelta=Math.max(0.01,Number(radiusKm)||25)/111;
    const lngDelta=latDelta/Math.max(Math.cos(lat*Math.PI/180),0.2);
    return this.search(query,{
      limit,language,bounded:true,
      viewbox:[lng-lngDelta,lat+latDelta,lng+lngDelta,lat-latDelta]
    });
  }

  async searchAlongRoute(query,route,{limit=8,language="es,en"}={}){
    const points=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
    const valid=points.map(point=>({
      lat:Number(point?.lat??point?.latitude??point?.[1]),
      lng:Number(point?.lng??point?.longitude??point?.[0])
    })).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lng));
    if(!valid.length) return this.search(query,{limit,language});
    const minLat=Math.min(...valid.map(p=>p.lat));
    const maxLat=Math.max(...valid.map(p=>p.lat));
    const minLng=Math.min(...valid.map(p=>p.lng));
    const maxLng=Math.max(...valid.map(p=>p.lng));
    const padding=0.25;
    return this.search(query,{limit,language,bounded:true,viewbox:[minLng-padding,maxLat+padding,maxLng+padding,minLat-padding]});
  }

  async getPlaceDetails(placeId,{language="es,en"}={}){
    const text=String(placeId||"");
    const match=text.match(/osm:([a-z_]+):(\d+)/i);
    if(!match) return null;
    const prefix={node:"N",way:"W",relation:"R"}[match[1].toLowerCase()];
    if(!prefix) return null;
    const params=new URLSearchParams({osm_ids:`${prefix}${match[2]}`,format:"jsonv2",addressdetails:"1",namedetails:"1",extratags:"1","accept-language":language});
    const data=await fetchJson(`${NOMINATIM_LOOKUP_URL}?${params}`);
    return Array.isArray(data)&&data[0]?normalizeOsmPlace(data[0]):null;
  }
}

export const osmProvider=new OSMProvider();
