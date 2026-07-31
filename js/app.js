
import {load,save} from "./storage.js";
import {seed} from "./seed.js";
import {mapsUrl,haversine} from "./maps.js";

let state=load()||structuredClone(seed);
let activeTrip=state.trips.find(t=>t.id===state.selectedTripId)||state.trips[0];
let userLocation=null,photoCache={},userMarker=null,routeLine=null,currentWeather=null;
const map=L.map("map",{zoomControl:false}).setView([36.12,-115.17],12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
L.control.zoom({position:"topright"}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

const allStops=()=>activeTrip.days.flatMap(d=>d.stops.map(s=>({...s,dayId:d.id,dayTitle:d.title,date:d.date})));
const nextStop=()=>allStops().find(s=>!s.completed)||null;
const progress=()=>{const s=allStops();return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):0};

function markerIcon(stop,isNext){
  return L.divIcon({
    html:`<div class="marker-pin ${stop.completed?"done":""} ${isNext?"next":""}">${stop.icon}</div>`,
    className:"",
    iconSize:isNext?[48,48]:[38,38],
    iconAnchor:isNext?[24,24]:[19,19]
  });
}

function drawMap(){
  markerLayer.clearLayers();
  const stops=allStops(),next=nextStop(),pts=[];
  stops.forEach(stop=>{
    if(typeof stop.lat!=="number"||typeof stop.lng!=="number")return;
    const marker=L.marker([stop.lat,stop.lng],{icon:markerIcon(stop,next?.id===stop.id)}).addTo(markerLayer);
    marker.on("click",()=>renderSheet(stop));
    pts.push([stop.lat,stop.lng]);
  });
  if(routeLine)map.removeLayer(routeLine);
  if(pts.length>1)routeLine=L.polyline(pts,{color:"#0a84ff",weight:5,opacity:.74,dashArray:"8 9"}).addTo(map);
  if(next&&typeof next.lat==="number")map.flyTo([next.lat,next.lng],13,{duration:.8});
}

const weatherCodes={0:"Despejado",1:"Mayormente despejado",2:"Parcialmente nublado",3:"Nublado",45:"Niebla",48:"Niebla helada",51:"Llovizna ligera",53:"Llovizna",55:"Llovizna intensa",61:"Lluvia ligera",63:"Lluvia",65:"Lluvia intensa",71:"Nieve ligera",73:"Nieve",75:"Nieve intensa",80:"Chubascos",81:"Chubascos",82:"Chubascos intensos",95:"Tormenta"};

async function fetchWeather(stop){
  currentWeather=null;
  if(typeof stop.lat!=="number")return;
  try{
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${stop.lat}&longitude=${stop.lng}&current=temperature_2m,apparent_temperature,weather_code&temperature_unit=fahrenheit&timezone=auto`;
    const r=await fetch(u);if(!r.ok)throw new Error("weather");
    const d=await r.json();
    currentWeather={temp:Math.round(d.current.temperature_2m),feels:Math.round(d.current.apparent_temperature),condition:weatherCodes[d.current.weather_code]||"Condición variable"};
  }catch{}
}

async function fetchPhoto(stop){
  if(photoCache[stop.id])return photoCache[stop.id];
  try{
    const q=encodeURIComponent(stop.photoQuery||stop.name);
    const u=`https://en.wikipedia.org/w/api.php?action=query&origin=*&generator=search&gsrsearch=${q}&gsrlimit=1&prop=pageimages&pithumbsize=1000&format=json`;
    const r=await fetch(u),d=await r.json(),page=Object.values(d.query?.pages||{})[0];
    photoCache[stop.id]=page?.thumbnail?.source||"";
    return photoCache[stop.id];
  }catch{return ""}
}

function timeText(stop){
  const [h,m]=(stop.time||"00:00").split(":").map(Number),target=new Date(),now=new Date();
  target.setHours(h,m,0,0);
  const mins=Math.round((target-now)/60000);
  if(mins<0)return "Horario superado";
  if(mins<60)return `${mins} min`;
  return `${Math.floor(mins/60)} h ${mins%60} min`;
}

async function renderSheet(stop=nextStop()){
  const content=document.querySelector("#sheet-content");
  if(!stop){
    content.innerHTML=`<div class=sheet-inner><span class=next-badge>VIAJE COMPLETADO</span><h2 class=sheet-title>🎉 Todas las paradas listas</h2></div>`;
    return;
  }
  document.querySelector("#progress-pill").textContent="Actualizando destino…";
  await Promise.all([fetchWeather(stop),fetchPhoto(stop)]);
  const miles=haversine(userLocation,{lat:stop.lat,lng:stop.lng}),pct=progress(),photo=photoCache[stop.id];
  content.innerHTML=`<div class=sheet-inner>
    <div class=sheet-head>
      <div>
        <span class=next-badge>${stop.id===nextStop()?.id?"PRÓXIMA PARADA":"PARADA DEL VIAJE"}</span>
        <h2 class=sheet-title>${stop.icon} ${stop.name}</h2>
        <div class=sheet-meta>⏰ ${stop.time} · ${stop.dayTitle}</div>
      </div>
      <strong>${pct}%</strong>
    </div>
    <div class=progress-bar><i style="width:${pct}%"></i></div>
    <div class=info-grid>
      <div class=info-chip><strong>${miles==null?"—":miles.toFixed(1)+" mi"}</strong><span>Distancia recta</span></div>
      <div class=info-chip><strong>${timeText(stop)}</strong><span>Hasta horario</span></div>
      <div class=info-chip><strong>${currentWeather?currentWeather.temp+"°F":"—"}</strong><span>${currentWeather?currentWeather.condition:"Clima"}</span></div>
    </div>
    ${photo?`<div class=photo-hero><img src="${photo}" alt="Imagen de ${stop.name}"><div class=photo-caption>📸 Referencia visual del destino</div></div>`:""}
    <div class=detail-card><strong>📸 Consejo visual</strong>${stop.tip||"Agrega una recomendación visual para esta parada."}</div>
    <div class=detail-card><strong>📍 Dirección</strong>${stop.address}</div>
    ${currentWeather?`<div class=detail-card><strong>🌤 Clima actual</strong>${currentWeather.temp}°F, sensación ${currentWeather.feels}°F · ${currentWeather.condition}</div>`:""}
    <div class=sheet-actions>
      <button class="action secondary" data-complete="${stop.dayId}|${stop.id}">${stop.completed?"↩ Reabrir":"✓ Completar"}</button>
      <a class="action primary" target=_blank rel=noopener href="${mapsUrl(stop.address)}">🚗 Navegar</a>
    </div>
  </div>`;
  document.querySelector("#progress-pill").textContent=userLocation?`Ubicación activa · ${pct}% completado`:`Activa “Estoy aquí” · ${pct}% completado`;
  bindSheet();
}

function bindSheet(){
  document.querySelectorAll("[data-complete]").forEach(btn=>btn.onclick=()=>{
    const [dayId,stopId]=btn.dataset.complete.split("|");
    const day=activeTrip.days.find(d=>d.id===dayId),stop=day.stops.find(s=>s.id===stopId);
    stop.completed=!stop.completed;save(state);drawMap();renderSheet(nextStop()||stop);renderTimeline();
  });
}

function renderTimeline(){
  document.querySelector("#timeline-title").textContent=activeTrip.name;
  document.querySelector("#timeline-content").innerHTML=activeTrip.days.map(day=>`<section class=timeline-day>
    <h3>${day.title}</h3>
    ${day.stops.map(stop=>`<div class="timeline-item ${stop.completed?"done":""}">
      <input type=checkbox data-timeline="${day.id}|${stop.id}" ${stop.completed?"checked":""}>
      <div><strong>${stop.icon} ${stop.name}</strong><small>${stop.time} · ${stop.address}</small></div>
      <a class=timeline-nav target=_blank rel=noopener href="${mapsUrl(stop.address)}">Ir</a>
    </div>`).join("")}
  </section>`).join("");
  document.querySelectorAll("[data-timeline]").forEach(box=>box.onchange=()=>{
    const [dayId,stopId]=box.dataset.timeline.split("|");
    const stop=activeTrip.days.find(d=>d.id===dayId).stops.find(s=>s.id===stopId);
    stop.completed=box.checked;save(state);drawMap();renderTimeline();renderSheet(nextStop()||stop);
  });
}

document.querySelector("#sheet-handle").onclick=()=>{
  const sheet=document.querySelector("#bottom-sheet");
  sheet.classList.toggle("expanded");
  sheet.classList.toggle("compact");
};

document.querySelector("#timeline-button").onclick=()=>{
  renderTimeline();
  document.querySelector("#timeline-dialog").showModal();
};
document.querySelectorAll("[data-close]").forEach(btn=>btn.onclick=()=>document.querySelector("#"+btn.dataset.close).close());

document.querySelector("#location-button").onclick=()=>{
  const pill=document.querySelector("#progress-pill");
  if(!navigator.geolocation){pill.textContent="Ubicación no disponible";return}
  pill.textContent="Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition(pos=>{
    userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
    if(userMarker)map.removeLayer(userMarker);
    userMarker=L.circleMarker([userLocation.lat,userLocation.lng],{radius:9,color:"white",weight:4,fillColor:"#0a84ff",fillOpacity:1}).addTo(map);
    map.flyTo([userLocation.lat,userLocation.lng],14);
    renderSheet(nextStop());
  },err=>{
    pill.textContent=err.code===1?"Permiso de ubicación rechazado":"No se pudo obtener la ubicación";
  },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
};

document.querySelector("#continue-button").onclick=()=>{
  const stop=nextStop();
  if(stop)window.open(mapsUrl(stop.address),"_blank");
};

document.querySelector("#trip-title").textContent=activeTrip.name;
drawMap();renderSheet();renderTimeline();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
