(() => {
  try {
    const storedTheme = window.localStorage.getItem("shu-date-theme");
    const preference = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
    const systemTheme =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    const theme = preference === "system" ? systemTheme : preference;

    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    // Ignore theme bootstrap failures and fall back to CSS defaults.
  }
})();
