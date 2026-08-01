/**
 * Route Engine
 * Responsabilidad única: utilidades y contratos relacionados con distancias/rutas.
 * El cálculo de horarios vive en schedule-engine.js.
 */
export function formatDistance(meters){
  if(!Number.isFinite(meters))return "—";
  const miles=meters/1609.344;
  return miles<0.1?`${Math.round(meters)} m`:`${miles.toFixed(miles<10?1:0)} mi`;
}

export function formatDuration(minutes){
  const value=Math.max(0,Math.round(minutes||0));
  if(value<60)return `${value} min`;
  return `${Math.floor(value/60)} h ${value%60} min`;
}

export function isValidRoutePoint(value){
  return Boolean(value)&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lng));
}
