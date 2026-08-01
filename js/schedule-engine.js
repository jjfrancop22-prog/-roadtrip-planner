const DEFAULT_VISIT_MINUTES={
  attraction:45,photo:30,parking:10,food:60,hotel:30,fuel:20,other:30
};

export function minutesFromTime(value,fallback=7*60){
  const match=/^(\d{1,2}):(\d{2})$/.exec(String(value||""));
  if(!match)return fallback;
  return Number(match[1])*60+Number(match[2]);
}

export function timeFromMinutes(total){
  const normalized=((Math.round(total)%1440)+1440)%1440;
  return `${String(Math.floor(normalized/60)).padStart(2,"0")}:${String(normalized%60).padStart(2,"0")}`;
}

function smartVisitMinutes(stop){
  const text=`${stop?.name||""} ${stop?.type||""} ${stop?.smartPlace?.category||""} ${stop?.smartPlace?.placeType||""}`.toLowerCase();
  if(/hotel|motel|hostel|casino/.test(text))return 30;
  if(/restaurant|cafe|coffee|food|almuerzo|desayuno|cena/.test(text))return 60;
  if(/fuel|gas station|charging/.test(text))return 20;
  if(/parking/.test(text))return 10;
  if(/visitor center|centro de visitantes/.test(text))return 20;
  if(/museum|museo|historic site|monument/.test(text))return 60;
  if(/trail|sendero|hike|caminata|falls|waterfall|castle|vikingsholm/.test(text))return 60;
  if(/sand dunes|dunes|dunas|view|viewpoint|point|overlook|palette|basin|tufa|beach|arch|photo/.test(text))return 30;
  if(/national park|state park|nature reserve|lake|park/.test(text))return 45;
  return DEFAULT_VISIT_MINUTES[stop?.type]??30;
}

export function suggestedVisitMinutes(stop){
  const explicit=Number(stop?.durationMinutes);
  if(stop?.durationSource==="manual"&&Number.isFinite(explicit)&&explicit>=0)return explicit;
  return smartVisitMinutes(stop);
}

function validPoint(value){
  return value&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lng));
}

/**
 * Construye la línea de tiempo del día usando las piernas calculadas por RouteEngine.
 * No conoce UI, almacenamiento, mapas ni parking.
 */
export async function recalculateDaySchedule(day,{origin=null,routeProvider}={}){
  if(!day||!Array.isArray(day.stops))return null;
  day.startTime=day.startTime||"07:00";
  const stops=day.stops;
  const located=stops.filter(validPoint);
  const points=[];
  const useOrigin=validPoint(origin);
  if(useOrigin)points.push({lat:Number(origin.lat),lng:Number(origin.lng)});
  for(const stop of located)points.push({lat:Number(stop.lat),lng:Number(stop.lng)});

  let routeData=null;
  if(points.length>=2&&routeProvider){
    try{routeData=await routeProvider(points);}catch{routeData=null;}
  }
  const legs=Array.isArray(routeData?.legs)?routeData.legs:[];
  let cursor=minutesFromTime(day.startTime);
  let locatedIndex=0;
  let totalMeters=0,totalDrivingMinutes=0,totalVisitMinutes=0;

  stops.forEach((stop,index)=>{
    const visit=suggestedVisitMinutes(stop);
    stop.durationMinutes=visit;
    if(stop.durationSource!=="manual")stop.durationSource="smart";
    let leg=null;
    if(validPoint(stop)){
      const legIndex=useOrigin?locatedIndex:locatedIndex-1;
      if(legIndex>=0)leg=legs[legIndex]||null;
      locatedIndex++;
    }
    const driveMinutes=leg?Math.max(1,Math.round(Number(leg.duration||0)/60)):0;
    const driveMeters=leg?Number(leg.distance||0):0;
    cursor+=driveMinutes;
    stop.routeSchedule={
      automatic:true,
      sequence:index+1,
      arrivalTime:timeFromMinutes(cursor),
      departureTime:timeFromMinutes(cursor+visit),
      driveMinutes,
      driveMeters,
      calculatedAt:new Date().toISOString(),
      routeAvailable:Boolean(leg)
    };
    stop.time=stop.routeSchedule.arrivalTime;
    cursor+=visit;
    totalMeters+=driveMeters;
    totalDrivingMinutes+=driveMinutes;
    totalVisitMinutes+=visit;
  });

  day.routeSummary={
    automatic:true,
    startTime:day.startTime,
    endTime:timeFromMinutes(cursor),
    totalMeters,
    totalDrivingMinutes,
    totalVisitMinutes,
    calculatedAt:new Date().toISOString(),
    routeAvailable:Boolean(routeData)
  };
  return day.routeSummary;
}
