
import {load,save} from "./storage.js";
import {seed} from "./seed.js";
import {mapsUrl,haversineMeters,miles} from "./maps.js";

let state=load()||structuredClone(seed);
let activeTrip=state.trips.find(t=>t.id===state.selectedTripId)||state.trips[0];
let userLocation=null,userAccuracy=null,userMarker=null,accuracyCircle=null,routeLine=null,watchId=null;
let currentWeather=null,currentLegRoute=null,lastArrivalStopId=null;
const photoCache={};
const map=L.map("map",{zoomControl:false}).setView([36.12,-115.17],12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
L.control.zoom({position:"topright"}).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

const allStops=()=>activeTrip.days.flatMap(d=>d.stops.map(s=>({...s,dayId:d.id,dayTitle:d.title})));
const realStop=(d,s)=>activeTrip.days.find(x=>x.id===d)?.stops.find(x=>x.id===s);
const nextStop=()=>allStops().find(s=>!s.completed)||null;
const progress=()=>{const s=allStops();return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):0};

const stopIcons={
  attraction:"📍",parking:"🅿️",food:"🍔",hotel:"🏨",fuel:"⛽",photo:"📸",other:"⭐"
};

const parkingCatalog={
  lv1:[
    {
      id:"welcome-official",
      name:"Welcome Sign Parking",
      address:"5100 Las Vegas Blvd S, Las Vegas, NV 89119",
      lat:36.0820,lng:-115.1728,costType:"free",costLabel:"Gratis",pricingModel:"free",estimatedCost:0,
      walkMinutes:1,note:"Estacionamiento oficial junto al letrero. Confirma la señalización al llegar."
    }
  ],
  lv3:[
    {
      id:"bellagio-garage",
      name:"Bellagio Self-Parking",
      address:"3600 S Las Vegas Blvd, Las Vegas, NV 89109",
      lat:36.1117,lng:-115.1761,costType:"paid",costLabel:"$4 por hora",pricingModel:"fremont-hourly",hourlyCost:4,dailyCap:20,
      walkMinutes:4,note:"Opción muy cercana al Bellagio. La tarifa puede variar."
    },
    {
      id:"cosmopolitan-garage",
      name:"Cosmopolitan Self-Parking",
      address:"3708 Las Vegas Blvd S, Las Vegas, NV 89109",
      lat:36.1099,lng:-115.1744,costType:"paid",costLabel:"$20–$25",pricingModel:"mgm-daily",weekdayCost:20,weekendCost:25,
      walkMinutes:8,note:"Alternativa cercana al Bellagio y al centro del Strip."
    },
    {
      id:"treasure-island-garage",
      name:"Treasure Island Self-Park",
      address:"3300 Las Vegas Blvd S, Las Vegas, NV 89109",
      lat:36.1247,lng:-115.1729,costType:"verify",costLabel:"Condiciones por confirmar",pricingModel:"unknown",
      walkMinutes:22,note:"Opción estratégica para dejar el vehículo y recorrer parte del Strip caminando."
    }
  ],
  lv4:[
    {
      id:"venetian-palazzo",
      name:"The Venetian / Palazzo Parking",
      address:"3355 Las Vegas Blvd S, Las Vegas, NV 89109",
      lat:36.1212,lng:-115.1697,costType:"paid",costLabel:"Tarifa por confirmar",pricingModel:"unknown",
      walkMinutes:14,note:"Alternativa cercana para visitar Sphere."
    },
    {
      id:"sphere-parking",
      name:"Sphere Event Parking",
      address:"255 Sands Ave, Las Vegas, NV 89169",
      lat:36.1205,lng:-115.1614,costType:"verify",costLabel:"Variable por evento",pricingModel:"unknown",
      walkMinutes:4,note:"La disponibilidad y tarifa pueden cambiar según el evento."
    }
  ],
  lv5:[
    {
      id:"area15-main",
      name:"AREA15 Parking",
      address:"3215 S Rancho Dr, Las Vegas, NV 89102",
      lat:36.1318,lng:-115.2090,costType:"verify",costLabel:"Confirmar al llegar",pricingModel:"unknown",
      walkMinutes:2,note:"Parking principal del complejo. Las condiciones pueden variar por evento."
    }
  ],
  lv6:[
    {
      id:"four-queens",
      name:"Four Queens Parking Garage",
      address:"202 Fremont St, Las Vegas, NV 89101",
      lat:36.1707,lng:-115.1437,costType:"validation",costLabel:"Desde $5 / posible validación",pricingModel:"four-queens",
      walkMinutes:3,note:"Conserva el ticket y confirma si aplica validación."
    },
    {
      id:"fremont-garage",
      name:"Fremont Street Experience Garage",
      address:"111 S 4th St, Las Vegas, NV 89101",
      lat:36.1689,lng:-115.1429,costType:"paid",costLabel:"$4 por hora",pricingModel:"fremont-hourly",hourlyCost:4,dailyCap:20,
      walkMinutes:4,note:"Alternativa directa para Fremont Street."
    },
    {
      id:"golden-nugget",
      name:"Golden Nugget Parking",
      address:"129 E Fremont St, Las Vegas, NV 89101",
      lat:36.1698,lng:-115.1457,costType:"validation",costLabel:"Tarifa / validación por confirmar",pricingModel:"unknown",
      walkMinutes:5,note:"Confirma tarifa y condiciones de validación."
    }
  ]
};

