
import {load,save} from "./storage.js";
import {seed} from "./seed.js";
import {mapsUrl} from "./maps.js";

let state=load()||structuredClone(seed),route="dashboard",installPrompt=null;
const $=s=>document.querySelector(s),app=$("#app"),title=$("#page-title");
const trip=()=>state.trips.find(t=>t.id===state.selectedTripId)||state.trips[0];
const allStops=t=>t.days.flatMap(d=>d.stops.map(s=>({...s,dayTitle:d.title})));
const progress=t=>{const s=allStops(t);return s.length?Math.round(s.filter(x=>x.completed).length/s.length*100):0};
const nextStop=t=>allStops(t).find(x=>!x.completed)||null;
const esc=s=>(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function persist(){save(state)}
function setRoute(r){route=r;document.querySelectorAll("[data-route]").forEach(b=>b.classList.toggle("active",b.dataset.route===r));render()}
function render(){document.documentElement.dataset.theme=state.settings.theme;if(route==="dashboard")dashboard();if(route==="trips")trips();if(route==="planner")planner();if(route==="center")center();if(route==="settings")settings();bind()}
function dashboard(){
 const t=trip(),p=progress(t),n=nextStop(t),remaining=Math.max(0,t.budget-t.spent);
 title.textContent="Dashboard";
 app.innerHTML=`<section class=hero><small>V2.0.0-A · FUNDACIÓN AI</small><h2>${esc(t.emoji)} ${esc(t.name)}</h2><p>${esc(t.route)}</p><div class=progress><i style="width:${p}%;background:white"></i></div><div class=hero-actions>${n?`<a class="button secondary" target=_blank href="${mapsUrl(n.address)}">🚗 Continuar viaje</a>`:""}<button class="button primary" data-open-trip>Ver proyecto</button></div></section>
 <div class=section-head><h2>Resumen del proyecto</h2><span class=muted>${p}% completado</span></div>
 <section class="grid dashboard-grid">
  <article class=card><div class=label>Próxima parada</div><div class=metric>${n?esc(n.icon):"🎉"}</div><h3>${n?esc(n.name):"Viaje completado"}</h3><p class=muted>${n?esc(n.time+" · "+n.dayTitle):"Sin pendientes"}</p></article>
  <article class=card><div class=label>Presupuesto disponible</div><div class=metric>$${remaining.toFixed(2)}</div><p class=muted>$${t.spent.toFixed(2)} gastados de $${t.budget.toFixed(2)}</p></article>
  <article class=card><div class=label>Estado</div><div class="status ${t.status==="Idea"?"idea":""}">${esc(t.status)}</div><h3>${allStops(t).length} paradas</h3><p class=muted>${t.days.length} días · ${t.travelers} viajeros</p></article>
 </section>
 <div class=section-head><h2>Módulos V2</h2><span class=muted>Arquitectura lista</span></div>
 <section class="grid dashboard-grid">
  ${[["🧠","Planificador Inteligente","Base preparada para generar itinerarios."],["🗺️","Mapa Premium","Base preparada para rutas y capas."],["🚗","Asistente de Ruta","Continuar viaje y próxima parada."],["🧳","Centro del Viajero","Presupuesto, hoteles y documentos."],["📸","Diario de Viaje","Fotos, notas y línea de tiempo."]].map(x=>`<article class="card module"><div class=module-icon>${x[0]}</div><strong>${x[1]}</strong><span class=muted>${x[2]}</span></article>`).join("")}
 </section>`;
}
function trips(){
 title.textContent="Mis viajes";
 app.innerHTML=`<section class=hero><small>PROYECTOS DE VIAJE</small><h2>Todos tus viajes en una plataforma</h2><p>Crea y conserva viajes futuros sin comenzar desde cero.</p><div class=hero-actions><button class="button secondary" data-new-trip>＋ Nuevo viaje</button></div></section>
 <div class=section-head><h2>Viajes</h2><span class=muted>${state.trips.length} proyecto(s)</span></div>
 <section class="grid trip-grid">${state.trips.map(t=>`<article class="card trip-card"><div class=trip-title><div class=trip-emoji>${esc(t.emoji)}</div><div><h3>${esc(t.name)}</h3><span class="status ${t.status==="Idea"?"idea":""}">${esc(t.status)}</span></div></div><p class=muted>${esc(t.route)}</p><div class=progress><i style="width:${progress(t)}%"></i></div><div class=actions><button class="button primary" data-select-trip="${t.id}">Abrir</button></div></article>`).join("")}</section>`;
}
function planner(){
 title.textContent="Planificador";
 const t=trip();
 app.innerHTML=`<section class=hero><small>PLANIFICADOR INTELIGENTE</small><h2>${esc(t.name)}</h2><p>En esta fundación ya existe el espacio para construir el motor automático de itinerarios.</p></section>
 <div class=section-head><h2>Itinerario actual</h2><span class=muted>${t.days.length} días</span></div>
 <section class=timeline>${t.days.length?t.days.map(d=>`<article class=day><h3>${esc(d.title)}</h3>${d.stops.map(s=>`<label class="stop ${s.completed?"done":""}"><input type=checkbox data-toggle="${d.id}|${s.id}" ${s.completed?"checked":""}><span><strong>${esc(s.icon)} ${esc(s.name)}</strong><br><small class=muted>${esc(s.time)} · ${esc(s.address)}</small></span></label>`).join("")}</article>`).join(""):`<div class=notice>Este viaje todavía no tiene itinerario.</div>`}</section>`;
}
function center(){
 const t=trip();
 title.textContent="Centro del viajero";
 app.innerHTML=`<section class=hero><small>CENTRO DEL VIAJERO</small><h2>${esc(t.name)}</h2><p>Panel central para toda la información operativa del viaje.</p></section>
 <div class=section-head><h2>Información principal</h2></div>
 <section class="grid dashboard-grid">
  <article class=card><div class=module-icon>💰</div><h3>Presupuesto</h3><p class=muted>$${t.spent.toFixed(2)} de $${t.budget.toFixed(2)}</p></article>
  <article class=card><div class=module-icon>👥</div><h3>Viajeros</h3><p class=muted>${t.travelers} persona(s)</p></article>
  <article class=card><div class=module-icon>🚘</div><h3>Transporte</h3><p class=muted>${esc(t.vehicle)}</p></article>
  <article class=card><div class=module-icon>🏨</div><h3>Hoteles</h3><p class=muted>Preparado para la siguiente entrega.</p></article>
  <article class=card><div class=module-icon>📄</div><h3>Documentos</h3><p class=muted>Preparado para la siguiente entrega.</p></article>
  <article class=card><div class=module-icon>⛽</div><h3>Combustible</h3><p class=muted>Preparado para la siguiente entrega.</p></article>
 </section>`;
}
function settings(){
 title.textContent="Ajustes";
 app.innerHTML=`<section class=grid><div class=setting><div><strong>Modo oscuro</strong><div class=muted>Preferencia persistente</div></div><input id=theme type=checkbox ${state.settings.theme==="dark"?"checked":""}></div><article class=card><h3>RoadTrip AI V2.0.0-A</h3><p class=muted>Arquitectura modular, múltiples viajes, dashboard renovado y navegación entre proyectos.</p></article><div class=notice>La V1.1.0 se mantiene como respaldo independiente.</div></section>`;
}
function bind(){
 document.querySelectorAll("[data-open-trip]").forEach(b=>b.onclick=()=>setRoute("planner"));
 document.querySelectorAll("[data-new-trip]").forEach(b=>b.onclick=()=>$("#trip-dialog").showModal());
 document.querySelectorAll("[data-select-trip]").forEach(b=>b.onclick=()=>{state.selectedTripId=b.dataset.selectTrip;persist();setRoute("dashboard")});
 document.querySelectorAll("[data-toggle]").forEach(b=>b.onchange=()=>{const[d,s]=b.dataset.toggle.split("|"),day=trip().days.find(x=>x.id===d),stop=day.stops.find(x=>x.id===s);stop.completed=b.checked;persist();render()});
 const th=$("#theme");if(th)th.onchange=()=>{state.settings.theme=th.checked?"dark":"light";persist();render()};
}
document.querySelectorAll("[data-route]").forEach(b=>b.onclick=()=>setRoute(b.dataset.route));
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).close());
$("#trip-form").onsubmit=e=>{e.preventDefault();const t={id:uid("trip"),name:$("#trip-name").value.trim(),route:$("#trip-route").value.trim(),startDate:$("#trip-start").value,endDate:$("#trip-end").value,travelers:Number($("#trip-travelers").value)||1,emoji:$("#trip-emoji").value||"🚗",vehicle:$("#trip-vehicle").value.trim()||"Por definir",budget:Number($("#trip-budget").value)||0,spent:0,status:"Idea",days:[]};state.trips.push(t);state.selectedTripId=t.id;persist();$("#trip-dialog").close();e.target.reset();setRoute("dashboard")};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("#install-button").classList.remove("hidden")});$("#install-button").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("#install-button").classList.add("hidden")};
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
persist();render();
