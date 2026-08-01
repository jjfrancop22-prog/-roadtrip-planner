export function estimateFuelCost({distanceMiles=0,mpg=25,pricePerGallon=0}={}){
  if(mpg<=0)return null;
  return (Number(distanceMiles)/Number(mpg))*Number(pricePerGallon);
}
