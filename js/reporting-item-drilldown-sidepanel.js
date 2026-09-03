"use strict";

/* Item Reporting inline job drill-down. Keeps summary rows visible and caps the expanded section height. */
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
  let activeRow = null;
  let activeDetailRow = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const style = document.createElement("style");
  style.id = "item-report-inline-drilldown-style";
  style.textContent = `
    #table tbody tr.item-report-summary-row.item-report-expanded td{background:#eff6ff}
    #table tbody tr.item-report-drilldown-row>td{
      padding:0!important;
      background:#f8fafc!important;
      white-space:normal!important;
      border-bottom:2px solid #bfdbfe;
    }
    #table .item-inline-drilldown{
      padding:14px 16px 16px;
      border-top:2px solid #bfdbfe;
      background:#f8fafc;
    }
    #table .item-inline-drilldown .item-drilldown-head{
      display:flex;
      justify-content:space-between;
      gap:14px;
      align-items:flex-start;
      margin-bottom:10px;
    }
    #table .item-inline-drilldown .item-drilldown-head h3{margin:0;font-size:16px}
    #table .item-inline-drilldown .item-drilldown-note{font-size:12px;color:#64748b;margin-top:4px}
    #table .item-inline-drilldown .item-inline-job-scroll{
      max-height:290px;
      overflow:auto;
      border:1px solid #e2e8f0;
      border-radius:10px;
      background:#fff;
    }
    #table .item-inline-drilldown .item-job-table{min-width:2200px}
    #table .item-inline-drilldown .item-job-table td.item-job-comments{white-space:normal;min-width:280px;max-width:420px}
    #table .item-inline-drilldown .item-job-table td.item-entered{font-weight:800;background:#fff7ed}
    #table .item-inline-drilldown .item-view-job{
      border:1px solid #94a3b8;
      background:#fff;
      border-radius:8px;
      padding:6px 10px;
      font-weight:800;
      white-space:nowrap;
    }
    #table .item-inline-drilldown .item-view-job:hover{background:#eff6ff;border-color:#60a5fa}
    #table .item-inline-close{white-space:nowrap}
    @media(max-width:900px){
      #table .item-inline-drilldown .item-drilldown-head{flex-direction:column}
      #table .item-inline-drilldown .item-inline-job-scroll{max-height:260px}
    }
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

  function normalize(value) {
    const text = String(value ?? "").trim();
    return !text || text === "--" ? "" : text;
  }

  function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || value === "") return "--";
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { maximumFractionDigits: digits })
      : String(value);
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

  function requestArgs() {
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
    if (groupBy === "JOB_TYPE") return { job_type: cells[0] };
    return { internal_id: cells[1], work_order_department: cells[5], job_type: cells[6] };
  }

  function matchesSummaryRow(summary, key, groupBy) {
    if (groupBy === "SKU_GROUP") {
      return normalize(summary.sku_group) === key.sku_group
        && normalize(summary.work_order_department) === key.work_order_department
        && normalize(summary.job_type) === key.job_type;
    }
    if (groupBy === "JOB_TYPE") return normalize(summary.job_type) === key.job_type;
    return normalize(summary.internal_id) === key.internal_id
      && normalize(summary.work_order_department) === key.work_order_department
      && normalize(summary.job_type) === key.job_type;
  }

  async function resolveSummaryRow(row) {
    const args = requestArgs();
    const rows = await rpc("get_item_reporting", args);
    const list = Array.isArray(rows) ? rows : [];
    const key = rowKeyFromDom(row, args.p_group_by);
    const summary = list.find((candidate) => matchesSummaryRow(candidate, key, args.p_group_by));
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
    return JSON.stringify({
      filters: copy,
      item_id: summary.item_id,
      sku_group: summary.sku_group,
      job_type: summary.job_type,
      work_order_department: summary.work_order_department
    });
  }

  function summaryLabel(summary, groupBy) {
    if (groupBy === "SKU_GROUP") return [summary.sku_group, summary.job_type].filter(Boolean).join(" - ") || "Selected SKU Group";
    if (groupBy === "JOB_TYPE") return summary.job_type || "Selected Job Type";
    return [summary.item_name || summary.internal_id, summary.job_type].filter(Boolean).join(" - ") || "Selected Item";
  }

  function closeInline() {
    activeRow?.classList.remove("item-report-expanded");
    activeDetailRow?.remove();
    activeRow = null;
    activeDetailRow = null;
  }

  function createDetailRow(row) {
    const detailRow = document.createElement("tr");
    detailRow.className = "item-report-drilldown-row";
    detailRow.dataset.itemInlineDetail = "1";

    const cell = document.createElement("td");
    cell.colSpan = Math.max(1, row.cells.length);

    const panel = document.createElement("div");
    panel.className = "item-drilldown-panel item-inline-drilldown";
    panel.innerHTML = '<div class="muted">Loading jobs...</div>';

    cell.appendChild(panel);
    detailRow.appendChild(cell);
    row.insertAdjacentElement("afterend", detailRow);
    return { detailRow, panel };
  }

  function renderJobs(panel, jobs, label) {
    const body = jobs.map((job) => {
      const isNotListed = job.internal_id === "SYSTEM-ITEM-NOT-LISTED";
      const itemText = isNotListed
        ? (job.item_not_listed_detail || job.item_name || "Item Not Listed")
        : (job.item_name || "--");
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
        <td>${esc(formatNumber(job.assigned_quantity, 2))}</td>
        <td>${esc(formatNumber(job.completed_quantity, 2))}</td>
        <td>${esc(formatNumber(job.productive_minutes, 2))}</td>
        <td>${esc(formatNumber(job.target_cycle_time, 4))}</td>
        <td>${esc(formatNumber(job.actual_cycle_time, 4))}</td>
        <td>${esc(formatPercent(job.productivity_percent))}</td>
        <td>${esc(job.qa_status || "--")}</td>
        <td>${esc(formatNumber(job.quantity_passed, 2))}</td>
        <td>${esc(formatNumber(job.quantity_rejected, 2))}</td>
        <td>${esc(formatNumber(job.error_quantity, 2))}</td>
        <td>${esc(formatNumber(job.scrap_quantity, 2))}</td>
        <td>${esc(formatNumber(job.rework_quantity_returned, 2))}</td>
        <td>${esc(formatNumber(job.correction_count, 0))}</td>
        <td class="item-job-comments">${esc(job.comments || job.qa_comments || "--")}</td>
      </tr>`;
    }).join("");

    panel.innerHTML = `
      <div class="item-drilldown-head">
        <div>
          <h3>${esc(label)}</h3>
          <div class="item-drilldown-note">${jobs.length} contributing job${jobs.length === 1 ? "" : "s"}. Scroll this section to review jobs; the remaining Item rows stay directly below it.</div>
        </div>
        <button type="button" class="secondary item-inline-close">Collapse Jobs</button>
      </div>
      ${jobs.length ? `<div class="item-inline-job-scroll"><table class="item-job-table"><thead><tr>
        <th>Job</th><th>Employee</th><th>Employee Dept</th><th>Completion Date</th><th>Item / Item Entered</th>
        <th>Work Order</th><th>WO Type</th><th>WO Department</th><th>Job Type</th><th>Operation</th>
        <th>Assigned Qty</th><th>Completed Qty</th><th>Productive Min</th><th>Target Cycle</th><th>Actual Cycle</th><th>Productivity</th>
        <th>QA Status</th><th>Passed</th><th>Rejected</th><th>Errors</th><th>Scrap</th><th>Rework Returned</th><th>Corrections</th><th>Comments</th>
      </tr></thead><tbody>${body}</tbody></table></div>` : '<div class="muted">No jobs were found for this report row.</div>'}`;
  }

  async function openSummaryRow(row) {
    if (activeRow === row && activeDetailRow?.isConnected) {
      closeInline();
      return;
    }

    closeInline();
    activeRow = row;
    activeRow.classList.add("item-report-expanded");
    const { detailRow, panel } = createDetailRow(row);
    activeDetailRow = detailRow;

    try {
      const { args, summary } = await resolveSummaryRow(row);
      const key = cacheKey(args, summary);
      let jobs = jobsCache.get(key);
      if (!jobs) {
        const data = await rpc("get_item_reporting_jobs", drillArgs(args, summary));
        jobs = Array.isArray(data) ? data : [];
        jobsCache.set(key, jobs);
      }
      if (activeRow === row && activeDetailRow === detailRow && panel.isConnected) {
        renderJobs(panel, jobs, summaryLabel(summary, args.p_group_by));
      }
    } catch (error) {
      if (activeRow === row && activeDetailRow === detailRow && panel.isConnected) {
        panel.innerHTML = `
          <div class="item-drilldown-head">
            <div><h3>Jobs</h3></div>
            <button type="button" class="secondary item-inline-close">Collapse Jobs</button>
          </div>
          <div class="message" data-type="error">${esc(error.message || String(error))}</div>`;
      }
    }
  }

  tableWrap.addEventListener("click", (event) => {
    if (!isItemMode()) return;

    const close = event.target.closest?.(".item-inline-close");
    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      closeInline();
      return;
    }

    const body = rootReportBody();
    const row = event.target.closest?.("tbody > tr");
    if (!body || !row || row.parentElement !== body || row.classList.contains("item-report-drilldown-row")) return;
    if (event.target.closest?.("button,a,input,select,details,summary")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    openSummaryRow(row);
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#run-report,#daily-tab,#weekly-tab,#transactions-tab")) {
      jobsCache.clear();
      closeInline();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target?.closest?.("#item-group-by,#item-wo-department,#item-employee-department,#item-job-type,#item-sku-group,#item-search,#report-employee,#start-date,#end-date")) closeInline();
  });
})();
