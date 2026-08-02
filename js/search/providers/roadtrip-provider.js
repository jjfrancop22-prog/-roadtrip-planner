import {SearchProvider} from "../search-provider.js";
import {seed} from "../../seed.js";

const STORAGE_KEY="roadtrip_ai_v2_1_0_c";

const normalizeText=value=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("es").trim();

function readCurrentState(){
  try{
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored?.trips?.length?stored:seed;
  }catch{return seed}
}

function allKnownPlaces(){
  const state=readCurrentState();
  const seen=new Set();
  const places=[];
  for(const trip of state.trips||[]){
    for(const day of trip.days||[]){
      for(const stop of day.stops||[]){
        const lat=Number(stop.lat??stop.latitude);
        const lng=Number(stop.lng??stop.longitude);
        if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;
        const key=`${normalizeText(stop.name)}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
        if(seen.has(key)) continue;
        seen.add(key);
        places.push({
          id:`roadtrip:${trip.id}:${day.id}:${stop.id}`,
          providerId:"roadtrip-ai",
          provider:"RoadTrip AI Places",
          providerPlaceId:`${trip.id}:${day.id}:${stop.id}`,
          name:stop.name||"Lugar",
          displayName:stop.address||[day.title,trip.name].filter(Boolean).join(" · "),
          address:stop.address||"",
          latitude:lat,longitude:lng,lat,lng,
          city:stop.city||"",state:stop.state||"",country:stop.country||"Estados Unidos",
          category:stop.type||"attraction",type:stop.type||"attraction",
          rating:stop.rating??null,isOpen:null,photos:stop.photoQuery?[stop.photoQuery]:[],
          source:"roadtrip",importance:1,
          tripId:trip.id,tripName:trip.name,dayId:day.id,dayTitle:day.title,
          icon:stop.icon||"📍",tip:stop.tip||"",durationMinutes:Number(stop.durationMinutes)||30,
          priorityLabel:stop.priority||"preferred",raw:stop
        });
      }
    }
  }
  return places;
}

function scoreText(place,query){
  const q=normalizeText(query);
  const name=normalizeText(place.name);
  const address=normalizeText(place.address);
  const words=q.split(/\s+/).filter(Boolean);
  if(!q||!words.length) return 0;
  let score=0;
  if(name===q) score+=100;
  else if(name.startsWith(q)) score+=75;
  else if(name.includes(q)) score+=60;
  if(address.includes(q)) score+=30;
  score+=words.reduce((sum,word)=>sum+(name.includes(word)?14:address.includes(word)?6:0),0);
  return score;
}

function routePoints(route){
  const source=Array.isArray(route)?route:(route?.points||route?.coordinates||[]);
  return source.map(point=>({
    lat:Number(point?.lat??point?.latitude??point?.[1]),
    lng:Number(point?.lng??point?.longitude??point?.[0])
  })).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lng));
}

const haversineKm=(a,b)=>{
  const R=6371,toRad=value=>value*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
};

export class RoadTripProvider extends SearchProvider{
  constructor(){
    super({
      id:"roadtrip-ai",name:"RoadTrip AI Places",priority:5,
      capabilities:{search:true,nearby:true,alongRoute:true,details:true}
    });
  }

  async search(query,{limit=12}={}){
    return allKnownPlaces()
      .map(place=>({...place,providerTextScore:scoreText(place,query)}))
      .filter(place=>place.providerTextScore>0)
      .sort((a,b)=>b.providerTextScore-a.providerTextScore)
      .slice(0,Math.max(1,Number(limit)||12));
  }

  async searchNearby(query,location,{radiusKm=50,limit=12}={}){
    const origin={lat:Number(location?.lat??location?.latitude),lng:Number(location?.lng??location?.longitude)};
    if(!Number.isFinite(origin.lat)||!Number.isFinite(origin.lng)) return this.search(query,{limit});
    return (await this.search(query,{limit:50}))
      .map(place=>({...place,distanceKm:haversineKm(origin,place)}))
      .filter(place=>place.distanceKm<=Math.max(1,Number(radiusKm)||50))
      .sort((a,b)=>a.distanceKm-b.distanceKm||b.providerTextScore-a.providerTextScore)
      .slice(0,limit);
  }

  async searchAlongRoute(query,route,{corridorKm=40,limit=12}={}){
    const points=routePoints(route);
    if(!points.length) return this.search(query,{limit});
    return (await this.search(query,{limit:60}))
      .map(place=>({...place,routeDistanceKm:Math.min(...points.map(point=>haversineKm(point,place)))}))
      .filter(place=>place.routeDistanceKm<=Math.max(1,Number(corridorKm)||40))
      .sort((a,b)=>a.routeDistanceKm-b.routeDistanceKm||b.providerTextScore-a.providerTextScore)
      .slice(0,limit);
  }

  async getPlaceDetails(placeId){
    return allKnownPlaces().find(place=>place.id===placeId||place.providerPlaceId===placeId)||null;
  }
}

export const roadTripProvider=new RoadTripProvider();
