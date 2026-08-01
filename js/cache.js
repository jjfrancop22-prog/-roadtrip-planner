const CACHE_KEY="roadtrip-smart-search-cache-v1";
const RECENT_KEY="roadtrip-smart-search-recents-v1";
const TTL_MS=7*24*60*60*1000;

function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}
}
function writeJson(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
}
export function normalizeQuery(query){
  return query.trim().toLocaleLowerCase("es");
}
export function getCachedSearch(query){
  const key=normalizeQuery(query);
  const cache=readJson(CACHE_KEY,{});
  const entry=cache[key];
  if(!entry)return null;
  if(Date.now()-entry.savedAt>TTL_MS){
    delete cache[key];writeJson(CACHE_KEY,cache);return null;
  }
  return entry.results;
}
export function setCachedSearch(query,results){
  const key=normalizeQuery(query);
  const cache=readJson(CACHE_KEY,{});
  cache[key]={savedAt:Date.now(),results};
  const keys=Object.keys(cache).sort((a,b)=>cache[b].savedAt-cache[a].savedAt);
  keys.slice(40).forEach(oldKey=>delete cache[oldKey]);
  writeJson(CACHE_KEY,cache);
}
export function addRecentSearch(query){
  const clean=query.trim();
  if(!clean)return;
  const recents=readJson(RECENT_KEY,[]).filter(item=>normalizeQuery(item)!==normalizeQuery(clean));
  recents.unshift(clean);
  writeJson(RECENT_KEY,recents.slice(0,8));
}
export function getRecentSearches(){
  return readJson(RECENT_KEY,[]);
}
export function getLocalSuggestions(query){
  const normalized=normalizeQuery(query);
  const recents=getRecentSearches();
  if(!normalized)return recents;
  return recents.filter(item=>normalizeQuery(item).includes(normalized));
}
export function cacheStats(){
  return {
    entries:Object.keys(readJson(CACHE_KEY,{})).length,
    recents:getRecentSearches().length
  };
}
