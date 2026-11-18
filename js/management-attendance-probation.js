"use strict";

(() => {
  const body = document.getElementById("attendance-body");
  if (!body) return;

  const style = document.createElement("style");
  style.textContent = `
    #view-attendance tr.probationary-row td{background:#fff9db!important}
    #view-attendance .probationary-label{display:inline-block;margin-left:6px;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:900;background:#fff3bf;color:#7c5c00;border:1px solid #e6c74f}
  `;
  document.head.appendChild(style);
})();
