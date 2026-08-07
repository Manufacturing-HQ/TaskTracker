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

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
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

  async function logout() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    sessionEmployee = null;
    if (token) {
      try { await rpc("logout_employee_session", { p_session_token: token }); } catch {}
    }
    $("app").hidden = true;
    $("login-shell").hidden = false;
    setMessage("Signed out.");
  }

  async function getAccess() {
    const role = sessionEmployee?.employee_role || sessionEmployee?.role || "Employee";
    const employeeId = sessionEmployee?.employee_id || sessionEmployee?.id;
    const result = {
      qa: false,
      training: false,
      supervisor: ["Supervisor", "Manager", "Administrator"].includes(role),
      reporting: ["Supervisor", "Manager", "Administrator"].includes(role)
    };

    if (["Manager", "Administrator"].includes(role)) {
      result.qa = true;
      result.training = true;
      return result;
    }

    if (role === "Supervisor") result.training = true;

    try {
      const qa = await rpc("has_employee_permission", {
        p_employee_id: employeeId,
        p_permission_code: "qa.view"
      });
      result.qa = Boolean(qa);
    } catch {}

    try {
      const training = await rpc("has_employee_permission", {
        p_employee_id: employeeId,
        p_permission_code: "qa.manage_training"
      });
      result.training = result.training || Boolean(training);
    } catch {}

    return result;
  }

  function applyAccess(access) {
    const map = [
      ["qa", "nav-qa", "card-qa"],
      ["training", "nav-training", "card-training"],
      ["supervisor", "nav-supervisor", "card-supervisor"],
      ["reporting", "nav-reporting", "card-reporting"]
    ];
    map.forEach(([key, navId, cardId]) => {
      $(navId).hidden = !access[key];
      $(cardId).hidden = !access[key];
    });
  }

  async function enterApp() {
    const name = sessionEmployee?.employee_name || sessionEmployee?.name || "Employee";
    const role = sessionEmployee?.employee_role || sessionEmployee?.role || "Employee";
    const department = sessionEmployee?.department || "";

    $("login-shell").hidden = true;
    $("app").hidden = false;
    $("welcome-name").textContent = name;
    $("side-name").textContent = name;
    $("side-meta").textContent = [role, department].filter(Boolean).join(" · ");
    $("role-badge").textContent = role;
    setMessage("");

    const access = await getAccess();
    applyAccess(access);
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
  $("sign-out").addEventListener("click", () => logout().catch(() => {}));

  init();
})();
