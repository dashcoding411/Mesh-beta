// Runs before the page first paints: a small classic script in <head>, put
// there by vite.config.js (it isn't part of the app's bundle). The HTML
// arrives holding both the welcome page and the loading logo. This picks the
// logo unless the app is about to open on the welcome page (the same call as
// opensOnWelcome in lib/firstVisit.js), and applies a saved theme and text
// size (lib/appearance.js), so nothing flashes before the app starts.
(function () {
  const root = document.documentElement;
  let welcome = false;
  try {
    const path = location.pathname;
    welcome = !localStorage.getItem("mesh:last-account")
      && !/(^#|&)(id_token|error)=/.test(location.hash)
      && (path === "/welcome" || (path === "/" && !localStorage.getItem("mesh:welcomed")));
    const saved = JSON.parse(localStorage.getItem("mesh:appearance") || "{}");
    if (saved.theme === "light" || saved.theme === "dark") root.setAttribute("data-theme", saved.theme);
    if (saved.text === "large" || saved.text === "larger") root.setAttribute("data-text", saved.text);
  } catch { /* storage blocked: the logo, and the system's theme */ }
  if (!welcome) root.classList.add("app-boot");
})();
