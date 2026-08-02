# RoadTrip AI V3.2.0-A — Base oficial del motor de búsqueda

La aplicación debe consumir lugares exclusivamente mediante `providerManager`.

## Contrato obligatorio
Todos los proveedores implementan:
- `search()`
- `searchNearby()`
- `searchAlongRoute()`
- `getPlaceDetails()`

## Proveedor principal
OpenStreetMap (`osm-provider.js`).

## Extensión futura
Los conectores Google, Apple y RoadTrip AI Places se registrarán en `provider-manager.js` sin cambiar la interfaz del buscador.
