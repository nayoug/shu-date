(function () {
  "use strict";

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  onReady(function initLayoutShell() {
    const app = document.getElementById("app");
    const drawer = document.getElementById("drawer");
    const backdrop = document.getElementById("backdrop");
    const openDrawerBtn = document.getElementById("openDrawer");
    const closeDrawerBtn = document.getElementById("closeDrawer");
    const desktopMedia = window.matchMedia ? window.matchMedia("(min-width: 900px)") : null;

    function isDesktop() {
      return Boolean(desktopMedia && desktopMedia.matches);
    }

    function isDrawerOpen() {
      return Boolean(app && app.classList.contains("drawer-open"));
    }

    function setDrawerState(isOpen) {
      if (app) app.classList.toggle("drawer-open", isOpen);
      if (drawer) drawer.setAttribute("aria-hidden", String(!isOpen));
      if (openDrawerBtn) openDrawerBtn.setAttribute("aria-expanded", String(isOpen));

      document.body.style.overflow = isOpen && !isDesktop() ? "hidden" : "";
    }

    function toggleDrawer() {
      setDrawerState(!isDrawerOpen());
    }

    if (openDrawerBtn) openDrawerBtn.addEventListener("click", toggleDrawer);
    if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", () => setDrawerState(false));
    if (backdrop) backdrop.addEventListener("click", () => setDrawerState(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isDrawerOpen()) {
        setDrawerState(false);
      }
    });

    function handleDesktopMediaChange() {
      if (isDrawerOpen()) {
        setDrawerState(true);
      }
    }

    if (desktopMedia) {
      if (typeof desktopMedia.addEventListener === "function") {
        desktopMedia.addEventListener("change", handleDesktopMediaChange);
      } else if (typeof desktopMedia.addListener === "function") {
        desktopMedia.addListener(handleDesktopMediaChange);
      }
    }

    document.querySelectorAll(".expandable").forEach((button) => {
      const targetId = button.dataset.target;
      const target = targetId ? document.getElementById(targetId) : null;

      if (!target) return;

      button.setAttribute("aria-controls", targetId);
      target.hidden = button.getAttribute("aria-expanded") !== "true";

      button.addEventListener("click", () => {
        const shouldOpen = button.getAttribute("aria-expanded") !== "true";

        button.setAttribute("aria-expanded", String(shouldOpen));
        target.hidden = !shouldOpen;
        target.classList.toggle("show", shouldOpen);
      });
    });
  });
})();
