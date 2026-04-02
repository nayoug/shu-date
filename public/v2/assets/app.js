(function () {
  const STORAGE_KEY = 'shu-date-theme';
  const VALID_THEMES = new Set(['system', 'light', 'dark']);
  let mediaQuery = null;
  let currentPreference = 'system';
  let currentTheme = 'light';
  let mediaListenerAttached = false;

  initializeTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  function bootstrap() {
    setupThemeControls();
    setupDrawer();
    setupReveal();
  }

  function initializeTheme() {
    ensureMediaQuery();
    currentPreference = resolvePreference();
    applyTheme(resolveEffectiveTheme(currentPreference));
    attachMediaListener();
  }

  function setupThemeControls() {
    const buttons = Array.from(document.querySelectorAll('[data-theme-option]'));
    buttons.forEach((button) => {
      const preference = button.dataset.themeOption;
      if (button.dataset.themeBound === 'true' || !VALID_THEMES.has(preference)) {
        return;
      }

      button.dataset.themeBound = 'true';
      button.addEventListener('click', () => {
        if (currentPreference === preference) {
          return;
        }

        currentPreference = preference;
        persistTheme(currentPreference);
        applyTheme(resolveEffectiveTheme(currentPreference));
      });
    });

    updateThemeControls();
  }

  function ensureMediaQuery() {
    if (!mediaQuery && typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }
  }

  function attachMediaListener() {
    if (!mediaQuery || mediaListenerAttached) {
      return;
    }

    const syncWithSystem = () => {
      if (currentPreference === 'system') {
        applyTheme(resolveEffectiveTheme('system'));
      } else {
        updateThemeControls();
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncWithSystem);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(syncWithSystem);
    }

    mediaListenerAttached = true;
  }

  function resolvePreference() {
    try {
      const storedTheme = window.localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.has(storedTheme) ? storedTheme : 'system';
    } catch (error) {
      return 'system';
    }
  }

  function resolveEffectiveTheme(preference) {
    if (preference === 'light' || preference === 'dark') {
      return preference;
    }

    return mediaQuery && mediaQuery.matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = currentTheme;
    document.documentElement.dataset.themePreference = currentPreference;
    document.documentElement.style.colorScheme = currentTheme;
    updateThemeControls();
  }

  function updateThemeControls() {
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const preference = button.dataset.themeOption;
      const active = preference === currentPreference;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const summary = currentPreference === 'system'
      ? '当前：跟随系统（' + (currentTheme === 'dark' ? '深色' : '浅色') + '）'
      : '当前：' + (currentPreference === 'dark' ? '深色模式' : '浅色模式');

    document.querySelectorAll('[data-theme-summary]').forEach((node) => {
      node.textContent = summary;
    });
  }

  function persistTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // ignore storage errors
    }
  }

  function setupDrawer() {
    const toggle = document.querySelector('[data-v2-drawer-toggle]');
    const drawer = document.querySelector('[data-v2-drawer]');

    if (!toggle || !drawer) {
      return;
    }

    const closeTargets = drawer.querySelectorAll('[data-v2-drawer-close]');

    const closeDrawer = () => {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
    };

    const openDrawer = () => {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
    };

    toggle.addEventListener('click', () => {
      if (drawer.classList.contains('is-open')) {
        closeDrawer();
        return;
      }
      openDrawer();
    });

    closeTargets.forEach((node) => node.addEventListener('click', closeDrawer));
    drawer.querySelectorAll('a').forEach((node) => node.addEventListener('click', closeDrawer));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });
  }

  function setupReveal() {
    const nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) {
      return;
    }

    nodes.forEach((node) => node.classList.add('is-visible'));
  }
})();
