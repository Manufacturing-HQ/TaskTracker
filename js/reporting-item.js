"use strict";

/* Phase 3 Item Reporting mode for the shared Reporting page. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const runButton = document.getElementById("run-report");
  const tabsWrap = document.getElementById("weekly-tab")?.parentElement;
  const tableWrap = document.getElementById("table");
  if (!config || !supabaseLib || !runButton || !tabsWrap || !tableWrap) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let setupLoaded = false;
  let latestRows = [];

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(text, type = "info") {
    const el = $("message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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

  function sum(rows, key) {
    return rows.reduce((total, row) => total + numberValue(row[key]), 0);
  }

  function isItemMode() {
    return $("item-tab")?.classList.contains("active") === true;
  }

  function ensureFilters() {
    if ($("item-report-filters")) return;
    const hostCard = runButton.closest("section.card");
    if (!hostCard) return;
    const wrap = document.createElement("div");
    wrap.id = "item-report-filters";
    wrap.className = "grid";
    wrap.style.marginTop = "14px";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div><label for="item-group-by">Item Report View</label><select id="item-group-by"><option value="ITEM">Item + Job Type</option><option value="SKU_GROUP">SKU Group + Job Type</option><option value="JOB_TYPE">Job Type</option></select></div>
      <div><label for="item-wo-department">WO Department</label><select id="item-wo-department"><option value="">All WO Departments</option></select></div>
      <div><label for="item-employee-department">Employee Department</label><select id="item-employee-department"><option value="">All Employee Departments</option></select></div>
      <div><label for="item-job-type">Job Type</label><select id="item-job-type"><option value="">All Job Types</option></select></div>
      <div><label for="item-sku-group">SKU Group</label><select id="item-sku-group"><option value="">All SKU Groups</option></select></div>
      <div><label for="item-search">Item / Internal ID Search</label><input id="item-search" type="search" placeholder="Optional item search"></div>`;
    hostCard.appendChild(wrap);
  }

  function setSimpleOptions(selectId, rows, allLabel) {
    const select = $(selectId);
    if (!select) return;
    select.innerHTML = `<option value="">${esc(allLabel)}</option>`;
    (rows || []).forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  async function loadSetup() {
    if (setupLoaded) return;
    const token = sessionStorage.getItem(sessionKey);
    if (!token) throw new Error("Your reporting session is no longer available.");
    const setup = await rpc("get_item_reporting_setup_options", { p_session_token: token });
    setSimpleOptions("item-wo-department", setup?.work_order_departments, "All WO Departments");
    setSimpleOptions("item-job-type", setup?.job_types, "All Job Types");
    setSimpleOptions("item-sku-group", setup?.sku_groups, "All SKU Groups");

    const deptSelect = $("item-employee-department");
    deptSelect.innerHTML = '<option value="">All Employee Departments</option>';
    (setup?.employee_departments || []).forEach((row) => {
      const option = document.createElement("option");
      option.value = row.department_id;
      option.textContent = row.department_name;
      deptSelect.appendChild(option);
    });
    setupLoaded = true;
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

  async function fetchRows() {
    await loadSetup();
    const rows = await rpc("get_item_reporting", requestArgs());
    return Array.isArray(rows) ? rows : [];
  }

  function renderSummary(rows) {
    const summary = $("summary");
    const jobs = sum(rows, "job_count");
    const assigned = sum(rows, "assigned_quantity");
    const productive = sum(rows, "productive_minutes");
    const expected = sum(rows, "expected_minutes");
    const finalized = sum(rows, "qa_finalized_jobs");
    const pending = sum(rows, "qa_pending_jobs");
    const qaQty = sum(rows, "qa_finalized_assigned_quantity");
    const errors = sum(rows, "error_quantity");
    const scrap = sum(rows, "scrap_quantity");
    const productivity = productive > 0 ? (expected / productive) * 100 : null;
    const targetCycle = assigned > 0 ? expected / assigned : null;
    const actualCycle = assigned > 0 ? productive / assigned : null;
    const errorRate = qaQty > 0 ? (errors / qaQty) * 100 : null;
    const scrapRate = qaQty > 0 ? (scrap / qaQty) * 100 : null;

    summary.innerHTML = `
      <div class="metric"><div class="muted">Jobs</div><strong>${formatNumber(jobs, 0)}</strong></div>
      <div class="metric"><div class="muted">Assigned Quantity</div><strong>${formatNumber(assigned, 2)}</strong></div>
      <div class="metric"><div class="muted">Productive Minutes</div><strong>${formatNumber(productive, 2)}</strong></div>
      <div class="metric"><div class="muted">Productivity</div><strong>${formatPercent(productivity)}</strong></div>
      <div class="metric"><div class="muted">Target Cycle Time</div><strong>${formatNumber(targetCycle, 4)}</strong></div>
      <div class="metric"><div class="muted">Actual Cycle Time</div><strong>${formatNumber(actualCycle, 4)}</strong></div>
      <div class="metric"><div class="muted">QA Finalized / Pending</div><strong>${formatNumber(finalized, 0)} / ${formatNumber(pending, 0)}</strong></div>
      <div class="metric"><div class="muted">Error Rate</div><strong>${formatPercent(errorRate)}</strong></div>
      <div class="metric"><div class="muted">Scrap Rate</div><strong>${formatPercent(scrapRate)}</strong></div>`;
  }

  function dimensionHeaders(groupBy) {
    if (groupBy === "SKU_GROUP") return ["SKU Group", "Make", "Build Type", "WO Department", "Job Type", "Operation"];
    if (groupBy === "JOB_TYPE") return ["Job Type", "Make", "Build Type", "Operation"];
    return ["Item", "Internal ID", "SKU Group", "Make", "Build Type", "WO Department", "Job Type", "Operation"];
  }

  function dimensionCells(row, groupBy) {
    if (groupBy === "SKU_GROUP") return [row.sku_group, row.make, row.build_type, row.work_order_department, row.job_type, row.operation_code];
    if (groupBy === "JOB_TYPE") return [row.job_type, row.make, row.build_type, row.operation_code];
    return [row.item_name, row.internal_id, row.sku_group, row.make, row.build_type, row.work_order_department, row.job_type, row.operation_code];
  }

  function renderTable(rows) {
    latestRows = rows;
    $("row-count").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
    renderSummary(rows);
    if (!rows.length) {
      tableWrap.innerHTML = '<div class="muted" style="padding:16px">No completed productive jobs matched these Item Reporting filters.</div>';
      return;
    }

    const groupBy = $("item-group-by")?.value || "ITEM";
    const headers = [
      ...dimensionHeaders(groupBy),
      "Employees", "Jobs", "Assigned Qty", "Productive Min", "Expected Min",
      "Target Cycle", "Actual Cycle", "Productivity", "Target Versions",
      "QA Finalized", "QA Pending", "QA Finalized Qty", "Errors", "Error Rate", "Scrap", "Scrap Rate"
    ];

    const body = rows.map((row) => {
      const cells = [
        ...dimensionCells(row, groupBy),
        formatNumber(row.employee_count, 0),
        formatNumber(row.job_count, 0),
        formatNumber(row.assigned_quantity, 2),
        formatNumber(row.productive_minutes, 2),
        formatNumber(row.expected_minutes, 2),
        formatNumber(row.target_cycle_time, 4),
        formatNumber(row.actual_cycle_time, 4),
        formatPercent(row.productivity_percent),
        formatNumber(row.target_cycle_time_versions, 0),
        formatNumber(row.qa_finalized_jobs, 0),
        formatNumber(row.qa_pending_jobs, 0),
        formatNumber(row.qa_finalized_assigned_quantity, 2),
        formatNumber(row.error_quantity, 2),
        formatPercent(row.error_rate_percent),
        formatNumber(row.scrap_quantity, 2),
        formatPercent(row.scrap_rate_percent)
      ];
      return `<tr>${cells.map((cell) => `<td>${esc(cell ?? "--")}</td>`).join("")}</tr>`;
    }).join("");

    tableWrap.innerHTML = `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function runItemReport() {
    setMessage("Loading Item Reporting...");
    try {
      const rows = await fetchRows();
      renderTable(rows);
      setMessage("Item Reporting loaded.", "success");
    } catch (error) {
      setMessage(error.message || String(error), "error");
    }
  }

  function activateItemMode() {
    $("daily-tab")?.classList.remove("active");
    $("weekly-tab")?.classList.remove("active");
    $("transactions-tab")?.classList.remove("active");
    $("item-tab")?.classList.add("active");
    $("item-report-filters").hidden = false;
    $("report-title").textContent = "Item Reporting";
    $("report-note").textContent = "Uses job completion date, Assigned Quantity, historical cycle-time snapshots, and all productive session minutes. Quality uses the latest terminal QA outcome; Programming and Shell Assembly operations intentionally bypass QA.";
    runItemReport();
  }

  function leaveItemMode() {
    $("item-tab")?.classList.remove("active");
    if ($("item-report-filters")) $("item-report-filters").hidden = true;
  }

  async function exportItemCsv() {
    const csv = window.TaskTrackerCsv;
    if (!csv) throw new Error("CSV export is unavailable.");
    const rows = await fetchRows();
    const groupBy = $("item-group-by")?.value || "ITEM";
    const headers = [
      ...dimensionHeaders(groupBy),
      "Employees", "Jobs", "Assigned Quantity", "Productive Minutes", "Expected Minutes",
      "Target Cycle Time", "Actual Cycle Time", "Productivity %", "Target Cycle Time Versions",
      "QA Eligible Jobs", "QA Finalized Jobs", "QA Pending Jobs", "QA Finalized Assigned Quantity",
      "Error Quantity", "Error Rate %", "Scrap Quantity", "Scrap Rate %"
    ];
    const output = rows.map((row) => [
      ...dimensionCells(row, groupBy),
      row.employee_count, row.job_count, row.assigned_quantity, row.productive_minutes, row.expected_minutes,
      row.target_cycle_time, row.actual_cycle_time, row.productivity_percent, row.target_cycle_time_versions,
      row.qa_eligible_jobs, row.qa_finalized_jobs, row.qa_pending_jobs, row.qa_finalized_assigned_quantity,
      row.error_quantity, row.error_rate_percent, row.scrap_quantity, row.scrap_rate_percent
    ]);
    csv.download(
      `task-tracker-item-report-${groupBy.toLowerCase()}-${$("start-date").value}-to-${$("end-date").value}.csv`,
      headers,
      output
    );
  }

  function bindTransactionTab() {
    const transactions = $("transactions-tab");
    if (!transactions || transactions.dataset.itemReportingBound === "1") return;
    transactions.dataset.itemReportingBound = "1";
    transactions.addEventListener("click", leaveItemMode);
  }

  function install() {
    ensureFilters();
    if (!$("item-tab")) {
      const itemTab = document.createElement("button");
      itemTab.id = "item-tab";
      itemTab.className = "tab";
      itemTab.type = "button";
      itemTab.textContent = "Item";
      tabsWrap.appendChild(itemTab);
      itemTab.addEventListener("click", activateItemMode);
    }

    $("daily-tab")?.addEventListener("click", leaveItemMode);
    $("weekly-tab")?.addEventListener("click", leaveItemMode);
    bindTransactionTab();

    new MutationObserver(bindTransactionTab).observe(tabsWrap, { childList: true });

    runButton.addEventListener("click", (event) => {
      if (!isItemMode()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runItemReport();
    }, true);

    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("#report-export-csv");
      if (!button || !isItemMode()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exportItemCsv().catch((error) => alert(error.message || String(error)));
    }, true);
  }

  install();
})();
