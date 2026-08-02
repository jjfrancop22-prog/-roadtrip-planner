const escapeHtml=value=>String(value??"")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

const iconFor=place=>{
  const value=`${place.category} ${place.type}`.toLowerCase();
  if(/hotel|motel|hostel|guest_house/.test(value))return "🏨";
  if(/restaurant|fast_food/.test(value))return "🍔";
  if(/cafe|coffee/.test(value))return "☕";
  if(/fuel|charging_station/.test(value))return "⛽";
  if(/parking/.test(value))return "🅿️";
  if(/hospital|clinic|pharmacy/.test(value))return "🏥";
  if(/park|nature|reserve|lake|beach/.test(value))return "🌲";
  if(/museum|attraction|viewpoint|monument/.test(value))return "📸";
  if(/supermarket|mall|shop/.test(value))return "🛒";
  return "📍";
};

export function renderLoading(container){
  container.innerHTML=`<div class="smart-search-state"><i class="search-spinner"></i><strong>Buscando lugares…</strong><span>Consultando RoadTrip AI Places y OpenStreetMap</span></div>`;
}
export function renderMessage(container,title,message,kind="info"){
  container.innerHTML=`<div class="smart-search-state ${kind}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
}
export function renderRecent(container,items,onChoose){
  if(!items.length){container.innerHTML="";return}
  container.innerHTML=`<section class="smart-search-recent"><strong>🕘 Búsquedas recientes</strong><div>${items.map((item,index)=>`<button type="button" data-recent-index="${index}">${escapeHtml(item)}</button>`).join("")}</div></section>`;
  container.querySelectorAll("[data-recent-index]").forEach(button=>{
    button.onclick=()=>onChoose(items[Number(button.dataset.recentIndex)]);
  });
}
export function renderResults(container,results,onSelect){
  if(!results.length){
    renderMessage(container,"Sin resultados","Prueba con el nombre completo y la ciudad.","empty");
    return;
  }
  container.innerHTML=results.map((place,index)=>`
    <article class="smart-place-card">
      <div class="smart-place-icon">${iconFor(place)}</div>
      <div class="smart-place-body">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml([place.city,place.state,place.country].filter(Boolean).join(" · "))}</span>
        <small>${escapeHtml(place.displayName)}</small>
        <div class="smart-place-meta">
          ${Number.isFinite(place.distanceKm)?`<b>📍 ${place.distanceKm<1?`${Math.round(place.distanceKm*1000)} m`:`${place.distanceKm.toFixed(1)} km`}</b>`:""}
          ${Number.isFinite(place.estimatedDriveMinutes)?`<b>🚗 ${place.estimatedDriveMinutes} min</b>`:""}
          ${place.onRoute?`<b>🛣 En tu ruta</b>`:place.rankingReason?`<b>${place.farFromContext?"⚠️":"📌"} ${escapeHtml(place.rankingReason)}</b>`:""}
          ${Number.isFinite(place.smartScore)?`<b>🤖 ${place.smartScore}/100</b>`:""}
        </div>
        <em>${escapeHtml(place.type||place.category)} · ${escapeHtml((place.sources||[place.provider]).join(" + "))}</em>
      </div>
      <button type="button" data-place-index="${index}">Agregar</button>
    </article>`).join("");
  container.querySelectorAll("[data-place-index]").forEach(button=>{
    button.onclick=()=>onSelect(results[Number(button.dataset.placeIndex)]);
  });
}
