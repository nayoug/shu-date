import { loginStates } from "../data.js";
import { setButtonGroup, showBanner } from "../shell.js";

export function setupLoginPage() {
  if (document.body.dataset.page !== "login") {
    return;
  }

  const buttons = Array.from(document.querySelectorAll("[data-login-state]"));
  const form = document.querySelector("[data-login-form]");
  const banner = document.querySelector("[data-login-banner]");

  const activate = (stateKey) => {
    setButtonGroup(buttons, stateKey, "loginState");
    showBanner(banner, loginStates[stateKey]);
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => activate(button.dataset.loginState));
  });

  activate("default");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value.trim();

    if (!email.includes("@") || password.length < 6) {
      activate("failure");
      return;
    }

    showBanner(banner, {
      tone: "success",
      title: "登录成功",
      body: "登录成功，接下来可以继续填写资料或查看匹配。",
    });
  });
}

