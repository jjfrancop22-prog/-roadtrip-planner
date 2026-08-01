import {searchNominatim} from "./api.js";
import {
  getCachedSearch,setCachedSearch,addRecentSearch,
  getLocalSuggestions,cacheStats
} from "./cache.js";
import {renderLoading,renderMessage,renderRecent,renderResults} from "./ui.js";

let config={onSelect:()=>{},onMetrics:()=>{}};
let currentResults=[];

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
  status.textContent="BUSCANDO";
  status.className="smart-search-provider searching";
  renderLoading(results);
  feedback.textContent="";

  try{
    const cached=getCachedSearch(query);
    let fromCache=Boolean(cached);
    currentResults=cached||await searchNominatim(query);
    if(!cached)setCachedSearch(query,currentResults);
    addRecentSearch(query);

    const elapsed=Math.round(performance.now()-started);
    status.textContent="ONLINE";
    status.className="smart-search-provider online";
    feedback.textContent=`${currentResults.length} resultado(s) · ${fromCache?"caché local":`${elapsed} ms`}`;
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
      api:"Online",
      responseMs:elapsed,
      results:currentResults.length,
      fromCache,
      ...cacheStats()
    });
  }catch(error){
    status.textContent="ERROR";
    status.className="smart-search-provider error";
    renderMessage(results,"No se pudo buscar",error.name==="AbortError"?"La búsqueda tardó demasiado. Intenta otra vez.":error.message,"error");
    config.onMetrics({api:"Error",lastError:error.message});
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
