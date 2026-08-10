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
  let attendanceData = null;
  let auditSetup = null;
  let tasks = [];

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

  function currentRole() {
    return sessionEmployee?.employee_role || sessionEmployee?.role || "";
  }

  function pct(v) {
    return v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`;
  }

  function minutesLabel(v) {
    const n = Number(v || 0);
    if (!n) return "—";
    if (n < 60) return `${n.toFixed(0)} min`;
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return `${h}h ${m}m`;
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
    const role = row.employee_role || row.role;
    if (!["Supervisor", "Manager", "Administrator"].includes(role)) {
      setMessage("This workspace is for Supervisor, Manager, and Administrator accounts.", "error");
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
    window.location.replace("index.html");
  }

  function applyRoleUi() {
    const role = currentRole();
    const supervisor = role === "Supervisor";
    const management = role === "Manager" || role === "Administrator";

    $("workspace-label").textContent = supervisor ? "Supervisor Workspace" : "Management Workspace";
    $("live-nav").textContent = supervisor ? "Team Live Status" : "Company Live Status";
    $("overview-nav").textContent = supervisor ? "Supervisor Operations" : "Management Operations";
    $("live-performance-title").textContent = supervisor ? "Team Performance" : "Company Performance";
    $("overview-heading").textContent = supervisor ? "Supervisor Operations" : "Management Operations";
    $("overview-copy").textContent = supervisor
      ? "Use the navigation for Attendance Audit, Task Tracker Audit, Task Queue, Attendance / Employee Summary, Training, and Reporting."
      : "Use the navigation for Attendance Audit, Task Tracker Audit, Task Queue, Attendance / Employee Summary, QA, Training, and Reporting.";
    $("queue-heading").textContent = supervisor ? "Pending Supervisor Task Queue" : "Operations Task Queue";
    $("qa-link").hidden = !management;
  }

  function viewLabels(view) {
    const supervisor = currentRole() === "Supervisor";
    const company = !supervisor;
    return {
      home: [
        supervisor ? "Team Live Status" : "Company Live Status",
        supervisor ? "Current employee status and team performance." : "Current employee status and company performance."
      ],
      overview: [
        supervisor ? "Supervisor Operations" : "Management Operations",
        supervisor ? "Overview of daily supervisor workflows." : "Overview of management operational workflows."
      ],
      attendance: ["Attendance Audit", "Verify attendance and hours worked for the selected business date."],
      audit: ["Task Tracker Audit", "Review one employee and one business date at a time."],
      queue: ["Task Queue", company ? "Operational tasks available in your access scope." : "Pending and completed Supervisor Operations tasks."]
    };
  }

  function setView(view) {
    const labels = viewLabels(view);
    document.querySelectorAll("button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    ["home", "overview", "attendance", "audit", "queue"].forEach((v) => {
      $("view-" + v).hidden = v !== view;
    });
    $("page-title").textContent = labels[view][0];
    $("page-subtitle").textContent = labels[view][1];
    if (view === "home") loadLiveStatus().catch(showError);
    if (view === "attendance") loadAttendance().catch(showError);
    if (view === "audit") loadAuditSetup().catch(showError);
    if (view === "queue") loadQueue().catch(showError);
  }

  function showError(error) {
    setMessage(error.message || String(error), "error");
  }

  async function loadLiveStatus() {
    const data = await rpc("get_supervisor_live_status_dashboard", {
      p_session_token: sessionToken,
      p_period: $("performance-period").value
    });
    const p = data?.performance || {};
    $("perf-productivity").textContent = pct(p.productivity_percent);
    $("perf-efficiency").textContent = pct(p.efficiency_percent);
    $("perf-error").textContent = pct(p.error_rate_percent);
    const body = $("status-body");
    body.innerHTML = "";
    (data?.employees || []).forEach((e) => {
      const task = e.has_active_task
        ? [e.task_type, e.work_order_number, e.item_name || e.non_productive_task, e.job_type].filter(Boolean).join(" · ")
        : "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><strong>${escapeHtml(e.employee_name)}</strong><div style="color:#64748b;font-size:12px">${escapeHtml(e.department || "")}</div></td>
        <td><span class="status-pill ${e.has_active_task ? "" : "status-idle"}">${escapeHtml(e.status || "No Active Task")}</span></td>
        <td>${escapeHtml(task)}</td>
        <td>${e.has_active_task ? escapeHtml(minutesLabel(e.minutes_on_current_session)) : "—"}</td>
        <td>${escapeHtml(e.total_stops || 0)}</td>
        <td>${escapeHtml(e.supervisor_name || "—")}</td>`;
      body.appendChild(tr);
    });
    if (!body.children.length) body.innerHTML = '<tr><td colspan="6">No employees are available in your access scope.</td></tr>';
  }

  async function loadAttendance() {
    attendanceData = await rpc("get_attendance_audit", {
      p_session_token: sessionToken,
      p_business_date: $("attendance-date").value || null
    });
    $("attendance-date").value = attendanceData.business_date;
    const body = $("attendance-body");
    body.innerHTML = "";
    (attendanceData.employees || []).forEach((emp) => {
      const tr = document.createElement("tr");
      const options = (attendanceData.event_types || []).map((t) => `<option value="${t.event_type_id}" ${t.event_type_id === emp.event_type_id ? "selected" : ""}>${escapeHtml(t.display_name)}</option>`).join("");
      tr.innerHTML = `<td><strong>${escapeHtml(emp.employee_name)}</strong></td>
        <td><select data-kind="event" data-employee="${emp.employee_id}"><option value="">Select...</option>${options}</select></td>
        <td><input data-kind="hours" data-employee="${emp.employee_id}" type="number" min="0" max="24" step="0.01" value="${emp.entered_hours ?? ""}" style="width:95px"></td>
        <td data-minutes="${emp.employee_id}">${emp.minutes_worked ?? "—"}</td>
        <td data-saved="${emp.employee_id}">${emp.saved_at ? "Saved" : "Not saved"}</td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll("select[data-kind=event]").forEach((el) => el.addEventListener("change", () => saveAttendanceRow(el.dataset.employee)));
    body.querySelectorAll("input[data-kind=hours]").forEach((el) => {
      el.addEventListener("change", () => saveAttendanceRow(el.dataset.employee));
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
    });
  }

  async function saveAttendanceRow(employeeId) {
    const eventEl = document.querySelector(`select[data-kind=event][data-employee="${employeeId}"]`);
    const hoursEl = document.querySelector(`input[data-kind=hours][data-employee="${employeeId}"]`);
    if (!eventEl?.value) return;
    const savedEl = document.querySelector(`[data-saved="${employeeId}"]`);
    savedEl.textContent = "Saving...";
    try {
      const result = await rpc("save_attendance_audit_entry", {
        p_session_token: sessionToken,
        p_employee_id: employeeId,
        p_business_date: $("attendance-date").value,
        p_event_type_id: eventEl.value,
        p_entered_hours: hoursEl.value === "" ? null : Number(hoursEl.value),
        p_notes: null
      });
      document.querySelector(`[data-minutes="${employeeId}"]`).textContent = result.minutes_worked ?? "—";
      savedEl.textContent = "Saved";
    } catch (e) {
      savedEl.textContent = "Error";
      showError(e);
    }
  }

  async function loadAuditSetup() {
    auditSetup = await rpc("get_task_tracker_audit_setup", {
      p_session_token: sessionToken,
      p_business_date: $("audit-date").value || null
    });
    $("audit-date").value = auditSetup.business_date;
    const select = $("audit-employee");
    const current = select.value;
    select.innerHTML = '<option value="">Select employee</option>';
    (auditSetup.employees || []).forEach((e) => {
      const option = document.createElement("option");
      option.value = e.employee_id;
      option.textContent = e.employee_name;
      select.appendChild(option);
    });
    if (current && [...select.options].some((o) => o.value === current)) select.value = current;
    renderFindings();
    renderExistingAudit();
  }

  function renderFindings() {
    const wrap = $("finding-wrap");
    wrap.innerHTML = "";
    (auditSetup?.finding_types || []).forEach((f) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${f.finding_type_id}"> <span>${escapeHtml(f.display_name)}</span>`;
      wrap.appendChild(label);
    });
    wrap.hidden = $("audit-result").value !== "ISSUES_FOUND";
  }

  function renderExistingAudit() {
    const employeeId = $("audit-employee").value;
    const emp = (auditSetup?.employees || []).find((e) => e.employee_id === employeeId);
    const box = $("audit-existing");
    if (!emp?.audit_id) {
      box.hidden = true;
      $("audit-result").value = "NO_ISSUES";
      $("audit-comments").value = "";
      document.querySelectorAll("#finding-wrap input").forEach((x) => { x.checked = false; });
      renderFindings();
      return;
    }
    box.textContent = `Existing audit: ${emp.audit_result.replaceAll("_", " ")} · ${emp.submitted_at || ""}`;
    box.hidden = false;
    $("audit-result").value = emp.audit_result;
    $("audit-comments").value = emp.comments || "";
    const selected = new Set((emp.findings || []).map((f) => f.finding_type_id));
    document.querySelectorAll("#finding-wrap input").forEach((x) => { x.checked = selected.has(x.value); });
    renderFindings();
  }

  async function submitAudit() {
    const employeeId = $("audit-employee").value;
    if (!employeeId) throw new Error("Select an employee first.");
    const findingIds = [...document.querySelectorAll("#finding-wrap input:checked")].map((x) => x.value);
    await rpc("submit_task_tracker_audit", {
      p_session_token: sessionToken,
      p_employee_id: employeeId,
      p_business_date: $("audit-date").value,
      p_audit_result: $("audit-result").value,
      p_finding_type_ids: findingIds.length ? findingIds : null,
      p_comments: $("audit-comments").value.trim() || null
    });
    setMessage("Task Tracker Audit saved.");
    await loadAuditSetup();
  }

  async function loadQueue() {
    tasks = await rpc("get_my_supervisor_tasks", {
      p_session_token: sessionToken,
      p_include_completed: $("include-completed").checked
    });
    const wrap = $("queue-list");
    wrap.innerHTML = "";
    (tasks || []).forEach((t) => {
      const div = document.createElement("div");
      div.className = "task-card";
      div.innerHTML = `<h3>${escapeHtml(t.title || t.task_type_name)}</h3><small>${escapeHtml([t.task_type_name, t.employee_name, t.business_date ? `Business ${t.business_date}` : null, t.due_date ? `Due ${t.due_date}` : null, t.status].filter(Boolean).join(" · "))}</small>${t.details ? `<div style="margin-top:8px">${escapeHtml(t.details)}</div>` : ""}<div style="margin-top:10px" class="actions"></div>`;
      const actions = div.querySelector(".actions");
      if (t.status === "Pending") {
        const b = document.createElement("button");
        b.className = "ghost";
        b.textContent = "Start";
        b.onclick = async () => {
          await rpc("start_supervisor_task", { p_session_token: sessionToken, p_supervisor_task_id: t.supervisor_task_id });
          await loadQueue();
        };
        actions.appendChild(b);
      }
      if (["Pending", "In Progress"].includes(t.status)) {
        const b = document.createElement("button");
        b.className = "primary";
        b.textContent = "Complete";
        b.style.marginLeft = "8px";
        b.onclick = async () => {
          await rpc("complete_supervisor_task", { p_session_token: sessionToken, p_supervisor_task_id: t.supervisor_task_id, p_completion_notes: null });
          await loadQueue();
        };
        actions.appendChild(b);
      }
      wrap.appendChild(div);
    });
    if (!wrap.children.length) wrap.innerHTML = '<div style="color:#64748b">No operational tasks match this view.</div>';
  }

  async function enterApp() {
    const role = currentRole();
    if (!["Supervisor", "Manager", "Administrator"].includes(role)) {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      sessionEmployee = null;
      setMessage("This workspace is for Supervisor, Manager, and Administrator accounts.", "error");
      return;
    }
    $("login").hidden = true;
    $("app").hidden = false;
    $("side-name").textContent = sessionEmployee.employee_name || sessionEmployee.name || "";
    $("side-meta").textContent = [role, sessionEmployee.department].filter(Boolean).join(" · ");
    applyRoleUi();
    setMessage("");
    setView("home");
  }

  async function init() {
    try {
      await listEmployees();
      if (await restoreSession()) await enterApp();
    } catch (e) {
      showError(e);
    }
  }

  $("login-form").addEventListener("submit", (e) => login(e).catch(showError));
  $("sign-out").addEventListener("click", () => signOut().catch(showError));
  document.querySelectorAll("button[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("performance-period").addEventListener("change", () => loadLiveStatus().catch(showError));
  $("refresh-status").addEventListener("click", () => loadLiveStatus().catch(showError));
  $("attendance-date").addEventListener("change", () => loadAttendance().catch(showError));
  $("audit-date").addEventListener("change", () => loadAuditSetup().catch(showError));
  $("audit-load").addEventListener("click", () => loadAuditSetup().catch(showError));
  $("audit-employee").addEventListener("change", renderExistingAudit);
  $("audit-result").addEventListener("change", renderFindings);
  $("audit-submit").addEventListener("click", () => submitAudit().catch(showError));
  $("include-completed").addEventListener("change", () => loadQueue().catch(showError));

  init();
})();
