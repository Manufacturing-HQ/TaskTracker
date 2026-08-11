"use strict";

(() => {
  const app = document.getElementById("app");
  const userName = document.getElementById("user-name");
  const topbar = document.querySelector(".topbar");
  const currentSection = document.querySelector("main#app > section.card:nth-of-type(2)");
  const unfinishedSection = document.getElementById("unfinished")?.closest("section.card");
  const reworkSection = document.getElementById("rework-list")?.closest("section.card");
  const reworkCount = document.getElementById("rework-count");
  if (!app || !topbar || !currentSection || !unfinishedSection || !reworkSection || !reworkCount) return;

  const style = document.createElement("style");
  style.textContent = `
    .employee-active-zone{border:3px solid #111827!important;background:#ecfdf3!important}
    .employee-active-zone .mini-card,.employee-active-zone .action-panel{background:rgba(255,255,255,.72)}
    .employee-unfinished-zone{border:3px solid #111827!important;background:#fff9db!important}
    .employee-unfinished-zone .mini-card{background:#fffdf3}
    .employee-rework-zone{border:3px solid #111827!important;background:#fff0f3!important}
    .employee-rework-zone .mini-card{background:#fff7f8}
    .employee-top-name{font-weight:900;font-size:14px;padding:8px 12px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1}
    .employee-rework-nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:8px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;vertical-align:middle}
  `;
  document.head.appendChild(style);

  currentSection.classList.add("employee-active-zone");
  unfinishedSection.classList.add("employee-unfinished-zone");
  reworkSection.classList.add("employee-rework-zone");

  const signedCard = app.querySelector("section.card:first-child");
  if (signedCard) signedCard.remove();

  const actions = topbar.querySelector(".actions");
  const topName = document.createElement("span");
  topName.className = "employee-top-name";
  topName.textContent = userName?.textContent?.trim() || "Employee";
  actions?.prepend(topName);

  function syncName() {
    const name = userName?.textContent?.trim();
    if (name) topName.textContent = name;
  }

  function syncReworkBadge() {
    const count = Number(reworkCount.textContent || 0);
    const outerTaskButton = window.parent !== window ? window.parent.document.querySelector('.nav button[data-view="task"]') : null;
    if (!outerTaskButton) return;
    let badge = outerTaskButton.querySelector(".employee-rework-nav-badge");
    if (count > 0) {
      if (!badge) {
        badge = window.parent.document.createElement("span");
        badge.className = "employee-rework-nav-badge";
        outerTaskButton.appendChild(badge);
      }
      badge.textContent = String(count);
      badge.title = `${count} pending QA rework request${count === 1 ? "" : "s"}`;
    } else {
      badge?.remove();
    }
  }

  new MutationObserver(syncName).observe(userName || app, { childList: true, subtree: true, characterData: true });
  new MutationObserver(syncReworkBadge).observe(reworkCount, { childList: true, subtree: true, characterData: true });
  syncName();
  syncReworkBadge();
})();
