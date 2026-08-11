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

    const select = $("report-employee");
    select.innerHTML = '<option value="">All accessible employees</option>';
    (setup.employees || []).forEach((employee) => {
      const option = document.createElement("option");
      option.value = employee.employee_id;
      option.textContent = [employee.employee_name, employee.department].filter(Boolean).join(" · ");
      select.appendChild(option);
    });
  }

  function setMode(nextMode) {
    mode = nextMode;
    $("daily-tab").classList.toggle("active", mode === "daily");
    $("weekly-tab").classList.toggle("active", mode === "weekly");
    $("report-title").textContent = mode === "daily" ? "Daily Reporting" : "Weekly Reporting";
    $("report-note").textContent = mode === "daily"
      ? `Daily allocation uses ${setup?.business_timezone || "America/New_York"}. Error Rate uses QA reviews completed that business date.`
      : `Weekly reporting is grouped by Saturday week-ending dates in ${setup?.business_timezone || "America/New_York"}. Error Rate is recomputed from weekly QA totals.`;
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
    if (!start || !end) {
      setMessage("Select a valid date range.", "error");
      return;
    }

    setMessage(`Loading ${mode} reporting...`);
    try {
      const employeeId = $("report-employee").value || null;
      const rows = mode === "daily"
        ? await rpc("get_reporting_daily", {
            p_session_token: sessionToken,
            p_start_date: start,
            p_end_date: end,
            p_employee_id: employeeId
          })
        : await rpc("get_reporting_weekly", {
            p_session_token: sessionToken,
            p_week_ending_start: start,
            p_week_ending_end: end,
            p_employee_id: employeeId
          });
      renderTable(Array.isArray(rows) ? rows : []);
      setMessage("Reporting loaded.", "success");
    } catch (error) {
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
  $("run-report").addEventListener("click", runReport);

  init();
})();
