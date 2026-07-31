
import {load,save} from "./storage.js";
import {seed} from "./seed.js";
import {mapsUrl,haversine} from "./maps.js";

let state=load()||structuredClone(seed);
const allStops=()=>state.trip.days.flatMap(d=>d.stops.map(s=>({...s,dayId:d.id,dayTitle:d.title,date:d.date})));
const nextStop=()=>allStops().find(s=>!s.completed)||null;
const progress=()=>{const s=allStops();return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):0};
const map=L.map("map",{zoomControl:false}).setView([36.12,-115.17],12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
L.control.zoom({position:"topright"}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);
let userMarker=null,routeLine=null,currentWeather=null,photoCache={};

function icon(stop,isNext){
 const cls=`marker-pin ${stop.completed?"done":""} ${isNext?"next":""}`;
 return L.divIcon({html:`<div class="${cls}">${stop.icon}</div>`,className:"",iconSize:isNext?[46,46]:[38,38],iconAnchor:isNext?[23,23]:[19,19]});
}
function drawMap(){
 markerLayer.clearLayers();const stops=allStops(),next=nextStop(),pts=[];
 stops.forEach(s=>{const m=L.marker([s.lat,s.lng],{icon:icon(s,next?.id===s.id)}).addTo(markerLayer);m.on("click",()=>renderSheet(s));pts.push([s.lat,s.lng])});
 if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(pts,{color:"#0a84ff",weight:5,opacity:.72,dashArray:"8 9"}).addTo(map);
 if(next)map.flyTo([next.lat,next.lng],13,{duration:.8});
}
const weatherCodes={0:"Despejado",1:"Mayormente despejado",2:"Parcialmente nublado",3:"Nublado",45:"Niebla",48:"Niebla helada",51:"Llovizna ligera",53:"Llovizna",55:"Llovizna intensa",61:"Lluvia ligera",63:"Lluvia",65:"Lluvia intensa",71:"Nieve ligera",73:"Nieve",75:"Nieve intensa",80:"Chubascos",81:"Chubascos",82:"Chubascos intensos",95:"Tormenta"};
async function fetchWeather(stop){
 try{
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${stop.lat}&longitude=${stop.lng}&current=temperature_2m,apparent_temperature,weather_code&temperature_unit=fahrenheit&timezone=auto`;
  const r=await fetch(u);if(!r.ok)throw new Error("weather");const d=await r.json();
  currentWeather={temp:Math.round(d.current.temperature_2m),feels:Math.round(d.current.apparent_temperature),condition:weatherCodes[d.current.weather_code]||"Condición variable"};
 }catch{currentWeather=null}
}
async function fetchPhoto(stop){
 if(photoCache[stop.id])return photoCache[stop.id];
 try{
  const q=encodeURIComponent(stop.photoQuery);const u=`https://en.wikipedia.org/w/api.php?action=query&origin=*&generator=search&gsrsearch=${q}&gsrlimit=1&prop=pageimages&pithumbsize=900&format=json`;
  const r=await fetch(u);const d=await r.json();const page=Object.values(d.query?.pages||{})[0];photoCache[stop.id]=page?.thumbnail?.source||"";return photoCache[stop.id];
 }catch{return ""}
}
function timeUntil(stop){
 const now=new Date(),[h,m]=(stop.time||"00:00").split(":").map(Number),target=new Date();
 target.setHours(h,m,0,0);let mins=Math.round((target-now)/60000);
 if(mins<0)return "Horario superado";if(mins<60)return `${mins} min`;return `${Math.floor(mins/60)} h ${mins%60} min`;
}
async function renderSheet(stop=nextStop()){
 if(!stop){document.querySelector("#sheet-content").innerHTML=`<div class=sheet-inner><div class=eyebrow>VIAJE COMPLETADO</div><h2 class=sheet-title>🎉 Todas las paradas listas</h2></div>`;return}
 const status=document.querySelector("#status-pill");status.textContent="Actualizando clima y fotografía…";
 await Promise.all([fetchWeather(stop),fetchPhoto(stop)]);
 const miles=haversine(state.userLocation,{lat:stop.lat,lng:stop.lng}),pct=progress(),photo=photoCache[stop.id];
 document.querySelector("#sheet-content").innerHTML=`<div class=sheet-inner>
  <div class=eyebrow>${stop.id===nextStop()?.id?"PRÓXIMA PARADA":"PARADA DEL VIAJE"}</div>
  <h2 class=sheet-title>${stop.icon} ${stop.name}</h2>
  <div class=sheet-meta>⏰ ${stop.time} · ${stop.dayTitle}</div>
  <div class=metric-row>
   <div class=metric><strong>${miles==null?"—":miles.toFixed(1)+" mi"}</strong><span>Distancia recta</span></div>
   <div class=metric><strong>${timeUntil(stop)}</strong><span>Hasta horario</span></div>
   <div class=metric><strong>${currentWeather?currentWeather.temp+"°F":"—"}</strong><span>${currentWeather?currentWeather.condition:"Clima"}</span></div>
  </div>
  <div class=progress><i style="width:${pct}%"></i></div>
  ${photo?`<div class=photo><img src="${photo}" alt="Fotografía de ${stop.name}"><div class=photo-label>📸 Referencia visual del destino</div></div>`:""}
  <div class=info-block><strong>📸 Consejo para la fotografía</strong>${stop.tip}</div>
  <div class=info-block><strong>🅿️ Estacionamiento</strong>${stop.parking}</div>
  ${currentWeather?`<div class=info-block><strong>🌤 Clima actual</strong>${currentWeather.temp}°F, sensación ${currentWeather.feels}°F · ${currentWeather.condition}</div>`:""}
  <div class=sheet-actions><button class="button secondary" data-complete="${stop.dayId}|${stop.id}">${stop.completed?"↩ Reabrir":"✓ Completar"}</button><a class="button primary" target=_blank href="${mapsUrl(stop.address)}">🚗 Navegar</a></div>
 </div>`;
 status.textContent=state.userLocation?`Ubicación activa · ${pct}% completado`:`Activa “Estoy aquí” para distancia · ${pct}% completado`;
 bindSheet();
}
function bindSheet(){document.querySelectorAll("[data-complete]").forEach(b=>b.onclick=()=>{const[d,s]=b.dataset.complete.split("|"),day=state.trip.days.find(x=>x.id===d),stop=day.stops.find(x=>x.id===s);stop.completed=!stop.completed;save(state);drawMap();renderSheet(nextStop()||stop);renderTimeline()})}
function renderTimeline(){
 document.querySelector("#timeline-content").innerHTML=state.trip.days.map(day=>`<section class=day><h3>${day.title}</h3>${day.stops.map(s=>`<div class="timeline-item ${s.completed?"done":""}"><input type=checkbox data-timeline="${day.id}|${s.id}" ${s.completed?"checked":""}><div><strong>${s.icon} ${s.name}</strong><small>${s.time} · ${s.address}</small></div><a class=mini-nav target=_blank href="${mapsUrl(s.address)}">Ir</a></div>`).join("")}</section>`).join("");
 document.querySelectorAll("[data-timeline]").forEach(b=>b.onchange=()=>{const[d,s]=b.dataset.timeline.split("|"),stop=state.trip.days.find(x=>x.id===d).stops.find(x=>x.id===s);stop.completed=b.checked;save(state);drawMap();renderTimeline();renderSheet(nextStop()||stop)})
}
document.querySelector("#location-button").onclick=()=>{
 const pill=document.querySelector("#status-pill");if(!navigator.geolocation){pill.textContent="Ubicación no disponible";return}
 pill.textContent="Buscando tu ubicación…";
 navigator.geolocation.getCurrentPosition(pos=>{
  state.userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};save(state);
  if(userMarker)map.removeLayer(userMarker);
  userMarker=L.circleMarker([state.userLocation.lat,state.userLocation.lng],{radius:9,color:"white",weight:4,fillColor:"#0a84ff",fillOpacity:1}).addTo(map);
  map.flyTo([state.userLocation.lat,state.userLocation.lng],14);renderSheet(nextStop());pill.textContent="Ubicación encontrada";
 },err=>{pill.textContent=err.code===1?"Permiso de ubicación rechazado":"No se pudo obtener la ubicación"},{enableHighAccuracy:true,timeout:12000,maximumAge:30000})
};
document.querySelector("#timeline-button").onclick=()=>{renderTimeline();document.querySelector("#timeline-dialog").showModal()};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.querySelector("#"+b.dataset.close).close());
document.querySelector("#continue-button").onclick=()=>{const n=nextStop();if(n)window.open(mapsUrl(n.address),"_blank")};
document.querySelector("#trip-name").textContent=state.trip.name;
drawMap();renderSheet();renderTimeline();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
