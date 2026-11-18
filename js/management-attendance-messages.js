"use strict";

/**
 * Attendance-specific message container only.
 *
 * Errors are now written directly by the Attendance workflow so unrelated
 * Management errors cannot leak into this section.
 */
(() => {
  const attendanceMessage = document.getElementById("attendance-message");
  if (!attendanceMessage) return;

  document.querySelectorAll('button[data-view="attendance"]').forEach((button) => {
    button.addEventListener("click", () => {
      attendanceMessage.hidden = true;
      attendanceMessage.textContent = "";
    });
  });
})();
