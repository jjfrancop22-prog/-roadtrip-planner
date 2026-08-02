# V3.2.0-D — Caché inteligente offline

La aplicación conserva localmente:

1. El shell completo de la PWA.
2. Las búsquedas ya realizadas.
3. Los lugares asociados a la ruta activa.
4. Resultados individuales indexados por nombre, dirección y categoría.
5. Recursos de mapas e imágenes que el dispositivo ya haya abierto.

## Funcionamiento

- Con Internet: usa los proveedores registrados y guarda los resultados.
- Sin Internet: busca primero la consulta exacta y después en el índice local de lugares.
- Si un proveedor falla: utiliza automáticamente el último resultado disponible.
- Las búsquedas recientes permanecen 14 días como caché fresca y hasta 180 días como respaldo offline.

## Limitación real

La navegación turn-by-turn de Google Maps o Apple Maps depende de sus propias aplicaciones y de los mapas descargados en ellas. RoadTrip AI conserva el itinerario y los lugares, pero no sustituye los mapas offline del navegador externo.
