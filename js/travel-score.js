/**
 * AI Travel Score — contrato modular inicial.
 * Aún no altera datos existentes. Permite incorporar la puntuación sin tocar app.js.
 */
const WEIGHTS={photo:25,family:10,accessibility:10,effort:10,popularity:15,time:10,cost:10,bestTime:10};

export function calculateTravelScore(criteria={}){
  const breakdown={};
  let total=0;
  for(const [key,max] of Object.entries(WEIGHTS)){
    const raw=Number(criteria[key]??0);
    const value=Math.max(0,Math.min(max,Number.isFinite(raw)?raw:0));
    breakdown[key]=value;
    total+=value;
  }
  return {score:Math.round(total),breakdown,level:travelScoreLevel(total)};
}

export function travelScoreLevel(score){
  if(score>=95)return "imperdible";
  if(score>=85)return "muy-recomendado";
  if(score>=70)return "recomendado";
  if(score>=50)return "opcional";
  return "interes-especifico";
}

export {WEIGHTS as TRAVEL_SCORE_WEIGHTS};
