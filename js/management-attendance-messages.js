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
