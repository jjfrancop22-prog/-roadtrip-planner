
import { googleMapsUrl } from "./maps.js";

const esc = (value = "") => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

export function allStops(state) {
  return state.trip.days.flatMap((day) =>
    day.stops.map((stop) => ({ ...stop, dayId: day.id, dayTitle: day.title, date: day.date }))
  );
}

export function progress(state) {
  const stops = allStops(state);
  return stops.length ? Math.round(stops.filter((stop) => stop.completed).length / stops.length * 100) : 0;
}

export function nextStop(state) {
  return allStops(state).find((stop) => !stop.completed) || null;
}

export function renderDashboard(container, state) {
  const pct = progress(state);
  const next = nextStop(state);
  const remaining = Math.max(0, Number(state.budget.total) - Number(state.budget.spent));
  const completed = allStops(state).filter((stop) => stop.completed).length;
  const totalStops = allStops(state).length;

  container.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <span class="trip-chip">${esc(state.trip.emoji)} Viaje actual</span>
          <h2>${esc(state.trip.name)}</h2>
          <p>${esc(state.trip.route)}</p>
        </div>
        <div class="status-badge ready">● ${esc(state.trip.status)}</div>
      </div>
      <div class="progress" style="background:rgba(255,255,255,.20)">
        <span style="width:${pct}%;background:white"></span>
      </div>
      <div class="hero-actions">
        ${next ? `<a class="button secondary" target="_blank" rel="noopener" href="${googleMapsUrl(next.address)}">🚗 Navegar ahora</a>` : ""}
        <button class="button primary" data-go="trip">Ver itinerario</button>
      </div>
    </section>

    <div class="section-head">
      <h2>Resumen inteligente</h2>
      <span class="muted">${pct}% completado</span>
    </div>

    <section class="grid dashboard-grid">
      <article class="card next-stop">
        <div class="status-badge ready">PRÓXIMA PARADA</div>
        ${next ? `
          <div class="next-stop-name">${esc(next.icon)} ${esc(next.name)}</div>
          <div class="next-stop-meta">⏰ ${esc(next.time)} · ${esc(next.dayTitle)}</div>
          <div class="actions">
            <a class="button primary full" target="_blank" rel="noopener" href="${googleMapsUrl(next.address)}">🚗 Navegar ahora</a>
          </div>
        ` : `
          <div class="next-stop-name">🎉 Viaje completado</div>
          <div class="next-stop-meta">Todas las paradas están marcadas.</div>
        `}
      </article>

      <article class="card">
        <div class="metric">
          <div>
            <div class="metric-label">Progreso del recorrido</div>
            <div class="metric-value">${completed}/${totalStops}</div>
          </div>
          <div class="metric-value">${pct}%</div>
        </div>
        <div class="progress"><span style="width:${pct}%"></span></div>
      </article>

      <article class="card">
        <div class="metric">
          <div>
            <div class="metric-label">Clima registrado</div>
            <div class="metric-value">${esc(String(state.weather.temperature))}${esc(state.weather.unit)}</div>
          </div>
          <div style="font-size:2rem">☀️</div>
        </div>
        <p class="muted">${esc(state.weather.city)} · ${esc(state.weather.condition)}</p>
        <div class="actions">
          <button class="button ghost" data-edit-weather>Actualizar clima</button>
        </div>
      </article>

      <article class="card">
        <div class="metric">
          <div>
            <div class="metric-label">Presupuesto restante</div>
            <div class="metric-value">$${remaining.toFixed(2)}</div>
          </div>
          <div style="font-size:2rem">💰</div>
        </div>
        <p class="muted">$${Number(state.budget.spent).toFixed(2)} gastados de $${Number(state.budget.total).toFixed(2)}</p>
        <div class="actions">
          <button class="button ghost" data-edit-budget>Actualizar presupuesto</button>
        </div>
      </article>

      <article class="card">
        <div class="status-badge ready">ESTADO GENERAL</div>
        <h3>${esc(state.trip.status)}</h3>
        <p class="muted">PWA operativa, datos guardados localmente y navegación Google Maps disponible.</p>
      </article>

      <article class="card">
        <div class="status-badge warning">SIGUIENTE ETAPA</div>
        <h3>Gestión completa</h3>
        <p class="muted">La próxima versión permitirá crear, editar y eliminar viajes, días y paradas.</p>
      </article>
    </section>
  `;
}

export function renderTrip(container, state) {
  container.innerHTML = `
    <section class="hero">
      <span class="trip-chip">${esc(state.trip.emoji)} ITINERARIO</span>
      <h2>${esc(state.trip.name)}</h2>
      <p>${esc(state.trip.route)}</p>
    </section>

    <div class="section-head">
      <h2>Plan por días</h2>
      <span class="muted">Checklist persistente</span>
    </div>

    <section class="day-list">
      ${state.trip.days.map((day) => `
        <article class="day-card">
          <div class="day-title">
            <div>
              <small class="muted">${esc(day.date)}</small>
              <h3>${esc(day.title)}</h3>
            </div>
          </div>
          ${day.stops.map((stop) => `
            <div class="stop-row ${stop.completed ? "done" : ""}">
              <input type="checkbox" data-toggle-stop="${day.id}|${stop.id}" ${stop.completed ? "checked" : ""}>
              <div class="stop-content">
                <strong>${esc(stop.icon)} ${esc(stop.name)}</strong><br>
                <small>⏰ ${esc(stop.time)} · ${esc(stop.address)}</small>
              </div>
              <a class="map-mini" target="_blank" rel="noopener" href="${googleMapsUrl(stop.address)}">Ir</a>
            </div>
          `).join("")}
        </article>
      `).join("")}
    </section>
  `;
}

export function renderSettings(container, state) {
  container.innerHTML = `
    <section class="settings-list">
      <div class="setting-row">
        <div>
          <strong>Modo oscuro</strong>
          <div class="muted">La preferencia queda guardada.</div>
        </div>
        <input id="theme-toggle" type="checkbox" ${state.settings.theme === "dark" ? "checked" : ""}>
      </div>

      <article class="card">
        <h3>RoadTrip Planner V1.0.0-B</h3>
        <p class="muted">Dashboard inteligente, próxima parada, navegación, progreso, clima manual, presupuesto y estado general.</p>
      </article>

      <div class="notice">
        El clima de esta versión se actualiza manualmente. En una versión futura podrá conectarse a una fuente meteorológica en línea.
      </div>
    </section>
  `;
}
