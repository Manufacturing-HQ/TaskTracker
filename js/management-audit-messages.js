"use strict";

(() => {
  const globalMessage = document.getElementById("message");
  const auditView = document.getElementById("view-audit");
  const existingMessage = document.getElementById("audit-existing");
  if (!globalMessage || !auditView || !existingMessage) return;

  const auditMessage = document.createElement("div");
  auditMessage.id = "audit-message";
  auditMessage.className = "msg";
  auditMessage.hidden = true;
  existingMessage.insertAdjacentElement("afterend", auditMessage);

  const syncAuditMessage = () => {
    if (auditView.hidden) return;
    const text = globalMessage.textContent || "";
    if (!text) return;
    auditMessage.textContent = text;
    auditMessage.dataset.type = globalMessage.dataset.type || "info";
    auditMessage.hidden = false;
  };

  new MutationObserver(syncAuditMessage).observe(globalMessage, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-type", "hidden"]
  });

  document.querySelectorAll('button[data-view="audit"]').forEach((button) => {
    button.addEventListener("click", () => {
      auditMessage.hidden = true;
      auditMessage.textContent = "";
    });
  });

  document.getElementById("audit-submit")?.addEventListener("click", () => {
    auditMessage.hidden = true;
    auditMessage.textContent = "";
  });
})();
