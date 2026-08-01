export function estimateWalkingMinutes(meters,speedMetersPerMinute=80){
  if(!Number.isFinite(Number(meters)))return null;
  return Math.max(1,Math.round(Number(meters)/speedMetersPerMinute));
}
