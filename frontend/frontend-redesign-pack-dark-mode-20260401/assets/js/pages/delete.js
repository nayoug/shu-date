import { profileData } from "../data.js";
import { showBanner } from "../shell.js";

export function setupDeletePage() {
  if (document.body.dataset.page !== "settings-delete") {
    return;
  }

  const form = document.querySelector("[data-delete-form]");
  const banner = document.querySelector("[data-delete-banner]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value.trim();
    const acknowledged = form.elements.acknowledged.checked;

    if (email !== profileData.email || password.length < 8 || !acknowledged) {
      showBanner(banner, {
        tone: "danger",
        title: "还不能注销账号",
        body: "请确认当前邮箱、填写密码，并勾选风险确认。",
      });
      return;
    }

    showBanner(banner, {
      tone: "warning",
      title: "原型模式：仅演示流程",
      body: "当前只是原型演示，不会真的注销账号。",
    });
  });
}

