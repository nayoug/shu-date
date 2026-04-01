import { matchData, navItems, notificationsData, profileData } from "./data.js";

export function injectShell() {
  const body = document.body;
  const page = body.dataset.page || "home";
  const currentKey = resolveNavKey(page);
  const overlay = body.dataset.header === "overlay";
  const headerHost = document.querySelector("[data-site-header]");
  const footerHost = document.querySelector("[data-site-footer]");

  if (headerHost) {
    headerHost.innerHTML = createHeaderMarkup(page, currentKey, overlay);
  }

  if (footerHost) {
    footerHost.innerHTML = createFooterMarkup();
  }
}

function resolveNavKey(page) {
  if (page.startsWith("settings")) {
    return "settings";
  }

  if (page === "login") {
    return "home";
  }

  return page;
}

function createThemeControlsMarkup(variant = "", compact = false) {
  const className = ["theme-switch", variant].filter(Boolean).join(" ");
  const labels = compact
    ? {
        system: "系统",
        light: "浅色",
        dark: "深色",
      }
    : {
        system: "跟随系统",
        light: "浅色",
        dark: "深色",
      };

  return `
    <div class="${className}" role="group" aria-label="外观模式">
      <button class="theme-switch__option" type="button" data-theme-option="system" aria-pressed="false">${labels.system}</button>
      <button class="theme-switch__option" type="button" data-theme-option="light" aria-pressed="false">${labels.light}</button>
      <button class="theme-switch__option" type="button" data-theme-option="dark" aria-pressed="false">${labels.dark}</button>
    </div>
  `;
}

function createHeaderMarkup(page, currentKey, overlay) {
  const navLinks = navItems
    .map((item) => {
      const current = item.key === currentKey ? ' aria-current="page"' : "";
      const counter = item.count ? '<span class="nav-counter" data-unread-count></span>' : "";
      return `<a class="nav-link" href="${item.href}"${current}>${item.label}${counter}</a>`;
    })
    .join("");

  const primaryAction =
    page === "home" || page === "login"
      ? `
        <a class="button button--ghost button--sm desktop-only" href="/login/">登录</a>
        <a class="button button--sm desktop-only" href="/matches/">进入原型</a>
      `
      : `
        <a class="user-pill desktop-only" href="/profile/">
          <span class="user-pill__label" data-profile="nickname">轨霜</span>
          <span class="user-pill__meta" data-profile="verifiedText">已验证</span>
        </a>
      `;

  const drawerLinks = navItems
    .map((item) => {
      const current = item.key === currentKey ? ' aria-current="page"' : "";
      const counter = item.count ? '<span class="drawer-link__count" data-unread-count></span>' : "";
      return `<a class="drawer-link" href="${item.href}"${current}>${item.label}${counter}</a>`;
    })
    .join("");

  return `
    <header class="site-header${overlay ? " site-header--overlay" : ""}">
      <div class="site-header__inner">
        <a class="brandmark" href="/">
          <span class="brandmark__symbol" aria-hidden="true"></span>
          <span class="brandmark__copy">
            <span class="brandmark__name">shu-date</span>
            <span class="brandmark__tag">校园恋爱匹配</span>
          </span>
        </a>
        <nav class="site-nav" aria-label="主导航">
          ${navLinks}
        </nav>
        <div class="site-header__actions">
          ${createThemeControlsMarkup("theme-switch--header desktop-only", true)}
          ${primaryAction}
          <button
            class="menu-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="mobile-drawer"
            data-drawer-target="mobile-drawer"
          >
            <span class="menu-toggle__lines" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span class="menu-toggle__label">菜单</span>
          </button>
        </div>
      </div>
    </header>
    <div class="drawer" id="mobile-drawer" aria-hidden="true">
      <button class="drawer__backdrop" type="button" data-drawer-close aria-label="关闭导航"></button>
      <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div class="drawer__head">
          <div>
            <p class="microcopy">当前账号</p>
            <h2 class="drawer__title" id="drawer-title" data-profile="nickname">轨霜</h2>
            <p class="drawer__subtitle" data-profile="email">user@shu.edu.cn</p>
          </div>
          <button class="drawer__close" type="button" data-drawer-close aria-label="关闭">
            <span></span>
            <span></span>
          </button>
        </div>
        <nav class="drawer__nav" aria-label="移动导航">
          ${drawerLinks}
        </nav>
        <div class="drawer__footer">
          ${createThemeControlsMarkup("theme-switch--drawer")}
          <a class="button button--sm" href="/matches/">本周匹配</a>
          <a class="button button--ghost button--sm" href="/settings/password/">改密码</a>
        </div>
      </aside>
    </div>
  `;
}

function createFooterMarkup() {
  return `
    <footer class="site-footer">
      <div class="site-footer__inner">
        <div class="site-footer__lead">
          <p class="microcopy">原型</p>
          <p class="site-footer__brand">shu-date</p>
          <p class="site-footer__text">
            先确认身份，再完善资料、查看匹配和接收通知。
          </p>
        </div>
        <div class="site-footer__links">
          <a href="/">主页</a>
          <a href="/profile/">资料</a>
          <a href="/matches/">匹配</a>
          <a href="/notifications/">通知</a>
          <a href="/settings/">设置</a>
          <a href="/docs/prototype-guide.md">原型说明</a>
        </div>
        <p class="site-footer__meta">2026 · 校园匹配原型 · <span data-year></span></p>
      </div>
    </footer>
  `;
}

