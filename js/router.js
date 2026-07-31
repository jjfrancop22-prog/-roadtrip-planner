
export function createRouter({ onRouteChange }) {
  let currentRoute = "dashboard";

  function navigate(route) {
    currentRoute = route;
    onRouteChange(route);
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.route === route);
    });
  }

  function start() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.route));
    });
    navigate(currentRoute);
  }

  return { start, navigate };
}
