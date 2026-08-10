"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const tableWrap = document.getElementById("table");
  const reportTitle = document.getElementById("report-title");
  const dailyTab = document.getElementById("daily-tab");
  const runButton = document.getElementById("run-report");
  const reportEmployee = document.getElementById("report-employee");
  const startDate = document.getElementById("start-date");
  const endDate = document.getElementById("end-date");
  if (!config || !supabaseLib || !tableWrap || !reportTitle || !dailyTab || !runButton) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let latestRows = [];
  let setup = null;
  let detailWrap = null;
  let decorating = false;

  function ensureDetailWrap() {
    if (detailWrap) return detailWrap;
    detailWrap = document.createElement("div");
    detailWrap.id = "reporting-daily-detail";
    detailWrap.className = "card";
    detailWrap.hidden = true;
    tableWrap.closest("section.card")?.insertAdjacentElement("afterend", detailWrap);
    return detailWrap;
  }

  function isDailyMode() {
    return dailyTab.classList.contains("active") && /Daily Reporting/i.test(reportTitle.textContent || "");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  async function loadReferenceData() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    setup = await rpc("get_reporting_setup_options", { p_session_token: token });
  }

  async function fetchRows() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token || !isDailyMode() || !startDate.value || !endDate.value) {
      latestRows = [];
      return;
    }
    latestRows = await rpc("get_reporting_daily", {
      p_session_token: token,
      p_start_date: startDate.value,
      p_end_date: endDate.value,
      p_employee_id: reportEmployee?.value || null
    }) || [];
  }

  function renameCoverage() {
    tableWrap.querySelectorAll("th").forEach((th) => {
      if (th.textContent.trim() === "Coverage") th.textContent = "Efficiency";
    });
  }

  function decorateRows() {
    if (decorating) return;
    decorating = true;
    try {
      renameCoverage();
      if (!isDailyMode()) {
        if (detailWrap) detailWrap.hidden = true;
        return;
      }
      const bodyRows = Array.from(tableWrap.querySelectorAll("tbody tr"));
      bodyRows.forEach((tr, index) => {
        const row = latestRows[index];
        if (!row) return;
        tr.style.cursor = "pointer";
        tr.title = "Click to view underlying jobs and sessions";
        tr.onclick = () => openDetail(row).catch((error) => renderError(error));
      });
    } finally {
      decorating = false;
    }
  }

  function fmt(value, digits = 2) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : esc(value);
  }

  function renderError(error) {
    const wrap = ensureDetailWrap();
    wrap.hidden = false;
    wrap.innerHTML = `<h2 style="margin-top:0">Daily Detail</h2><div class="message" data-type="error">${esc(error.message || String(error))}</div>`;
  }

  async function openDetail(row) {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) throw new Error("Your session is no longer available.");
    const detail = await rpc("get_reporting_daily_detail", {
      p_session_token: token,
      p_employee_id: row.employee_id,
      p_work_date: row.work_date
    });

    const wrap = ensureDetailWrap();
    wrap.hidden = false;
    const jobs = detail?.jobs || [];
    const jobHtml = jobs.length ? jobs.map((job) => {
      const sessions = job.sessions || [];
      return `<details style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-top:10px;background:#f8fafc">
        <summary style="cursor:pointer;font-weight:800">${esc(job.task_type || "Task")} · ${esc(job.item_name || job.non_productive_task || "")}${job.work_order_number ? ` · WO ${esc(job.work_order_number)}` : ""} · ${fmt(job.allocated_minutes)} min</summary>
        <div style="margin-top:10px;font-size:13px">Job type: ${esc(job.job_type || "—")} · Qty: ${esc(job.completed_quantity ?? job.assigned_quantity ?? "—")} · Expected credit: ${fmt(job.expected_minutes_credit)} min · Status: ${esc(job.job_status || "—")}</div>
        <div class="table-wrap" style="margin-top:10px"><table style="min-width:760px"><thead><tr><th>Start</th><th>End</th><th>Allocated Min</th><th>Stop Reason</th><th>End Type</th><th>Comments</th></tr></thead><tbody>${sessions.map((s) => `<tr><td>${esc(s.start_time || "—")}</td><td>${esc(s.end_time || "—")}</td><td>${fmt(s.allocated_minutes)}</td><td>${esc(s.stop_reason || "—")}</td><td>${esc(s.session_end_type || "—")}</td><td>${esc(s.comments || "—")}</td></tr>`).join("")}</tbody></table></div>
      </details>`;
    }).join("") : '<div class="muted">No tracker sessions were recorded for this employee on this date.</div>';

    wrap.innerHTML = `<div class="row"><div><h2 style="margin:0">Daily Detail · ${esc(row.employee_name)}</h2><div class="muted">${esc(row.work_date)} · Click each job to inspect sessions</div></div><button id="close-report-detail" class="secondary" type="button">Close</button></div>
      <div class="summary" style="margin-top:16px">
        <div class="metric"><div class="muted">Tracker Minutes</div><strong>${fmt(row.tracker_minutes)}</strong></div>
        <div class="metric"><div class="muted">Productive Minutes</div><strong>${fmt(row.productive_minutes)}</strong></div>
        <div class="metric"><div class="muted">Worked Minutes</div><strong>${fmt(row.minutes_worked)}</strong></div>
        <div class="metric"><div class="muted">Productivity</div><strong>${row.productivity_percent == null ? "—" : `${fmt(row.productivity_percent)}%`}</strong></div>
        <div class="metric"><div class="muted">Efficiency</div><strong>${row.tracker_coverage_percent == null ? "—" : `${fmt(row.tracker_coverage_percent)}%`}</strong></div>
      </div>
      ${jobHtml}`;
    wrap.querySelector("#close-report-detail")?.addEventListener("click", () => { wrap.hidden = true; });
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function syncAfterRender() {
    try {
      await fetchRows();
      decorateRows();
    } catch {
      decorateRows();
    }
  }

  new MutationObserver(() => decorateRows()).observe(tableWrap, { childList: true, subtree: true });
  runButton.addEventListener("click", () => setTimeout(syncAfterRender, 100));
  dailyTab.addEventListener("click", () => setTimeout(syncAfterRender, 100));
  document.getElementById("weekly-tab")?.addEventListener("click", () => {
    if (detailWrap) detailWrap.hidden = true;
    setTimeout(decorateRows, 100);
  });

  window.addEventListener("pageshow", () => setTimeout(syncAfterRender, 300));
  loadReferenceData().catch(() => {});
  setTimeout(syncAfterRender, 500);
})();
