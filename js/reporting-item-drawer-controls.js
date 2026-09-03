"use strict";

/* Column chooser and CSV export for the document-level Item Reporting job drawer. */
(() => {
  const JOB_STORAGE_KEY = "tasktracker.itemReporting.jobVisibleColumns.v1";
  const JOB_DEFAULTS = new Set([
    "Employee", "Completion Date", "Item / Item Entered", "Work Order", "Job Type",
    "Assigned Qty", "Productive Min", "Productivity", "QA Status", "Errors", "Scrap"
  ]);

  function loadSelection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(JOB_STORAGE_KEY) || "null");
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    } catch (_) {}
    return new Set(JOB_DEFAULTS);
  }

  let selectedJobs = loadSelection();

  function saveSelection() {
    try { localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(Array.from(selectedJobs))); } catch (_) {}
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function installStyle() {
    if (document.getElementById("item-drawer-column-style")) return;
    const style = document.createElement("style");
    style.id = "item-drawer-column-style";
    style.textContent = `
      #item-report-job-drawer .item-drawer-actions{display:flex;gap:8px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap;margin-left:auto}
      #item-report-job-drawer .item-drawer-column-picker{position:relative}
      #item-report-job-drawer .item-drawer-column-picker>summary{list-style:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px 11px;background:#fff;font-weight:800;cursor:pointer;white-space:nowrap}
      #item-report-job-drawer .item-drawer-column-picker>summary::-webkit-details-marker{display:none}
      #item-report-job-drawer .item-drawer-column-panel{position:absolute;z-index:5100;top:calc(100% + 6px);right:0;width:min(330px,88vw);max-height:440px;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 16px 40px rgba(15,23,42,.16);padding:12px;text-align:left}
      #item-report-job-drawer .item-drawer-column-actions{display:flex;gap:8px;margin-bottom:10px;position:sticky;top:-12px;background:#fff;padding:4px 0 8px;z-index:1}
      #item-report-job-drawer .item-drawer-column-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 9px;font-weight:800;font-size:12px}
      #item-report-job-drawer .item-drawer-column-option{display:flex;align-items:center;gap:9px;padding:7px 5px;font-weight:600;font-size:13px;cursor:pointer;margin:0}
      #item-report-job-drawer .item-drawer-column-option input{width:auto;margin:0}
      #item-report-job-drawer .item-drawer-column-option.is-fixed{color:#64748b;cursor:default}
      #item-report-job-drawer .item-export-jobs{white-space:nowrap}
    `;
    document.head.appendChild(style);
  }

  function panel() {
    return document.getElementById("item-report-job-drawer");
  }

  function jobTable(drawer) {
    return drawer?.querySelector(".item-job-table") || null;
  }

  function renderPicker(drawer) {
    const table = jobTable(drawer);
    const pickerPanel = drawer?.querySelector("[data-drawer-column-panel]");
    const pickerSummary = drawer?.querySelector("[data-drawer-column-summary]");
    if (!table || !pickerPanel || !pickerSummary) return;

    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th")).map((th) => th.textContent.trim());
    const optional = headers.filter((header) => header !== "Job");
    const visibleCount = optional.filter((header) => selectedJobs.has(header)).length + 1;
    pickerSummary.textContent = `Columns (${visibleCount}/${headers.length})`;
    pickerPanel.innerHTML = `
      <div class="item-drawer-column-actions"><button type="button" data-drawer-columns-all>Select All</button><button type="button" data-drawer-columns-reset>Reset Default</button></div>
      <label class="item-drawer-column-option is-fixed"><input type="checkbox" checked disabled><span>Job (required)</span></label>
      ${optional.map((header) => `<label class="item-drawer-column-option"><input type="checkbox" data-drawer-column="${esc(header)}" ${selectedJobs.has(header) ? "checked" : ""}><span>${esc(header)}</span></label>`).join("")}`;
  }

  function applyColumns(drawer) {
    const table = jobTable(drawer);
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
    renderPicker(drawer);
  }

  function ensureControls(drawer) {
    const head = drawer?.querySelector(".item-drawer-head");
    const table = jobTable(drawer);
    if (!head || !table) return;

    let actions = head.querySelector(".item-drawer-actions");
    if (!actions) {
      const close = head.querySelector(".item-drawer-close");
      actions = document.createElement("div");
      actions.className = "item-drawer-actions";
      actions.innerHTML = `<button type="button" class="secondary item-export-jobs">Export Jobs</button><details class="item-drawer-column-picker"><summary data-drawer-column-summary>Columns</summary><div class="item-drawer-column-panel" data-drawer-column-panel></div></details>`;
      if (close) actions.appendChild(close);
      head.appendChild(actions);
    }

    applyColumns(drawer);
  }

  function slug(value) {
    const csv = window.TaskTrackerCsv;
    if (csv?.slug) return csv.slug(value || "jobs");
    return String(value || "jobs").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "jobs";
  }

  function exportJobs(drawer) {
    const csv = window.TaskTrackerCsv;
    const table = jobTable(drawer);
    if (!csv || !table) throw new Error("Job CSV export is unavailable.");

    const headers = Array.from(table.querySelectorAll(":scope > thead > tr > th"));
    const visibleIndexes = headers.map((header, index) => header.hidden ? -1 : index).filter((index) => index >= 0);
    const exportHeaders = visibleIndexes.map((index) => headers[index].textContent.trim() === "Job" ? "Job Number" : headers[index].textContent.trim());
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr")).map((row) => visibleIndexes.map((index) => {
      let value = row.cells[index]?.textContent?.trim() || "";
      if (headers[index].textContent.trim() === "Job") value = value.replace(/^View Job\s*#?/i, "").trim();
      return value;
    }));

    const start = document.getElementById("start-date")?.value || "start";
    const end = document.getElementById("end-date")?.value || "end";
    const label = drawer.dataset.exportLabel || "jobs";
    csv.download(`task-tracker-item-jobs-${slug(label)}-${start}-to-${end}.csv`, exportHeaders, rows);
  }

  document.addEventListener("click", (event) => {
    const all = event.target.closest?.("#item-report-job-drawer [data-drawer-columns-all]");
    if (all) {
      event.preventDefault();
      const drawer = panel();
      Array.from(jobTable(drawer)?.querySelectorAll(":scope > thead > tr > th") || [])
        .map((th) => th.textContent.trim())
        .filter((header) => header !== "Job")
        .forEach((header) => selectedJobs.add(header));
      saveSelection();
      applyColumns(drawer);
      return;
    }

    const reset = event.target.closest?.("#item-report-job-drawer [data-drawer-columns-reset]");
    if (reset) {
      event.preventDefault();
      selectedJobs = new Set(JOB_DEFAULTS);
      saveSelection();
      applyColumns(panel());
      return;
    }

    const exportButton = event.target.closest?.("#item-report-job-drawer .item-export-jobs");
    if (exportButton) {
      event.preventDefault();
      event.stopPropagation();
      try { exportJobs(panel()); } catch (error) { alert(error.message || String(error)); }
    }
  }, true);

  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest?.("#item-report-job-drawer [data-drawer-column]");
    if (!checkbox) return;
    const header = checkbox.dataset.drawerColumn;
    if (!header) return;
    if (checkbox.checked) selectedJobs.add(header);
    else selectedJobs.delete(header);
    saveSelection();
    applyColumns(panel());
  });

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.id === "item-report-job-drawer" || node.matches?.(".item-job-table") || Boolean(node.querySelector?.(".item-job-table"));
    }));
    if (relevant) setTimeout(() => ensureControls(panel()), 0);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  installStyle();
})();
