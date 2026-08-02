import {providerManager} from "./search/provider-manager.js";
import {
  getCachedSearch,setCachedSearch,addRecentSearch,
  getLocalSuggestions,cacheStats
} from "./cache.js";
import {renderLoading,renderMessage,renderRecent,renderResults} from "./ui.js";
import {
  buildSearchCacheKey,getOfflineSearch,saveOfflineSearch,findOfflinePlaces,
  cacheRoutePlaces,offlineCacheStats
} from "./search/offline-cache.js";

let config={onSelect:()=>{},onMetrics:()=>{},getContext:()=>({})};
let currentResults=[];
const asResults=value=>Array.isArray(value)?value:[];
let geoSearchEnginePromise=null;

async function loadGeoSearchEngine(){
  if(!geoSearchEnginePromise){
    geoSearchEnginePromise=import("./search/geosearch-engine.js")
      .then(module=>module.geoSearchEngine)
      .catch(error=>{
        console.warn("[RoadTrip AI] GeoSearch no disponible; se usará búsqueda estándar.",error);
        return null;
      });
  }
  return geoSearchEnginePromise;
}

const elements=()=>({
  form:document.querySelector("#smart-search-form"),
  input:document.querySelector("#smart-search-input"),
  submit:document.querySelector("#smart-search-submit"),
  feedback:document.querySelector("#smart-search-feedback"),
  results:document.querySelector("#smart-search-results"),
  status:document.querySelector("#smart-search-provider-status"),
  selected:document.querySelector("#smart-place-selected")
});

function showLocalSuggestions(){
  const {input,results,feedback}=elements();
  const suggestions=getLocalSuggestions(input.value);
  feedback.textContent=suggestions.length?"Resultados guardados en este dispositivo":"";
  renderRecent(results,suggestions,query=>{
    input.value=query;
    performSearch(query);
  });
}

