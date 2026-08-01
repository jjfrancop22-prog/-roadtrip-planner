let panel;
let state={version:"2.3.0-A1",api:"Sin consulta",results:0,responseMs:"—",entries:0,recents:0};
let getStats=()=>({});

function render(){
  if(!panel)return;
  const stats=getStats();
  panel.querySelector(".dev-panel-body").innerHTML=`
    <div><span>Versión</span><strong>${state.version}</strong></div>
    <div><span>OpenStreetMap</span><strong>${state.api||"Sin consulta"}</strong></div>
    <div><span>Respuesta</span><strong>${state.responseMs==="—"?"—":`${state.responseMs} ms`}</strong></div>
    <div><span>Resultados</span><strong>${state.results??0}</strong></div>
    <div><span>Caché</span><strong>${state.entries??0}</strong></div>
    <div><span>Recientes</span><strong>${state.recents??0}</strong></div>
    <div><span>Días / paradas</span><strong>${stats.days??0} / ${stats.stops??0}</strong></div>
    <div><span>LocalStorage</span><strong>${stats.localStorage||"—"}</strong></div>`;
}
export function initDevPanel(options={}){
  state.version=options.version||state.version;
  getStats=options.getStats||getStats;
  if(location.hostname!=="localhost"&&location.hostname!=="127.0.0.1")return;
  panel=document.createElement("aside");
  panel.className="dev-panel collapsed";
  panel.innerHTML=`<button class="dev-panel-toggle" type="button">🛠</button><section><header><strong>RoadTrip Dev</strong><button type="button" class="dev-panel-close">×</button></header><div class="dev-panel-body"></div></section>`;
  document.body.appendChild(panel);
  panel.querySelector(".dev-panel-toggle").onclick=()=>panel.classList.remove("collapsed");
  panel.querySelector(".dev-panel-close").onclick=()=>panel.classList.add("collapsed");
  render();
}
export function updateDevPanel(metrics={}){
  state={...state,...metrics};
  render();
}
