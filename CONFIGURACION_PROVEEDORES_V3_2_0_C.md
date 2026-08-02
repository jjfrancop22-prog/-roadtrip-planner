# Configuración de proveedores premium — V3.2.0-C

Los conectores premium están desactivados por defecto para evitar exponer credenciales.
OpenStreetMap y RoadTrip AI Places siguen activos normalmente.

## Configuración en tiempo de ejecución

Antes de cargar `app.js`, se puede definir:

```html
<script>
window.ROADTRIP_PROVIDER_CONFIG = {
  google: {
    enabled: true,
    mode: "proxy",
    proxyUrl: "https://TU-SERVIDOR/api/places"
  },
  apple: {
    enabled: true,
    mode: "proxy",
    proxyUrl: "https://TU-SERVIDOR/api/places"
  }
};
</script>
```

También puede guardarse el mismo objeto en `localStorage` bajo la clave:

`roadtrip_provider_config_v1`

## Contrato esperado del proxy

Solicitud POST:

```json
{
  "provider": "google",
  "action": "search",
  "query": "Ross",
  "options": {}
}
```

El proxy debe devolver un arreglo o un objeto con `results`/`places`.

## Apple MapKit JS

Apple también puede trabajar en modo `mapkit` si `window.mapkit.Search` ya fue inicializado con un token válido.
