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

  async function resolveWorkspace() {
    const role = sessionEmployee?.employee_role || sessionEmployee?.role || "";
    if (["Supervisor", "Manager", "Administrator"].includes(role)) return "management.html";
    if (role !== "Employee") throw new Error(`No workspace is configured for role: ${role || "Unknown"}.`);

    const historySetup = await rpc("get_history_workspace_options", { p_session_token: sessionToken });
    if (historySetup?.viewer?.has_qa_history) return "qa.html";
    return "employee.html";
  }

  async function routeToWorkspace() {
    const role = sessionEmployee?.employee_role || sessionEmployee?.role || "";
    $("login-form").hidden = true;
    $("routing").hidden = false;
    $("routing-message").textContent = `Signed in as ${sessionEmployee?.employee_name || "employee"} · ${role}.`;
    const destination = await resolveWorkspace();
    window.location.replace(destination);
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
    await routeToWorkspace();
  }

  async function init() {
    try {
      await listEmployees();
      if (await restoreSession()) await routeToWorkspace();
    } catch (error) {
      setMessage(error.message, "error");
      $("login-form").hidden = false;
      $("routing").hidden = true;
    }
  }

  $("login-form").addEventListener("submit", (event) => login(event).catch((e) => setMessage(e.message, "error")));
  init();
})();
