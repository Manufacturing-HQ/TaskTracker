"use strict";

/* Phase 3 Item Reporting column choosers and visible-column CSV exports. */
(() => {
  const tableWrap = document.getElementById("table");
  if (!tableWrap) return;

  const SUMMARY_STORAGE_KEY = "tasktracker.itemReporting.summaryVisibleColumns.v1";
  const JOB_STORAGE_KEY = "tasktracker.itemReporting.jobVisibleColumns.v1";

  const SUMMARY_HEADERS = {
    ITEM: [
      "Item", "Internal ID", "SKU Group", "Make", "Build Type", "WO Department", "Job Type", "Operation",
      "Employees", "Jobs", "Assigned Qty", "Productive Min", "Expected Min", "Target Cycle", "Actual Cycle",
      "Productivity", "Target Versions", "QA Finalized", "QA Pending", "QA Finalized Qty", "Errors", "Error Rate", "Scrap", "Scrap Rate"
    ],
    SKU_GROUP: [
      "SKU Group", "Make", "Build Type", "WO Department", "Job Type", "Operation",
      "Employees", "Jobs", "Assigned Qty", "Productive Min", "Expected Min", "Target Cycle", "Actual Cycle",
      "Productivity", "Target Versions", "QA Finalized", "QA Pending", "QA Finalized Qty", "Errors", "Error Rate", "Scrap", "Scrap Rate"
    ],
    JOB_TYPE: [
      "Job Type", "Make", "Build Type", "Operation", "Employees", "Jobs", "Assigned Qty", "Productive Min", "Expected Min",
      "Target Cycle", "Actual Cycle", "Productivity", "Target Versions", "QA Finalized", "QA Pending", "QA Finalized Qty",
      "Errors", "Error Rate", "Scrap", "Scrap Rate"
    ]
  };

  const SUMMARY_DEFAULTS = new Set([
    "Item", "Internal ID", "WO Department", "Job Type", "Jobs", "Assigned Qty",
    "Target Cycle", "Actual Cycle", "Productivity", "Error Rate", "Scrap Rate"
  ]);

  const JOB_DEFAULTS = new Set([
    "Employee", "Completion Date", "Item / Item Entered", "Work Order", "Job Type",
    "Assigned Qty", "Productive Min", "Productivity", "QA Status", "Errors", "Scrap"
  ]);

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function isItemMode() {
    return document.getElementById("item-tab")?.classList.contains("active") === true;
  }

  function currentGroupBy() {
    return document.getElementById("item-group-by")?.value || "ITEM";
  }

  function primarySummaryHeader(groupBy) {
    if (groupBy === "SKU_GROUP") return "SKU Group";
    if (groupBy === "JOB_TYPE") return "Job Type";
    return "Item";
  }

  function loadSelection(key, defaults) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    } catch (_) {}
    return new Set(defaults);
  }

  let selectedSummary = loadSelection(SUMMARY_STORAGE_KEY, SUMMARY_DEFAULTS);
  let selectedJobs = loadSelection(JOB_STORAGE_KEY, JOB_DEFAULTS);

  function saveSelection(key, values) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(values)));
    } catch (_) {}
  }

  function installStyle() {
    if (document.getElementById("item-column-chooser-style")) return;
    const style = document.createElement("style");
    style.id = "item-column-chooser-style";
    style.textContent = `
      .item-column-picker{position:relative}
      .item-column-picker>summary{list-style:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px 11px;background:#fff;font-weight:800;cursor:pointer;user-select:none;white-space:nowrap}
      .item-column-picker>summary::-webkit-details-marker{display:none}
      .item-column-picker[open]>summary{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.14)}
      .item-column-picker-panel{position:absolute;z-index:90;top:calc(100% + 6px);right:0;width:min(330px,88vw);max-height:440px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.16);padding:12px;text-align:left}
      .item-column-picker-actions{display:flex;gap:8px;margin-bottom:10px;position:sticky;top:-12px;background:#fff;padding:4px 0 8px;z-index:1}
      .item-column-picker-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 9px;font-weight:800;font-size:12px}
      .item-column-option{display:flex;align-items:center;gap:9px;padding:7px 5px;font-weight:600;font-size:13px;cursor:pointer;margin:0}
      .item-column-option input{width:auto;margin:0}
      .item-column-option.is-fixed{color:#64748b;cursor:default}
      .item-column-note{font-size:11px;color:#64748b;margin-top:8px}
      .item-job-column-actions{display:flex;gap:8px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap;margin-left:auto}
      .item-job-column-actions .item-column-picker{min-width:150px}
      .item-job-column-actions .item-export-jobs{white-space:nowrap}
      @media(max-width:1000px){.item-drilldown-head{align-items:flex-start!important;flex-direction:column}.item-job-column-actions{justify-content:flex-start;margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function summaryHeadersForPicker() {
    return SUMMARY_HEADERS[currentGroupBy()] || SUMMARY_HEADERS.ITEM;
  }

  function visibleSummarySet(groupBy = currentGroupBy()) {
    const primary = primarySummaryHeader(groupBy);
    return new Set([primary, ...Array.from(selectedSummary)]);
  }

  function renderSummaryPicker() {
    const panel = document.getElementById("item-summary-column-panel");
    const summary = document.getElementById("item-summary-column-summary");
    if (!panel || !summary) return;
    const groupBy = currentGroupBy();
    const headers = SUMMARY_HEADERS[groupBy] || SUMMARY_HEADERS.ITEM;
    const primary = primarySummaryHeader(groupBy);
    const visible = visibleSummarySet(groupBy);
    const count = headers.filter((header) => visible.has(header)).length;
    summary.textContent = `Columns (${count}/${headers.length})`;
    panel.innerHTML = `
      <div class="item-column-picker-actions"><button type="button" data-summary-columns-all>Select All</button><button type="button" data-summary-columns-reset>Reset Default</button></div>
      ${headers.map((header) => {
        const fixed = header === primary;
        const checked = fixed || selectedSummary.has(header);
        return `<label class="item-column-option${fixed ? " is-fixed" : ""}"><input type="checkbox" data-summary-column="${esc(header)}" ${checked ? "checked" : ""} ${fixed ? "disabled" : ""}><span>${esc(header)}${fixed ? " (required)" : ""}</span></label>`;
      }).join("")}
      <div class="item-column-note">The primary grouping column always stays visible. Your choices are remembered in this browser.</div>`;
  }

  function ensureSummaryPicker() {
    const filters = document.getElementById("item-report-filters");
    if (!filters || document.getElementById("item-summary-column-control")) return;
    const wrap = document.createElement("div");
    wrap.id = "item-summary-column-control";
    wrap.innerHTML = `<label>Visible Columns</label><details class="item-column-picker"><summary id="item-summary-column-summary">Columns</summary><div id="item-summary-column-panel" class="item-column-picker-panel"></div></details>`;
    filters.appendChild(wrap);
    renderSummaryPicker();
  }

  function rootSummaryTable() {
    if (!isItemMode()) return null;
    return tableWrap.querySelector(":scope > table");
  }

  function applySummaryColumns() {
    const table = rootSummaryTable();
    if (!table) return;
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
    if (!headers.length) return;
    const groupBy = headers.some((th) => th.textContent.trim() === "Item")
      ? "ITEM"
      : headers.some((th) => th.textContent.trim() === "SKU Group")
        ? "SKU_GROUP"
        : "JOB_TYPE";
    const visible = visibleSummarySet(groupBy);
    const bodyRows = Array.from(table.querySelectorAll(":scope > tbody > tr"));
    let visibleCount = 0;
    headers.forEach((header, index) => {
      const label = header.textContent.trim();
      const show = visible.has(label);
      header.hidden = !show;
      if (show) visibleCount += 1;
      bodyRows.forEach((row) => {
        if (row.classList.contains("item-report-drilldown-row")) return;
        if (row.cells[index]) row.cells[index].hidden = !show;
      });
    });
    table.style.minWidth = `${Math.max(760, visibleCount * 108)}px`;
    renderSummaryPicker();
  }

  function jobTableForPanel(panel) {
    return panel?.querySelector(".item-job-table") || null;
  }

  function renderJobPicker(panel) {
    const table = jobTableForPanel(panel);
    const pickerPanel = panel?.querySelector("[data-job-column-panel]");
    const pickerSummary = panel?.querySelector("[data-job-column-summary]");
    if (!table || !pickerPanel || !pickerSummary) return;
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th")).map((th) => th.textContent.trim());
    const optional = headers.filter((header) => header !== "Job");
    const visibleCount = optional.filter((header) => selectedJobs.has(header)).length + 1;
    pickerSummary.textContent = `Columns (${visibleCount}/${headers.length})`;
    pickerPanel.innerHTML = `
      <div class="item-column-picker-actions"><button type="button" data-job-columns-all>Select All</button><button type="button" data-job-columns-reset>Reset Default</button></div>
      <label class="item-column-option is-fixed"><input type="checkbox" checked disabled><span>Job (required)</span></label>
      ${optional.map((header) => `<label class="item-column-option"><input type="checkbox" data-job-column="${esc(header)}" ${selectedJobs.has(header) ? "checked" : ""}><span>${esc(header)}</span></label>`).join("")}
      <div class="item-column-note">View Job always stays visible. Your other choices are remembered in this browser.</div>`;
  }

  function ensureJobControls(panel) {
    if (!panel || panel.querySelector(".item-job-column-actions")) return;
    const head = panel.querySelector(".item-drilldown-head");
    const table = jobTableForPanel(panel);
    if (!head || !table) return;
    const actions = document.createElement("div");
    actions.className = "item-job-column-actions";
    actions.innerHTML = `<button type="button" class="secondary item-export-jobs">Export Jobs</button><details class="item-column-picker"><summary data-job-column-summary>Columns</summary><div class="item-column-picker-panel" data-job-column-panel></div></details>`;
    head.appendChild(actions);
    renderJobPicker(panel);
    applyJobColumns(panel);
  }

  function applyJobColumns(panel) {
    const table = jobTableForPanel(panel);
    if (!table) return;
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr"));
    let visibleCount = 0;
    headers.forEach((header, index) => {
      const label = header.textContent.trim();
      const show = label === "Job" || selectedJobs.has(label);
      header.hidden = !show;
      if (show) visibleCount += 1;
      rows.forEach((row) => {
        if (row.cells[index]) row.cells[index].hidden = !show;
      });
    });
    table.style.minWidth = `${Math.max(820, visibleCount * 118)}px`;
    renderJobPicker(panel);
  }

  function applyAllJobColumns() {
    tableWrap.querySelectorAll(".item-drilldown-panel").forEach((panel) => {
      ensureJobControls(panel);
      applyJobColumns(panel);
    });
  }

  function slug(value) {
    const csv = window.TaskTrackerCsv;
    if (csv?.slug) return csv.slug(value || "jobs");
    return String(value || "jobs").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "jobs";
  }

  function exportSummaryCsv() {
    const csv = window.TaskTrackerCsv;
    const table = rootSummaryTable();
    if (!csv || !table) throw new Error("Item Reporting CSV export is unavailable.");
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
    const visibleIndexes = headers.map((header, index) => header.hidden ? -1 : index).filter((index) => index >= 0);
    const exportHeaders = visibleIndexes.map((index) => headers[index].textContent.trim());
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr"))
      .filter((row) => !row.classList.contains("item-report-drilldown-row"))
      .map((row) => visibleIndexes.map((index) => row.cells[index]?.textContent?.trim() || ""));
    const start = document.getElementById("start-date")?.value || "start";
    const end = document.getElementById("end-date")?.value || "end";
    csv.download(`task-tracker-item-report-${currentGroupBy().toLowerCase()}-${start}-to-${end}.csv`, exportHeaders, rows);
  }

  function exportJobCsv(panel) {
    const csv = window.TaskTrackerCsv;
    const table = jobTableForPanel(panel);
    if (!csv || !table) throw new Error("Job CSV export is unavailable.");
    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
    const visibleIndexes = headers.map((header, index) => header.hidden ? -1 : index).filter((index) => index >= 0);
    const exportHeaders = visibleIndexes.map((index) => headers[index].textContent.trim() === "Job" ? "Job Number" : headers[index].textContent.trim());
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr")).map((row) => visibleIndexes.map((index) => {
      let value = row.cells[index]?.textContent?.trim() || "";
      if (headers[index].textContent.trim() === "Job") value = value.replace(/^View Job\s*#?/i, "").trim();
      return value;
    }));
    const detailRow = panel.closest("tr.item-report-drilldown-row");
    const summaryRow = detailRow?.previousElementSibling;
    const summaryCell = summaryRow ? Array.from(summaryRow.cells).find((cell) => !cell.hidden) : null;
    const label = summaryCell?.textContent?.trim() || "jobs";
    const start = document.getElementById("start-date")?.value || "start";
    const end = document.getElementById("end-date")?.value || "end";
    csv.download(`task-tracker-item-jobs-${slug(label)}-${start}-to-${end}.csv`, exportHeaders, rows);
  }

  function handleSummaryPickerChange(checkbox) {
    const header = checkbox.dataset.summaryColumn;
    if (!header) return;
    if (checkbox.checked) selectedSummary.add(header);
    else selectedSummary.delete(header);
    saveSelection(SUMMARY_STORAGE_KEY, selectedSummary);
    applySummaryColumns();
  }

  function handleJobPickerChange(checkbox) {
    const header = checkbox.dataset.jobColumn;
    if (!header) return;
    if (checkbox.checked) selectedJobs.add(header);
    else selectedJobs.delete(header);
    saveSelection(JOB_STORAGE_KEY, selectedJobs);
    applyAllJobColumns();
  }

  function installEvents() {
    document.addEventListener("click", (event) => {
      const exportButton = event.target.closest?.("#report-export-csv");
      if (exportButton && isItemMode()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        try { exportSummaryCsv(); } catch (error) { alert(error.message || String(error)); }
        return;
      }

      const summaryAll = event.target.closest?.("[data-summary-columns-all]");
      if (summaryAll) {
        event.preventDefault();
        summaryHeadersForPicker().forEach((header) => selectedSummary.add(header));
        saveSelection(SUMMARY_STORAGE_KEY, selectedSummary);
        applySummaryColumns();
        return;
      }

      const summaryReset = event.target.closest?.("[data-summary-columns-reset]");
      if (summaryReset) {
        event.preventDefault();
        selectedSummary = new Set(SUMMARY_DEFAULTS);
        saveSelection(SUMMARY_STORAGE_KEY, selectedSummary);
        applySummaryColumns();
        return;
      }

      const jobAll = event.target.closest?.("[data-job-columns-all]");
      if (jobAll) {
        event.preventDefault();
        const panel = jobAll.closest(".item-drilldown-panel");
        const table = jobTableForPanel(panel);
        Array.from(table?.querySelectorAll(":scope > thead > tr > th") || []).map((th) => th.textContent.trim()).filter((header) => header !== "Job").forEach((header) => selectedJobs.add(header));
        saveSelection(JOB_STORAGE_KEY, selectedJobs);
        applyAllJobColumns();
        return;
      }

      const jobReset = event.target.closest?.("[data-job-columns-reset]");
      if (jobReset) {
        event.preventDefault();
        selectedJobs = new Set(JOB_DEFAULTS);
        saveSelection(JOB_STORAGE_KEY, selectedJobs);
        applyAllJobColumns();
        return;
      }

      const exportJobs = event.target.closest?.(".item-export-jobs");
      if (exportJobs) {
        event.preventDefault();
        event.stopPropagation();
        try { exportJobCsv(exportJobs.closest(".item-drilldown-panel")); } catch (error) { alert(error.message || String(error)); }
      }
    }, true);

    document.addEventListener("change", (event) => {
      const summaryCheckbox = event.target.closest?.("[data-summary-column]");
      if (summaryCheckbox) {
        handleSummaryPickerChange(summaryCheckbox);
        return;
      }
      const jobCheckbox = event.target.closest?.("[data-job-column]");
      if (jobCheckbox) handleJobPickerChange(jobCheckbox);
    });

    document.addEventListener("change", (event) => {
      if (event.target?.id === "item-group-by") setTimeout(() => {
        renderSummaryPicker();
        applySummaryColumns();
      }, 0);
    });
  }

  function refreshTableFeatures() {
    if (isItemMode()) applySummaryColumns();
    applyAllJobColumns();
  }

  installStyle();
  installEvents();

  const filterObserver = new MutationObserver(() => {
    ensureSummaryPicker();
    if (document.getElementById("item-summary-column-control")) filterObserver.disconnect();
  });
  filterObserver.observe(document.body, { childList: true, subtree: true });
  ensureSummaryPicker();
  if (document.getElementById("item-summary-column-control")) filterObserver.disconnect();

  const tableObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches("table,tr.item-report-drilldown-row,.item-drilldown-panel")
        || Boolean(node.querySelector?.(".item-drilldown-panel,.item-job-table"));
    }));
    if (relevant) setTimeout(refreshTableFeatures, 0);
  });
  tableObserver.observe(tableWrap, { childList: true, subtree: true });
  setTimeout(() => { ensureSummaryPicker(); refreshTableFeatures(); }, 800);
})();
