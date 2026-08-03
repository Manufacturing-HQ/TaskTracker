"use strict";

window.TaskTrackerAuth = (() => {
  const config = window.TaskTrackerConfig;

  if (!config) {
    throw new Error("Task Tracker configuration was not loaded.");
  }

  if (!window.supabase) {
    throw new Error("The Supabase JavaScript library was not loaded.");
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );

  function getStoredSessionToken() {
    return sessionStorage.getItem(config.sessionStorageKey);
  }

  function storeSessionToken(sessionToken) {
    sessionStorage.setItem(
      config.sessionStorageKey,
      sessionToken
    );
  }

  function clearStoredSessionToken() {
    sessionStorage.removeItem(config.sessionStorageKey);
  }

  async function listEmployees() {
    const { data, error } = await client.rpc(
      "list_login_employees"
    );

    if (error) {
      throw new Error(
        error.message || "The employee list could not be loaded."
      );
    }

    return Array.isArray(data) ? data : [];
  }

  async function login(employeeId, pin) {
    const { data, error } = await client.rpc(
      "login_with_employee_pin",
      {
        p_employee_id: employeeId,
        p_pin: pin
      }
    );

    if (error) {
      throw new Error(
        error.message || "The login request could not be completed."
      );
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      throw new Error(
        "The login request did not return a result."
      );
    }

    if (!result.login_successful) {
      return {
        successful: false,
        message:
          result.login_message ||
          "The employee name or PIN is incorrect."
      };
    }

    if (!result.session_token) {
      throw new Error(
        "The login succeeded but no session token was returned."
      );
    }

    storeSessionToken(result.session_token);

    return {
      successful: true,
      sessionToken: result.session_token,
      employee: {
        id: result.employee_id,
        name: result.employee_name,
        department: result.department,
        role: result.employee_role,
        supervisorId: result.supervisor_id,
        expiresAt: result.expires_at
      }
    };
  }

  async function restoreSession() {
    const sessionToken = getStoredSessionToken();

    if (!sessionToken) {
      return null;
    }

    const { data, error } = await client.rpc(
      "get_employee_session_context",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      clearStoredSessionToken();
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      clearStoredSessionToken();
      return null;
    }

    return {
      sessionToken,
      employee: {
        id: result.employee_id,
        name: result.employee_name,
        department: result.department,
        role: result.employee_role,
        supervisorId: result.supervisor_id,
        expiresAt: result.expires_at
      }
    };
  }
  async function getMyTaskState(sessionToken) {
    const { data, error } = await client.rpc(
      "get_my_task_state",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee task status could not be loaded."
      );
    }

    return data || null;
  }
  async function getPermissionContext(sessionToken) {
    const { data, error } = await client.rpc(
      "get_employee_permission_context",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee permissions could not be loaded."
      );
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      throw new Error(
        "The employee permissions were not returned."
      );
    }

    return result;
  }

  async function logout() {
    const sessionToken = getStoredSessionToken();

    clearStoredSessionToken();

    if (!sessionToken) {
      return;
    }

    const { error } = await client.rpc(
      "logout_employee_session",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      console.warn(
        "The server logout request did not complete:",
        error.message
      );
    }
  }

    return Object.freeze({
    listEmployees,
    login,
    restoreSession,
    getMyTaskState,
    getPermissionContext,
    logout,
    getStoredSessionToken,
    clearStoredSessionToken
  });
})();
