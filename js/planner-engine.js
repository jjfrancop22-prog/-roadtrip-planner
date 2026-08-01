/**
 * Planner Engine — punto único para futuras optimizaciones.
 * En esta base estable no reordena ni elimina paradas automáticamente.
 */
export function analyzeDayPlan(day,{targetArrivalMinutes=null}={}){
  const summary=day?.routeSummary||null;
  if(!summary)return {status:"pending",warnings:[]};
  const warnings=[];
  if(targetArrivalMinutes!=null){
    const [h,m]=String(summary.endTime||"00:00").split(":").map(Number);
    const end=h*60+m;
    if(end>targetArrivalMinutes)warnings.push({type:"late-arrival",minutes:end-targetArrivalMinutes});
  }
  return {status:warnings.length?"warning":"ok",warnings,summary};
}
