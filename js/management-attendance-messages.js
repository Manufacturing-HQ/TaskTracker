"use strict";

(() => {
  const globalMessage = document.getElementById("message");
  const attendanceMessage = document.getElementById("attendance-message");
  const attendanceView = document.getElementById("view-attendance");
  if (!globalMessage || !attendanceMessage || !attendanceView) return;

  const syncAttendanceMessage = () => {
    if (attendanceView.hidden) return;
    const text = globalMessage.textContent || "";
    const isError = globalMessage.dataset.type === "error";
    if (!text || !isError) return;
    attendanceMessage.textContent = text;
    attendanceMessage.dataset.type = "error";
    attendanceMessage.hidden = false;
  };

  new MutationObserver(syncAttendanceMessage).observe(globalMessage, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-type", "hidden"]
  });

  document.querySelectorAll('button[data-view="attendance"]').forEach((button) => {
    button.addEventListener("click", () => {
      attendanceMessage.hidden = true;
      attendanceMessage.textContent = "";
    });
  });
})();

(() => {
  if (document.querySelector('script[data-pilot-helper="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-pilot-live-enhancements.js";
  script.dataset.pilotHelper = "management";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-operations-hub="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-operations-hub.js";
  script.dataset.operationsHub = "management";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-requested-enhancements="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-requested-enhancements.js";
  script.dataset.requestedEnhancements = "management";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-master-edit-enhancement="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-master-edit-enhancement.js";
  script.dataset.masterEditEnhancement = "management";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-overdue-highlight="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-overdue-highlight.js";
  script.dataset.overdueHighlight = "management";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-operational-exceptions="management"]')) return;
  const script = document.createElement("script");
  script.src = "js/management-operational-exceptions.js";
  script.dataset.operationalExceptions = "management";
  document.body.appendChild(script);
})();
