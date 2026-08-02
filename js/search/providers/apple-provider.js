import {SearchProvider} from "../search-provider.js";
import {getProviderConfig} from "../provider-config.js";

function normalizeApplePlace(item){
  const coordinate=item.coordinate||item.location?.coordinate||item.location||{};
  const latitude=Number(coordinate.latitude??coordinate.lat);
  const longitude=Number(coordinate.longitude??coordinate.lng??coordinate.lon);
  const address=item.formattedAddress||item.address||item.subtitle||[
    item.thoroughfare,item.locality,item.administrativeArea,item.postCode,item.country
  ].filter(Boolean).join(", ");
  const providerId=String(item.id||item.identifier||`${latitude},${longitude}`);
  return {
    id:`apple:${providerId}`,
    providerId:"apple-maps",provider:"Apple Maps",providerPlaceId:providerId,
    name:item.name||item.title||"Lugar",displayName:address||"",address:address||"",
    latitude,longitude,lat:latitude,lng:longitude,
    city:item.locality||item.city||"",state:item.administrativeArea||item.state||"",
    country:item.country||"",countryCode:item.countryCode||"",
    category:item.pointOfInterestCategory||item.category||"place",
    type:item.pointOfInterestCategory||item.category||"place",
    rating:Number.isFinite(Number(item.rating))?Number(item.rating):null,
    isOpen:item.isOpen??null,photos:Array.isArray(item.photos)?item.photos:[],raw:item
  };
}

async function fetchProxy(url,action,payload){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{
      method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({provider:"apple",action,...payload}),signal:controller.signal
    });
    if(!response.ok)throw new Error(`Apple Maps respondió ${response.status}`);
    const data=await response.json();
    return Array.isArray(data)?data:(data.results||data.places||[]);
  }finally{clearTimeout(timeout)}
}

function mapKitSearch(query,options={}){
  return new Promise((resolve,reject)=>{
    const mapkit=globalThis.mapkit;
    if(!mapkit?.Search)return reject(new Error("MapKit JS no está inicializado."));
    const search=new mapkit.Search({language:getProviderConfig().apple.language||"es-419"});
    const coordinate=options.location
      ?new mapkit.Coordinate(Number(options.location.lat??options.location.latitude),Number(options.location.lng??options.location.longitude))
      :undefined;
    search.search(String(query||""),{coordinate},(error,data)=>{
      if(error)return reject(error);
      resolve(data?.places||data?.mapItems||[]);
    });
  });
}

export class AppleProvider extends SearchProvider{
  constructor(){
    const config=getProviderConfig().apple;
    const mapkitReady=typeof globalThis!=="undefined"&&Boolean(globalThis.mapkit?.Search);
    super({
      id:"apple-maps",name:"Apple Maps",priority:25,
      enabled:Boolean(config.enabled&&(config.proxyUrl||mapkitReady)),
      capabilities:{search:true,nearby:true,alongRoute:true,details:true,photos:false,openingHours:false,ratings:false}
    });
  }

  get config(){return getProviderConfig().apple;}

  async request(action,payload={}){
    const config=this.config;
    if(config.mode==="proxy"){
      if(!config.proxyUrl)throw new Error("Apple Maps no tiene proxy configurado.");
      return fetchProxy(config.proxyUrl,action,payload);
    }
    if(action==="getPlaceDetails")return [];
    return mapKitSearch(payload.query,{location:payload.location});
  }

  async search(query,options={}){
    const clean=String(query||"").trim();
    if(clean.length<2)return [];
    return (await this.request("search",{query:clean,options})).map(normalizeApplePlace);
  }

  async searchNearby(query,location,options={}){
    return (await this.request("searchNearby",{query,location,options})).map(normalizeApplePlace);
  }

  async searchAlongRoute(query,route,options={}){
    const points=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
    const middle=points[Math.floor(points.length/2)];
    const location=middle?{lat:middle?.lat??middle?.latitude??middle?.[1],lng:middle?.lng??middle?.longitude??middle?.[0]}:null;
    if(this.config.mode==="proxy"){
      return (await this.request("searchAlongRoute",{query,route,options})).map(normalizeApplePlace);
    }
    // MapKit JS no ofrece una búsqueda nativa por corredor; se usa el punto medio y el ProviderManager aplica ranking contra la ruta completa.
    return this.searchNearby(query,location,options);
  }

  async getPlaceDetails(placeId,options={}){
    if(this.config.mode!=="proxy")return null;
    const results=await this.request("getPlaceDetails",{placeId:String(placeId||"").replace(/^apple:/,""),options});
    const place=Array.isArray(results)?results[0]:results;
    return place?normalizeApplePlace(place):null;
  }
}

export const appleProvider=new AppleProvider();
