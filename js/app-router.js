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
  const rememberedEmployeeKey = "task_tracker_remembered_employee";
  const returnTargetParam = "return_to";
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let returnTarget = readReturnTarget();

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function showLogin(message = "", type = "info") {
    $("login-form").hidden = false;
    $("routing").hidden = true;
    if (message) setMessage(message, type);
  }

  function showRouting() {
    $("login-form").hidden = true;
    $("routing").hidden = false;
  }

  function readRememberedEmployee() {
    try {
      const raw = localStorage.getItem(rememberedEmployeeKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.employeeId) return null;
      return {
        employeeId: String(parsed.employeeId),
        employeeName: String(parsed.employeeName || "")
      };
    } catch {
      return null;
    }
  }

  function rememberEmployee(employee) {
    if (!employee?.id) return;
    try {
      localStorage.setItem(rememberedEmployeeKey, JSON.stringify({
        employeeId: String(employee.id),
        employeeName: String(employee.name || "")
      }));
    } catch {
      // Device recognition is a convenience only; login must still succeed if storage is unavailable.
    }
  }

  function forgetRememberedEmployee() {
    try {
      localStorage.removeItem(rememberedEmployeeKey);
    } catch {
      // Ignore unavailable browser storage.
    }
  }

  function setRememberedEmployeeUi(employee = null) {
    const recognized = $("recognized-user");
    const recognizedName = $("recognized-employee-name");
    const label = $("employee-label");
    const select = $("employee");
    if (!recognized || !recognizedName || !label || !select) return;

    if (employee) {
      recognizedName.textContent = employee.employee_name || employee.employeeName || "Saved employee";
      recognized.hidden = false;
      label.hidden = true;
      select.hidden = true;
      select.value = employee.employee_id || employee.employeeId || "";
      $("remember-device").checked = true;
      window.setTimeout(() => $("pin")?.focus(), 0);
    } else {
      recognized.hidden = true;
      label.hidden = false;
      select.hidden = false;
    }
  }

  function readReturnTarget() {
    const raw = new URLSearchParams(window.location.search).get(returnTargetParam);
    if (!raw) return null;
    if (raw.includes("\\") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    try {
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return null;
      const file = url.pathname.split("/").pop() || "";
      if (!/^[A-Za-z0-9._-]+\.html$/.test(file) || file.toLowerCase() === "index.html") return null;
      return `${file}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
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

    const remembered = readRememberedEmployee();
    const matched = remembered
      ? (rows || []).find((row) => String(row.employee_id) === remembered.employeeId)
      : null;

    if (remembered && !matched) forgetRememberedEmployee();
    setRememberedEmployeeUi(matched || null);
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

  async function resolveWorkspace() {
    const route = await rpc("get_workspace_route", { p_session_token: sessionToken });
    if (!route?.destination) throw new Error("Unable to determine the correct workspace.");

    if (route.qa_department_missing_access) {
      throw new Error("This Quality Assurance employee does not have QA View/Review permission assigned yet. Assign QA permissions in employee administration before using the QA workspace.");
    }

    return route.destination;
  }

  async function routeToWorkspace() {
    const role = sessionEmployee?.employee_role || sessionEmployee?.role || "";
    showRouting();
    $("routing-message").textContent = returnTarget
      ? `Signed in as ${sessionEmployee?.employee_name || "employee"} · Opening requested page…`
      : `Signed in as ${sessionEmployee?.employee_name || "employee"} · ${role}.`;
    try {
      const destination = returnTarget || await resolveWorkspace();
      window.location.replace(destination);
    } catch (error) {
      showLogin(error.message || "Unable to open the correct workspace.", "error");
      throw error;
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

    if ($("remember-device")?.checked) {
      rememberEmployee({
        id: row.employee_id,
        name: row.employee_name
      });
    } else {
      forgetRememberedEmployee();
    }

    $("pin").value = "";
    await routeToWorkspace();
  }

  async function init() {
    try {
      await listEmployees();
      if (await restoreSession()) await routeToWorkspace();
    } catch (error) {
      showLogin(error.message || "Unable to restore the previous session.", "error");
    }
  }

  $("login-form").addEventListener("submit", (event) => {
    login(event).catch((error) => showLogin(error.message || "Unable to sign in.", "error"));
  });

  $("change-employee")?.addEventListener("click", () => {
    forgetRememberedEmployee();
    setRememberedEmployeeUi(null);
    $("employee").value = "";
    $("remember-device").checked = true;
    $("employee").focus();
  });

  init();
})();
