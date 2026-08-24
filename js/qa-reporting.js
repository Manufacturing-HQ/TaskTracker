"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const csv = window.TaskTrackerCsv;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let setup = null;
  let builderSetup = null;
  let latestData = null;
  let latestBuilderData = null;
  let builderLoaded = false;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const pct = (value) => value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}%`;
  const numberText = (value) => value === null || value === undefined ? "0" : Number(value).toLocaleString("en-US", {maximumFractionDigits:2});

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function message(text, type = "info") {
    const el = $("message");
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function todayEastern() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function shiftDate(text, days) {
    const d = new Date(`${text}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function setDefaultDates() {
    const end = todayEastern();
    const start = shiftDate(end, -30);
    $("qa-report-end").value = end;
    $("qa-report-start").value = start;
    $("builder-report-end").value = end;
    $("builder-report-start").value = start;
  }

  async function listEmployees() {
    const rows = await rpc("list_login_employees");
    $("employee").innerHTML = '<option value="">Select employee</option>' + (rows || []).map((r) => `<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
  }

  async function restore() {
    if (!sessionToken) return false;
    try {
      const rows = await rpc("get_employee_session_context", { p_session_token: sessionToken });
      sessionEmployee = Array.isArray(rows) ? rows[0] : rows;
      return Boolean(sessionEmployee);
    } catch {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      return false;
    }
  }

  async function login(event) {
    event.preventDefault();
    message("Signing in...");
    const rows = await rpc("login_with_employee_pin", { p_employee_id: $("employee").value, p_pin: $("pin").value });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.login_successful || !row.session_token) {
      message(row?.login_message || "Login failed.", "error");
      return;
    }
    sessionToken = row.session_token;
    sessionStorage.setItem(sessionKey, sessionToken);
    sessionEmployee = row;
    $("pin").value = "";
    await enter();
  }

  async function logout() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    sessionEmployee = null;
    if (token) { try { await rpc("logout_employee_session", { p_session_token: token }); } catch {} }
    $("app").hidden = true;
    $("login").hidden = false;
    message("Signed out.");
  }

  function switchView(view) {
    const builder = view === "builder";
    $("qa-report-view").hidden = builder;
    $("builder-report-view").hidden = !builder;
    $("tab-qa-report").classList.toggle("active", !builder);
    $("tab-builder-report").classList.toggle("active", builder);
    $("report-subtitle").textContent = builder ? "Builder quality by productive completion date" : "QA review activity by QA completion date";
    if (builder && !builderLoaded) loadBuilderReport().catch((error) => message(error.message, "error"));
  }

  function renderEmployee(rows) {
    const body = (rows || []).map((r) => `<tr><td>${esc(r.qa_rep)}</td><td>${esc(r.total_jobs)}</td><td>${esc(r.total_pieces_reviewed)}</td><td>${esc(r.total_errors)}</td><td>${pct(r.error_rate_percent)}</td><td>${esc(r.scrap_pieces)}</td><td>${esc(r.rework_returned)}</td></tr>`).join("");
    $("qa-report-by-employee").innerHTML = `<table><thead><tr><th>QA Employee</th><th>Jobs</th><th>Pieces Reviewed</th><th>Errors</th><th>Error Rate</th><th>Scrap</th><th>Rework Returned</th></tr></thead><tbody>${body || '<tr><td colspan="7">No QA reviews found.</td></tr>'}</tbody></table>`;
  }

  function renderDate(rows) {
    const body = (rows || []).map((r) => `<tr><td>${esc(r.review_date)}</td><td>${esc(r.total_jobs)}</td><td>${esc(r.total_pieces_reviewed)}</td><td>${esc(r.total_errors)}</td><td>${pct(r.error_rate_percent)}</td></tr>`).join("");
    $("qa-report-by-date").innerHTML = `<table><thead><tr><th>Date</th><th>Jobs</th><th>Pieces Reviewed</th><th>Errors</th><th>Error Rate</th></tr></thead><tbody>${body || '<tr><td colspan="5">No QA reviews found.</td></tr>'}</tbody></table>`;
  }

  async function loadReport() {
    const start = $("qa-report-start").value;
    const end = $("qa-report-end").value;
    if (!start || !end) throw new Error("Select a valid date range.");
    latestData = await rpc("get_qa_reporting", {
      p_session_token: sessionToken,
      p_start_date: start,
      p_end_date: end,
      p_qa_employee_id: setup?.viewer?.access_scope === "ALL_QA" ? ($("qa-report-rep").value || null) : setup?.viewer?.employee_id
    });
    const s = latestData?.summary || {};
    $("qa-report-jobs").textContent = s.total_jobs ?? 0;
    $("qa-report-pieces").textContent = numberText(s.total_pieces_reviewed);
    $("qa-report-errors").textContent = numberText(s.total_errors);
    $("qa-report-rate").textContent = pct(s.error_rate_percent);
    renderEmployee(latestData?.by_employee || []);
    renderDate(latestData?.by_date || []);
    message("QA Reporting loaded.", "success");
  }

  function renderBuilderSummary(rows) {
    const body = (rows || []).map((r) => `<tr><td>${esc(r.builder_name)}</td><td>${numberText(r.total_jobs)}</td><td>${numberText(r.quantity)}</td><td>${numberText(r.errors)}</td><td>${pct(r.error_rate_percent)}</td></tr>`).join("");
    $("builder-summary").innerHTML = `<table><thead><tr><th>Builder</th><th>Total Jobs</th><th>Quantity</th><th>Errors</th><th>Error Rate</th></tr></thead><tbody>${body || '<tr><td colspan="5">No QA-reviewed builder jobs found for the selected filters.</td></tr>'}</tbody></table>`;
  }

  function renderBuilderErrors(categories) {
    const host = $("builder-errors");
    const rows = categories || [];
    if (!rows.length) {
      host.innerHTML = '<div class="muted">No configured QA error categories were found.</div>';
      return;
    }
    host.innerHTML = rows.map((category) => `<section class="error-report-section"><div class="error-report-title"><h3>${esc(category.category_name)}</h3><span>${numberText(category.total_errors)} total</span></div><div class="error-report-grid">${(category.error_types || []).map((type) => `<div class="error-report-card"><strong>${numberText(type.total_errors)}</strong><span>${esc(type.error_name)}</span></div>`).join("") || '<div class="muted">No error types configured.</div>'}</div></section>`).join("");
  }

  async function loadBuilderReport() {
    if (!setup?.viewer?.can_view_builder_reports) throw new Error("Builder Reports are not available for this account.");
    const start = $("builder-report-start").value;
    const end = $("builder-report-end").value;
    if (!start || !end) throw new Error("Select a valid Builder Report date range.");
    latestBuilderData = await rpc("get_builder_reporting", {
      p_session_token: sessionToken,
      p_start_date: start,
      p_end_date: end,
      p_builder_employee_id: $("builder-report-employee").value || null,
      p_department: $("builder-report-department").value || null,
      p_supervisor_id: $("builder-report-supervisor").value || null
    });
    const s = latestBuilderData?.summary || {};
    $("builder-report-jobs").textContent = numberText(s.total_jobs);
    $("builder-report-quantity").textContent = numberText(s.total_quantity);
    $("builder-report-errors").textContent = numberText(s.total_errors);
    $("builder-report-rate").textContent = pct(s.error_rate_percent);
    renderBuilderSummary(latestBuilderData?.builder_summary || []);
    renderBuilderErrors(latestBuilderData?.error_categories || []);
    builderLoaded = true;
    message("Builder Reports loaded.", "success");
  }

  async function exportSection(kind, button) {
    if (!setup?.viewer?.can_export || !csv) return;
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      await loadReport();
      const start = $("qa-report-start").value;
      const end = $("qa-report-end").value;
      const label = setup.viewer.access_scope === "ALL_QA" ? ($("qa-report-rep").selectedOptions?.[0]?.textContent || "all-qa") : setup.viewer.employee_name;
      if (kind === "employee") {
        csv.download(`qa-report-by-employee-${start}-to-${end}-${csv.slug(label)}.csv`, ["QA Employee","Jobs","Pieces Reviewed","Errors","Error Rate %","Scrap","Rework Returned"], (latestData?.by_employee || []).map((r) => [r.qa_rep,r.total_jobs,r.total_pieces_reviewed,r.total_errors,r.error_rate_percent,r.scrap_pieces,r.rework_returned]));
      } else {
        csv.download(`qa-report-by-date-${start}-to-${end}-${csv.slug(label)}.csv`, ["Date","Jobs","Pieces Reviewed","Errors","Error Rate %"], (latestData?.by_date || []).map((r) => [r.review_date,r.total_jobs,r.total_pieces_reviewed,r.total_errors,r.error_rate_percent]));
      }
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function exportBuilderSummary(button) {
    if (!setup?.viewer?.can_view_builder_reports || !csv) return;
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      await loadBuilderReport();
      const start = $("builder-report-start").value;
      const end = $("builder-report-end").value;
      csv.download(`builder-report-summary-${start}-to-${end}.csv`, ["Builder","Total Jobs","Quantity","Errors","Error Rate %"], (latestBuilderData?.builder_summary || []).map((r) => [r.builder_name,r.total_jobs,r.quantity,r.errors,r.error_rate_percent]));
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function fillBuilderOptions() {
    $("builder-report-employee").innerHTML = '<option value="">All Builders</option>' + (builderSetup?.builders || []).map((r) => `<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
    $("builder-report-department").innerHTML = '<option value="">All Departments</option>' + (builderSetup?.departments || []).map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
    $("builder-report-supervisor").innerHTML = '<option value="">All Supervisors</option>' + (builderSetup?.supervisors || []).map((r) => `<option value="${esc(r.supervisor_id)}">${esc(r.supervisor_name)}</option>`).join("");
  }

  async function enter() {
    setup = await rpc("get_qa_reporting_options", { p_session_token: sessionToken });
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = setup.viewer?.employee_name || sessionEmployee?.employee_name || "Employee";
    $("viewer-meta").textContent = [setup.viewer?.role, setup.viewer?.department].filter(Boolean).join(" · ");
    setDefaultDates();

    const isAll = setup.viewer?.access_scope === "ALL_QA";
    $("qa-report-rep-wrap").hidden = !isAll;
    $("qa-report-self-wrap").hidden = isAll;
    $("qa-report-self").textContent = setup.viewer?.employee_name || "";
    $("qa-report-rep").innerHTML = '<option value="">All QA Employees</option>' + (setup.qa_reps || []).map((r) => `<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
    $("qa-export-actions").hidden = !setup.viewer?.can_export;

    const canBuilder = !!setup.viewer?.can_view_builder_reports;
    $("tab-builder-report").hidden = !canBuilder;
    if (canBuilder) {
      builderSetup = await rpc("get_builder_reporting_options", { p_session_token: sessionToken });
      fillBuilderOptions();
    }

    builderLoaded = false;
    switchView("qa");
    message("");
    await loadReport();
  }

  async function init() {
    try {
      await listEmployees();
      if (await restore()) {
        try { await enter(); }
        catch (error) {
          sessionStorage.removeItem(sessionKey);
          sessionToken = null;
          $("app").hidden = true;
          $("login").hidden = false;
          message(error.message, "error");
        }
      }
    } catch (error) {
      message(error.message, "error");
    }
  }

  $("login-form").addEventListener("submit", (event) => login(event).catch((error) => message(error.message, "error")));
  $("sign-out").addEventListener("click", () => logout().catch(() => {}));
  $("tab-qa-report").addEventListener("click", () => switchView("qa"));
  $("tab-builder-report").addEventListener("click", () => switchView("builder"));
  $("qa-report-load").addEventListener("click", () => loadReport().catch((error) => message(error.message, "error")));
  $("builder-report-load").addEventListener("click", () => loadBuilderReport().catch((error) => message(error.message, "error")));
  $("qa-export-employee").addEventListener("click", () => exportSection("employee", $("qa-export-employee")).catch((error) => message(error.message, "error")));
  $("qa-export-date").addEventListener("click", () => exportSection("date", $("qa-export-date")).catch((error) => message(error.message, "error")));
  $("builder-export-summary").addEventListener("click", () => exportBuilderSummary($("builder-export-summary")).catch((error) => message(error.message, "error")));
  init();
})();