const normalize=value=>String(value||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export const OFFICIAL_PARKING_DATABASE=[
  {
    attraction:{
      names:["welcome to fabulous las vegas sign","welcome sign","las vegas sign"],
      lat:36.0820,lng:-115.1728,radiusMeters:500
    },
    options:[
      {
        id:"official-welcome-sign-lot",
        name:"Welcome to Fabulous Las Vegas Sign Parking Lot",
        address:"5100 Las Vegas Blvd S, Las Vegas, NV 89119",
        lat:36.08208,lng:-115.17284,
        official:true,verified:true,
        costType:"free",costLabel:"Gratis",estimatedCost:0,pricingModel:"free",
        walkMinutes:1,
        accessLabel:"Estacionamiento oficial para visitantes",
        note:"Parking oficial junto al letrero. Es pequeño y puede llenarse en horas concurridas.",
        sourceLabel:"Base oficial RoadTrip AI"
      }
    ]
  },
  {
    attraction:{
      names:["bellagio fountains","bellagio fountains y conservatorio","bellagio conservatory","bellagio"],
      lat:36.1126,lng:-115.1767,radiusMeters:900
    },
    options:[
      {
        id:"official-bellagio-self-parking",
        name:"Bellagio Self-Parking",
        address:"3600 S Las Vegas Blvd, Las Vegas, NV 89109",
        lat:36.11175,lng:-115.17622,
        official:true,verified:true,
        costType:"paid",costLabel:"Tarifa MGM vigente",pricingModel:"mgm-current",
        walkMinutes:4,
        accessLabel:"Parking oficial del Bellagio",
        note:"Parking propio del resort. Las tarifas pueden aumentar durante eventos especiales.",
        sourceLabel:"MGM Resorts"
      }
    ]
  },
  {
    attraction:{
      names:["sphere las vegas","sphere"],
      lat:36.1206,lng:-115.1614,radiusMeters:900
    },
    options:[
      {
        id:"official-sphere-event-parking",
        name:"Sphere On-Site Event Parking",
        address:"255 Sands Ave, Las Vegas, NV 89169",
        lat:36.12055,lng:-115.16155,
        official:true,verified:true,
        costType:"paid",costLabel:"Precio variable por evento",pricingModel:"event",
        walkMinutes:4,
        accessLabel:"Parking oficial limitado",
        note:"El estacionamiento en el sitio es limitado y normalmente debe reservarse para el evento.",
        sourceLabel:"Sphere"
      }
    ]
  },
  {
    attraction:{
      names:["area15"],
      lat:36.1320,lng:-115.2091,radiusMeters:900
    },
    options:[
      {
        id:"official-area15-parking",
        name:"AREA15 Main Parking",
        address:"3215 S Rancho Dr, Las Vegas, NV 89102",
        lat:36.13185,lng:-115.20895,
        official:true,verified:true,
        costType:"conditional",costLabel:"Gratis para residentes de Nevada; tarifa para otros",pricingModel:"conditional",
        walkMinutes:2,
        accessLabel:"Parking oficial de AREA15",
        note:"Los residentes de Nevada reciben estacionamiento gratuito con identificación válida; otros visitantes pueden pagar una tarifa.",
        sourceLabel:"AREA15"
      }
    ]
  },
  {
    attraction:{
      names:["fremont street experience","fremont street"],
      lat:36.1708,lng:-115.1440,radiusMeters:1000
    },
    options:[
      {
        id:"official-fremont-street-garage",
        name:"Fremont Street Experience Parking Garage",
        address:"111 S 4th St, Las Vegas, NV 89101",
        lat:36.16892,lng:-115.14292,
        official:true,verified:true,
        costType:"paid",costLabel:"$4/h lun–jue; $5/h vie–dom",pricingModel:"fremont-current",
        hourlyCostWeekday:4,hourlyCostWeekend:5,dailyCapWeekday:20,dailyCapWeekend:25,
        walkMinutes:4,
        accessLabel:"Garage oficial de Fremont Street Experience",
        note:"Incluye 15 minutos de gracia. La tarifa puede variar durante eventos.",
        sourceLabel:"Fremont Street Experience"
      }
    ]
  }
];

const haversine=(a,b)=>{
  const R=6371000,toRad=value=>value*Math.PI/180;
  const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+
    Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
};

export function findOfficialParking(place){
  if(!place)return [];
  const name=normalize(place.name);
  const match=OFFICIAL_PARKING_DATABASE.find(entry=>{
    const nameMatch=entry.attraction.names.some(candidate=>{
      const normalized=normalize(candidate);
      return name.includes(normalized)||normalized.includes(name);
    });
    const distance=Number.isFinite(place.lat)&&Number.isFinite(place.lng)
      ?haversine(place,entry.attraction):Infinity;
    return nameMatch||distance<=entry.attraction.radiusMeters;
  });
  return match?match.options.map(option=>({...option,source:"official-database"})):[];
}
