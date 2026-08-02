import {rankSearchResults} from "./smart-ranking-engine.js";
import {assertSearchProvider} from "./search-provider.js";
import {osmProvider} from "./providers/osm-provider.js";
import {roadTripProvider} from "./providers/roadtrip-provider.js";
import {googleProvider} from "./providers/google-provider.js";
import {appleProvider} from "./providers/apple-provider.js";
import {providerConfigStatus} from "./provider-config.js";

const normalizeText=value=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g," ").trim();

const haversineKm=(a,b)=>{
  const R=6371,toRad=value=>value*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
};

function validPoint(value){
  const point={lat:Number(value?.lat??value?.latitude),lng:Number(value?.lng??value?.longitude)};
  return Number.isFinite(point.lat)&&Number.isFinite(point.lng)?point:null;
}

function routePoints(route){
  const source=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
  return source.map(point=>validPoint({lat:point?.lat??point?.latitude??point?.[1],lng:point?.lng??point?.longitude??point?.[0]})).filter(Boolean);
}

class ProviderManager {
  constructor(){this.providers=new Map();this.primaryProviderId=null;}

  register(provider,{primary=false}={}){
    assertSearchProvider(provider);this.providers.set(provider.id,provider);
    if(primary||!this.primaryProviderId)this.primaryProviderId=provider.id;
    return this;
  }
  unregister(providerId){this.providers.delete(providerId);if(this.primaryProviderId===providerId)this.primaryProviderId=this.getAvailableProviders()[0]?.id||null;}
  setPrimary(providerId){if(!this.providers.has(providerId))throw new Error(`Proveedor no registrado: ${providerId}`);this.primaryProviderId=providerId;}
  getProvider(providerId=this.primaryProviderId){const provider=this.providers.get(providerId);if(!provider||provider.enabled===false)throw new Error(`Proveedor no disponible: ${providerId||"ninguno"}`);return provider;}
  getAvailableProviders(){return [...this.providers.values()].filter(provider=>provider.enabled!==false).sort((a,b)=>a.priority-b.priority);}
  getStatus(){return {primary:this.primaryProviderId,config:providerConfigStatus(),providers:[...this.providers.values()].map(provider=>({id:provider.id,name:provider.name,enabled:provider.enabled!==false,priority:provider.priority,capabilities:{...provider.capabilities}}))};}

  normalize(item,provider){
    if(item==null)return item;
    const lat=Number(item.latitude??item.lat),lng=Number(item.longitude??item.lng);
    return {
      id:item.id||`${provider.id}:${item.providerPlaceId||crypto.randomUUID?.()||Date.now()}`,
      providerId:item.providerId||provider.id,provider:item.provider||provider.name,
      providerPlaceId:item.providerPlaceId||item.placeId||null,name:item.name||"Lugar",
      displayName:item.displayName||item.address||"",address:item.address||item.displayName||"",
      latitude:lat,longitude:lng,lat,lng,city:item.city||"",state:item.state||"",country:item.country||"",
      countryCode:item.countryCode||"",category:item.category||"place",type:item.type||"place",
      rating:item.rating??null,isOpen:item.isOpen??null,photos:Array.isArray(item.photos)?item.photos:[],...item
    };
  }

  async execute(method,args=[],{providerId,fallback=true}={}){
    const preferred=providerId?this.getProvider(providerId):this.getProvider();
    const ordered=[preferred,...this.getAvailableProviders().filter(provider=>provider.id!==preferred.id)];
    let lastError=null;
    for(const provider of ordered){
      if(provider.capabilities&&provider.capabilities[method]===false)continue;
      try{const result=await provider[method](...args);return Array.isArray(result)?result.map(item=>this.normalize(item,provider)):this.normalize(result,provider);}
      catch(error){lastError=error;console.warn(`[ProviderManager] ${provider.name}.${method} falló`,error);if(!fallback)break;}
    }
    throw lastError||new Error(`Ningún proveedor pudo ejecutar ${method}().`);
  }

