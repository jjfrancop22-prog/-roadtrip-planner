const STORAGE_KEY="roadtripai.navigation.preference.v3";

function safeText(value){return String(value||"").trim();}
function destination(stop){
  const lat=Number(stop?.lat),lng=Number(stop?.lng);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return `${lat},${lng}`;
  return safeText(stop?.address)||safeText(stop?.name);
}
export function getNavigationPreference(){
  try{return localStorage.getItem(STORAGE_KEY)||""}catch{return ""}
}
export function saveNavigationPreference(provider){
  if(!["google","apple"].includes(provider))return;
  try{localStorage.setItem(STORAGE_KEY,provider)}catch{}
}
export function clearNavigationPreference(){try{localStorage.removeItem(STORAGE_KEY)}catch{}}
export function buildNavigationUrl(stop,provider="google",options={}){
  const target=destination(stop);
  if(!target)return "";
  const avoid=[];
  if(options.avoidTolls)avoid.push("tolls");
  if(options.avoidHighways)avoid.push("highways");
  if(provider==="apple"){
    const params=new URLSearchParams({daddr:target,dirflg:"d"});
    if(safeText(stop?.name))params.set("q",safeText(stop.name));
    return `https://maps.apple.com/?${params.toString()}`;
  }
  const params=new URLSearchParams({api:"1",destination:target,travelmode:"driving"});
  if(avoid.length)params.set("avoid",avoid.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
export function openNavigation(stop,provider,options={}){
  const url=buildNavigationUrl(stop,provider,options);
  if(!url)throw new Error("La parada no tiene una dirección o coordenadas válidas.");
  window.location.href=url;
  return url;
}
export function providerLabel(provider){return provider==="apple"?"Apple Maps":"Google Maps"}