async function performSearch(rawQuery){
  const query=rawQuery.trim();
  const {input,submit,feedback,results,status}=elements();
  if(query.length<3){
    renderMessage(results,"Escribe al menos 3 letras","Ejemplo: Mono Lake o hotel Sacramento.");
    return;
  }

  const started=performance.now();
  submit.disabled=true;
  input.setAttribute("aria-busy","true");
  status.textContent=navigator.onLine?"BUSCANDO":"SIN CONEXIÓN";
  status.className="smart-search-provider searching";
  renderLoading(results);
  feedback.textContent="";

  try{
    const context=await Promise.resolve(config.getContext?.()||{});
    const route=context.route||[];
    const geoSearchEngine=await loadGeoSearchEngine();
    let geoContext={
      location:context.location||(route.length?route[0]:null),
      locationSource:context.location?"gps":route.length?"ruta":"ninguna",
      city:"",state:"",radiusKm:null
    };
    if(geoSearchEngine){
      try{geoContext=await geoSearchEngine.buildContext({location:context.location,route});}
      catch(error){console.warn("[RoadTrip AI] No se pudo construir el contexto geográfico.",error);}
    }
    const location=geoContext.location;
    const key=buildSearchCacheKey(query,{location});
    let source="online",cacheEntry=null;

    if(navigator.onLine){
      cacheEntry=await getOfflineSearch(key,{allowStale:false});
      if(cacheEntry?.results?.length){
        currentResults=asResults(cacheEntry.results);
        source="caché inteligente";
      }else{
        try{
          if(geoSearchEngine){
            const geoResponse=await geoSearchEngine.search(query,{location,route,limit:12});
            currentResults=asResults(geoResponse?.results);
            Object.assign(geoContext,geoResponse.geo||{});
          }else{
            currentResults=asResults(await providerManager.search(query,{location,route,limit:12}));
          }
          if(currentResults.length){
            await saveOfflineSearch(key,query,currentResults,{location,route,geo:geoContext});
          }
        }catch(networkError){
          cacheEntry=await getOfflineSearch(key,{allowStale:true});
          currentResults=cacheEntry?.results?.length?asResults(cacheEntry.results):asResults(await findOfflinePlaces(query,{location,route,limit:12}));
          if(!currentResults.length)throw networkError;
          source="respaldo offline";
        }
      }
    }else{
      cacheEntry=await getOfflineSearch(key,{allowStale:true});
      currentResults=cacheEntry?.results?.length?asResults(cacheEntry.results):asResults(await findOfflinePlaces(query,{location,route,limit:12}));
      source="modo offline";
      if(!currentResults.length)throw new Error("No hay resultados guardados para esta búsqueda. Conéctate una vez para descargarlos.");
    }

    currentResults=asResults(currentResults);
    addRecentSearch(query);
    const elapsed=Math.round(performance.now()-started);
    status.textContent=navigator.onLine?(source==="online"?"ONLINE":"CACHÉ"):"OFFLINE";
    status.className=`smart-search-provider ${navigator.onLine?"online":"selected"}`;
    const geoLabel=geoContext.city
      ? ` · ${geoContext.city}${geoContext.radiusKm?` · radio ${geoContext.radiusKm} km`:""}`
      : geoContext.locationSource==="gps"?" · GPS":geoContext.locationSource==="ruta"?" · ruta activa":"";
    feedback.textContent=`${currentResults.length} resultado(s) · ${source}${geoLabel}${cacheEntry?.stale?" · copia anterior":""} · ${elapsed} ms`;
    renderResults(results,currentResults,async place=>{
      status.textContent="AGREGANDO";
      status.className="smart-search-provider searching";
      try{
        await config.onSelect(place);
        status.textContent="AGREGADO";
        status.className="smart-search-provider selected";
      }catch(error){
        status.textContent="ERROR";
        status.className="smart-search-provider error";
        renderMessage(results,"No se pudo agregar",error.message||"Intenta otra vez.","error");
      }
    });
    config.onMetrics({
      api:navigator.onLine?"Online":"Offline",responseMs:elapsed,results:currentResults.length,
      fromCache:source!=="online",cacheSource:source,...cacheStats(),...(await offlineCacheStats())
    });
  }catch(error){
    status.textContent=navigator.onLine?"ERROR":"OFFLINE";
    status.className="smart-search-provider error";
    renderMessage(results,navigator.onLine?"No se pudo buscar":"Sin resultados offline",error.name==="AbortError"?"La búsqueda tardó demasiado. Intenta otra vez.":error.message,"error");
    config.onMetrics({api:navigator.onLine?"Error":"Offline",lastError:error.message});
  }finally{
    submit.disabled=false;
    input.removeAttribute("aria-busy");
  }
}
export function initSmartSearch(options={}){
  config={...config,...options};
  const {form,input}=elements();
  if(!form||form.dataset.initialized==="true")return;
  form.dataset.initialized="true";
  console.info("[RoadTrip AI] Smart Search inicializado correctamente.");
  const submit=document.querySelector("#smart-search-submit");
  submit.addEventListener("click",()=>performSearch(input.value));
  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"){
      event.preventDefault();
      event.stopPropagation();
      performSearch(input.value);
    }
  });
  input.addEventListener("input",showLocalSuggestions);
  input.addEventListener("focus",showLocalSuggestions);
  const refreshNetworkStatus=()=>{
    const {status}=elements();
    if(!status)return;
    status.textContent=navigator.onLine?"LISTO":"OFFLINE";
    status.className=`smart-search-provider ${navigator.onLine?"":"selected"}`;
  };
  window.addEventListener("online",refreshNetworkStatus);
  window.addEventListener("offline",refreshNetworkStatus);
  Promise.resolve(config.getContext?.()||{}).then(context=>cacheRoutePlaces(context.stops||[])).catch(()=>{});
  refreshNetworkStatus();
  showLocalSuggestions();
}

export function resetSmartSearch(){
  const {form,input,feedback,results,status,selected}=elements();
  if(!form)return;
  input.value="";
  feedback.textContent="";
  results.innerHTML="";
  selected.classList.add("hidden");
  selected.innerHTML="";
  status.textContent="LISTO";
  status.className="smart-search-provider";
  showLocalSuggestions();
}
