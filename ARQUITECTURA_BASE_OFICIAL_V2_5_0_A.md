# RoadTrip AI V2.5.0-A — Modular Core

Esta versión congela la arquitectura modular como base oficial.

## Principios
- `app.js` coordina la aplicación y conserva la interfaz existente.
- La lógica de horarios vive en `schedule-engine.js`.
- Las utilidades de rutas viven en `route-engine.js`.
- Los módulos futuros tienen contratos independientes y no ejecutan lógica invasiva.
- No se cambió el modelo de datos ni se eliminaron funciones existentes.

## Módulos activos
- `route-engine.js`
- `schedule-engine.js`
- `maps-engine.js`
- `parking-engine` existente mediante `official-parking.js` y lógica actual

## Contratos preparados
- `travel-score.js`
- `planner-engine.js`
- `walking-engine.js`
- `places-engine.js`
- `weather-engine.js`
- `traffic-engine.js`
- `fuel-engine.js`
- `budget-engine.js`
- `hotel-engine.js`
- `restaurant-engine.js`

Los módulos reservados no alteran el comportamiento actual hasta ser activados en una versión posterior.
