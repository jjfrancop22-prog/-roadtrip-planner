
import { loadState, saveState } from "./storage.js";
import { createRouter } from "./router.js";
import { seed } from "./seed.js";
import { renderDashboard, renderTrip, renderSettings } from "./ui.js";

const stored = loadState();
const state = stored
  ? {
      ...structuredClone(seed),
      ...stored,
      settings: { ...seed.settings, ...(stored.settings || {}) },
      budget: { ...seed.budget, ...(stored.budget || {}) },
      weather: { ...seed.weather, ...(stored.weather || {}) },
      trip: stored.trip || structuredClone(seed.trip)
    }
  : structuredClone(seed);

const app = document.getElementById("app");
const screenTitle = document.getElementById("screen-title");
const installButton = document.getElementById("install-button");
let deferredInstallPrompt = null;

function persist() {
  saveState(state);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
}

function renderRoute(route) {
  applyTheme();

  if (route === "dashboard") {
    screenTitle.textContent = "Dashboard";
    renderDashboard(app, state);
  }

  if (route === "trip") {
    screenTitle.textContent = state.trip.name;
    renderTrip(app, state);
  }

  if (route === "settings") {
    screenTitle.textContent = "Ajustes";
    renderSettings(app, state);
  }

  bindScreenEvents(route);
}

const router = createRouter({ onRouteChange: renderRoute });

function bindScreenEvents(route) {
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => router.navigate(button.dataset.go));
  });

  document.querySelectorAll("[data-toggle-stop]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const [dayId, stopId] = checkbox.dataset.toggleStop.split("|");
      const day = state.trip.days.find((item) => item.id === dayId);
      const stop = day.stops.find((item) => item.id === stopId);
      stop.completed = checkbox.checked;
      persist();
      renderRoute(route);
    });
  });

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      state.settings.theme = themeToggle.checked ? "dark" : "light";
      persist();
      renderRoute("settings");
    });
  }

  document.querySelectorAll("[data-edit-budget]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("budget-total").value = state.budget.total;
      document.getElementById("budget-spent").value = state.budget.spent;
      document.getElementById("budget-dialog").showModal();
    });
  });

  document.querySelectorAll("[data-edit-weather]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("weather-city").value = state.weather.city;
      document.getElementById("weather-temp").value = state.weather.temperature;
      document.getElementById("weather-unit").value = state.weather.unit;
      document.getElementById("weather-condition").value = state.weather.condition;
      document.getElementById("weather-dialog").showModal();
    });
  });
}

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.closeDialog).close();
  });
});

document.getElementById("budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.budget.total = Number(document.getElementById("budget-total").value);
  state.budget.spent = Number(document.getElementById("budget-spent").value);
  persist();
  document.getElementById("budget-dialog").close();
  renderRoute("dashboard");
});

document.getElementById("weather-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.weather.city = document.getElementById("weather-city").value.trim();
  state.weather.temperature = Number(document.getElementById("weather-temp").value);
  state.weather.unit = document.getElementById("weather-unit").value;
  state.weather.condition = document.getElementById("weather-condition").value.trim();
  persist();
  document.getElementById("weather-dialog").close();
  renderRoute("dashboard");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove("hidden");
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("No se pudo registrar el Service Worker:", error);
    });
  });
}

persist();
router.start();