  async executeAll(method,args=[],options={}){
    const providers=this.getAvailableProviders().filter(provider=>provider.capabilities?.[method]!==false);
    const settled=await Promise.allSettled(providers.map(async provider=>{
      const result=await provider[method](...args);
      return (Array.isArray(result)?result:[result]).filter(Boolean).map(item=>this.normalize(item,provider));
    }));
    const results=[];let errors=0;
    settled.forEach((entry,index)=>{
      if(entry.status==="fulfilled")results.push(...entry.value);
      else{errors++;console.warn(`[ProviderManager] ${providers[index]?.name}.${method} falló`,entry.reason);}
    });
    if(!results.length&&errors===settled.length)throw new Error("Ningún proveedor de búsqueda respondió.");
    return results;
  }

  deduplicate(items,{distanceMeters=250}={}){
    const output=[];
    for(const item of items){
      const name=normalizeText(item.name);
      const point=validPoint(item);
      const duplicate=output.find(existing=>{
        const sameName=normalizeText(existing.name)===name||normalizeText(existing.name).includes(name)||name.includes(normalizeText(existing.name));
        if(!sameName)return false;
        const other=validPoint(existing);
        return point&&other?haversineKm(point,other)*1000<=distanceMeters:normalizeText(existing.address)===normalizeText(item.address);
      });
      if(!duplicate){output.push({...item,sources:[item.provider]});continue;}
      const preferred=(item.providerId==="roadtrip-ai"&&!duplicate.providerIds?.includes("roadtrip-ai"))?item:duplicate;
      const secondary=preferred===item?duplicate:item;
      Object.assign(duplicate,{...secondary,...preferred,
        photos:[...new Set([...(duplicate.photos||[]),...(item.photos||[])])],
        sources:[...new Set([...(duplicate.sources||[duplicate.provider]),item.provider])],
        providerIds:[...new Set([...(duplicate.providerIds||[duplicate.providerId]),item.providerId])]
      });
    }
    return output;
  }

  rank(items,query,options={}){return rankSearchResults(items,query,options);}

  async search(query,options={}){
    const requested=Math.max(12,(Number(options.limit)||12)*2);
    const batches=[];
    // Búsqueda general para conservar cobertura nacional.
    batches.push(this.executeAll("search",[query,{...options,limit:requested}],options));
    // Búsqueda delimitada: es la que hace aparecer primero lo que está cerca.
    if(validPoint(options.location))
      batches.push(this.executeAll("searchNearby",[query,options.location,{...options,radiusKm:50,limit:requested}],options));
    // Si no hay GPS o existe una ruta activa, consulta también su corredor.
    if(routePoints(options.route).length)
      batches.push(this.executeAll("searchAlongRoute",[query,options.route,{...options,limit:requested}],options));
    const settled=await Promise.allSettled(batches);
    const raw=settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);
    if(!raw.length){
      const rejected=settled.find(x=>x.status==="rejected");
      throw rejected?.reason||new Error("Ningún proveedor de búsqueda respondió.");
    }
    return this.rank(this.deduplicate(raw),query,options);
  }
  async searchNearby(query,location,options={}){
    const raw=await this.executeAll("searchNearby",[query,location,{...options,limit:Math.max(12,(Number(options.limit)||12)*2)}],options);
    return this.rank(this.deduplicate(raw),query,{...options,location});
  }
  async searchAlongRoute(query,route,options={}){
    const raw=await this.executeAll("searchAlongRoute",[query,route,{...options,limit:Math.max(12,(Number(options.limit)||12)*2)}],options);
    return this.rank(this.deduplicate(raw),query,{...options,route});
  }
  getPlaceDetails(placeId,options={}){return this.execute("getPlaceDetails",[placeId,options],options);}
}

export const providerManager=new ProviderManager()
  .register(osmProvider,{primary:true})
  .register(roadTripProvider)
  .register(googleProvider)
  .register(appleProvider);
export {ProviderManager};
