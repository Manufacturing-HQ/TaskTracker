"use strict";

/* Keeps Item Reporting summary rows visible while showing contributing jobs beside the report. */
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

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const style = document.createElement("style");
  style.id = "item-report-sidepanel-style";
  style.textContent = `
    #table.item-report-split-open{
      display:grid;
      grid-template-columns:minmax(1080px,1fr) minmax(440px,540px);
      gap:14px;
      align-items:start;
      overflow:auto;
      border:0;
      border-radius:0;
      background:transparent;
    }
    #table.item-report-split-open > table{
      width:100%;
      align-self:start;
      border:1px solid #e2e8f0;
      border-radius:12px;
      background:#fff;
      overflow:hidden;
    }
    #table > .item-report-side-panel{
      position:sticky;
      top:12px;
      align-self:start;
      max-height:calc(100vh - 36px);
      overflow:hidden;
      border:1px solid #bfdbfe;
      border-radius:12px;
      background:#fff;
      padding:14px;
      box-shadow:0 12px 32px rgba(15,23,42,.10);
    }
    #table > .item-report-side-panel > .table-wrap{
      max-height:calc(100vh - 185px);
      overflow:auto;
    }
    #table.item-report-split-open tr.item-report-summary-row.item-report-expanded td{
      background:#eff6ff;
    }
    .item-sidepanel-close{white-space:nowrap}
    @media(max-width:1500px){
      #table.item-report-split-open{grid-template-columns:minmax(900px,1fr) minmax(420px,480px)}
    }
    @media(max-width:1150px){
      #table.item-report-split-open{display:block}
      #table > .item-report-side-panel{position:static;margin-top:14px;max-height:62vh}
      #table > .item-report-side-panel > .table-wrap{max-height:48vh}
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
    if (groupBy === "SKU_GROUP") {
      return [summary.sku_group, summary.job_type].filter(Boolean).join(" · ") || "Selected SKU Group";
    }
    if (groupBy === "JOB_TYPE") return summary.job_type || "Selected Job Type";
    return [summary.item_name || summary.internal_id, summary.job_type].filter(Boolean).join(" · ") || "Selected Item";
  }

  function closePanel() {
    tableWrap.querySelectorAll("tr.item-report-summary-row.item-report-expanded").forEach((row) => {
      row.classList.remove("item-report-expanded");
    });
    tableWrap.querySelector(":scope > .item-report-side-panel")?.remove();
    tableWrap.classList.remove("item-report-split-open");
  }

  function ensurePanel() {
    let panel = tableWrap.querySelector(":scope > .item-report-side-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "item-report-side-panel item-drilldown-panel";
      panel.dataset.itemReportSideDetail = "1";
      tableWrap.appendChild(panel);
    }
    tableWrap.classList.add("item-report-split-open");
    return panel;
  }

  function renderJobs(panel, jobs, label) {
    if (!jobs.length) {
      panel.innerHTML = `
        <div class="item-drilldown-head">
          <div><h3>${esc(label)}</h3><div class="item-drilldown-note">No jobs were found for this report row.</div></div>
          <button type="button" class="secondary item-sidepanel-close">Close Jobs</button>
        </div>`;
      return;
    }

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
        <div>
          <h3>${esc(label)}</h3>
          <div class="item-drilldown-note">${jobs.length} contributing job${jobs.length === 1 ? "" : "s"}. The Item report remains visible while you review the jobs.</div>
        </div>
        <button type="button" class="secondary item-sidepanel-close">Close Jobs</button>
      </div>
      <div class="table-wrap"><table class="item-job-table"><thead><tr>
        <th>Job</th><th>Employee</th><th>Employee Dept</th><th>Completion Date</th><th>Item / Item Entered</th>
        <th>Work Order</th><th>WO Type</th><th>WO Department</th><th>Job Type</th><th>Operation</th>
        <th>Assigned Qty</th><th>Completed Qty</th><th>Productive Min</th><th>Target Cycle</th><th>Actual Cycle</th><th>Productivity</th>
        <th>QA Status</th><th>Passed</th><th>Rejected</th><th>Errors</th><th>Scrap</th><th>Rework Returned</th><th>Corrections</th><th>Comments</th>
      </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  async function openSummaryRow(row) {
    const alreadySelected = row.classList.contains("item-report-expanded")
      && Boolean(tableWrap.querySelector(":scope > .item-report-side-panel"));
    if (alreadySelected) {
      closePanel();
      return;
    }

    tableWrap.querySelectorAll("tr.item-report-summary-row.item-report-expanded").forEach((other) => {
      other.classList.remove("item-report-expanded");
    });
    row.classList.add("item-report-expanded");

    const panel = ensurePanel();
    panel.innerHTML = '<div class="item-drilldown-loading">Loading jobs...</div>';

    try {
      const { args, summary } = await resolveSummaryRow(row);
      const key = cacheKey(args, summary);
      let jobs = jobsCache.get(key);
      if (!jobs) {
        const data = await rpc("get_item_reporting_jobs", drillArgs(args, summary));
        jobs = Array.isArray(data) ? data : [];
        jobsCache.set(key, jobs);
      }
      if (panel.isConnected && row.classList.contains("item-report-expanded")) {
        renderJobs(panel, jobs, summaryLabel(summary, args.p_group_by));
      }
    } catch (error) {
      if (panel.isConnected) {
        panel.innerHTML = `
          <div class="item-drilldown-head">
            <div><h3>Jobs</h3><div class="item-drilldown-note">Unable to load this row.</div></div>
            <button type="button" class="secondary item-sidepanel-close">Close Jobs</button>
          </div>
          <div class="message" data-type="error">${esc(error.message || String(error))}</div>`;
      }
    }
  }

  tableWrap.addEventListener("click", (event) => {
    if (!isItemMode()) return;
    const body = rootReportBody();
    const row = event.target.closest?.("tbody > tr");
    if (!body || !row || row.parentElement !== body || row.classList.contains("item-report-drilldown-row")) return;
    if (event.target.closest?.("button,a,input,select,details,summary")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    openSummaryRow(row);
  }, true);

  tableWrap.addEventListener("click", (event) => {
    const close = event.target.closest?.(".item-sidepanel-close,.item-collapse-jobs");
    if (!close || !close.closest?.(".item-report-side-panel")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    closePanel();
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#run-report,#daily-tab,#weekly-tab,#transactions-tab")) {
      jobsCache.clear();
      closePanel();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target?.closest?.("#item-group-by,#item-wo-department,#item-employee-department,#item-job-type,#item-sku-group,#item-search,#report-employee,#start-date,#end-date")) {
      closePanel();
    }
  });
})();
