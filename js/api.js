const NOMINATIM_URL="https://nominatim.openstreetmap.org/search";
let lastRequestAt=0;
const MIN_REQUEST_INTERVAL=1100;

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function normalizePlace(item){
  const address=item.address||{};
  return {
    id:`${item.osm_type||"place"}-${item.osm_id||item.place_id}`,
    placeId:item.place_id,
    osmType:item.osm_type,
    osmId:item.osm_id,
    name:item.name||item.namedetails?.name||item.display_name?.split(",")[0]||"Lugar",
    displayName:item.display_name||"",
    lat:Number(item.lat),
    lng:Number(item.lon),
    category:item.category||item.class||"place",
    type:item.type||"place",
    importance:Number(item.importance||0),
    city:address.city||address.town||address.village||address.municipality||"",
    county:address.county||"",
    state:address.state||address.region||"",
    country:address.country||"",
    countryCode:(address.country_code||"").toUpperCase(),
    postcode:address.postcode||"",
    boundingBox:Array.isArray(item.boundingbox)?item.boundingbox.map(Number):null,
    extraTags:item.extratags||{},
    fee:item.extratags?.fee||"",
    access:item.extratags?.access||"",
    operator:item.extratags?.operator||"",
    capacity:item.extratags?.capacity||"",
    parking:item.extratags?.parking||""
  };
}

export async function searchNominatim(query,{limit=8,language="es,en"}={}){
  const clean=query.trim();
  if(clean.length<3) return [];

  const elapsed=Date.now()-lastRequestAt;
  if(elapsed<MIN_REQUEST_INTERVAL) await wait(MIN_REQUEST_INTERVAL-elapsed);
  lastRequestAt=Date.now();

  const params=new URLSearchParams({
    q:clean,
    format:"jsonv2",
    addressdetails:"1",
    namedetails:"1",
    extratags:"1",
    limit:String(Math.min(limit,10)),
    dedupe:"1",
    "accept-language":language
  });

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${NOMINATIM_URL}?${params}`,{
      headers:{"Accept":"application/json"},
      signal:controller.signal
    });
    if(!response.ok) throw new Error(`OpenStreetMap respondió ${response.status}`);
    const data=await response.json();
    return Array.isArray(data)?data.map(normalizePlace):[];
  }finally{
    clearTimeout(timeout);
  }
}


export async function searchNearbyParking(place,{limit=10}={}){
  if(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return [];
  const delta=0.035;
  const params=new URLSearchParams({
    q:"parking",
    format:"jsonv2",
    addressdetails:"1",
    namedetails:"1",
    extratags:"1",
    limit:String(Math.min(limit,10)),
    dedupe:"1",
    bounded:"1",
    viewbox:`${place.lng-delta},${place.lat+delta},${place.lng+delta},${place.lat-delta}`,
    "accept-language":"es,en"
  });

  const elapsed=Date.now()-lastRequestAt;
  if(elapsed<MIN_REQUEST_INTERVAL)await wait(MIN_REQUEST_INTERVAL-elapsed);
  lastRequestAt=Date.now();

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${NOMINATIM_URL}?${params}`,{
      headers:{"Accept":"application/json"},
      signal:controller.signal
    });
    if(!response.ok)throw new Error(`OpenStreetMap respondió ${response.status}`);
    const data=await response.json();
    return (Array.isArray(data)?data:[]).map(normalizePlace).map(option=>{
      const fee=String(option.fee||"").toLowerCase();
      const free=["no","0","false"].includes(fee);
      const paid=["yes","1","true"].includes(fee);
      return {
        id:`osm-parking-${option.osmType}-${option.osmId}`,
        name:option.name||"Estacionamiento",
        address:option.displayName,
        lat:option.lat,
        lng:option.lng,
        source:"openstreetmap",
        costType:free?"free":paid?"paid":"verify",
        costLabel:free?"Gratis":paid?"Pago · costo por confirmar":"Tarifa por confirmar",
        pricingModel:free?"free":"unknown",
        estimatedCost:free?0:null,
        note:free
          ?"OpenStreetMap indica fee=no. La opción todavía será validada por distancia, acceso y contexto."
          :"La tarifa no está publicada de forma confiable. Confirma antes de estacionar.",
        access:option.access,
        operator:option.operator,
        parking:option.parking,
        verified:false,
        official:false
      };
    });
  }finally{
    clearTimeout(timeout);
  }
}
