/**
 * Configuración central de conectores premium.
 *
 * Por seguridad, RoadTrip AI no incluye claves privadas en el código fuente.
 * Se puede configurar en tiempo de ejecución mediante:
 *   window.ROADTRIP_PROVIDER_CONFIG = { google:{...}, apple:{...} }
 * o localStorage con la clave: roadtrip_provider_config_v1
 */
const STORAGE_KEY="roadtrip_provider_config_v1";

const DEFAULT_CONFIG=Object.freeze({
  google:{
    enabled:false,
    mode:"proxy",          // "proxy" o "direct"
    proxyUrl:"",           // Endpoint propio recomendado
    apiKey:"",             // Solo para pruebas; no recomendado en producción
    languageCode:"es",
    regionCode:"US"
  },
  apple:{
    enabled:false,
    mode:"mapkit",         // "mapkit" o "proxy"
    proxyUrl:"",
    language:"es-419",
    countryCode:"US"
  }
});

function safeParse(value){
  try{return value?JSON.parse(value):{};}catch{return {};}
}

function mergeProvider(base,override){
  return {...base,...(override&&typeof override==="object"?override:{})};
}

export function getProviderConfig(){
  const stored=typeof localStorage!=="undefined"?safeParse(localStorage.getItem(STORAGE_KEY)):{};
  const runtime=typeof window!=="undefined"&&window.ROADTRIP_PROVIDER_CONFIG
    ?window.ROADTRIP_PROVIDER_CONFIG:{};
  return {
    google:mergeProvider(DEFAULT_CONFIG.google,{...(stored.google||{}),...(runtime.google||{})}),
    apple:mergeProvider(DEFAULT_CONFIG.apple,{...(stored.apple||{}),...(runtime.apple||{})})
  };
}

export function saveProviderConfig(config={}){
  if(typeof localStorage==="undefined")return;
  const current=getProviderConfig();
  const next={
    google:mergeProvider(current.google,config.google),
    apple:mergeProvider(current.apple,config.apple)
  };
  localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
}

export function providerConfigStatus(){
  const config=getProviderConfig();
  return {
    google:{enabled:Boolean(config.google.enabled),mode:config.google.mode,configured:Boolean(config.google.proxyUrl||config.google.apiKey)},
    apple:{enabled:Boolean(config.apple.enabled),mode:config.apple.mode,configured:Boolean(config.apple.proxyUrl||(typeof window!=="undefined"&&window.mapkit))}
  };
}
