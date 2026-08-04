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
    async function getStartTaskOptions(sessionToken) {
    const { data, error } = await client.rpc(
      "get_start_task_options",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The Start Task options could not be loaded."
      );
    }

    return data || {
      task_types: [],
      non_productive_tasks: [],
      placeholder_item: null
    };
  }

  async function searchStartTaskItems(
    sessionToken,
    searchText,
    resultLimit = 25
  ) {
    const { data, error } = await client.rpc(
      "search_start_task_items",
      {
        p_session_token: sessionToken,
        p_search_text: searchText,
        p_result_limit: resultLimit
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The item search could not be completed."
      );
    }

    return Array.isArray(data) ? data : [];
  }

  async function startMyTask(
    sessionToken,
    taskData
  ) {
    const { data, error } = await client.rpc(
      "start_my_task",
      {
        p_session_token: sessionToken,
        p_task_type_id: taskData.taskTypeId,
        p_item_id: taskData.itemId || null,
        p_item_not_listed_detail:
          taskData.itemNotListedDetail || null,
        p_work_order_number:
          taskData.workOrderNumber || null,
        p_work_order_type:
          taskData.workOrderType || null,
        p_job_type:
          taskData.jobType || null,
        p_non_productive_task_id:
          taskData.nonProductiveTaskId || null,
        p_comments:
          taskData.comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be started."
      );
    }

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (!result?.job_id) {
      throw new Error(
        "The task was started, but the new job was not returned."
      );
    }

    return result;
  }
    async function getTaskActionOptions(sessionToken) {
    const { data, error } = await client.rpc(
      "get_task_action_options",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task action options could not be loaded."
      );
    }

    return data || {
      pause_reasons: [],
      block_reasons: [],
      return_reasons: []
    };
  }

  async function pauseMyTask(
    sessionToken,
    jobId,
    stopReasonId,
    comments = null
  ) {
    const { data, error } = await client.rpc(
      "pause_my_task",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_stop_reason_id: stopReasonId,
        p_comments: comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be paused."
      );
    }

    return data || null;
  }

  async function blockMyTask(
    sessionToken,
    jobId,
    stopReasonId,
    comments = null
  ) {
    const { data, error } = await client.rpc(
      "block_my_task",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_stop_reason_id: stopReasonId,
        p_comments: comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be blocked."
      );
    }

    return data || null;
  }

  async function returnMyTask(
    sessionToken,
    jobId,
    stopReasonId,
    comments = null
  ) {
    const { data, error } = await client.rpc(
      "return_my_task",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_stop_reason_id: stopReasonId,
        p_comments: comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be returned."
      );
    }

    return data || null;
  }

  async function completeMyTask(
    sessionToken,
    jobId,
    completedQuantity = null,
    comments = null
  ) {
    const { data, error } = await client.rpc(
      "complete_my_task",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_completed_quantity:
          completedQuantity === null ||
          completedQuantity === ""
            ? null
            : Number(completedQuantity),
        p_comments: comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be completed."
      );
    }

    return data || null;
  }

  async function resumeMyTask(
    sessionToken,
    jobId,
    comments = null
  ) {
    const { data, error } = await client.rpc(
      "resume_my_task",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_comments: comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The task could not be resumed."
      );
    }

    return data || null;
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
    getStartTaskOptions,
    searchStartTaskItems,
    startMyTask,
    getTaskActionOptions,
    pauseMyTask,
    blockMyTask,
    returnMyTask,
    completeMyTask,
    resumeMyTask,
    getMyTaskState,
    getPermissionContext,
    logout,
    getStoredSessionToken,
    clearStoredSessionToken
  });
})();
