import { initializeTheme, setupThemeControls } from "./js/theme.js";
import { hydrateHomeTokens, hydrateMatchTokens, hydrateNotificationCounters, hydrateProfileTokens, injectShell, setupCurrentYear, setupDrawer, setupReveal, setupScrollMotion } from "./js/shell.js";
import { setupDeletePage } from "./js/pages/delete.js";
import { setupLoginPage } from "./js/pages/login.js";
import { setupMatchesPage } from "./js/pages/matches.js";
import { setupNotificationsPage } from "./js/pages/notifications.js";
import { setupPasswordPage } from "./js/pages/password.js";
import { setupProfilePage } from "./js/pages/profile.js";

initializeTheme();

document.addEventListener("DOMContentLoaded", () => {
  injectShell();
  setupThemeControls();
  hydrateProfileTokens();
  hydrateHomeTokens();
  hydrateMatchTokens();
  hydrateNotificationCounters();
  setupDrawer();
  setupReveal();
  setupScrollMotion();
  setupLoginPage();
  setupProfilePage();
  setupMatchesPage();
  setupPasswordPage();
  setupDeletePage();
  setupNotificationsPage();
  setupCurrentYear();
});
