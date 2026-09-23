"use strict";
(() => {
  const body=document.getElementById("attendance-body");
  if(!body) return;
  const style=document.createElement("style");
  style.textContent=`
    #attendance-body{font-variant-numeric:tabular-nums}
    #attendance-body td:nth-child(n+3):not(.attendance-action-cell){text-align:center;font-weight:800}
    #attendance-body tr.attendance-probationary td{background:#fff9db}
    #attendance-body .probationary-label{display:inline-block;margin-left:7px;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:900;background:#fff3bf;color:#7c5c00;border:1px solid #e6c74f}
    .attendance-action-cell{min-width:260px}
    .attendance-action-badge{display:block;width:max-content;max-width:100%;border-radius:999px;padding:4px 8px;margin:2px 0;font-size:11px;font-weight:900}
    .attendance-action-badge.coaching{background:#fff3bf;color:#7c5c00;border:1px solid #e6c74f}
    .attendance-action-badge.corrective{background:#ffe3e3;color:#b42318;border:1px solid #f3a6a6}
    .attendance-clear{font-size:11px;color:#64748b;font-weight:700}
    .attendance-threshold-legend{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:10px auto 14px;font-size:12px;color:#475569}
    .attendance-threshold-legend span{display:inline-flex;align-items:center;gap:6px}
    .attendance-threshold-legend i{width:14px;height:14px;border:1px solid #94a3b8;border-radius:3px;display:inline-block}
    .attendance-threshold-legend .probation{background:#fff9db}
    .attendance-threshold-legend .coach{background:#fff3bf}
    .attendance-threshold-legend .corrective{background:#ffe3e3}
  `;
  document.head.appendChild(style);
  const tableWrap=body.closest(".table-wrap");
  if(tableWrap&&!document.getElementById("attendance-threshold-legend")){
    const legend=document.createElement("div");
    legend.id="attendance-threshold-legend";
    legend.className="attendance-threshold-legend";
    legend.innerHTML='<span><i class="probation"></i> Probationary employee</span><span><i class="coach"></i> Coaching threshold</span><span><i class="corrective"></i> Corrective-action threshold</span>';
    tableWrap.insertAdjacentElement("beforebegin",legend);
  }
})();