function distanceMeters(a,b){
  if(!a||!b||typeof a.lat!=="number"||typeof a.lng!=="number"||typeof b.lat!=="number"||typeof b.lng!=="number")return null;
  const R=6371000,toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function walkingMinutesFromMeters(meters){
  if(meters==null)return null;
  return Math.max(1,Math.round(meters/80));
}
function formatParkingDistance(meters){
  if(meters==null)return "";
  if(meters<1000)return `${Math.round(meters)} m`;
  return `${(meters/1609.344).toFixed(1)} mi`;
}
function ensureParkingEngine(){
  state.parkingEngine=state.parkingEngine||{};
  state.parkingEngine.enabled=true;
  state.parkingEngine.favorites=Array.isArray(state.parkingEngine.favorites)?state.parkingEngine.favorites:[];
  state.parkingEngine.selectionByStop=state.parkingEngine.selectionByStop||{};
}
ensureParkingEngine();

function parkingStops(){
  return allStops().filter(stop=>stop.type==="parking"&&!stop.completed);
}
function parkingKey(option){
  return option.id||`user-${option.dayId||""}-${option.name}`;
}
function isParkingFavorite(option){
  return state.parkingEngine.favorites.includes(parkingKey(option));
}
function toggleParkingFavorite(option){
  const key=parkingKey(option);
  const favorites=state.parkingEngine.favorites;
  const index=favorites.indexOf(key);
  if(index>=0)favorites.splice(index,1);else favorites.push(key);
  save(state);
}
function plannedDateForStop(stop){
  const day=activeTrip.days.find(item=>item.id===stop.dayId);
  return day?.date?new Date(`${day.date}T12:00:00`):new Date();
}
function estimateParkingCost(option,stop){
  const durationMinutes=Math.max(30,Number(stop.durationMinutes||60));
  const date=plannedDateForStop(stop);
  const day=date.getDay();
  const weekend=day===0||day===5||day===6;

  switch(option.pricingModel){
    case "free": return 0;
    case "mgm-daily": return weekend?Number(option.weekendCost||25):Number(option.weekdayCost||20);
    case "fremont-hourly":
      return Math.min(Number(option.dailyCap||20),Math.max(Number(option.hourlyCost||4),Math.ceil(durationMinutes/60)*Number(option.hourlyCost||4)));
    case "four-queens":
      if(durationMinutes<=60)return 5;
      if(durationMinutes<=120)return 10;
      if(durationMinutes<=240)return 15;
      if(durationMinutes<=360)return 20;
      return 25;
    default:
      return Number.isFinite(Number(option.estimatedCost))?Number(option.estimatedCost):null;
  }
}
function pricingGroup(option,stop){
  const estimate=estimateParkingCost(option,stop);
  if(estimate===0||option.costType==="free")return 0;
  if(estimate!=null)return 1;
  return 2;
}
function costLabelForOption(option,stop){
  const estimate=estimateParkingCost(option,stop);
  if(estimate===0)return "Gratis";
  if(estimate!=null)return `Costo estimado $${estimate.toFixed(0)}`;
  return option.costLabel||"Tarifa por confirmar";
}
function buildParkingCandidates(stop){
  if(!stop||stop.type==="parking")return [];
  const userOptions=parkingStops()
    .filter(parking=>parking.id!==stop.id)
    .map(parking=>{
      const meters=distanceMeters(stop,parking);
      return {
        ...parking,
        id:parking.id,
        source:"itinerary",
        meters,
        walkMinutes:parking.walkMinutes||walkingMinutesFromMeters(meters),
        costType:parking.parkingCostType||"unknown",
        costLabel:parking.parkingCostLabel||"Tarifa no registrada",
        note:parking.tip||"Estacionamiento agregado por ti."
      };
    })
    .filter(option=>option.meters!=null&&option.meters<=5000);

  const catalogOptions=(parkingCatalog[stop.id]||[]).map(option=>({
    ...option,
    source:"catalog",
    meters:distanceMeters(stop,option)
  }));

  return [...userOptions,...catalogOptions].map(option=>{
    const favorite=isParkingFavorite(option);
    const walking=option.walkMinutes||walkingMinutesFromMeters(option.meters)||60;
    const estimatedCost=estimateParkingCost(option,stop);
    const group=pricingGroup(option,stop);
    return {
      ...option,
      favorite,
      walkMinutes:walking,
      estimatedCost,
      pricingGroup:group,
      displayCost:costLabelForOption(option,stop)
    };
  }).sort((a,b)=>{
    if(a.pricingGroup!==b.pricingGroup)return a.pricingGroup-b.pricingGroup;
    if(a.pricingGroup===1&&a.estimatedCost!==b.estimatedCost)return a.estimatedCost-b.estimatedCost;
    if(a.favorite!==b.favorite)return a.favorite?-1:1;
    return a.walkMinutes-b.walkMinutes;
  });
}
function selectedParkingIndex(stop,candidates){
  if(!candidates.length)return -1;
  const selectedKey=state.parkingEngine.selectionByStop[stop.id];
  const selectedIndex=candidates.findIndex(option=>parkingKey(option)===selectedKey);
  return selectedIndex>=0?selectedIndex:0;
}
function parkingRecommendation(stop){
  const candidates=buildParkingCandidates(stop);
  const index=selectedParkingIndex(stop,candidates);
  return {
    recommended:index>=0?candidates[index]:null,
    alternatives:candidates.filter((_,candidateIndex)=>candidateIndex!==index).slice(0,6),
    total:candidates.length
  };
}
function recalculateParking(stop){
  const candidates=buildParkingCandidates(stop);
  if(!candidates.length)return;
  const currentKey=state.parkingEngine.selectionByStop[stop.id];
  let index=candidates.findIndex(option=>parkingKey(option)===currentKey);
  index=(index+1)%candidates.length;
  state.parkingEngine.selectionByStop[stop.id]=parkingKey(candidates[index]);
  state.parkingEngine.lastRecalculation=new Date().toISOString();
  save(state);
}
function chooseParking(stopId,option){
  state.parkingEngine.selectionByStop[stopId]=parkingKey(option);
  state.parkingEngine.lastRecalculation=new Date().toISOString();
  save(state);
}
function parkingBadgeClass(costType){
  return ["free","paid","validation","verify"].includes(costType)?costType:"unknown";
}

const uid=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function ensureStopMetadata(){
  activeTrip.days.forEach(day=>day.stops.forEach(stop=>{
    stop.type=stop.type||"attraction";
    stop.source=stop.source||"recommended";
    stop.priority=stop.priority||"preferred";
    stop.durationMinutes=Number(stop.durationMinutes||30);
  }));
  save(state);
}
ensureStopMetadata();

function ensureDayMetadata(){
  activeTrip.days.forEach(day=>{
    day.startCity=day.startCity||"";
    day.endCity=day.endCity||"";
    day.notes=day.notes||"";
  });
  save(state);
}
ensureDayMetadata();

const dayRouteCache=new Map();
function dayCacheKey(day){
  return day.stops
    .filter(stop=>typeof stop.lat==="number"&&typeof stop.lng==="number")
    .map(stop=>`${stop.lat},${stop.lng}`)
    .join("|");
}
function dayVisitMinutes(day){
  return day.stops.reduce((total,stop)=>total+Number(stop.durationMinutes||0),0);
}
function formatMinutes(totalMinutes){
  const minutes=Math.max(0,Math.round(totalMinutes||0));
  if(minutes<60)return `${minutes} min`;
  return `${Math.floor(minutes/60)} h ${minutes%60} min`;
}
function formatDayRoute(day){
  const from=day.startCity||"Inicio";
  const to=day.endCity||"Cierre";
  return `${from} → ${to}`;
}
async function calculateDayDriving(day){
  const points=day.stops
    .filter(stop=>typeof stop.lat==="number"&&typeof stop.lng==="number")
    .map(stop=>({lat:stop.lat,lng:stop.lng}));
  if(points.length<2)return {seconds:0,meters:0};
  const key=dayCacheKey(day);
  if(dayRouteCache.has(key))return dayRouteCache.get(key);
  const result=await route(points);
  const data=result?{seconds:result.seconds||0,meters:result.meters||0}:{seconds:0,meters:0};
  dayRouteCache.set(key,data);
  return data;
}
async function updateDayMetrics(){
  const rows=[];
  for(const day of activeTrip.days){
    const driving=await calculateDayDriving(day);
    const visit=dayVisitMinutes(day);
    rows.push({day,drivingMinutes:driving.seconds/60,visitMinutes:visit});
    const element=document.querySelector(`[data-day-metrics="${day.id}"]`);
    if(element){
      element.innerHTML=`🚗 ${formatMinutes(driving.seconds/60)} · 📍 ${formatMinutes(visit)} en visitas`;
    }
  }
  const totalDriving=rows.reduce((sum,row)=>sum+row.drivingMinutes,0);
  const totalVisit=rows.reduce((sum,row)=>sum+row.visitMinutes,0);
  const summary=document.querySelector("#timeline-trip-summary");
  if(summary){
    summary.innerHTML=`<strong>${activeTrip.days.length} día(s) · ${allStops().length} parada(s)</strong>
      <span>🚗 ${formatMinutes(totalDriving)} conduciendo · 📍 ${formatMinutes(totalVisit)} en visitas</span>`;
  }
}
function sortTripDays(){
  activeTrip.days.sort((a,b)=>(a.date||"9999-12-31").localeCompare(b.date||"9999-12-31"));
}
function openDayDialog(dayId=""){
  const dialog=document.querySelector("#day-dialog");
  document.querySelector("#day-form").reset();
  document.querySelector("#day-edit-id").value="";
  document.querySelector("#day-dialog-title").textContent=dayId?"Editar día":"Agregar día";

  if(dayId){
    const day=activeTrip.days.find(item=>item.id===dayId);
    if(!day)return;
    document.querySelector("#day-edit-id").value=day.id;
    document.querySelector("#day-date").value=day.date||"";
    document.querySelector("#day-title").value=day.title||"";
    document.querySelector("#day-start-city").value=day.startCity||"";
    document.querySelector("#day-end-city").value=day.endCity||"";
    document.querySelector("#day-notes").value=day.notes||"";
  }else{
    const dates=activeTrip.days.map(day=>day.date).filter(Boolean).sort();
    if(dates.length){
      const next=new Date(`${dates[dates.length-1]}T12:00:00`);
      next.setDate(next.getDate()+1);
      document.querySelector("#day-date").value=next.toISOString().slice(0,10);
    }
  }
  dialog.showModal();
}
async function saveDayFromForm(){
  const editId=document.querySelector("#day-edit-id").value;
  const data={
    date:document.querySelector("#day-date").value,
    title:document.querySelector("#day-title").value.trim(),
    startCity:document.querySelector("#day-start-city").value.trim(),
    endCity:document.querySelector("#day-end-city").value.trim(),
    notes:document.querySelector("#day-notes").value.trim()
  };
  if(editId){
    const day=activeTrip.days.find(item=>item.id===editId);
    if(!day)throw new Error("Día no encontrado");
    Object.assign(day,data);
  }else{
    activeTrip.days.push({id:uid("day"),...data,stops:[]});
  }
  sortTripDays();
  dayRouteCache.clear();
  save(state);
  fillDayOptions();
  timeline();
  await drawMap();
  await renderSheet(nextStop());
}
async function deleteDay(dayId){
  const day=activeTrip.days.find(item=>item.id===dayId);
  if(!day)return;
  if(day.stops.length){
    alert("Para eliminar este día, primero mueve o elimina sus paradas.");
    return;
  }
  if(!confirm(`¿Eliminar el día "${day.title}"?`))return;
  activeTrip.days=activeTrip.days.filter(item=>item.id!==dayId);
  dayRouteCache.clear();
  save(state);
  timeline();
  await drawMap();
  await renderSheet(nextStop());
}
async function duplicateStop(dayId,stopId){
  const day=activeTrip.days.find(item=>item.id===dayId);
  const stop=day?.stops.find(item=>item.id===stopId);
  if(!day||!stop)return;
  const copy={
    ...structuredClone(stop),
    id:uid("stop"),
    name:`${stop.name} (copia)`,
    completed:false,
    status:"pending",
    source:"user"
  };
  const [hours,minutes]=(stop.time||"00:00").split(":").map(Number);
  const date=new Date(2000,0,1,hours||0,minutes||0);
  date.setMinutes(date.getMinutes()+15);
  copy.time=`${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
  day.stops.push(copy);
  sortDayStops(day);
  dayRouteCache.clear();
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop()||copy);
}


function fillDayOptions(selectedDayId=""){
  const select=document.querySelector("#stop-day");
  select.innerHTML=activeTrip.days.map(day=>`<option value="${day.id}" ${day.id===selectedDayId?"selected":""}>${day.date||""} · ${day.title}</option>`).join("");
}
function openStopDialog(dayId="",stopId=""){
  const dialog=document.querySelector("#stop-dialog");
  const form=document.querySelector("#stop-form");
  form.reset();
  document.querySelector("#stop-edit-day-id").value="";
  document.querySelector("#stop-edit-id").value="";
  document.querySelector("#stop-duration").value="30";
  document.querySelector("#stop-source").value="user";
  document.querySelector("#stop-priority").value="preferred";
  document.querySelector("#stop-dialog-title").textContent=stopId?"Editar parada":"Agregar parada";
  fillDayOptions(dayId||activeTrip.days[0]?.id||"");

  if(stopId){
    const stop=realStop(dayId,stopId);
    if(!stop)return;
    document.querySelector("#stop-edit-day-id").value=dayId;
    document.querySelector("#stop-edit-id").value=stopId;
    document.querySelector("#stop-day").value=dayId;
    document.querySelector("#stop-name").value=stop.name||"";
    document.querySelector("#stop-type").value=stop.type||"attraction";
    document.querySelector("#stop-time").value=stop.time||"";
    document.querySelector("#stop-address").value=stop.address||"";
    document.querySelector("#stop-lat").value=typeof stop.lat==="number"?stop.lat:"";
    document.querySelector("#stop-lng").value=typeof stop.lng==="number"?stop.lng:"";
    document.querySelector("#stop-source").value=stop.source||"recommended";
    document.querySelector("#stop-priority").value=stop.priority||"preferred";
    document.querySelector("#stop-duration").value=stop.durationMinutes||30;
    document.querySelector("#stop-tip").value=stop.tip||"";
  }
  dialog.showModal();
}
async function saveStopFromForm(){
  const editDayId=document.querySelector("#stop-edit-day-id").value;
  const editId=document.querySelector("#stop-edit-id").value;
  const targetDayId=document.querySelector("#stop-day").value;
  const targetDay=activeTrip.days.find(day=>day.id===targetDayId);
  if(!targetDay)throw new Error("Día no encontrado");

  const type=document.querySelector("#stop-type").value;
  const data={
    name:document.querySelector("#stop-name").value.trim(),
    type,
    icon:stopIcons[type]||"📍",
    time:document.querySelector("#stop-time").value,
    address:document.querySelector("#stop-address").value.trim(),
    lat:document.querySelector("#stop-lat").value===""?null:Number(document.querySelector("#stop-lat").value),
    lng:document.querySelector("#stop-lng").value===""?null:Number(document.querySelector("#stop-lng").value),
    source:document.querySelector("#stop-source").value,
    priority:document.querySelector("#stop-priority").value,
    durationMinutes:Number(document.querySelector("#stop-duration").value)||30,
    tip:document.querySelector("#stop-tip").value.trim(),
    parkingCostType:type==="parking"?"unknown":undefined,
    parkingCostLabel:type==="parking"?"Tarifa no registrada":undefined,
    completed:false,
    status:"pending"
  };

  if(editId){
    const oldDay=activeTrip.days.find(day=>day.id===editDayId);
    const index=oldDay?.stops.findIndex(stop=>stop.id===editId)??-1;
    if(index<0)throw new Error("Parada no encontrada");
    const existing=oldDay.stops[index];
    const updated={...existing,...data,id:existing.id,completed:existing.completed,status:existing.status};
    oldDay.stops.splice(index,1);
    targetDay.stops.push(updated);
  }else{
    targetDay.stops.push({id:uid("stop"),...data});
  }

  targetDay.stops.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
  dayRouteCache.clear();
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop());
}
async function deleteStop(dayId,stopId){
  const day=activeTrip.days.find(day=>day.id===dayId);
  const stop=day?.stops.find(stop=>stop.id===stopId);
  if(!day||!stop)return;
  if(!confirm(`¿Eliminar la parada "${stop.name}"?`))return;
  day.stops=day.stops.filter(stop=>stop.id!==stopId);
  dayRouteCache.clear();
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop());
}


function normalizeStatuses(){
  const next=nextStop();
  activeTrip.days.forEach(day=>day.stops.forEach(stop=>{
    if(stop.completed)stop.status="completed";
    else if(stop.id===next?.id&&stop.status!=="arrived")stop.status=state.navigation.trackingEnabled?"enroute":"pending";
    else if(stop.status!=="completed")stop.status="pending";
  }));
}
normalizeStatuses();

function icon(stop,isNext){
  return L.divIcon({html:`<div class="marker-pin ${stop.completed?"done":""} ${isNext?"next":""}">${stop.icon}</div>`,className:"",iconSize:isNext?[46,46]:[36,36],iconAnchor:isNext?[23,23]:[18,18]});
}
async function route(points){
  if(points.length<2)return null;
  try{
    const coords=points.map(p=>`${p.lng},${p.lat}`).join(";");
    const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const d=await r.json(),x=d.routes?.[0];if(!x)return null;
    return {coords:x.geometry.coordinates.map(([lng,lat])=>[lat,lng]),meters:x.distance,seconds:x.duration};
  }catch{return null}
}
async function drawMap(){
  markerLayer.clearLayers();const stops=allStops(),next=nextStop();
  stops.forEach(s=>{if(typeof s.lat!=="number")return;const m=L.marker([s.lat,s.lng],{icon:icon(s,next?.id===s.id)}).addTo(markerLayer);m.on("click",()=>renderSheet(s))});
  if(routeLine)map.removeLayer(routeLine);
  const pts=stops.filter(s=>typeof s.lat==="number").map(s=>({lat:s.lat,lng:s.lng}));
  const full=await route(pts),coords=full?.coords||pts.map(p=>[p.lat,p.lng]);
  if(coords.length>1)routeLine=L.polyline(coords,{color:"#0a84ff",weight:full?6:5,opacity:.82,dashArray:full?null:"8 9"}).addTo(map);
  if(next&&!userLocation)map.flyTo([next.lat,next.lng],13);
}
async function refreshLeg(){
  const stop=nextStop();currentLegRoute=userLocation&&stop?await route([userLocation,{lat:stop.lat,lng:stop.lng}]):null;
}
async function weather(stop){
  currentWeather=null;
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${stop.lat}&longitude=${stop.lng}&current=temperature_2m&temperature_unit=fahrenheit`);
    const d=await r.json();currentWeather={temp:Math.round(d.current.temperature_2m)};
  }catch{}
}
async function photo(stop){
  if(photoCache[stop.id])return photoCache[stop.id];
  try{
    const q=encodeURIComponent(stop.photoQuery||stop.name);
    const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&origin=*&generator=search&gsrsearch=${q}&gsrlimit=1&prop=pageimages&pithumbsize=1100&format=json`);
    const d=await r.json(),p=Object.values(d.query?.pages||{})[0];return photoCache[stop.id]=p?.thumbnail?.source||"";
  }catch{return ""}
}
const fDist=m=>m==null?"Activa ubicación":(miles(m)<.1?`${Math.round(m)} m`:`${miles(m).toFixed(miles(m)<10?1:0)} mi`);
const fTime=s=>s==null?"—":Math.round(s/60)<60?`${Math.max(1,Math.round(s/60))} min`:`${Math.floor(Math.round(s/60)/60)} h ${Math.round(s/60)%60} min`;
const label=s=>({pending:"Pendiente",enroute:"En camino",arrived:"Llegada",completed:"Completada"}[s]||"Pendiente");

async function arrival(){
  const stop=nextStop();if(!userLocation||!stop)return;
  const direct=haversineMeters(userLocation,{lat:stop.lat,lng:stop.lng}),target=realStop(stop.dayId,stop.id);
  if(direct<=(state.navigation.arrivalRadiusMeters||180)){target.status="arrived";lastArrivalStopId=stop.id}
  else if(!target.completed)target.status="enroute";
  save(state);
}

function renderParkingAlternative(stop,option,index){
  const groupLabel=option.pricingGroup===0?"GRATIS":option.pricingGroup===1?"PAGADO":"POR CONFIRMAR";
  return `<div class="parking-alternative group-${option.pricingGroup}">
    <div>
      <div class=parking-option-heading>
        <strong>${option.favorite?"⭐ ":""}${option.name}</strong>
        <span class="parking-option-group group-${option.pricingGroup}">${groupLabel}</span>
      </div>
      <span>🚶 ${option.walkMinutes||"—"} min caminando · ${option.displayCost}</span>
    </div>
    <button data-choose-parking="${stop.id}|${parkingKey(option)}">Elegir</button>
  </div>`;
}
function renderParkingGroups(stop,result){
  const all=[result.recommended,...result.alternatives].filter(Boolean);
  const free=all.filter(option=>option.pricingGroup===0);
  const paid=all.filter(option=>option.pricingGroup===1);
  const unknown=all.filter(option=>option.pricingGroup===2);
  const selectedKey=result.recommended?parkingKey(result.recommended):"";

  const renderGroup=(title,subtitle,items,className)=>items.length?`<section class="parking-choice-group ${className}">
    <header><strong>${title}</strong><span>${subtitle}</span></header>
    ${items.map(option=>`<div class="parking-choice ${parkingKey(option)===selectedKey?"selected":""}">
      <div>
        <strong>${option.favorite?"⭐ ":""}${option.name}</strong>
        <span>🚶 ${option.walkMinutes} min · ${option.displayCost}</span>
      </div>
      ${parkingKey(option)===selectedKey?'<span class=parking-selected>Elegido</span>':`<button data-choose-parking="${stop.id}|${parkingKey(option)}">Elegir</button>`}
    </div>`).join("")}
  </section>`:"";

  return `<div class=parking-choice-list>
    ${renderGroup("1. Opciones gratis","Primero se muestran por menor caminata",free,"free")}
    ${renderGroup(free.length?"2. Opciones pagadas":"1. Opciones pagadas","Ordenadas del menor al mayor costo estimado",paid,"paid")}
    ${renderGroup("Tarifa por confirmar","Se muestran al final porque no existe un precio fijo",unknown,"unknown")}
  </div>`;
}
function renderParkingCard(stop){
  if(stop.type==="parking"){
    return `<div class="parking-card parking-stop-card">
      <div class=parking-card-head>
        <div><span class=parking-eyebrow>🅿️ PARADA DE ESTACIONAMIENTO</span><strong>${stop.name}</strong></div>
        <span class="parking-engine-status">MOTOR ACTIVO</span>
      </div>
      <p>Esta parada puede ser recomendada automáticamente para destinos cercanos.</p>
    </div>`;
  }

  const result=parkingRecommendation(stop);
  const parking=result.recommended;
  if(!parking)return `<div class="parking-card empty">
    <div class=parking-card-head>
      <div><span class=parking-eyebrow>🅿️ PARKING AI · ACTIVO</span><strong>Sin estacionamientos disponibles</strong></div>
      <span class="parking-engine-status">ACTIVO</span>
    </div>
    <p>Agrega una parada de tipo “Estacionamiento” con latitud y longitud para que el motor la relacione automáticamente.</p>
    <button class="parking-add" data-add-parking-for="${stop.dayId}|${stop.id}">＋ Agregar estacionamiento</button>
  </div>`;

  const walking=parking.walkMinutes||walkingMinutesFromMeters(parking.meters)||"—";
  const distance=parking.meters!=null?formatParkingDistance(parking.meters):"";
  return `<div class=parking-card>
    <div class=parking-card-head>
      <div>
        <span class=parking-eyebrow>🅿️ PARKING AI · RECOMENDADO</span>
        <strong>${parking.favorite?"⭐ ":""}${parking.name}</strong>
      </div>
      <span class="parking-engine-status">ACTIVO</span>
    </div>
    <div class=parking-score-row>
      <span class="parking-cost ${parkingBadgeClass(parking.costType)}">${parking.displayCost}</span>
      <span class=parking-score>${parking.pricingGroup===0?"PRIMERA OPCIÓN GRATIS":parking.pricingGroup===1?"MENOR COSTO DISPONIBLE":"TARIFA POR CONFIRMAR"}</span>
    </div>
    <div class=parking-metrics>
      <span>🚶 ${walking} min caminando</span>
      ${distance?`<span>📏 ${distance}</span>`:""}
      <span>${parking.source==="itinerary"?"👤 Agregado por ti":"✨ Recomendado"}</span>
    </div>
    <p>${parking.note||""}</p>
    <div class=parking-actions-three>
      <a target=_blank rel=noopener href="${mapsUrl(parking.address)}">🧭 Ir al parking</a>
      <button data-favorite-parking="${stop.id}|${parkingKey(parking)}">${parking.favorite?"★ Favorito":"☆ Favorito"}</button>
      <button data-recalculate-parking="${stop.dayId}|${stop.id}">🔄 Siguiente opción</button>
    </div>
    <details class=parking-alternatives open>
      <summary>🅿️ Comparar todas las opciones</summary>
      ${renderParkingGroups(stop,result)}
    </details>
    <button class=parking-add data-add-parking-for="${stop.dayId}|${stop.id}">＋ Agregar otra opción</button>
  </div>`;
}

async function renderSheet(stop=nextStop()){
  const c=document.querySelector("#sheet-content");
  if(!stop){c.innerHTML='<div class=sheet-inner><span class="nav-status completed">Completada</span><h2>🎉 Viaje completado</h2></div>';return}
  await Promise.all([weather(stop),photo(stop),refreshLeg()]);
  const direct=haversineMeters(userLocation,{lat:stop.lat,lng:stop.lng}),target=realStop(stop.dayId,stop.id),status=target.status||"pending",pct=progress();
  c.innerHTML=`<div class=sheet-inner>
  <div class=sheet-head><div><span class="nav-status ${status}">${status==="enroute"?'<i class=live-dot></i>':""}${label(status)}</span><h2 class=sheet-title>${stop.icon} ${stop.name}</h2><div class=sheet-meta>${stop.time} · ${stop.dayTitle}</div></div><strong>${pct}%</strong></div>
  <div class=progress-bar><i style="width:${pct}%"></i></div>
  ${status==="arrived"?'<div class=arrival-banner>📍 Llegaste al destino. Confirma la parada para continuar.</div>':""}
  <div class=smart-grid>
   <div class=smart-card><span>Distancia real</span><strong>${fDist(currentLegRoute?.meters??direct)}</strong></div>
   <div class=smart-card><span>Tiempo estimado</span><strong>${fTime(currentLegRoute?.seconds)}</strong></div>
   <div class=smart-card><span>Precisión GPS</span><strong>${userAccuracy==null?"—":`±${Math.round(userAccuracy)} m`}</strong></div>
   <div class=smart-card><span>Clima</span><strong>${currentWeather?currentWeather.temp+"°F":"—"}</strong></div>
   <div class="smart-card full"><span>Estado</span><strong>${label(status)}</strong></div>
  </div>
  <button class="track-button ${state.navigation.trackingEnabled?"active":""}" data-track>${state.navigation.trackingEnabled?"● GPS activo":"◎ Activar GPS"}</button>
  ${photoCache[stop.id]?`<div class=photo-hero><img src="${photoCache[stop.id]}"><div class=photo-caption>📸 Referencia visual</div></div>`:""}
  <div class=detail-card><strong>📍 Dirección</strong>${stop.address}
    <span class="stop-origin ${stop.source==="user"?"user":""}">${stop.source==="user"?"Agregada por mí":"Recomendada"}<span class=stop-priority>· ${stop.priority||"preferred"}</span></span>
    <div class=stop-tools>
      <button class="stop-tool edit" data-edit-stop="${stop.dayId}|${stop.id}">✏️ Editar</button>
      <button class="stop-tool delete" data-delete-stop="${stop.dayId}|${stop.id}">🗑 Eliminar</button>
    </div>
  </div>
  ${renderParkingCard(stop)}
  <div class=sheet-actions><button class="action secondary" data-complete="${stop.dayId}|${stop.id}">✓ Completar</button><a class="action primary" target=_blank href="${mapsUrl(stop.address)}">🧭 Navegar</a></div>
  </div>`;
  document.querySelector("#progress-pill").textContent=state.navigation.trackingEnabled?`GPS activo · ${pct}% completado`:`Activa “Estoy aquí” · ${pct}% completado`;
  bind();
}

function openParkingDialogForStop(dayId,stopId){
  const destination=realStop(dayId,stopId);
  openStopDialog(dayId,"");
  document.querySelector("#stop-type").value="parking";
  document.querySelector("#stop-name").value=`Parking para ${destination?.name||"destino"}`;
  document.querySelector("#stop-time").value=destination?.time||"";
  document.querySelector("#stop-source").value="user";
  document.querySelector("#stop-priority").value="preferred";
  document.querySelector("#stop-duration").value="10";
  document.querySelector("#stop-tip").value=`Estacionamiento vinculado a ${destination?.name||"esta parada"}.`;
}

function bind(){
  document.querySelectorAll("[data-track]").forEach(b=>b.onclick=toggleTracking);
  document.querySelectorAll("[data-complete]").forEach(b=>b.onclick=async()=>{
    const [d,s]=b.dataset.complete.split("|"),x=realStop(d,s);x.completed=true;x.status="completed";normalizeStatuses();save(state);await drawMap();await renderSheet();timeline();
  });
  document.querySelectorAll("[data-edit-stop]").forEach(b=>b.onclick=()=>{
    const [d,s]=b.dataset.editStop.split("|");openStopDialog(d,s);
  });
  document.querySelectorAll("[data-delete-stop]").forEach(b=>b.onclick=async()=>{
    const [d,s]=b.dataset.deleteStop.split("|");await deleteStop(d,s);
  });
  document.querySelectorAll("[data-add-parking-for]").forEach(b=>b.onclick=()=>{
    const [d,s]=b.dataset.addParkingFor.split("|");openParkingDialogForStop(d,s);
  });
  document.querySelectorAll("[data-recalculate-parking]").forEach(button=>button.onclick=async()=>{
    const [dayId,stopId]=button.dataset.recalculateParking.split("|");
    const stop={...realStop(dayId,stopId),dayId};
    recalculateParking(stop);
    await renderSheet(stop);
  });
  document.querySelectorAll("[data-favorite-parking]").forEach(button=>button.onclick=async()=>{
    const [stopId,key]=button.dataset.favoriteParking.split("|");
    const stop=allStops().find(item=>item.id===stopId);
    const option=buildParkingCandidates(stop).find(item=>parkingKey(item)===key);
    if(option){toggleParkingFavorite(option);await renderSheet(stop);}
  });
  document.querySelectorAll("[data-choose-parking]").forEach(button=>button.onclick=async()=>{
    const [stopId,key]=button.dataset.chooseParking.split("|");
    const stop=allStops().find(item=>item.id===stopId);
    const option=buildParkingCandidates(stop).find(item=>parkingKey(item)===key);
    if(option){chooseParking(stopId,option);await renderSheet(stop);}
  });
}

function sortDayStops(day){
  day.stops.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
}
async function quickChangeTime(dayId,stopId,newTime){
  const stop=realStop(dayId,stopId);
  if(!stop||!newTime)return;
  stop.time=newTime;
  dayRouteCache.clear();
  const day=activeTrip.days.find(item=>item.id===dayId);
  sortDayStops(day);
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop()||stop);
}
async function moveStop(dayId,stopId,direction){
  const day=activeTrip.days.find(item=>item.id===dayId);
  if(!day)return;
  const index=day.stops.findIndex(stop=>stop.id===stopId);
  const newIndex=index+direction;
  if(index<0||newIndex<0||newIndex>=day.stops.length)return;

  const current=day.stops[index];
  const target=day.stops[newIndex];
  const currentTime=current.time;
  current.time=target.time;
  target.time=currentTime;

  [day.stops[index],day.stops[newIndex]]=[day.stops[newIndex],day.stops[index]];
  dayRouteCache.clear();
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop()||current);
}
async function deleteStopFromTimeline(dayId,stopId){
  const day=activeTrip.days.find(item=>item.id===dayId);
  const stop=day?.stops.find(item=>item.id===stopId);
  if(!day||!stop)return;
  if(!confirm(`¿Eliminar la parada "${stop.name}"?`))return;
  day.stops=day.stops.filter(item=>item.id!==stopId);
  dayRouteCache.clear();
  normalizeStatuses();
  save(state);
  await drawMap();
  timeline();
  await renderSheet(nextStop());
}

function timeline(){
  document.querySelector("#timeline-title").textContent=activeTrip.name;
  document.querySelector("#timeline-content").innerHTML=`
    <section class=timeline-overview>
      <div id=timeline-trip-summary>
        <strong>Calculando resumen…</strong>
        <span>Duración de conducción y visitas</span>
      </div>
      <button class=timeline-new-day data-new-day>＋ Crear nuevo día</button>
    </section>
    ${activeTrip.days.map(day=>`
      <section class=timeline-day>
        <div class=timeline-day-head>
          <div class=timeline-day-title>
            <h3>${day.title}</h3>
            <small>${day.date||"Sin fecha"} · ${formatDayRoute(day)} · ${day.stops.length} parada(s)</small>
            <span class=timeline-day-metrics data-day-metrics="${day.id}">Calculando duración…</span>
          </div>
          <div class=timeline-day-actions>
            <button data-add-day="${day.id}">＋ Parada</button>
            <button data-edit-day="${day.id}">✏️ Día</button>
            <button class=day-delete data-delete-day="${day.id}" ${day.stops.length?"disabled title='Mueve o elimina las paradas primero'":""}>🗑</button>
          </div>
        </div>
        ${day.notes?`<div class=timeline-day-notes><strong>📝 Notas</strong>${day.notes}</div>`:""}
        ${day.stops.length?day.stops.map((stop,index)=>`
          <article class="timeline-item ${stop.completed?"done":""}">
            <input type=checkbox data-timeline="${day.id}|${stop.id}" ${stop.completed?"checked":""}>
            <div class=timeline-main>
              <strong>${stop.icon} ${stop.name}</strong>
              <div class=timeline-meta>
                <label class=timeline-time-label>
                  <span>Hora</span>
                  <input class=timeline-time type=time value="${stop.time||""}" data-time-stop="${day.id}|${stop.id}">
                </label>
                <span class="timeline-status ${stop.status||"pending"}">${label(stop.status)}</span>
                <span class=timeline-duration>⏱ ${formatMinutes(stop.durationMinutes||0)}</span>
              </div>
            </div>
            <div class=timeline-manager-actions>
              <button title="Mover arriba" data-move-stop="${day.id}|${stop.id}|-1" ${index===0?"disabled":""}>↑</button>
              <button title="Mover abajo" data-move-stop="${day.id}|${stop.id}|1" ${index===day.stops.length-1?"disabled":""}>↓</button>
              <button title="Duplicar" data-duplicate-stop="${day.id}|${stop.id}">⧉</button>
              <button class=timeline-edit title="Editar o mover a otro día" data-timeline-edit="${day.id}|${stop.id}">✏️</button>
              <button class=timeline-delete title="Eliminar" data-timeline-delete="${day.id}|${stop.id}">🗑</button>
              <a class=timeline-nav target=_blank rel=noopener href="${mapsUrl(stop.address)}">Ir</a>
            </div>
          </article>`).join(""):`<div class=timeline-empty>
            <strong>Este día todavía no tiene paradas.</strong>
            <button data-add-day="${day.id}">＋ Agregar la primera parada</button>
          </div>`}
      </section>`).join("")}`;

  document.querySelectorAll("[data-timeline]").forEach(box=>box.onchange=async()=>{
    const [dayId,stopId]=box.dataset.timeline.split("|");
    const stop=realStop(dayId,stopId);
    stop.completed=box.checked;
    stop.status=box.checked?"completed":"pending";
    normalizeStatuses();
    save(state);
    await drawMap();
    timeline();
    await renderSheet(nextStop()||stop);
  });

  document.querySelectorAll("[data-time-stop]").forEach(input=>input.onchange=async()=>{
    const [dayId,stopId]=input.dataset.timeStop.split("|");
    await quickChangeTime(dayId,stopId,input.value);
  });

  document.querySelectorAll("[data-timeline-edit]").forEach(button=>button.onclick=()=>{
    const [dayId,stopId]=button.dataset.timelineEdit.split("|");
    openStopDialog(dayId,stopId);
  });

  document.querySelectorAll("[data-timeline-delete]").forEach(button=>button.onclick=async()=>{
    const [dayId,stopId]=button.dataset.timelineDelete.split("|");
    await deleteStopFromTimeline(dayId,stopId);
  });

  document.querySelectorAll("[data-duplicate-stop]").forEach(button=>button.onclick=async()=>{
    const [dayId,stopId]=button.dataset.duplicateStop.split("|");
    await duplicateStop(dayId,stopId);
  });

  document.querySelectorAll("[data-move-stop]").forEach(button=>button.onclick=async()=>{
    const [dayId,stopId,direction]=button.dataset.moveStop.split("|");
    await moveStop(dayId,stopId,Number(direction));
  });

  document.querySelectorAll("[data-add-day]").forEach(button=>button.onclick=()=>{
    openStopDialog(button.dataset.addDay,"");
  });

  document.querySelectorAll("[data-edit-day]").forEach(button=>button.onclick=()=>{
    openDayDialog(button.dataset.editDay);
  });

  document.querySelectorAll("[data-delete-day]").forEach(button=>button.onclick=async()=>{
    await deleteDay(button.dataset.deleteDay);
  });

  document.querySelectorAll("[data-new-day]").forEach(button=>button.onclick=()=>openDayDialog());

  updateDayMetrics();
}
function marker(){
  if(!userLocation)return;if(userMarker)map.removeLayer(userMarker);if(accuracyCircle)map.removeLayer(accuracyCircle);
  accuracyCircle=L.circle([userLocation.lat,userLocation.lng],{radius:userAccuracy||20,color:"#0a84ff",weight:1,fillOpacity:.08}).addTo(map);
  userMarker=L.circleMarker([userLocation.lat,userLocation.lng],{radius:9,color:"white",weight:4,fillColor:"#0a84ff",fillOpacity:1}).addTo(map);
}
async function position(p){userLocation={lat:p.coords.latitude,lng:p.coords.longitude};userAccuracy=p.coords.accuracy;marker();await arrival();await refreshLeg();await renderSheet();if(!document.querySelector("#driving-mode").classList.contains("hidden"))drive()}
function error(e){state.navigation.trackingEnabled=false;save(state);document.querySelector("#progress-pill").textContent=e.code===1?"Permiso rechazado":"No se pudo obtener ubicación"}
function start(){if(watchId!=null)navigator.geolocation.clearWatch(watchId);state.navigation.trackingEnabled=true;save(state);watchId=navigator.geolocation.watchPosition(position,error,{enableHighAccuracy:true,timeout:15000,maximumAge:3000})}
function stop(){if(watchId!=null)navigator.geolocation.clearWatch(watchId);watchId=null;state.navigation.trackingEnabled=false;save(state);renderSheet()}
function toggleTracking(){state.navigation.trackingEnabled?stop():start()}
function drive(){
  const s=nextStop();if(!s)return;
  const x=realStop(s.dayId,s.id),direct=haversineMeters(userLocation,{lat:s.lat,lng:s.lng});
  document.querySelector("#driving-content").innerHTML=`<div class=drive-card><div class=drive-icon>${s.icon}</div><div class="nav-status ${x.status}">${label(x.status)}</div><h2>${s.name}</h2><p>${s.address}</p><div class=drive-metrics><div class=drive-metric><strong>${fDist(currentLegRoute?.meters??direct)}</strong><span>Distancia</span></div><div class=drive-metric><strong>${fTime(currentLegRoute?.seconds)}</strong><span>Tiempo</span></div></div><div class=drive-actions><a target=_blank href="${mapsUrl(s.address)}">🧭 Llévame a la siguiente</a><button id=drive-complete>✓ Confirmar parada</button></div></div>`;
  document.querySelector("#drive-complete").onclick=async()=>{x.completed=true;x.status="completed";normalizeStatuses();save(state);await drawMap();await renderSheet();timeline();drive()}
}
document.querySelector("#sheet-handle").onclick=()=>{const s=document.querySelector("#bottom-sheet");s.classList.toggle("expanded");s.classList.toggle("compact")};
document.querySelector("#timeline-button").onclick=()=>{timeline();document.querySelector("#timeline-dialog").showModal()};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.querySelector("#"+b.dataset.close).close());
document.querySelector("#location-button").onclick=toggleTracking;
document.querySelector("#continue-button").onclick=()=>{document.querySelector("#driving-mode").classList.remove("hidden");if(!state.navigation.trackingEnabled)start();drive()};
document.querySelector("#close-driving").onclick=()=>document.querySelector("#driving-mode").classList.add("hidden");


document.querySelector("#day-form").onsubmit=async event=>{
  event.preventDefault();
  try{
    await saveDayFromForm();
    document.querySelector("#day-dialog").close();
  }catch(error){
    alert(error.message||"No se pudo guardar el día.");
  }
};
document.querySelectorAll('[data-close="day-dialog"]').forEach(button=>{
  button.onclick=()=>document.querySelector("#day-dialog").close();
});

document.querySelector("#add-stop-button").onclick=()=>openStopDialog();
document.querySelector("#stop-form").onsubmit=async event=>{
  event.preventDefault();
  try{
    await saveStopFromForm();
    document.querySelector("#stop-dialog").close();
  }catch(error){
    alert(error.message||"No se pudo guardar la parada.");
  }
};
document.querySelectorAll('[data-close="stop-dialog"]').forEach(button=>{
  button.onclick=()=>document.querySelector("#stop-dialog").close();
});

document.querySelector("#trip-title").textContent=activeTrip.name;
document.querySelector("#trip-title").title="V2.2.1 · Gestor de días y rutas";
await drawMap();await renderSheet();timeline();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
