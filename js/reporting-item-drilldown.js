"use strict";

/* Phase 3 Item Reporting row drill-down and full job detail modal. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const tableWrap = document.getElementById("table");
  if (!config || !supabaseLib || !tableWrap) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const jobsCache = new Map();
  const detailCache = new Map();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const style = document.createElement("style");
  style.textContent = `
    #table tbody tr.item-report-summary-row{cursor:pointer}
    #table tbody tr.item-report-summary-row:hover td{background:#eef4ff}
    #table tbody tr.item-report-summary-row td:first-child::before{content:'▸';display:inline-block;width:16px;color:#475569;font-weight:900}
    #table tbody tr.item-report-summary-row.item-report-expanded td:first-child::before{content:'▾'}
    #table tbody tr.item-report-drilldown-row>td{padding:0;background:#f8fafc;white-space:normal}
    .item-drilldown-panel{padding:16px 18px 18px;border-top:2px solid #bfdbfe;border-bottom:2px solid #bfdbfe}
    .item-drilldown-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:12px}
    .item-drilldown-head h3{margin:0;font-size:16px}.item-drilldown-note{font-size:12px;color:#64748b;margin-top:3px}
    .item-job-table{min-width:2200px}.item-job-table td.item-job-comments{white-space:normal;min-width:280px;max-width:420px}
    .item-job-table td.item-entered{font-weight:800;background:#fff7ed}
    .item-view-job{border:1px solid #94a3b8;background:#fff;border-radius:8px;padding:6px 10px;font-weight:800;white-space:nowrap}
    .item-view-job:hover{background:#eff6ff;border-color:#60a5fa}
    .item-job-modal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.62);display:flex;align-items:flex-start;justify-content:center;padding:28px 18px;overflow:auto}
    .item-job-modal-backdrop[hidden]{display:none!important}.item-job-modal{width:min(1500px,100%);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.32);overflow:hidden}
    .item-job-modal-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px 22px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .item-job-modal-header h2{margin:0;font-size:22px}.item-job-modal-sub{margin-top:4px;color:#64748b}.item-job-modal-close{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;font-weight:900}
    .item-job-modal-body{padding:20px 22px 26px}.item-job-detail-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:18px}
    .item-job-detail-cell{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc;min-width:0}.item-job-detail-cell span{display:block;font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}.item-job-detail-cell strong{display:block;overflow-wrap:anywhere}
    .item-job-section{margin-top:20px}.item-job-section h3{margin:0 0 10px;font-size:17px}.item-job-section .table-wrap{max-height:440px}
    .item-job-section table{min-width:1000px}.item-job-comment-box{border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere}
    .item-job-correction-values{margin-top:6px}.item-job-correction-values pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:10px;max-width:700px;font-size:11px}
    .item-drilldown-loading,.item-drilldown-empty{padding:16px;color:#64748b}
    @media(max-width:1000px){.item-job-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.item-job-detail-grid{grid-template-columns:1fr}.item-job-modal-backdrop{padding:10px}.item-job-modal-body,.item-job-modal-header{padding:14px}}
  `;
  document.head.appendChild(style);

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function isItemMode() {
    return $("item-tab")?.classList.contains("active") === true;
  }

  function rootReportBody() {
    return tableWrap.querySelector(":scope > table > tbody");
  }

  function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || value === "") return "--";
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : String(value);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "--";
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)}%` : String(value);
  }

  function formatDate(value) {
    if (!value) return "--";
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  function formatEasternDateTime(value) {
    if (!value) return "--";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "2-digit"
    }).format(d);
  }

  function normalize(value) {
    const text = String(value ?? "").trim();
    return !text || text === "--" ? "" : text;
  }

  function baseRequestArgs() {
    const token = sessionStorage.getItem(sessionKey);
    const start = $("start-date")?.value;
    const end = $("end-date")?.value;
    if (!token) throw new Error("Your reporting session is no longer available.");
    if (!start || !end) throw new Error("Select a valid date range.");
    return {
      p_session_token: token,
      p_start_date: start,
      p_end_date: end,
      p_group_by: $("item-group-by")?.value || "ITEM",
      p_employee_id: $("report-employee")?.value || null,
      p_work_order_department: $("item-wo-department")?.value || null,
      p_employee_department_id: $("item-employee-department")?.value || null,
      p_job_type: $("item-job-type")?.value || null,
      p_sku_group: $("item-sku-group")?.value || null,
      p_item_search: $("item-search")?.value?.trim() || null
    };
  }

  function rowKeyFromDom(row, groupBy) {
    const cells = Array.from(row.cells).map((cell) => normalize(cell.textContent));
    if (groupBy === "SKU_GROUP") {
      return { sku_group: cells[0], work_order_department: cells[3], job_type: cells[4] };
    }
    if (groupBy === "JOB_TYPE") {
      return { job_type: cells[0] };
    }
    return { internal_id: cells[1], work_order_department: cells[5], job_type: cells[6] };
  }

  function matchesSummaryRow(summary, key, groupBy) {
    if (groupBy === "SKU_GROUP") {
      return normalize(summary.sku_group) === key.sku_group
        && normalize(summary.work_order_department) === key.work_order_department
        && normalize(summary.job_type) === key.job_type;
    }
    if (groupBy === "JOB_TYPE") {
      return normalize(summary.job_type) === key.job_type;
    }
    return normalize(summary.internal_id) === key.internal_id
      && normalize(summary.work_order_department) === key.work_order_department
      && normalize(summary.job_type) === key.job_type;
  }

  async function resolveSummaryRow(row) {
    const args = baseRequestArgs();
    const rows = await rpc("get_item_reporting", args);
    const list = Array.isArray(rows) ? rows : [];
    const groupBy = args.p_group_by;
    const key = rowKeyFromDom(row, groupBy);
    const summary = list.find((candidate) => matchesSummaryRow(candidate, key, groupBy));
    if (!summary) throw new Error("The selected report row could not be matched. Run the report again and retry.");
    return { args, summary };
  }

  function drillArgs(args, summary) {
    return {
      ...args,
      p_group_item_id: summary.item_id || null,
      p_group_sku_group: summary.sku_group || null,
      p_group_job_type: summary.job_type || null,
      p_group_work_order_department: summary.work_order_department || null
    };
  }

  function cacheKey(args, summary) {
    const copy = { ...args };
    delete copy.p_session_token;
    return JSON.stringify({ filters: copy, item_id: summary.item_id, sku_group: summary.sku_group, job_type: summary.job_type, wo: summary.work_order_department });
  }

  function renderJobs(panel, jobs) {
    if (!jobs.length) {
      panel.innerHTML = '<div class="item-drilldown-empty">No jobs were found for this summary row.</div>';
      return;
    }

    const body = jobs.map((job) => {
      const isNotListed = job.internal_id === "SYSTEM-ITEM-NOT-LISTED";
      const itemText = isNotListed ? (job.item_not_listed_detail || job.item_name || "Item Not Listed") : (job.item_name || "--");
      return `<tr>
        <td><button type="button" class="item-view-job" data-job-id="${esc(job.job_id)}">View Job #${esc(job.job_number ?? "")}</button></td>
        <td>${esc(job.employee_name || "--")}</td>
        <td>${esc(job.employee_department || "--")}</td>
        <td>${esc(formatDate(job.completion_date))}</td>
        <td class="${isNotListed ? "item-entered" : ""}">${esc(itemText)}</td>
        <td>${esc(job.work_order_number || "--")}</td>
        <td>${esc(job.work_order_type || "--")}</td>
        <td>${esc(job.work_order_department || "--")}</td>
        <td>${esc(job.job_type || "--")}</td>
        <td>${esc(job.operation_code || "--")}</td>
        <td>${esc(formatNumber(job.assigned_quantity,2))}</td>
        <td>${esc(formatNumber(job.completed_quantity,2))}</td>
        <td>${esc(formatNumber(job.productive_minutes,2))}</td>
        <td>${esc(formatNumber(job.target_cycle_time,4))}</td>
        <td>${esc(formatNumber(job.actual_cycle_time,4))}</td>
        <td>${esc(formatPercent(job.productivity_percent))}</td>
        <td>${esc(job.qa_status || "--")}</td>
        <td>${esc(formatNumber(job.quantity_passed,2))}</td>
        <td>${esc(formatNumber(job.quantity_rejected,2))}</td>
        <td>${esc(formatNumber(job.error_quantity,2))}</td>
        <td>${esc(formatNumber(job.scrap_quantity,2))}</td>
        <td>${esc(formatNumber(job.rework_quantity_returned,2))}</td>
        <td>${esc(formatNumber(job.correction_count,0))}</td>
        <td class="item-job-comments">${esc(job.comments || job.qa_comments || "--")}</td>
      </tr>`;
    }).join("");

    panel.innerHTML = `
      <div class="item-drilldown-head">
        <div><h3>${jobs.length} job${jobs.length === 1 ? "" : "s"} contributing to this row</h3><div class="item-drilldown-note">Item Reporting uses completion date and Assigned Quantity. “Item Not Listed” rows show the employee-entered item description here.</div></div>
      </div>
      <div class="table-wrap"><table class="item-job-table"><thead><tr>
        <th>Job</th><th>Employee</th><th>Employee Dept</th><th>Completion Date</th><th>Item / Item Entered</th>
        <th>Work Order</th><th>WO Type</th><th>WO Department</th><th>Job Type</th><th>Operation</th>
        <th>Assigned Qty</th><th>Completed Qty</th><th>Productive Min</th><th>Target Cycle</th><th>Actual Cycle</th><th>Productivity</th>
        <th>QA Status</th><th>Passed</th><th>Rejected</th><th>Errors</th><th>Scrap</th><th>Rework Returned</th><th>Corrections</th><th>Comments</th>
      </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function closeOpenRows(exceptRow = null) {
    tableWrap.querySelectorAll("tr.item-report-drilldown-row").forEach((detailRow) => {
      const summary = detailRow.previousElementSibling;
      if (summary === exceptRow) return;
      summary?.classList.remove("item-report-expanded");
      detailRow.remove();
    });
  }

  async function toggleSummaryRow(row) {
    const existing = row.nextElementSibling;
    if (existing?.classList.contains("item-report-drilldown-row")) {
      row.classList.remove("item-report-expanded");
      existing.remove();
      return;
    }

    const detailRow = document.createElement("tr");
    detailRow.className = "item-report-drilldown-row";
    const cell = document.createElement("td");
    cell.colSpan = row.cells.length;
    const panel = document.createElement("div");
    panel.className = "item-drilldown-panel";
    panel.innerHTML = '<div class="item-drilldown-loading">Loading jobs...</div>';
    cell.appendChild(panel);
    detailRow.appendChild(cell);
    row.insertAdjacentElement("afterend", detailRow);
    row.classList.add("item-report-expanded");

    try {
      const { args, summary } = await resolveSummaryRow(row);
      const key = cacheKey(args, summary);
      let jobs = jobsCache.get(key);
      if (!jobs) {
        const data = await rpc("get_item_reporting_jobs", drillArgs(args, summary));
        jobs = Array.isArray(data) ? data : [];
        jobsCache.set(key, jobs);
      }
      if (detailRow.isConnected) renderJobs(panel, jobs);
    } catch (error) {
      if (detailRow.isConnected) panel.innerHTML = `<div class="message" data-type="error">${esc(error.message || String(error))}</div>`;
    }
  }

  function ensureModal() {
    if ($("item-job-modal-backdrop")) return $("item-job-modal-backdrop");
    const backdrop = document.createElement("div");
    backdrop.id = "item-job-modal-backdrop";
    backdrop.className = "item-job-modal-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="item-job-modal" role="dialog" aria-modal="true" aria-labelledby="item-job-modal-title">
        <div class="item-job-modal-header"><div><h2 id="item-job-modal-title">Job Detail</h2><div id="item-job-modal-sub" class="item-job-modal-sub"></div></div><button type="button" class="item-job-modal-close" data-close-item-job>Close</button></div>
        <div id="item-job-modal-body" class="item-job-modal-body"></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest?.("[data-close-item-job]")) backdrop.hidden = true;
    });
    return backdrop;
  }

  function detailCell(label, value) {
    return `<div class="item-job-detail-cell"><span>${esc(label)}</span><strong>${esc(value ?? "--")}</strong></div>`;
  }

  function renderJobDetail(data) {
    const job = data?.job || {};
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    const reviews = Array.isArray(data?.qa_reviews) ? data.qa_reviews : [];
    const corrections = Array.isArray(data?.corrections) ? data.corrections : [];
    const productiveMinutes = sessions.reduce((total, session) => total + (Number(session.duration_minutes) || 0), 0);
    const assigned = Number(job.assigned_quantity) || 0;
    const expected = Number(job.expected_minutes) || 0;
    const actualCycle = assigned > 0 ? productiveMinutes / assigned : null;
    const productivity = productiveMinutes > 0 ? expected / productiveMinutes * 100 : null;

    $("item-job-modal-title").textContent = `Job #${job.job_number ?? ""}`;
    $("item-job-modal-sub").textContent = `${job.item_display_name || job.item_name || "Productive Job"} · ${job.employee_name || ""}`;

    const fields = [
      ["Employee", job.employee_name], ["Employee Department", job.employee_department], ["Completion Date", formatDate(job.completion_date)],
      ["Item", job.item_name], ["Item Entered", job.item_not_listed_detail], ["Internal ID", job.internal_id],
      ["Work Order", job.work_order_number], ["WO Type", job.work_order_type], ["WO Department", job.work_order_department],
      ["Job Type", job.job_type], ["Operation", job.operation_code], ["Status", job.job_status],
      ["Assigned Quantity", formatNumber(job.assigned_quantity,2)], ["Completed Quantity", formatNumber(job.completed_quantity,2)],
      ["Target Cycle", formatNumber(job.cycle_time_snapshot,4)], ["Actual Cycle", formatNumber(actualCycle,4)],
      ["Expected Minutes", formatNumber(job.expected_minutes,2)], ["Productive Minutes", formatNumber(productiveMinutes,2)],
      ["Productivity", formatPercent(productivity)], ["Sessions", formatNumber(sessions.length,0)]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "--");

    const sessionRows = sessions.map((session) => `<tr>
      <td>${esc(formatDate(session.business_date))}</td><td>${esc(session.start_time || "--")}</td><td>${esc(session.stop_time || "--")}</td>
      <td>${esc(formatNumber(session.duration_minutes,2))}</td><td>${esc(session.stop_reason || "--")}</td><td>${esc(session.end_type || "--")}</td><td>${esc(session.comments || "--")}</td>
    </tr>`).join("");

    const qaRows = reviews.map((review) => {
      const errors = (review.errors || []).map((error) => `${error.error_name} (${formatNumber(error.quantity,2)})`).join(", ") || "--";
      return `<tr>
        <td>${esc(formatEasternDateTime(review.reviewed_at))}</td><td>${esc(review.reviewer_name || "--")}</td><td>${esc(review.disposition || "--")}</td>
        <td>${review.is_terminal ? "Yes" : "No"}</td><td>${esc(formatNumber(review.quantity_passed,2))}</td><td>${esc(formatNumber(review.quantity_rejected,2))}</td>
        <td>${esc(formatNumber(review.scrap_quantity,2))}</td><td>${esc(formatNumber(review.rework_quantity_returned,2))}</td><td>${esc(formatNumber(review.rework_quantity_completed_by_qa,2))}</td>
        <td style="white-space:normal;min-width:240px">${esc(errors)}</td><td style="white-space:normal;min-width:260px">${esc(review.qa_comments || "--")}</td>
      </tr>`;
    }).join("");

    const correctionRows = corrections.map((correction) => `<tr>
      <td>${esc(formatEasternDateTime(correction.corrected_at))}</td><td>${esc(correction.performed_by || "--")}</td><td>${esc(correction.correction_type || "--")}</td>
      <td style="white-space:normal;min-width:260px">${esc(correction.reason || "--")}</td>
      <td><details class="item-job-correction-values"><summary>View values</summary><pre>${esc(`Old: ${JSON.stringify(correction.old_values ?? null, null, 2)}\n\nNew: ${JSON.stringify(correction.new_values ?? null, null, 2)}`)}</pre></details></td>
    </tr>`).join("");

    $("item-job-modal-body").innerHTML = `
      <div class="item-job-detail-grid">${fields.map(([label,value]) => detailCell(label,value)).join("")}</div>
      <div class="item-job-section"><h3>Job Comments</h3><div class="item-job-comment-box">${esc(job.comments || "No job comments.")}</div></div>
      <div class="item-job-section"><h3>Sessions</h3>${sessions.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Start</th><th>Stop</th><th>Duration Min</th><th>Stop Reason</th><th>End Type</th><th>Comments</th></tr></thead><tbody>${sessionRows}</tbody></table></div>` : '<div class="muted">No current sessions recorded.</div>'}</div>
      <div class="item-job-section"><h3>QA Review History</h3>${reviews.length ? `<div class="table-wrap"><table><thead><tr><th>Reviewed</th><th>QA Employee</th><th>Disposition</th><th>Final</th><th>Passed</th><th>Rejected</th><th>Scrap</th><th>Rework Returned</th><th>QA Rework</th><th>Errors</th><th>Comments</th></tr></thead><tbody>${qaRows}</tbody></table></div>` : '<div class="muted">No QA reviews recorded for this job.</div>'}</div>
      <div class="item-job-section"><h3>Correction History</h3>${corrections.length ? `<div class="table-wrap"><table><thead><tr><th>Changed</th><th>Changed By</th><th>Type</th><th>Reason</th><th>Old / New Values</th></tr></thead><tbody>${correctionRows}</tbody></table></div>` : '<div class="muted">No corrections recorded for this job.</div>'}</div>`;
  }

  async function openJobDetail(jobId) {
    const backdrop = ensureModal();
    backdrop.hidden = false;
    $("item-job-modal-title").textContent = "Job Detail";
    $("item-job-modal-sub").textContent = "Loading...";
    $("item-job-modal-body").innerHTML = '<div class="item-drilldown-loading">Loading full job history...</div>';
    try {
      let data = detailCache.get(jobId);
      if (!data) {
        const token = sessionStorage.getItem(sessionKey);
        if (!token) throw new Error("Your reporting session is no longer available.");
        data = await rpc("get_item_reporting_job_detail", { p_session_token: token, p_job_id: jobId });
        detailCache.set(jobId, data);
      }
      if (!backdrop.hidden) renderJobDetail(data);
    } catch (error) {
      $("item-job-modal-body").innerHTML = `<div class="message" data-type="error">${esc(error.message || String(error))}</div>`;
    }
  }

  function markSummaryRows() {
    if (!isItemMode()) return;
    const body = rootReportBody();
    if (!body) return;
    Array.from(body.children).forEach((row) => {
      if (row.classList.contains("item-report-drilldown-row")) return;
      row.classList.add("item-report-summary-row");
      row.title = "Click to view the jobs contributing to this row";
    });
  }

  tableWrap.addEventListener("click", (event) => {
    const viewButton = event.target.closest?.(".item-view-job");
    if (viewButton) {
      event.preventDefault();
      event.stopPropagation();
      openJobDetail(viewButton.dataset.jobId);
      return;
    }
    if (!isItemMode()) return;
    const body = rootReportBody();
    const row = event.target.closest?.("tbody > tr");
    if (!body || !row || row.parentElement !== body || row.classList.contains("item-report-drilldown-row")) return;
    if (event.target.closest?.("button,a,input,select,details,summary")) return;
    toggleSummaryRow(row);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("item-job-modal-backdrop") && !$("item-job-modal-backdrop").hidden) {
      $("item-job-modal-backdrop").hidden = true;
    }
  });

  new MutationObserver(() => setTimeout(markSummaryRows, 0)).observe(tableWrap, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#item-tab")) setTimeout(markSummaryRows, 100);
    if (event.target.closest?.("#run-report")) {
      jobsCache.clear();
      detailCache.clear();
      closeOpenRows();
    }
    if (event.target.closest?.("#daily-tab,#weekly-tab,#transactions-tab")) closeOpenRows();
  }, true);

  ensureModal();
  setTimeout(markSummaryRows, 700);
})();
