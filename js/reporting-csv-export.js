"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const csv = window.TaskTrackerCsv;
  const runButton = document.getElementById("run-report");
  if (!config || !supabaseLib || !csv || !runButton) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  let exportButton = null;

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function activeMode() {
    return $("weekly-tab")?.classList.contains("active") ? "weekly" : "daily";
  }

  function selectedEmployeeLabel() {
    const select = $("report-employee");
    return select?.selectedOptions?.[0]?.textContent?.trim() || "all-employees";
  }

  async function exportCsv() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    const start = $("start-date")?.value;
    const end = $("end-date")?.value;
    if (!token || !start || !end) throw new Error("Select a valid date range before exporting.");

    exportButton.disabled = true;
    const oldText = exportButton.textContent;
    exportButton.textContent = "Exporting...";
    try {
      const employeeId = $("report-employee")?.value || null;
      const mode = activeMode();
      const rows = mode === "daily"
        ? await rpc("get_reporting_daily", {
            p_session_token: token,
            p_start_date: start,
            p_end_date: end,
            p_employee_id: employeeId
          })
        : await rpc("get_reporting_weekly", {
            p_session_token: token,
            p_week_ending_start: start,
            p_week_ending_end: end,
            p_employee_id: employeeId
          });

      const data = Array.isArray(rows) ? rows : [];
      const headers = mode === "daily"
        ? ["Date","Employee","Department","Supervisor","Tracker Min","Productive Min","Non-Productive Min","Worked Min","Completed Jobs","Completed Qty","Expected Min","Productivity %","Efficiency %","Unaccounted Min","QA Reviewed","Errors","Error Rate %"]
        : ["Week Ending","Employee","Department","Supervisor","First Activity","Last Activity","Tracker Min","Productive Min","Non-Productive Min","Worked Min","Completed Jobs","Completed Qty","Expected Min","Productivity %","Efficiency %","Unaccounted Min","QA Reviewed","Errors","Error Rate %"];

      const out = data.map((r) => mode === "daily"
        ? [r.work_date,r.employee_name,r.department,r.supervisor_name,r.tracker_minutes,r.productive_minutes,r.non_productive_minutes,r.minutes_worked,r.completed_productive_jobs,r.completed_quantity,r.expected_minutes,r.productivity_percent,r.tracker_coverage_percent,r.unaccounted_minutes,r.qa_reviewed_pieces,r.qa_error_quantity,r.error_rate_percent]
        : [r.week_ending_date,r.employee_name,r.department,r.supervisor_name,r.first_activity_date,r.last_activity_date,r.tracker_minutes,r.productive_minutes,r.non_productive_minutes,r.minutes_worked,r.completed_productive_jobs,r.completed_quantity,r.expected_minutes,r.productivity_percent,r.tracker_coverage_percent,r.unaccounted_minutes,r.qa_reviewed_pieces,r.qa_error_quantity,r.error_rate_percent]);

      const employee = csv.slug(selectedEmployeeLabel());
      csv.download(`task-tracker-${mode}-report-${start}-to-${end}-${employee}.csv`, headers, out);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = oldText;
    }
  }

  async function install() {
    if (exportButton || !$("app") || $("app").hidden) return;
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    try {
      const rows = await rpc("get_employee_session_context", { p_session_token: token });
      const viewer = Array.isArray(rows) ? rows[0] : rows;
      if (!viewer || !["Supervisor","Manager","Administrator"].includes(viewer.employee_role)) return;
      exportButton = document.createElement("button");
      exportButton.id = "report-export-csv";
      exportButton.type = "button";
      exportButton.className = "secondary";
      exportButton.textContent = "Export CSV";
      exportButton.style.width = "100%";
      exportButton.addEventListener("click", () => exportCsv().catch((error) => alert(error.message)));
      runButton.parentElement?.insertAdjacentElement("afterend", (() => {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.alignItems = "end";
        wrap.appendChild(exportButton);
        return wrap;
      })());
    } catch {}
  }

  new MutationObserver(() => install()).observe($("app"), { attributes: true, attributeFilter: ["hidden"] });
  setTimeout(install, 700);
})();

(() => {
  if (document.querySelector('script[data-reporting-transaction-metrics]')) return;
  const script = document.createElement("script");
  script.src = "js/reporting-transaction-metrics.js?v=transaction-metrics-20260826";
  script.dataset.reportingTransactionMetrics = "1";
  document.body.appendChild(script);
})();