export function hydrateProfileTokens() {
  const values = {
    nickname: profileData.nickname,
    email: profileData.email,
    campus: profileData.campus,
    lovetype_code: profileData.lovetype_code,
    my_grade: profileData.my_grade,
    gender: profileData.gender,
    preferred_gender: profileData.preferred_gender,
    interests: profileData.interests.join("、"),
    core_traits: profileData.core_traits.join("、"),
    acceptedCampus: profileData.accepted_campus.join("、"),
    verifiedText: profileData.verified ? "已验证" : "未验证",
  };

  document.querySelectorAll("[data-profile]").forEach((node) => {
    const key = node.dataset.profile;
    if (values[key] !== undefined) {
      node.textContent = values[key];
    }
  });
}

export function hydrateHomeTokens() {
  const homeValues = {
    week: `第 ${matchData.weekNumber} 轮`,
    unread: `${notificationsData.filter((item) => !item.read).length} 条未读`,
    campus: profileData.campus,
    lovetype: profileData.lovetype_code,
  };

  document.querySelectorAll("[data-home]").forEach((node) => {
    const key = node.dataset.home;
    if (homeValues[key] !== undefined) {
      node.textContent = homeValues[key];
    }
  });
}

export function hydrateMatchTokens() {
  const percent = Math.round(matchData.score * 100);
  const matchValues = {
    week: `第 ${matchData.weekNumber} 周`,
    percent: `${percent}%`,
    partner: matchData.partner.nickname,
    partnerGrade: matchData.partner.my_grade,
    partnerCampus: matchData.partner.campus,
    partnerType: matchData.partner.lovetype_code,
    partnerInterests: matchData.partner.interests.join("、"),
  };

  document.querySelectorAll("[data-match]").forEach((node) => {
    const key = node.dataset.match;
    if (matchValues[key] !== undefined) {
      node.textContent = matchValues[key];
    }
  });

  document.querySelectorAll("[data-match-score-ring]").forEach((node) => {
    node.style.setProperty("--score", percent);
  });
}

export function hydrateNotificationCounters() {
  const total = notificationsData.length;
  const unread = notificationsData.filter((item) => !item.read).length;
  const matchCount = notificationsData.filter((item) => item.type === "match").length;
  const systemCount = notificationsData.filter((item) => item.type === "system").length;

  document.querySelectorAll("[data-unread-count]").forEach((node) => {
    node.textContent = unread;
  });

  document.querySelectorAll("[data-notification-total]").forEach((node) => {
    node.textContent = total;
  });

  document.querySelectorAll("[data-notification-unread]").forEach((node) => {
    node.textContent = unread;
  });

  document.querySelectorAll("[data-notification-match]").forEach((node) => {
    node.textContent = matchCount;
  });

  document.querySelectorAll("[data-notification-system]").forEach((node) => {
    node.textContent = systemCount;
  });
}

export function setupDrawer() {
  const toggle = document.querySelector("[data-drawer-target]");
  const drawer = document.getElementById("mobile-drawer");

  if (!toggle || !drawer) {
    return;
  }

  const closeTargets = drawer.querySelectorAll("[data-drawer-close]");

  const closeDrawer = () => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
  };

  const openDrawer = () => {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("drawer-open");
    drawer.querySelector(".drawer__close")?.focus();
  };

  toggle.addEventListener("click", () => {
    if (drawer.classList.contains("is-open")) {
      closeDrawer();
      return;
    }

    openDrawer();
  });

  closeTargets.forEach((node) => {
    node.addEventListener("click", closeDrawer);
  });

  drawer.querySelectorAll("a").forEach((node) => {
    node.addEventListener("click", closeDrawer);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });
}

export function setupReveal() {
  const reveals = document.querySelectorAll(".reveal");

  if (!reveals.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    reveals.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  reveals.forEach((node) => observer.observe(node));
}

export function setupScrollMotion() {
  const hero = document.querySelector(".hero");

  if (!hero) {
    return;
  }

  const update = () => {
    const offset = Math.min(window.scrollY * 0.18, 72);
    const glow = Math.min(window.scrollY * 0.05, 24);
    document.documentElement.style.setProperty("--hero-shift", `${offset}px`);
    document.documentElement.style.setProperty("--glow-shift", `${glow}px`);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

export function setButtonGroup(buttons, activeValue, datasetKey) {
  buttons.forEach((button) => {
    const active = button.dataset[datasetKey] === activeValue;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function showBanner(node, state) {
  if (!node) {
    return;
  }

  if (!state) {
    node.hidden = true;
    return;
  }

  node.hidden = false;
  node.className = `status-banner status-banner--${state.tone}`;
  const titleNode = node.querySelector("[data-banner-title]");
  const bodyNode = node.querySelector("[data-banner-body]");

  if (titleNode) {
    titleNode.textContent = state.title;
  }

  if (bodyNode) {
    bodyNode.textContent = state.body;
  }
}

export function setupCurrentYear() {
  const currentYear = String(new Date().getFullYear());
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = currentYear;
  });
}


