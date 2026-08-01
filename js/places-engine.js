/** Normaliza datos turísticos sin depender de un proveedor concreto. */
export function normalizePlace(place={}){
  return {
    id:place.id||null,
    name:String(place.name||"Lugar sin nombre"),
    address:String(place.address||""),
    lat:Number.isFinite(Number(place.lat))?Number(place.lat):null,
    lng:Number.isFinite(Number(place.lng))?Number(place.lng):null,
    category:place.category||place.type||"other",
    source:place.source||"user"
  };
}
