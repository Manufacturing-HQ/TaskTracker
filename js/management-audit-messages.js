"use strict";

/**
 * Task Tracker Audit message container only.
 *
 * Errors are now written directly by the Audit workflow so unrelated
 * Management errors cannot leak into this section.
 */
(() => {
  const auditExisting = document.getElementById("audit-existing");
  if (!auditExisting) return;

  let auditMessage = document.getElementById("audit-message");
  if (!auditMessage) {
    auditMessage = document.createElement("div");
    auditMessage.id = "audit-message";
    auditMessage.className = "msg";
    auditMessage.hidden = true;
    auditExisting.insertAdjacentElement("afterend", auditMessage);
  }

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
