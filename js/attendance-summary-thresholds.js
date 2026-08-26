"use strict";

(() => {
  const body = document.getElementById("attendance-body");
  if (!body) return;

  const style = document.createElement("style");
  style.textContent = `
    #attendance-body{font-variant-numeric:tabular-nums}
    #attendance-body td:nth-child(n+3){text-align:center;font-weight:800}
    #attendance-body tr.attendance-probationary td{background:#fff9db!important}
    #attendance-body td.attendance-coaching{background:#fff3bf!important;color:#7c5c00!important}
    #attendance-body td.attendance-corrective{background:#ffe3e3!important;color:#b42318!important}
    #attendance-body td.attendance-coaching::after,
    #attendance-body td.attendance-corrective::after{display:block;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;margin-top:2px}
    #attendance-body td.attendance-coaching::after{content:"Coaching"}
    #attendance-body td.attendance-corrective::after{content:"Corrective Action"}
    .attendance-threshold-legend{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:10px auto 14px;font-size:12px;color:#475569}
    .attendance-threshold-legend span{display:inline-flex;align-items:center;gap:6px}
    .attendance-threshold-legend i{width:14px;height:14px;border:1px solid #94a3b8;border-radius:3px;display:inline-block}
    .attendance-threshold-legend .coach{background:#fff3bf}
    .attendance-threshold-legend .corrective{background:#ffe3e3}
    section.panel:has(#attendance-body) .table-wrap{max-width:980px;margin-left:auto;margin-right:auto}
    section.panel:has(#attendance-body) .section-title{max-width:980px;margin-left:auto;margin-right:auto}
  `;
  document.head.appendChild(style);

  const tableWrap = body.closest(".table-wrap");
  if (tableWrap && !document.getElementById("attendance-threshold-legend")) {
    const legend = document.createElement("div");
    legend.id = "attendance-threshold-legend";
    legend.className = "attendance-threshold-legend";
    legend.innerHTML = '<span><i class="coach"></i> Coaching threshold</span><span><i class="corrective"></i> Corrective-action threshold</span>';
    tableWrap.insertAdjacentElement("beforebegin", legend);
  }

  function decorate() {
    body.querySelectorAll("tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      cells.forEach((cell) => cell.classList.remove("attendance-coaching", "attendance-corrective"));

      const absence = Number(cells[2].textContent.trim()) || 0;
      const tardies = Number(cells[3].textContent.trim()) || 0;

      if (absence >= 3) cells[2].classList.add("attendance-corrective");
      else if (absence >= 2) cells[2].classList.add("attendance-coaching");

      if (tardies >= 6) cells[3].classList.add("attendance-corrective");
      else if (tardies >= 5) cells[3].classList.add("attendance-coaching");
    });
  }

  new MutationObserver(decorate).observe(body, { childList: true, subtree: true });
  decorate();
})();
