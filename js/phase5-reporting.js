"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let setup = null;
  let mode = "daily";

  const reportState = window.TaskTrackerReportingState = window.TaskTrackerReportingState || {
    loaded: false,
    loading: false,
    mode: null,
    start: null,
    end: null,
    employeeId: null,
    supervisorId: null,
    excludeNonTaskTracker: false,
    rows: []
  };
  let byDateSort = { key: "employee_name", direction: "asc" };

  function beginReportState(start, end, employeeId, supervisorId = null, excludeNonTaskTracker = false) {
    reportState.loaded = false;
    reportState.loading = true;
    reportState.mode = mode;
    reportState.start = start;
    reportState.end = end;
    reportState.employeeId = employeeId || null;
    reportState.supervisorId = supervisorId || null;
    reportState.excludeNonTaskTracker = !!excludeNonTaskTracker;
    reportState.rows = [];
    window.dispatchEvent(new CustomEvent("tasktracker:report-loading", {
      detail: {
        mode,
        start,
        end,
        employeeId: employeeId || null,
        supervisorId: supervisorId || null,
        excludeNonTaskTracker: !!excludeNonTaskTracker
      }
    }));
  }

  function publishReportState(rows, start, end, employeeId, supervisorId = null, excludeNonTaskTracker = false) {
    reportState.loaded = true;
    reportState.loading = false;
    reportState.mode = mode;
    reportState.start = start;
    reportState.end = end;
    reportState.employeeId = employeeId || null;
    reportState.supervisorId = supervisorId || null;
    reportState.excludeNonTaskTracker = !!excludeNonTaskTracker;
    reportState.rows = rows;
    window.dispatchEvent(new CustomEvent("tasktracker:report-loaded", {
      detail: reportState
    }));
  }

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function todayEastern() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function shiftDate(dateText, days) {
    const d = new Date(`${dateText}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function setDefaultDates() {
    const today = todayEastern();
    $("end-date").value = today;
    $("start-date").value = shiftDate(today, -6);
  }

  async function listEmployees() {
    const rows = await rpc("list_login_employees");
    const select = $("employee");
    select.innerHTML = '<option value="">Select employee</option>';
    (rows || []).forEach((row) => {
      const option = document.createElement("option");
      option.value = row.employee_id;
      option.textContent = row.employee_name;
      select.appendChild(option);
    });
  }

  async function restoreSession() {
    if (!sessionToken) return false;
    try {
      const rows = await rpc("get_employee_session_context", { p_session_token: sessionToken });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return false;
      sessionEmployee = row;
      return true;
    } catch {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      return false;
    }
  }

  async function login(event) {
    event.preventDefault();
    setMessage("Signing in...");
    const rows = await rpc("login_with_employee_pin", {
      p_employee_id: $("employee").value,
      p_pin: $("pin").value
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.login_successful || !row.session_token) {
      setMessage(row?.login_message || "Login failed.", "error");
      return;
    }
    sessionToken = row.session_token;
    sessionStorage.setItem(sessionKey, sessionToken);
    sessionEmployee = row;
    $("pin").value = "";
    await enterApp();
  }

  async function signOut() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    sessionEmployee = null;
    if (token) {
      try { await rpc("logout_employee_session", { p_session_token: token }); } catch {}
    }
    $("app").hidden = true;
    $("login").hidden = false;
    setMessage("Signed out.");
  }

  async function loadSetup() {
    setup = await rpc("get_reporting_setup_options", { p_session_token: sessionToken });
    $("viewer-meta").textContent = [setup.viewer?.role, setup.viewer?.department].filter(Boolean).join(" · ");
    $("report-note").textContent = `Timezone: ${setup.business_timezone || "America/New_York"} · Week ending day: Saturday`;

    const employeeSelect = $("report-employee");
    employeeSelect.innerHTML = '<option value="">All accessible employees</option>';
    (setup.employees || []).forEach((employee) => {
      const option = document.createElement("option");
      option.value = employee.employee_id;
      option.textContent = [employee.employee_name, employee.department].filter(Boolean).join(" · ");
      employeeSelect.appendChild(option);
    });

    const supervisorSelect = $("report-supervisor");
    supervisorSelect.innerHTML = '<option value="">All accessible supervisors</option>';
    (setup.supervisors || []).forEach((supervisor) => {
      const option = document.createElement("option");
      option.value = supervisor.supervisor_id;
      option.textContent = supervisor.supervisor_name;
      supervisorSelect.appendChild(option);
    });

    const isAdmin = setup.viewer?.role === "Administrator";
    $("exclude-non-task-tracker-wrap").hidden = !isAdmin;
    $("exclude-non-task-tracker").checked = isAdmin;
  }

  function setMode(nextMode) {
    mode = nextMode;
    $("daily-tab").classList.toggle("active", mode === "daily");
    $("weekly-tab").classList.toggle("active", mode === "weekly");
    $("by-date-tab").classList.toggle("active", mode === "by-date");
    $("transactions-tab")?.classList.remove("active");
    $("item-tab")?.classList.remove("active");

    const byDate = mode === "by-date";
    $("report-supervisor-wrap").hidden = !byDate;
    $("exclude-non-task-tracker-wrap").hidden = !byDate || setup?.viewer?.role !== "Administrator";
    $("run-report").textContent = byDate ? "Generate Report" : "Run Report";

    if (mode === "daily") {
      $("report-title").textContent = "Daily Reporting";
      $("report-note").textContent = `Daily allocation uses ${setup?.business_timezone || "America/New_York"}. Error Rate uses QA reviews completed that business date.`;
    } else if (mode === "weekly") {
      $("report-title").textContent = "Weekly Reporting";
      $("report-note").textContent = `Weekly reporting is grouped by Saturday week-ending dates in ${setup?.business_timezone || "America/New_York"}. Error Rate is recomputed from weekly QA totals.`;
    } else {
      $("report-title").textContent = "By Date Reporting";
      $("report-note").textContent = "One row per employee for the selected date range. Totals are summed; Productivity, Efficiency, Pick Error Rate, and Error Rate are recalculated from the full-range totals.";
    }
  }

  function formatNumber(value, digits = 1) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : escapeHtml(value);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : escapeHtml(value);
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  }

  const byDateColumns = [
    { label: "Employee", key: "employee_name", type: "text" },
    { label: "Department", key: "department", type: "text" },
    { label: "Supervisor", key: "supervisor_name", type: "text" },
    { label: "Active Days", key: "active_days", type: "number", digits: 0 },
    { label: "Tracker Min", key: "tracker_minutes", type: "number" },
    { label: "Productive Min", key: "productive_minutes", type: "number" },
    { label: "NP Min", key: "non_productive_minutes", type: "number" },
    { label: "Worked Min", key: "minutes_worked", type: "number" },
    { label: "Completed Jobs", key: "completed_productive_jobs", type: "number", digits: 0 },
    { label: "Completed Qty", key: "completed_quantity", type: "number", digits: 2 },
    { label: "Expected Min", key: "expected_minutes", type: "number" },
    { label: "Productivity", key: "productivity_percent", type: "percent" },
    { label: "Efficiency", key: "tracker_coverage_percent", type: "percent" },
    { label: "Unaccounted Min", key: "unaccounted_minutes", type: "number" },
    { label: "QA Reviewed", key: "qa_reviewed_pieces", type: "number", digits: 2 },
    { label: "Errors", key: "qa_error_quantity", type: "number", digits: 2 },
    { label: "Error Rate", key: "error_rate_percent", type: "percent" }
  ];

  function byDateValue(row, column) {
    if (column.type === "percent") return formatPercent(row[column.key]);
    if (column.type === "number") return formatNumber(row[column.key], column.digits ?? 1);
    return row[column.key] ?? "—";
  }

  function sortByDateRows(rows) {
    const column = byDateColumns.find((item) => item.key === byDateSort.key) || byDateColumns[0];
    const direction = byDateSort.direction === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a?.[column.key];
      const bv = b?.[column.key];
      const aBlank = av === null || av === undefined || av === "";
      const bBlank = bv === null || bv === undefined || bv === "";
      if (aBlank && bBlank) return 0;
      if (aBlank) return 1;
      if (bBlank) return -1;
      if (column.type === "text") {
        return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * direction;
      }
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isFinite(an) && !Number.isFinite(bn)) return 0;
      if (!Number.isFinite(an)) return 1;
      if (!Number.isFinite(bn)) return -1;
      return (an - bn) * direction;
    });
  }

  function bindByDateSort() {
    $("table").querySelectorAll("th[data-sort-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sortKey;
        if (byDateSort.key === key) {
          byDateSort.direction = byDateSort.direction === "asc" ? "desc" : "asc";
        } else {
          byDateSort = { key, direction: "asc" };
        }
        const sorted = sortByDateRows(reportState.rows || []);
        reportState.rows = sorted;
        renderTable(sorted);
      });
    });
  }

  function renderSummary(rows) {
    const summary = $("summary");
    const trackerMinutes = sum(rows, "tracker_minutes");
    const productiveMinutes = sum(rows, "productive_minutes");
    const nonProductiveMinutes = sum(rows, "non_productive_minutes");
    const completedQty = sum(rows, "completed_quantity");
    const expectedMinutes = sum(rows, "expected_minutes");
    const reviewedPieces = sum(rows, "qa_reviewed_pieces");
    const totalErrors = sum(rows, "qa_error_quantity");
    const errorRate = reviewedPieces > 0 ? Math.min(100, (totalErrors / reviewedPieces) * 100) : 0;

    summary.innerHTML = `
      <div class="metric"><div class="muted">Tracker Minutes</div><strong>${formatNumber(trackerMinutes)}</strong></div>
      <div class="metric"><div class="muted">Productive Minutes</div><strong>${formatNumber(productiveMinutes)}</strong></div>
      <div class="metric"><div class="muted">Non-Productive Minutes</div><strong>${formatNumber(nonProductiveMinutes)}</strong></div>
      <div class="metric"><div class="muted">Completed Qty</div><strong>${formatNumber(completedQty, 2)}</strong></div>
      <div class="metric"><div class="muted">Expected Minutes</div><strong>${formatNumber(expectedMinutes)}</strong></div>
      <div class="metric"><div class="muted">QA Reviewed Pieces</div><strong>${formatNumber(reviewedPieces, 2)}</strong></div>
      <div class="metric"><div class="muted">Total Errors</div><strong>${formatNumber(totalErrors, 2)}</strong></div>
      <div class="metric"><div class="muted">Error Rate</div><strong>${formatPercent(errorRate)}</strong></div>
    `;
  }

  function renderTable(rows) {
    $("row-count").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
    renderSummary(rows);

    if (!rows.length) {
      $("table").innerHTML = '<div class="muted" style="padding:16px">No reporting rows matched this range.</div>';
      return;
    }

    if (mode === "by-date") {
      const headers = byDateColumns.map((column) => {
        const active = byDateSort.key === column.key;
        const indicator = active ? (byDateSort.direction === "asc" ? " ↑" : " ↓") : "";
        return `<th data-sort-key="${escapeHtml(column.key)}" title="Click to sort">${escapeHtml(column.label + indicator)}</th>`;
      }).join("");
      const body = rows.map((row) => `<tr>${byDateColumns.map((column) => `<td>${escapeHtml(byDateValue(row,column))}</td>`).join("")}</tr>`).join("");
      $("table").innerHTML = `<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
      bindByDateSort();
      return;
    }

    const daily = mode === "daily";
    const headers = daily
      ? ["Date","Employee","Department","Supervisor","Tracker Min","Productive Min","NP Min","Worked Min","Completed Jobs","Completed Qty","Expected Min","Productivity","Efficiency","Unaccounted Min","QA Reviewed","Errors","Error Rate"]
      : ["Week Ending","Employee","Department","Supervisor","First Activity","Last Activity","Tracker Min","Productive Min","NP Min","Worked Min","Completed Jobs","Completed Qty","Expected Min","Productivity","Efficiency","Unaccounted Min","QA Reviewed","Errors","Error Rate"];

    const body = rows.map((r) => {
      const cells = daily
        ? [r.work_date,r.employee_name,r.department,r.supervisor_name,formatNumber(r.tracker_minutes),formatNumber(r.productive_minutes),formatNumber(r.non_productive_minutes),formatNumber(r.minutes_worked),formatNumber(r.completed_productive_jobs,0),formatNumber(r.completed_quantity,2),formatNumber(r.expected_minutes),formatPercent(r.productivity_percent),formatPercent(r.tracker_coverage_percent),formatNumber(r.unaccounted_minutes),formatNumber(r.qa_reviewed_pieces,2),formatNumber(r.qa_error_quantity,2),formatPercent(r.error_rate_percent)]
        : [r.week_ending_date,r.employee_name,r.department,r.supervisor_name,r.first_activity_date,r.last_activity_date,formatNumber(r.tracker_minutes),formatNumber(r.productive_minutes),formatNumber(r.non_productive_minutes),formatNumber(r.minutes_worked),formatNumber(r.completed_productive_jobs,0),formatNumber(r.completed_quantity,2),formatNumber(r.expected_minutes),formatPercent(r.productivity_percent),formatPercent(r.tracker_coverage_percent),formatNumber(r.unaccounted_minutes),formatNumber(r.qa_reviewed_pieces,2),formatNumber(r.qa_error_quantity,2),formatPercent(r.error_rate_percent)];
      return `<tr>${cells.map((c) => `<td>${escapeHtml(c ?? "—")}</td>`).join("")}</tr>`;
    }).join("");

    $("table").innerHTML = `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function runReport() {
    const start = $("start-date").value;
    const end = $("end-date").value;
    if (!start || !end || end < start) {
      setMessage("Select a valid date range.", "error");
      return;
    }

    const employeeId = $("report-employee").value || null;
    const supervisorId = mode === "by-date" ? ($("report-supervisor").value || null) : null;
    const excludeNonTaskTracker = mode === "by-date"
      && setup?.viewer?.role === "Administrator"
      && $("exclude-non-task-tracker").checked;

    beginReportState(start, end, employeeId, supervisorId, excludeNonTaskTracker);
    setMessage(`Loading ${mode === "by-date" ? "By Date" : mode} reporting...`);
    try {
      let rows;
      if (mode === "daily") {
        rows = await rpc("get_reporting_daily", {
          p_session_token: sessionToken,
          p_start_date: start,
          p_end_date: end,
          p_employee_id: employeeId
        });
      } else if (mode === "weekly") {
        rows = await rpc("get_reporting_weekly", {
          p_session_token: sessionToken,
          p_week_ending_start: start,
          p_week_ending_end: end,
          p_employee_id: employeeId
        });
      } else {
        rows = await rpc("get_reporting_by_date", {
          p_session_token: sessionToken,
          p_start_date: start,
          p_end_date: end,
          p_employee_id: employeeId,
          p_supervisor_id: supervisorId,
          p_exclude_non_task_tracker: excludeNonTaskTracker
        });
      }

      let normalizedRows = Array.isArray(rows) ? rows : [];
      if (mode === "by-date") {
        byDateSort = { key: "employee_name", direction: "asc" };
        normalizedRows = sortByDateRows(normalizedRows);
      }
      publishReportState(normalizedRows, start, end, employeeId, supervisorId, excludeNonTaskTracker);
      renderTable(normalizedRows);
      setMessage("Reporting loaded.", "success");
    } catch (error) {
      reportState.loading = false;
      reportState.loaded = false;
      reportState.rows = [];
      setMessage(error.message, "error");
    }
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || sessionEmployee?.name || "Employee";
    setMessage("");
    setDefaultDates();
    await loadSetup();
    setMode("daily");
    await runReport();
  }

  async function init() {
    try {
      await listEmployees();
      if (await restoreSession()) await enterApp();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  $("login-form").addEventListener("submit", (event) => login(event).catch((e) => setMessage(e.message, "error")));
  $("sign-out").addEventListener("click", () => signOut().catch(() => {}));
  $("daily-tab").addEventListener("click", () => setMode("daily"));
  $("weekly-tab").addEventListener("click", () => setMode("weekly"));
  $("by-date-tab").addEventListener("click", () => setMode("by-date"));
  $("run-report").addEventListener("click", runReport);

  init();
})();
