import { notificationTypeMeta, notificationsData } from "../data.js";
import { setButtonGroup } from "../shell.js";

export function setupNotificationsPage() {
  if (document.body.dataset.page !== "notifications") {
    return;
  }

  const sceneButtons = Array.from(document.querySelectorAll("[data-notification-scene]"));
  const filterButtons = Array.from(document.querySelectorAll("[data-notification-filter]"));
  const list = document.querySelector("[data-notification-list]");
  const emptyState = document.querySelector("[data-notification-empty]");
  const errorState = document.querySelector("[data-notification-error]");
  const state = {
    scene: "default",
    filter: "all",
  };

  const render = () => {
    setButtonGroup(sceneButtons, state.scene, "notificationScene");
    setButtonGroup(filterButtons, state.filter, "notificationFilter");

    if (list) {
      list.hidden = true;
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    if (errorState) {
      errorState.hidden = true;
    }

    if (state.scene === "error") {
      if (errorState) {
        errorState.hidden = false;
      }
      return;
    }

    let items = [...notificationsData].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );

    if (state.scene === "empty") {
      items = [];
    }

    if (state.filter === "unread") {
      items = items.filter((item) => !item.read);
    } else if (state.filter !== "all") {
      items = items.filter((item) => item.type === state.filter);
    }

    if (!items.length) {
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }

    if (list) {
      list.hidden = false;
      list.innerHTML = items.map((item) => renderNotificationItem(item)).join("");
    }
  };

  sceneButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.scene = button.dataset.notificationScene;
      render();
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.notificationFilter;
      render();
    });
  });

  render();
}

function renderNotificationItem(item) {
  const meta = notificationTypeMeta[item.type] || notificationTypeMeta.system;
  const stateLabel = item.read ? "已读" : "未读";
  const dateText = formatDate(item.createdAt);

  return `
    <li class="notification-item${item.read ? "" : " notification-item--unread"}">
      <div class="notification-item__head">
        <span class="pill pill--${meta.tone}">${meta.label}</span>
        <span class="notification-item__time">${dateText}</span>
      </div>
      <div class="notification-item__body">
        <div>
          <h3>${item.title}</h3>
          <p>${item.content}</p>
        </div>
        <span class="notification-item__state">${stateLabel}</span>
      </div>
    </li>
  `;
}

function formatDate(value) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatter.format(new Date(value)).replace(/\//g, ".");
}
