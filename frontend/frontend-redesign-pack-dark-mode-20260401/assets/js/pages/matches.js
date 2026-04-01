import { setButtonGroup } from "../shell.js";

export function setupMatchesPage() {
  if (document.body.dataset.page !== "matches") {
    return;
  }

  const buttons = Array.from(document.querySelectorAll("[data-match-state]"));
  const panels = Array.from(document.querySelectorAll('[data-state-panels="match-pages"] [data-panel-state]'));

  const activate = (stateKey) => {
    setButtonGroup(buttons, stateKey, "matchState");
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panelState !== stateKey;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => activate(button.dataset.matchState));
  });

  activate("matched");
}
