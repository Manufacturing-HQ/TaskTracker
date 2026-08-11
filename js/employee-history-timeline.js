"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const historyView = document.getElementById("view-history");
  const historyTable = document.getElementById("history-table");
  const loadButton = document.getElementById("history-load");
  const startDate = document.getElementById("history-start");
  const endDate = document.getElementById("history-end");
  if (!config || !supabaseLib || !historyView || !historyTable || !loadButton) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  const pct = (v) => v === null || v === undefined ? "—" : `${Number(v).toFixed(2)}%`;
  const min = (v) => v === null || v === undefined ? "—" : `${Number(v).toFixed(2)} min`;
  const fmtDate = (v) => v ? new Date(`${v}T00:00:00`).toLocaleDateString() : "—";

  const style = document.createElement("style");
  style.textContent = `
    .employee-rework-nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:8px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;vertical-align:middle}
    .history-job-card{border:2px solid #94a3b8;border-radius:14px;background:#fff;margin-bottom:12px;overflow:hidden}
    .history-job-summary{padding:14px 16px;cursor:pointer;background:#f8fafc;display:grid;grid-template-columns:130px minmax(220px,1.6fr) 1fr 110px 150px;gap:12px;align-items:center}
    .history-job-summary:hover{background:#eef2f7}.history-job-summary strong{display:block}.history-job-meta{font-size:12px;color:#64748b;margin-top:3px}
    .history-session-wrap{padding:12px 14px 16px;background:#fff}.history-session-table{min-width:980px}.history-gap-within{background:#fff9db!important;font-weight:800}.history-gap-between{background:#e8f0fe!important;font-weight:800}.history-gap-label{font-size:10px;font-weight:900;text-transform:uppercase;color:#475569;display:block;margin-top:2px}.history-explain{font-size:12px;color:#64748b;margin-bottom:12px}.history-job-list{margin-top:14px}
    @media(max-width:900px){.history-job-summary{grid-template-columns:1fr 1fr}.history-job-summary>div:nth-child(2){grid-column:1/-1}}
  `;
  document.head.appendChild(style);

  const oldWrap = historyTable.closest(".table-wrap");
  const list = document.createElement("div");
  list.id = "employee-history-timeline";
  list.className = "history-job-list";
  const explanation = document.createElement("div");
  explanation.className = "history-explain";
  explanation.textContent = "Time Between Tasks measures the gap from one stopped session to the next session start on the same Eastern business date. Overnight gaps are never counted. Yellow gaps are within the same job; blue gaps are between different jobs.";
  oldWrap.insertAdjacentElement("beforebegin", explanation);
  oldWrap.insertAdjacentElement("beforebegin", list);
  oldWrap.hidden = true;

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function render(data) {
    const sum = data?.summary || {};
    document.getElementById("history-productivity").textContent = pct(sum.productivity_percent);
    document.getElementById("history-efficiency").textContent = pct(sum.efficiency_percent);
    document.getElementById("history-error").textContent = pct(sum.error_rate_percent);
    const jobs = data?.jobs || [];
    if (!jobs.length) {
      list.innerHTML = '<div class="empty">No jobs found for this date range.</div>';
      return;
    }
    list.innerHTML = jobs.map((job) => {
      const qa = job.qa || {};
      const label = job.task_type === "Productive" ? (job.work_order_number || job.item_name || "Productive") : (job.non_productive_task || job.task_type || "Task");
      const sessions = job.sessions || [];
      const sessionRows = sessions.map((s) => {
        const gap = Number(s.time_between_tasks_minutes);
        const hasGap = Number.isFinite(gap) && gap > 0;
        const gapClass = hasGap ? (s.gap_type === "WITHIN_JOB" ? "history-gap-within" : "history-gap-between") : "";
        const gapLabel = hasGap ? `<span class="history-gap-label">${s.gap_type === "WITHIN_JOB" ? "Within same job" : "Between jobs"}</span>` : "";
        return `<tr><td>${fmtDate(s.business_date)}</td><td>${esc(s.start_time||"—")}</td><td>${esc(s.stop_time||"—")}</td><td>${esc(s.stop_reason||"—")}</td><td>${min(s.duration_minutes)}</td><td class="${gapClass}">${hasGap ? min(gap) : "—"}${gapLabel}</td><td>${esc(s.comments||"—")}</td></tr>`;
      }).join("");
      const errors = (qa.errors||[]).map((e) => `${e.error_name} (${e.quantity})`).join(", ");
      return `<details class="history-job-card">
        <summary class="history-job-summary"><div><strong>${fmtDate(job.first_date)}</strong><div class="history-job-meta">${esc(job.task_type||"")}</div></div><div><strong>${esc(label)}</strong><div class="history-job-meta">${esc([job.item_name,job.job_type,job.job_status].filter(Boolean).join(" · "))}</div></div><div><strong>${min(job.actual_minutes)}</strong><div class="history-job-meta">Tracked duration</div></div><div><strong>${min(job.within_job_gap_minutes)}</strong><div class="history-job-meta">Within-job gap</div></div><div><strong>${min(job.between_job_gap_minutes)}</strong><div class="history-job-meta">Gap to next job</div></div></summary>
        <div class="history-session-wrap"><div class="table-wrap"><table class="history-session-table"><thead><tr><th>Date</th><th>Start Time</th><th>Stop Time</th><th>Stop Reason</th><th>Duration</th><th>Time Between Tasks</th><th>Comments</th></tr></thead><tbody>${sessionRows}</tbody></table></div>${errors?`<div class="details" style="margin-top:10px"><strong>QA Errors:</strong> ${esc(errors)}</div>`:""}</div>
      </details>`;
    }).join("");
  }

  async function load() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token || !startDate.value || !endDate.value) return;
    list.innerHTML = '<div class="empty">Loading history...</div>';
    try {
      const data = await rpc("get_employee_history_timeline", {p_session_token:token,p_employee_id:null,p_start_date:startDate.value,p_end_date:endDate.value});
      render(data);
    } catch (error) {
      list.innerHTML = `<div class="msg" data-type="error">${esc(error.message)}</div>`;
    }
  }

  loadButton.addEventListener("click", () => setTimeout(load,20));
  document.querySelector('.nav button[data-view="history"]')?.addEventListener("click", () => setTimeout(load,50));
})();
