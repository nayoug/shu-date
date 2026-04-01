import { showBanner } from "../shell.js";

export function setupPasswordPage() {
  if (document.body.dataset.page !== "settings-password") {
    return;
  }

  const form = document.querySelector("[data-password-form]");
  const banner = document.querySelector("[data-password-banner]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const currentPassword = form.elements.currentPassword.value.trim();
    const newPassword = form.elements.newPassword.value.trim();
    const confirmPassword = form.elements.confirmPassword.value.trim();

    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
      showBanner(banner, {
        tone: "danger",
        title: "密码校验失败",
        body: "请填写当前密码，并确认新密码不少于 8 位且两次输入一致。",
      });
      return;
    }

    if (currentPassword === newPassword) {
      showBanner(banner, {
        tone: "warning",
        title: "新旧密码相同",
        body: "新密码需要和当前密码不同。",
      });
      return;
    }

    showBanner(banner, {
      tone: "success",
      title: "密码修改成功",
      body: "密码已更新，下次登录请使用新密码。",
    });
    form.reset();
  });
}

