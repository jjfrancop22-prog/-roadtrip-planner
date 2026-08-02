const normalizeText=value=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

const toPoint=value=>{
  const lat=Number(value?.lat??value?.latitude??value?.[1]);
  const lng=Number(value?.lng??value?.longitude??value?.[0]);
  return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
};

export function haversineKm(a,b){
  const p1=toPoint(a),p2=toPoint(b);
  if(!p1||!p2)return null;
  const R=6371,toRad=v=>v*Math.PI/180;
  const dLat=toRad(p2.lat-p1.lat),dLng=toRad(p2.lng-p1.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(p1.lat))*Math.cos(toRad(p2.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

function routePoints(route){
  const source=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
  return source.map(toPoint).filter(Boolean);
}

// Distancia aproximada del punto a cada segmento de la ruta, usando una
// proyección local. Es mucho más precisa que medir solo contra las paradas.
function distanceToSegmentKm(point,a,b){
  const p=toPoint(point),p1=toPoint(a),p2=toPoint(b);
  if(!p||!p1||!p2)return Infinity;
  const meanLat=(p1.lat+p2.lat+p.lat)/3*Math.PI/180;
  const kx=111.320*Math.cos(meanLat),ky=110.574;
  const ax=p1.lng*kx,ay=p1.lat*ky,bx=p2.lng*kx,by=p2.lat*ky,px=p.lng*kx,py=p.lat*ky;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  if(!len2)return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}

export function distanceToRouteKm(point,route){
  const points=routePoints(route);
  if(!toPoint(point)||!points.length)return null;
  if(points.length===1)return haversineKm(point,points[0]);
  let best=Infinity;
  for(let i=1;i<points.length;i++)best=Math.min(best,distanceToSegmentKm(point,points[i-1],points[i]));
  return Number.isFinite(best)?best:null;
}

function nameMatchScore(query,item){
  const q=normalizeText(query),name=normalizeText(item.name),address=normalizeText(item.address||item.displayName);
  if(!q)return 0;
  if(name===q)return 100;
  if(name.startsWith(q))return 94;
  if(name.includes(q))return 86;
  const words=q.split(" ").filter(Boolean);
  const matched=words.filter(word=>name.includes(word)||address.includes(word)).length;
  return Math.min(82,40+(matched/Math.max(1,words.length))*42);
}

function proximityScore(distanceKm){
  if(!Number.isFinite(distanceKm))return 30;
  if(distanceKm<=2)return 100;
  if(distanceKm<=5)return 96;
  if(distanceKm<=15)return 88;
  if(distanceKm<=30)return 75;
  if(distanceKm<=75)return 55;
  if(distanceKm<=150)return 35;
  return Math.max(0,20-distanceKm/150);
}

function routeScore(routeDistanceKm){
  if(!Number.isFinite(routeDistanceKm))return 30;
  if(routeDistanceKm<=1.5)return 100;
  if(routeDistanceKm<=5)return 94;
  if(routeDistanceKm<=10)return 82;
  if(routeDistanceKm<=25)return 55;
  if(routeDistanceKm<=50)return 25;
  return 0;
}

export function rankSearchResults(items,query,{location,route,limit=12}={}){
  const origin=toPoint(location),hasRoute=routePoints(route).length>0;
  return items.map(item=>{
    const point=toPoint(item);
    const distanceKm=origin&&point?haversineKm(origin,point):Number(item.distanceKm);
    const routeDistanceKm=hasRoute&&point?distanceToRouteKm(point,route):Number(item.routeDistanceKm);
    const nameScore=nameMatchScore(query,item);
    const nearScore=proximityScore(distanceKm);
    const corridorScore=routeScore(routeDistanceKm);
    const sourceScore=item.providerId==="roadtrip-ai"?100:item.providerId==="google"?90:item.providerId==="apple"?88:76;
    const popularityScore=Math.min(100,Number(item.importance||0)*100||Number(item.rating||0)*20||45);

    // Si hay GPS, la cercanía manda. Si no, la ruta activa toma ese peso.
    const smartScore=Math.round(origin
      ? nameScore*.27+nearScore*.38+corridorScore*.22+sourceScore*.08+popularityScore*.05
      : nameScore*.32+corridorScore*.43+sourceScore*.15+popularityScore*.10);
    const onRoute=Number.isFinite(routeDistanceKm)&&routeDistanceKm<=8;
    const farFromContext=(origin&&Number.isFinite(distanceKm)&&distanceKm>250)&&(!onRoute);
    return {
      ...item,
      distanceKm:Number.isFinite(distanceKm)?distanceKm:null,
      routeDistanceKm:Number.isFinite(routeDistanceKm)?routeDistanceKm:null,
      estimatedDriveMinutes:Number.isFinite(distanceKm)?Math.max(1,Math.round(distanceKm/55*60)):null,
      onRoute,
      farFromContext,
      smartScore,
      rankingReason:onRoute?"En tu ruta":Number.isFinite(distanceKm)&&distanceKm<=25?"Cerca de ti":farFromContext?"Lejos de tu viaje":"Resultado relevante"
    };
  }).sort((a,b)=>
    Number(a.farFromContext)-Number(b.farFromContext)||
    b.smartScore-a.smartScore||
    (a.distanceKm??Infinity)-(b.distanceKm??Infinity)
  ).slice(0,Math.max(1,Number(limit)||12));
}

let lastLocation=null,lastLocationAt=0;
export function getLiveLocation({timeout=6500,maximumAge=120000}={}){
  if(lastLocation&&Date.now()-lastLocationAt<maximumAge)return Promise.resolve(lastLocation);
  if(!navigator.geolocation)return Promise.resolve(null);
  return new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(position=>{
      lastLocation={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy};
      lastLocationAt=Date.now();resolve(lastLocation);
    },()=>resolve(null),{enableHighAccuracy:true,timeout,maximumAge});
  });
}
