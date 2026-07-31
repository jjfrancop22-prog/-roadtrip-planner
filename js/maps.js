export const mapsUrl=a=>`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}&travelmode=driving`;
export function haversine(a,b){if(!a||!b)return null;const R=3958.8,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
