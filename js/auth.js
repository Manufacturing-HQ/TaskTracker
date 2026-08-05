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
    async function editPermittedActiveJob(
    sessionToken,
    jobId,
    editData
  ) {
    const { data, error } = await client.rpc(
      "edit_permitted_active_job",
      {
        p_session_token: sessionToken,
        p_job_id: jobId,
        p_correction_reason:
          editData.correctionReason,
        p_task_type_id:
          editData.taskTypeId,
        p_item_id:
          editData.itemId || null,
        p_item_not_listed_detail:
          editData.itemNotListedDetail || null,
        p_non_productive_task_id:
          editData.nonProductiveTaskId || null,
        p_work_order_number:
          editData.workOrderNumber || null,
        p_work_order_type:
          editData.workOrderType || null,
        p_job_type:
          editData.jobType || null,
        p_job_comments:
          editData.comments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The active job details could not be updated."
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

    async function getMemoCreationOptions(sessionToken) {
    const { data, error } = await client.rpc(
      "get_memo_creation_options",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The memo creation options could not be loaded."
      );
    }

    return data || {
      memo_categories: [],
      employees: []
    };
  }

  async function createAndAssignMemo(
    sessionToken,
    memoData
  ) {
    const { data, error } = await client.rpc(
      "create_and_assign_memo",
      {
        p_session_token: sessionToken,
        p_memo_category_id:
          memoData.memoCategoryId,
        p_memo_title:
          memoData.memoTitle,
        p_memo_body:
          memoData.memoBody,
        p_assigned_employee_ids:
          memoData.assignedEmployeeIds
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The memo could not be created."
      );
    }

    return data || null;
  }

  async function getMyMemos(
    sessionToken,
    includeAcknowledged = false
  ) {
    const { data, error } = await client.rpc(
      "get_my_memos",
      {
        p_session_token: sessionToken,
        p_include_acknowledged:
          Boolean(includeAcknowledged)
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee memos could not be loaded."
      );
    }

    return Array.isArray(data) ? data : [];
  }

  async function acknowledgeMyMemo(
    sessionToken,
    memoAssignmentId,
    acknowledgmentComments = null
  ) {
    const { data, error } = await client.rpc(
      "acknowledge_my_memo",
      {
        p_session_token: sessionToken,
        p_memo_assignment_id:
          memoAssignmentId,
        p_acknowledgment_comments:
          acknowledgmentComments || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The memo could not be acknowledged."
      );
    }

    return data || null;
  }

    async function getEmployeeAdminOptions(
    sessionToken
  ) {
    const { data, error } = await client.rpc(
      "get_employee_admin_options",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee administration options could not be loaded."
      );
    }

    return data || {
      roles: [],
      departments: [],
      supervisors: []
    };
  }

  async function searchAdminEmployees(
    sessionToken,
    {
      searchText = null,
      includeInactive = true,
      resultLimit = 100,
      resultOffset = 0
    } = {}
  ) {
    const { data, error } = await client.rpc(
      "search_admin_employees",
      {
        p_session_token: sessionToken,
        p_search_text:
          searchText?.trim() || null,
        p_include_inactive:
          Boolean(includeInactive),
        p_result_limit:
          Number(resultLimit) || 100,
        p_result_offset:
          Number(resultOffset) || 0
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee records could not be loaded."
      );
    }

    return data || {
      records: [],
      total_count: 0
    };
  }

  async function saveAdminEmployee(
    sessionToken,
    employeeData
  ) {
    const { data, error } = await client.rpc(
      "save_admin_employee",
      {
        p_session_token: sessionToken,
        p_employee_id:
          employeeData.employeeId || null,
        p_employee_name:
          employeeData.employeeName,
        p_department:
          employeeData.department || null,
        p_supervisor_id:
          employeeData.supervisorId || null,
        p_employee_role:
          employeeData.employeeRole,
        p_is_active:
          Boolean(employeeData.isActive),
        p_display_order:
          Number(employeeData.displayOrder) || 0,
        p_new_pin:
          employeeData.newPin?.trim() || null
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The employee record could not be saved."
      );
    }

    return data || null;
  }

  async function getDropdownAdminConfiguration(
    sessionToken
  ) {
    const { data, error } = await client.rpc(
      "get_dropdown_admin_configuration",
      {
        p_session_token: sessionToken
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The dropdown administration configuration could not be loaded."
      );
    }

    return data || {
      record_types: [],
      stop_reason_types: []
    };
  }

  async function searchAdminDropdownRecords(
    sessionToken,
    {
      recordType,
      searchText = null,
      includeInactive = true,
      resultLimit = 100,
      resultOffset = 0
    } = {}
  ) {
    const { data, error } = await client.rpc(
      "search_admin_dropdown_records",
      {
        p_session_token: sessionToken,
        p_record_type: recordType,
        p_search_text:
          searchText?.trim() || null,
        p_include_inactive:
          Boolean(includeInactive),
        p_result_limit:
          Number(resultLimit) || 100,
        p_result_offset:
          Number(resultOffset) || 0
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The administration records could not be loaded."
      );
    }

    return data || {
      record_type: recordType,
      records: [],
      total_count: 0,
      result_limit: resultLimit,
      result_offset: resultOffset
    };
  }

  async function saveAdminDropdownRecord(
    sessionToken,
    recordType,
    recordId,
    recordData
  ) {
    const { data, error } = await client.rpc(
      "save_admin_dropdown_record",
      {
        p_session_token: sessionToken,
        p_record_type: recordType,
        p_record_id: recordId || null,
        p_record_data: recordData
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "The administration record could not be saved."
      );
    }

    return data || null;
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
    editPermittedActiveJob,
    getMyTaskState,
    getPermissionContext,
    getMemoCreationOptions,
    createAndAssignMemo,
    getMyMemos,
    acknowledgeMyMemo,
    getEmployeeAdminOptions,
    searchAdminEmployees,
    saveAdminEmployee,
    getDropdownAdminConfiguration,
    searchAdminDropdownRecords,
    saveAdminDropdownRecord,
    logout,
    getStoredSessionToken,
    clearStoredSessionToken
  });
})();
