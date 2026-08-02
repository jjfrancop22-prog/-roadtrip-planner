/**
 * Contrato base para proveedores de búsqueda de RoadTrip AI.
 * Cada conector debe implementar los cuatro métodos públicos.
 */
export class SearchProvider {
  constructor({id,name,priority=100,enabled=true,capabilities={}}={}){
    if(new.target===SearchProvider){
      throw new TypeError("SearchProvider es una interfaz base y no puede instanciarse directamente.");
    }
    this.id=id||"provider";
    this.name=name||this.id;
    this.priority=Number(priority)||100;
    this.enabled=enabled!==false;
    this.capabilities={
      search:true,
      nearby:false,
      alongRoute:false,
      details:false,
      ...capabilities
    };
  }

  async search(){ throw new Error(`${this.name} debe implementar search()`); }
  async searchNearby(){ throw new Error(`${this.name} debe implementar searchNearby()`); }
  async searchAlongRoute(){ throw new Error(`${this.name} debe implementar searchAlongRoute()`); }
  async getPlaceDetails(){ throw new Error(`${this.name} debe implementar getPlaceDetails()`); }

  normalizeResult(result){ return result; }
}

export const REQUIRED_PROVIDER_METHODS=[
  "search",
  "searchNearby",
  "searchAlongRoute",
  "getPlaceDetails"
];

export function assertSearchProvider(provider){
  if(!provider||typeof provider!=="object") throw new TypeError("Proveedor inválido.");
  for(const method of REQUIRED_PROVIDER_METHODS){
    if(typeof provider[method]!=="function"){
      throw new TypeError(`El proveedor ${provider.id||"sin id"} no implementa ${method}().`);
    }
  }
  if(!provider.id) throw new TypeError("Todo proveedor debe declarar un id único.");
  return provider;
}
