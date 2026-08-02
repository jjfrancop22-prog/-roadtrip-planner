import {SearchProvider} from "../search-provider.js";
import {getProviderConfig} from "../provider-config.js";

const TEXT_SEARCH_URL="https://places.googleapis.com/v1/places:searchText";
const NEARBY_SEARCH_URL="https://places.googleapis.com/v1/places:searchNearby";
const FIELD_MASK=[
  "places.id","places.displayName","places.formattedAddress","places.location",
  "places.primaryType","places.types","places.rating","places.userRatingCount",
  "places.currentOpeningHours.openNow","places.photos","places.addressComponents"
].join(",");

function componentValue(components=[],type){
  const item=components.find(component=>(component.types||[]).includes(type));
  return item?.longText||item?.shortText||"";
}

function normalizeGooglePlace(place){
  const location=place.location||{};
  const photos=(place.photos||[]).map(photo=>photo.name).filter(Boolean);
  return {
    id:`google:${place.id}`,
    providerId:"google-places",
    provider:"Google Places",
    providerPlaceId:place.id,
    name:place.displayName?.text||place.name||"Lugar",
    displayName:place.formattedAddress||"",
    address:place.formattedAddress||"",
    latitude:Number(location.latitude),longitude:Number(location.longitude),
    lat:Number(location.latitude),lng:Number(location.longitude),
    category:place.primaryType||place.types?.[0]||"place",
    type:place.primaryType||place.types?.[0]||"place",
    rating:Number.isFinite(Number(place.rating))?Number(place.rating):null,
    ratingCount:Number(place.userRatingCount)||0,
    isOpen:place.currentOpeningHours?.openNow??null,
    photos,
    city:componentValue(place.addressComponents,"locality"),
    state:componentValue(place.addressComponents,"administrative_area_level_1"),
    country:componentValue(place.addressComponents,"country"),
    countryCode:(place.addressComponents||[]).find(component=>(component.types||[]).includes("country"))?.shortText||"",
    raw:place
  };
}

async function fetchJson(url,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    if(!response.ok)throw new Error(`Google Places respondió ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timeout)}
}

function cleanLocation(location){
  const latitude=Number(location?.lat??location?.latitude);
  const longitude=Number(location?.lng??location?.longitude);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null;
}

export class GoogleProvider extends SearchProvider{
  constructor(){
    const config=getProviderConfig().google;
    super({
      id:"google-places",name:"Google Places",priority:20,
      enabled:Boolean(config.enabled&&(config.proxyUrl||config.apiKey)),
      capabilities:{search:true,nearby:true,alongRoute:true,details:true,photos:true,openingHours:true,ratings:true}
    });
  }

  get config(){return getProviderConfig().google;}

  async proxy(action,payload={}){
    const {proxyUrl}=this.config;
    if(!proxyUrl)throw new Error("Google Places no tiene proxy configurado.");
    const data=await fetchJson(proxyUrl,{
      method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({provider:"google",action,...payload})
    });
    return Array.isArray(data)?data:(data.results||data.places||[]);
  }

  async directText(query,{limit=12,location}={}){
    const config=this.config;
    if(!config.apiKey)throw new Error("Google Places no tiene API key configurada.");
    const body={
      textQuery:String(query||"").trim(),
      maxResultCount:Math.min(Math.max(Number(limit)||12,1),20),
      languageCode:config.languageCode||"es",
      regionCode:config.regionCode||"US"
    };
    const point=cleanLocation(location);
    if(point)body.locationBias={circle:{center:point,radius:50000}};
    const data=await fetchJson(TEXT_SEARCH_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Goog-Api-Key":config.apiKey,"X-Goog-FieldMask":FIELD_MASK},
      body:JSON.stringify(body)
    });
    return data.places||[];
  }

  async search(query,options={}){
    const clean=String(query||"").trim();
    if(clean.length<2)return [];
    const config=this.config;
    const places=config.mode==="direct"
      ?await this.directText(clean,options)
      :await this.proxy("search",{query:clean,options});
    return places.map(normalizeGooglePlace);
  }

  async searchNearby(query,location,options={}){
    const config=this.config;
    if(config.mode!=="direct"){
      const places=await this.proxy("searchNearby",{query,location,options});
      return places.map(normalizeGooglePlace);
    }
    // Text Search con sesgo geográfico ofrece mejores resultados para marcas/nombres.
    return this.search(query,{...options,location});
  }

  async searchAlongRoute(query,route,options={}){
    const points=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
    const valid=points.map(point=>cleanLocation({lat:point?.lat??point?.latitude??point?.[1],lng:point?.lng??point?.longitude??point?.[0]})).filter(Boolean);
    if(!valid.length)return this.search(query,options);
    if(this.config.mode!=="direct"){
      const places=await this.proxy("searchAlongRoute",{query,route,options});
      return places.map(normalizeGooglePlace);
    }
    // Para modo directo se usa el punto medio como sesgo; ProviderManager aplica el ranking final contra toda la ruta.
    const midpoint=valid[Math.floor(valid.length/2)];
    return this.search(query,{...options,location:{lat:midpoint.latitude,lng:midpoint.longitude}});
  }

  async getPlaceDetails(placeId,options={}){
    const id=String(placeId||"").replace(/^google:/,"");
    if(!id)return null;
    const config=this.config;
    if(config.mode!=="direct"){
      const result=await this.proxy("getPlaceDetails",{placeId:id,options});
      const place=Array.isArray(result)?result[0]:result;
      return place?normalizeGooglePlace(place):null;
    }
    if(!config.apiKey)throw new Error("Google Places no tiene API key configurada.");
    const fields=FIELD_MASK.replaceAll("places.","");
    const data=await fetchJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,{
      headers:{"Accept":"application/json","X-Goog-Api-Key":config.apiKey,"X-Goog-FieldMask":fields}
    });
    return normalizeGooglePlace(data);
  }
}

export const googleProvider=new GoogleProvider();
