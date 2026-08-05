"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const auth = window.TaskTrackerAuth;

  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");

  const loginForm = document.getElementById("login-form");
  const employeeSelect =
    document.getElementById("employee-select");
  const pinInput = document.getElementById("pin-input");
  const loginButton = document.getElementById("login-button");
  const loginMessage =
    document.getElementById("login-message");
  const loginLoading =
    document.getElementById("login-loading");

  const currentEmployeeName =
    document.getElementById("current-employee-name");
  const currentEmployeeDetails =
    document.getElementById("current-employee-details");
  const currentEmployeeInitials =
    document.getElementById("current-employee-initials");

  const welcomeName =
    document.getElementById("welcome-name");
  const roleBadge =
    document.getElementById("role-badge");

  const employeeNav =
    document.getElementById("employee-nav");
  const supervisorNav =
    document.getElementById("supervisor-nav");
  const managerNav =
    document.getElementById("manager-nav");
  const administratorNav =
    document.getElementById("administrator-nav");

  const dashboardNavButton =
    document.getElementById("dashboard-nav-button");
  const startTaskNavButton =
    document.getElementById("start-task-nav-button");

    const dashboardPage =
    document.getElementById("dashboard-page");
  const startTaskPage =
    document.getElementById("start-task-page");
  const myMemosPage =
    document.getElementById("my-memos-page");
    const createMemoPage =
    document.getElementById("create-memo-page");
  const employeeAdminPage =
    document.getElementById("employee-admin-page");
  const dropdownAdminPage =
    document.getElementById("dropdown-admin-page");

  const employeeAdminNavButton =
    document.getElementById(
      "employee-admin-nav-button"
    );
  const dropdownAdminNavButton =
    document.getElementById(
      "dropdown-admin-nav-button"
    );

  const myMemosNavButton =
    document.getElementById("my-memos-nav-button");
  const createMemoNavButton =
    document.getElementById("create-memo-nav-button");
  const pendingMemoCount =
    document.getElementById("pending-memo-count");

  const refreshMemosButton =
    document.getElementById("refresh-memos-button");
  const includeAcknowledgedMemos =
    document.getElementById(
      "include-acknowledged-memos"
    );
  const myMemosMessage =
    document.getElementById("my-memos-message");
  const myMemosContent =
    document.getElementById("my-memos-content");

  const createMemoForm =
    document.getElementById("create-memo-form");
  const memoCategorySelect =
    document.getElementById("memo-category-select");
  const memoTitleInput =
    document.getElementById("memo-title-input");
  const memoBodyInput =
    document.getElementById("memo-body-input");
  const memoEmployeeOptions =
    document.getElementById("memo-employee-options");
  const selectAllMemoEmployees =
    document.getElementById(
      "select-all-memo-employees"
    );
  const createMemoMessage =
    document.getElementById("create-memo-message");
  const createMemoSubmitButton =
    document.getElementById(
      "create-memo-submit-button"
    );
    const cancelCreateMemoButton =
    document.getElementById(
      "cancel-create-memo-button"
    );

  const newEmployeeButton =
    document.getElementById(
      "new-employee-button"
    );
  const employeeAdminSearch =
    document.getElementById(
      "employee-admin-search"
    );
  const employeeAdminIncludeInactive =
    document.getElementById(
      "employee-admin-include-inactive"
    );
  const employeeAdminRefreshButton =
    document.getElementById(
      "employee-admin-refresh-button"
    );
  const employeeAdminMessage =
    document.getElementById(
      "employee-admin-message"
    );
  const employeeAdminSummary =
    document.getElementById(
      "employee-admin-summary"
    );
  const employeeAdminRecords =
    document.getElementById(
      "employee-admin-records"
    );

  const employeeAdminModalBackdrop =
    document.getElementById(
      "employee-admin-modal-backdrop"
    );
  const employeeAdminModalClose =
    document.getElementById(
      "employee-admin-modal-close"
    );
  const employeeAdminModalTitle =
    document.getElementById(
      "employee-admin-modal-title"
    );
  const employeeAdminForm =
    document.getElementById(
      "employee-admin-form"
    );
  const employeeAdminId =
    document.getElementById(
      "employee-admin-id"
    );
  const employeeAdminName =
    document.getElementById(
      "employee-admin-name"
    );
  const employeeAdminDepartment =
    document.getElementById(
      "employee-admin-department"
    );
  const employeeDepartmentOptions =
    document.getElementById(
      "employee-department-options"
    );
  const employeeAdminRole =
    document.getElementById(
      "employee-admin-role"
    );
  const employeeAdminSupervisor =
    document.getElementById(
      "employee-admin-supervisor"
    );
  const employeeAdminDisplayOrder =
    document.getElementById(
      "employee-admin-display-order"
    );
  const employeeAdminPin =
    document.getElementById(
      "employee-admin-pin"
    );
  const employeeAdminPinLabel =
    document.getElementById(
      "employee-admin-pin-label"
    );
  const employeeAdminPinNote =
    document.getElementById(
      "employee-admin-pin-note"
    );
  const employeeAdminActive =
    document.getElementById(
      "employee-admin-active"
    );
  const employeeAdminFormMessage =
    document.getElementById(
      "employee-admin-form-message"
    );
  const employeeAdminCancelButton =
    document.getElementById(
      "employee-admin-cancel-button"
    );
  const employeeAdminSaveButton =
    document.getElementById(
      "employee-admin-save-button"
    );

    const dropdownRecordTypeSelect =
    document.getElementById(
      "dropdown-record-type-select"
    );
  const dropdownAdminSearch =
    document.getElementById(
      "dropdown-admin-search"
    );
  const dropdownAdminIncludeInactive =
    document.getElementById(
      "dropdown-admin-include-inactive"
    );
  const dropdownAdminRefreshButton =
    document.getElementById(
      "dropdown-admin-refresh-button"
    );
  const newDropdownRecordButton =
    document.getElementById(
      "new-dropdown-record-button"
    );
  const dropdownAdminMessage =
    document.getElementById(
      "dropdown-admin-message"
    );
  const dropdownAdminSummary =
    document.getElementById(
      "dropdown-admin-summary"
    );
  const dropdownAdminRecords =
    document.getElementById(
      "dropdown-admin-records"
    );

  const dropdownAdminModalBackdrop =
    document.getElementById(
      "dropdown-admin-modal-backdrop"
    );
  const dropdownAdminModalClose =
    document.getElementById(
      "dropdown-admin-modal-close"
    );
  const dropdownAdminModalTitle =
    document.getElementById(
      "dropdown-admin-modal-title"
    );
  const dropdownAdminForm =
    document.getElementById(
      "dropdown-admin-form"
    );
  const dropdownAdminRecordId =
    document.getElementById(
      "dropdown-admin-record-id"
    );
  const dropdownAdminName =
    document.getElementById(
      "dropdown-admin-name"
    );
  const dropdownAdminNameField =
    document.getElementById(
      "dropdown-admin-name-field"
    );
  const dropdownAdminInternalId =
    document.getElementById(
      "dropdown-admin-internal-id"
    );
  const dropdownAdminInternalIdField =
    document.getElementById(
      "dropdown-admin-internal-id-field"
    );
  const dropdownAdminSkuGroup =
    document.getElementById(
      "dropdown-admin-sku-group"
    );
  const dropdownAdminSkuGroupField =
    document.getElementById(
      "dropdown-admin-sku-group-field"
    );
  const dropdownAdminDepartment =
    document.getElementById(
      "dropdown-admin-department"
    );
  const dropdownAdminDepartmentField =
    document.getElementById(
      "dropdown-admin-department-field"
    );
  const dropdownAdminMake =
    document.getElementById(
      "dropdown-admin-make"
    );
  const dropdownAdminMakeField =
    document.getElementById(
      "dropdown-admin-make-field"
    );
  const dropdownAdminBuildType =
    document.getElementById(
      "dropdown-admin-build-type"
    );
  const dropdownAdminBuildTypeField =
    document.getElementById(
      "dropdown-admin-build-type-field"
    );
  const dropdownAdminCycleTime =
    document.getElementById(
      "dropdown-admin-cycle-time"
    );
  const dropdownAdminCycleTimeField =
    document.getElementById(
      "dropdown-admin-cycle-time-field"
    );
  const dropdownAdminReasonType =
    document.getElementById(
      "dropdown-admin-reason-type"
    );
  const dropdownAdminReasonTypeField =
    document.getElementById(
      "dropdown-admin-reason-type-field"
    );
  const dropdownAdminDisplayOrder =
    document.getElementById(
      "dropdown-admin-display-order"
    );
  const dropdownAdminDisplayOrderField =
    document.getElementById(
      "dropdown-admin-display-order-field"
    );
  const dropdownAdminRequiresComment =
    document.getElementById(
      "dropdown-admin-requires-comment"
    );
  const dropdownAdminRequiresCommentField =
    document.getElementById(
      "dropdown-admin-requires-comment-field"
    );
  const dropdownAdminPlaceholder =
    document.getElementById(
      "dropdown-admin-placeholder"
    );
  const dropdownAdminPlaceholderField =
    document.getElementById(
      "dropdown-admin-placeholder-field"
    );
  const dropdownAdminActive =
    document.getElementById(
      "dropdown-admin-active"
    );
  const dropdownAdminFormMessage =
    document.getElementById(
      "dropdown-admin-form-message"
    );
  const dropdownAdminCancelButton =
    document.getElementById(
      "dropdown-admin-cancel-button"
    );
  const dropdownAdminSaveButton =
    document.getElementById(
      "dropdown-admin-save-button"
    );

  const logoutButton =
    document.getElementById("logout-button");

  const dashboardRefreshButton =
    document.getElementById("dashboard-refresh-button");
  const currentTaskContent =
    document.getElementById("current-task-content");
  const unfinishedJobsContent =
    document.getElementById("unfinished-jobs-content");
  const taskStateMessage =
    document.getElementById("task-state-message");

  const startTaskForm =
    document.getElementById("start-task-form");
  const taskTypeOptions =
    document.getElementById("task-type-options");
  const productiveTaskSection =
    document.getElementById("productive-task-section");
  const nonProductiveTaskSection =
    document.getElementById("non-productive-task-section");
  const commentsSection =
    document.getElementById("start-task-comments-section");

  const itemSearchInput =
    document.getElementById("item-search-input");
  const itemSearchResults =
    document.getElementById("item-search-results");
  const selectedItemDisplay =
    document.getElementById("selected-item-display");
  const itemNotListedField =
    document.getElementById("item-not-listed-field");
  const itemNotListedDetail =
    document.getElementById("item-not-listed-detail");

  const workOrderNumber =
    document.getElementById("work-order-number");
  const workOrderType =
    document.getElementById("work-order-type");
  const productiveJobType =
    document.getElementById("productive-job-type");

  const nonProductiveTaskSelect =
    document.getElementById("non-productive-task-select");
  const nonProductiveJobType =
    document.getElementById("non-productive-job-type");
  const commentRequiredNote =
    document.getElementById("comment-required-note");

  const startTaskComments =
    document.getElementById("start-task-comments");
  const commentsRequiredMarker =
    document.getElementById("comments-required-marker");
  const startTaskMessage =
    document.getElementById("start-task-message");
  const startTaskSubmitButton =
    document.getElementById("start-task-submit-button");
    const cancelStartTaskButton =
    document.getElementById("cancel-start-task-button");

  const taskActionModalBackdrop =
    document.getElementById(
      "task-action-modal-backdrop"
    );
  const taskActionModalEyebrow =
    document.getElementById(
      "task-action-modal-eyebrow"
    );
  const taskActionModalTitle =
    document.getElementById(
      "task-action-modal-title"
    );
  const taskActionModalDescription =
    document.getElementById(
      "task-action-modal-description"
    );
  const taskActionModalClose =
    document.getElementById(
      "task-action-modal-close"
    );
  const taskActionForm =
    document.getElementById("task-action-form");
  const taskActionReasonField =
    document.getElementById(
      "task-action-reason-field"
    );
  const taskActionReasonSelect =
    document.getElementById(
      "task-action-reason-select"
    );
  const taskActionCommentRequiredNote =
    document.getElementById(
      "task-action-comment-required-note"
    );
  const taskActionQuantityField =
    document.getElementById(
      "task-action-quantity-field"
    );
  const taskActionCompletedQuantity =
    document.getElementById(
      "task-action-completed-quantity"
    );
  const taskActionComments =
    document.getElementById(
      "task-action-comments"
    );
  const taskActionCommentsRequiredMarker =
    document.getElementById(
      "task-action-comments-required-marker"
    );
  const taskActionMessage =
    document.getElementById(
      "task-action-message"
    );
  const taskActionCancelButton =
    document.getElementById(
      "task-action-cancel-button"
    );
    const taskActionConfirmButton =
    document.getElementById(
      "task-action-confirm-button"
    );

  const editJobModalBackdrop =
    document.getElementById(
      "edit-job-modal-backdrop"
    );
  const editJobModalClose =
    document.getElementById(
      "edit-job-modal-close"
    );
  const editJobForm =
    document.getElementById(
      "edit-job-form"
    );
  const editJobCancelButton =
    document.getElementById(
      "edit-job-cancel-button"
    );
  const editJobModalTitle =
    document.getElementById(
      "edit-job-modal-title"
    );
    const editJobMessage =
    document.getElementById(
      "edit-job-message"
    );

  const editJobTaskType =
    document.getElementById(
      "edit-job-task-type"
    );
  const editJobProductiveFields =
    document.getElementById(
      "edit-job-productive-fields"
    );
  const editJobNonProductiveFields =
    document.getElementById(
      "edit-job-non-productive-fields"
    );
  const editJobNonProductiveTask =
    document.getElementById(
      "edit-job-non-productive-task"
    );

  const editJobItemSearch =
    document.getElementById(
      "edit-job-item-search"
    );
  const editJobItemResults =
    document.getElementById(
      "edit-job-item-results"
    );
  const editJobSelectedItem =
    document.getElementById(
      "edit-job-selected-item"
    );
  const editJobItemNotListedField =
    document.getElementById(
      "edit-job-item-not-listed-field"
    );
  const editJobItemNotListedDetail =
    document.getElementById(
      "edit-job-item-not-listed-detail"
    );

  const editJobWorkOrderNumber =
    document.getElementById(
      "edit-job-work-order-number"
    );
  const editJobWorkOrderType =
    document.getElementById(
      "edit-job-work-order-type"
    );
  const editJobJobType =
    document.getElementById(
      "edit-job-job-type"
    );
  const editJobComments =
    document.getElementById(
      "edit-job-comments"
    );
  const editJobCorrectionReason =
    document.getElementById(
      "edit-job-correction-reason"
    );
  const editJobSaveButton =
    document.getElementById(
      "edit-job-save-button"
    );

    let currentSession = null;
  let elapsedTimer = null;
  let activeJobStartedAt = null;
  let currentActiveJob = null;

  let taskActionOptionsData = null;
  let currentTaskAction = null;

  let startTaskOptionsData = null;
    let selectedTaskType = null;
  let selectedItem = null;
  let itemSearchTimer = null;

  let selectedEditItem = null;
  let editItemSearchTimer = null;

    let memoCreationOptionsData = null;
  let currentMemos = [];

  let employeeAdminOptionsData = null;
  let currentAdminEmployees = [];
  let employeeAdminSearchTimer = null;

  let dropdownAdminConfigurationData = null;
  let currentDropdownRecords = [];
  let dropdownAdminSearchTimer = null;

  function setLoginLoading(isLoading) {
    loginButton.disabled = isLoading;
    employeeSelect.disabled = isLoading;
    pinInput.disabled = isLoading;
    loginLoading.hidden = !isLoading;

    loginButton.textContent = isLoading
      ? "Signing in..."
      : "Sign in to Task Tracker";
  }

  function showLoginMessage(message, type = "error") {
    loginMessage.textContent = message;
    loginMessage.className = `login-message ${type}`;
    loginMessage.hidden = !message;
  }

  function clearLoginMessage() {
    loginMessage.textContent = "";
    loginMessage.hidden = true;
  }

  function showStartTaskMessage(
    message,
    type = "error"
  ) {
    startTaskMessage.textContent = message;
    startTaskMessage.className =
      `login-message ${type}`;
    startTaskMessage.hidden = !message;
  }

  function clearStartTaskMessage() {
    startTaskMessage.textContent = "";
    startTaskMessage.hidden = true;
  }
  function showTaskActionMessage(message) {
    taskActionMessage.textContent = message;
    taskActionMessage.hidden = !message;
  }

    function clearTaskActionMessage() {
    taskActionMessage.textContent = "";
    taskActionMessage.hidden = true;
  }

    function clearEditJobMessage() {
    editJobMessage.textContent = "";
    editJobMessage.hidden = true;
  }

  function showEditJobMessage(message) {
    editJobMessage.textContent = message;
    editJobMessage.hidden = !message;
  }

  function populateEditTaskTypes(taskTypes) {
    editJobTaskType.innerHTML = `
      <option value="">
        Select a task type
      </option>
    `;

    taskTypes.forEach((taskType) => {
      const option =
        document.createElement("option");

      option.value = taskType.task_type_id;
      option.textContent =
        taskType.task_type_name;
      option.dataset.taskTypeName =
        taskType.task_type_name;

      editJobTaskType.appendChild(option);
    });
  }

  function populateEditNonProductiveTasks(tasks) {
    editJobNonProductiveTask.innerHTML = `
      <option value="">
        Select a non-productive task
      </option>
    `;

    tasks.forEach((task) => {
      const option =
        document.createElement("option");

      option.value =
        task.non_productive_task_id;
      option.textContent =
        task.task_name;

      editJobNonProductiveTask.appendChild(
        option
      );
    });
  }

  function renderEditSelectedItem(item) {
    selectedEditItem = item || null;

    if (!selectedEditItem) {
      editJobSelectedItem.innerHTML = "";
      editJobSelectedItem.hidden = true;
      editJobItemNotListedField.hidden = true;
      editJobItemNotListedDetail.value = "";

      return;
    }

    editJobSelectedItem.innerHTML = `
      <div class="selected-item-header">
        <div>
          <strong>
            ${escapeHtml(
              selectedEditItem.item_name || ""
            )}
          </strong>

          <div class="selected-item-meta">
            ${escapeHtml(
              selectedEditItem.internal_id || ""
            )}
          </div>
        </div>

        <button
          id="clear-edit-selected-item"
          class="clear-selected-item"
          type="button"
        >
          Change
        </button>
      </div>
    `;

    editJobSelectedItem.hidden = false;

    const placeholderItemId =
      startTaskOptionsData
        ?.placeholder_item
        ?.item_id;

    editJobItemNotListedField.hidden =
      selectedEditItem.item_id !==
      placeholderItemId;

    const clearButton =
      document.getElementById(
        "clear-edit-selected-item"
      );

    clearButton.addEventListener(
      "click",
      () => {
        renderEditSelectedItem(null);
        editJobItemSearch.focus();
      }
    );
  }

  function updateEditJobFieldVisibility() {
    const selectedOption =
      editJobTaskType.selectedOptions[0];

    const taskTypeName =
      selectedOption?.dataset.taskTypeName ||
      "";

    const isProductive =
      taskTypeName === "Productive";

    const isNonProductive =
      taskTypeName === "Non-Productive";

    editJobProductiveFields.hidden =
      !isProductive;

    editJobNonProductiveFields.hidden =
      !isNonProductive;
  }

  function populateEditJobForm(activeJob) {
    populateEditTaskTypes(
      startTaskOptionsData?.task_types || []
    );

    populateEditNonProductiveTasks(
      startTaskOptionsData
        ?.non_productive_tasks || []
    );

    editJobTaskType.value =
      activeJob.task_type_id || "";

    editJobNonProductiveTask.value =
      activeJob.non_productive_task_id || "";

    editJobWorkOrderNumber.value =
      activeJob.work_order_number || "";

    editJobWorkOrderType.value =
      activeJob.work_order_type || "";

    editJobJobType.value =
      activeJob.job_type || "";

    editJobComments.value =
      activeJob.comments || "";

    editJobCorrectionReason.value = "";

    editJobItemSearch.value = "";
    editJobItemResults.innerHTML = "";
    editJobItemResults.hidden = true;

    if (activeJob.item_id) {
      renderEditSelectedItem({
        item_id: activeJob.item_id,
        item_name: activeJob.item_name,
        internal_id: activeJob.internal_id
      });

      editJobItemNotListedDetail.value =
        activeJob.item_not_listed_detail || "";
    } else {
      renderEditSelectedItem(null);
    }

    updateEditJobFieldVisibility();
  }

    function closeEditJobModal() {
    editJobForm.reset();
    clearEditJobMessage();

    selectedEditItem = null;

    editJobItemResults.innerHTML = "";
    editJobItemResults.hidden = true;

    editJobSelectedItem.innerHTML = "";
    editJobSelectedItem.hidden = true;

    editJobItemNotListedField.hidden = true;

    delete editJobModalBackdrop.dataset.jobId;

    editJobSaveButton.disabled = false;
    editJobSaveButton.textContent =
      "Save Changes";

    editJobModalBackdrop.hidden = true;
  }

    async function openEditJobModal() {
    if (!currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "There is no active job to edit.";

      return;
    }

    const role =
      currentSession?.employee?.role || "";

    if (
      ![
        "Supervisor",
        "Manager",
        "Administrator"
      ].includes(role)
    ) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "You do not have permission to edit job details.";

      return;
    }

    editJobForm.reset();
    clearEditJobMessage();

    editJobModalBackdrop.dataset.jobId =
      currentActiveJob.job_id;

    editJobModalTitle.textContent =
      `Edit Active Job #${currentActiveJob.job_number}`;

    editJobSaveButton.disabled = true;
    editJobSaveButton.textContent =
      "Loading Job...";

    editJobModalBackdrop.hidden = false;

    try {
      await loadStartTaskOptions();

      populateEditJobForm(
        currentActiveJob
      );

      editJobSaveButton.disabled = false;
      editJobSaveButton.textContent =
        "Save Changes";
    } catch (error) {
      showEditJobMessage(
        error.message ||
        "The active job details could not be loaded."
      );
    }
  }

    function closeTaskActionModal() {
    currentTaskAction = null;

    delete taskActionModalBackdrop.dataset.jobId;

    taskActionForm.reset();
    clearTaskActionMessage();

    taskActionReasonField.hidden = false;
    taskActionQuantityField.hidden = true;

    taskActionCommentRequiredNote.hidden = true;
    taskActionCommentsRequiredMarker.hidden = true;

    taskActionConfirmButton.disabled = false;
    taskActionConfirmButton.textContent = "Confirm";

    taskActionComments.placeholder =
      "Add relevant details or context";

    taskActionModalBackdrop.hidden = true;
  }

  function updateTaskActionCommentRequirement() {
    const selectedOption =
      taskActionReasonSelect.selectedOptions[0];

    const commentsRequired =
      selectedOption?.dataset.requiresComment ===
      "true";

    taskActionCommentRequiredNote.hidden =
      !commentsRequired;

    taskActionCommentsRequiredMarker.hidden =
      !commentsRequired;
  }

  function populateTaskActionReasons(reasons) {
    taskActionReasonSelect.innerHTML = `
      <option value="">
        Select a reason
      </option>
    `;

    reasons.forEach((reason) => {
      const option =
        document.createElement("option");

      option.value = reason.stop_reason_id;
      option.textContent = reason.reason_name;
      option.dataset.requiresComment =
        String(reason.requires_comment);

      taskActionReasonSelect.appendChild(option);
    });
  }

  async function loadTaskActionOptions() {
    if (!currentSession) {
      return;
    }

    if (taskActionOptionsData) {
      return;
    }

    taskActionOptionsData =
      await auth.getTaskActionOptions(
        currentSession.sessionToken
      );
  }

  async function openPauseModal() {
    if (!currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "There is no active task to pause.";

      return;
    }

    currentTaskAction = "pause";

    taskActionModalEyebrow.textContent =
      "Pause Task";
    taskActionModalTitle.textContent =
      `Pause Job #${currentActiveJob.job_number}`;
    taskActionModalDescription.textContent =
      "Select why you are pausing this task. You can resume it later.";

    taskActionReasonField.hidden = false;
    taskActionQuantityField.hidden = true;

    taskActionReasonSelect.innerHTML = `
      <option value="">
        Loading Pause reasons...
      </option>
    `;

    taskActionComments.value = "";
    clearTaskActionMessage();

    taskActionModalBackdrop.hidden = false;

    try {
      await loadTaskActionOptions();

      populateTaskActionReasons(
        taskActionOptionsData?.pause_reasons || []
      );

      updateTaskActionCommentRequirement();
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The Pause reasons could not be loaded."
      );
    }
  }

    async function submitPauseTask() {
    if (!currentActiveJob) {
      showTaskActionMessage(
        "There is no active task to pause."
      );

      return;
    }

    const stopReasonId =
      taskActionReasonSelect.value;

    if (!stopReasonId) {
      showTaskActionMessage(
        "Select a reason for pausing the task."
      );

      return;
    }

    const selectedOption =
      taskActionReasonSelect.selectedOptions[0];

    const comments =
      taskActionComments.value.trim();

    if (
      selectedOption?.dataset.requiresComment ===
        "true" &&
      !comments
    ) {
      showTaskActionMessage(
        "Comments are required for this reason."
      );

      return;
    }

    taskActionConfirmButton.disabled = true;
    taskActionConfirmButton.textContent =
      "Pausing Task...";

    clearTaskActionMessage();

    try {
      const state = await auth.pauseMyTask(
        currentSession.sessionToken,
        currentActiveJob.job_id,
        stopReasonId,
        comments || null
      );

      closeTaskActionModal();

      renderActiveJob(state?.active_job || null);

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The task was paused successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The task could not be paused."
      );

      taskActionConfirmButton.disabled = false;
      taskActionConfirmButton.textContent =
        "Pause Task";
    }
  }

  async function openBlockModal() {
    if (!currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "There is no active task to block.";

      return;
    }

    currentTaskAction = "block";

    taskActionModalEyebrow.textContent =
      "Block Task";

    taskActionModalTitle.textContent =
      `Block Job #${currentActiveJob.job_number}`;

    taskActionModalDescription.textContent =
      "Select the issue preventing this task from continuing.";

    taskActionReasonField.hidden = false;
    taskActionQuantityField.hidden = true;

    taskActionReasonSelect.innerHTML = `
      <option value="">
        Loading Block reasons...
      </option>
    `;

    taskActionComments.value = "";
    taskActionComments.placeholder =
      "Describe the blocker and any important details";

    taskActionConfirmButton.textContent =
      "Block Task";

    clearTaskActionMessage();

    taskActionModalBackdrop.hidden = false;

    try {
      await loadTaskActionOptions();

      populateTaskActionReasons(
        taskActionOptionsData?.block_reasons || []
      );

      updateTaskActionCommentRequirement();
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The Block reasons could not be loaded."
      );
    }
  }

  async function submitBlockTask() {
    if (!currentActiveJob) {
      showTaskActionMessage(
        "There is no active task to block."
      );

      return;
    }

    const stopReasonId =
      taskActionReasonSelect.value;

    if (!stopReasonId) {
      showTaskActionMessage(
        "Select a reason for blocking the task."
      );

      return;
    }

    const selectedOption =
      taskActionReasonSelect.selectedOptions[0];

    const comments =
      taskActionComments.value.trim();

    if (
      selectedOption?.dataset.requiresComment ===
        "true" &&
      !comments
    ) {
      showTaskActionMessage(
        "Comments are required for this blocker."
      );

      return;
    }

    taskActionConfirmButton.disabled = true;
    taskActionConfirmButton.textContent =
      "Blocking Task...";

    clearTaskActionMessage();

    try {
      const state = await auth.blockMyTask(
        currentSession.sessionToken,
        currentActiveJob.job_id,
        stopReasonId,
        comments || null
      );

      closeTaskActionModal();

      renderActiveJob(
        state?.active_job || null
      );

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The task was blocked successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The task could not be blocked."
      );

            taskActionConfirmButton.disabled = false;
      taskActionConfirmButton.textContent =
        "Block Task";
    }
  }

  async function openReturnModal() {
    if (!currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "There is no active task to return.";

      return;
    }

    currentTaskAction = "return";

    taskActionModalEyebrow.textContent =
      "Return Task";

    taskActionModalTitle.textContent =
      `Return Job #${currentActiveJob.job_number}`;

    taskActionModalDescription.textContent =
      "Return this task for reassignment. It will no longer remain in your active or unfinished work.";

    taskActionReasonField.hidden = false;
    taskActionQuantityField.hidden = true;

    taskActionReasonSelect.innerHTML = `
      <option value="">
        Loading Return reasons...
      </option>
    `;

    taskActionComments.value = "";
    taskActionComments.placeholder =
      "Optional details about why this task is being returned";

    taskActionConfirmButton.textContent =
      "Return Task";

    clearTaskActionMessage();

    taskActionModalBackdrop.hidden = false;

    try {
      await loadTaskActionOptions();

      populateTaskActionReasons(
        taskActionOptionsData?.return_reasons || []
      );

      updateTaskActionCommentRequirement();
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The Return reasons could not be loaded."
      );
    }
  }

  async function submitReturnTask() {
    if (!currentActiveJob) {
      showTaskActionMessage(
        "There is no active task to return."
      );

      return;
    }

    const stopReasonId =
      taskActionReasonSelect.value;

    if (!stopReasonId) {
      showTaskActionMessage(
        "Select a reason for returning the task."
      );

      return;
    }

    const selectedOption =
      taskActionReasonSelect.selectedOptions[0];

    const comments =
      taskActionComments.value.trim();

    if (
      selectedOption?.dataset.requiresComment ===
        "true" &&
      !comments
    ) {
      showTaskActionMessage(
        "Comments are required for this reason."
      );

      return;
    }

    taskActionConfirmButton.disabled = true;
    taskActionConfirmButton.textContent =
      "Returning Task...";

    clearTaskActionMessage();

    try {
      const state = await auth.returnMyTask(
        currentSession.sessionToken,
        currentActiveJob.job_id,
        stopReasonId,
        comments || null
      );

      closeTaskActionModal();

      renderActiveJob(
        state?.active_job || null
      );

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The task was returned successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The task could not be returned."
      );

            taskActionConfirmButton.disabled = false;
      taskActionConfirmButton.textContent =
        "Return Task";
    }
  }

  function openCompleteModal() {
    if (!currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "There is no active task to complete.";

      return;
    }

    const isProductive =
      currentActiveJob.task_type_name ===
      "Productive";

    currentTaskAction = "complete";

    taskActionModalEyebrow.textContent =
      "Complete Task";

    taskActionModalTitle.textContent =
      `Complete Job #${currentActiveJob.job_number}`;

    taskActionModalDescription.textContent =
      isProductive
        ? "Enter the completed quantity. This job will move to Ready for QA."
        : "Confirm completion of this non-productive task.";

    taskActionReasonField.hidden = true;
    taskActionQuantityField.hidden =
      !isProductive;

    taskActionCommentRequiredNote.hidden = true;
    taskActionCommentsRequiredMarker.hidden = true;

    taskActionCompletedQuantity.value = "";

    taskActionComments.value = "";
    taskActionComments.placeholder =
      "Optional completion notes or details";

    taskActionConfirmButton.textContent =
      "Complete Task";

    clearTaskActionMessage();

    taskActionModalBackdrop.hidden = false;
  }

  async function submitCompleteTask() {
    if (!currentActiveJob) {
      showTaskActionMessage(
        "There is no active task to complete."
      );

      return;
    }

    const isProductive =
      currentActiveJob.task_type_name ===
      "Productive";

    let completedQuantity = null;

    if (isProductive) {
      completedQuantity =
        Number(taskActionCompletedQuantity.value);

      if (
        !Number.isFinite(completedQuantity) ||
        completedQuantity <= 0
      ) {
        showTaskActionMessage(
          "Enter a completed quantity greater than zero."
        );

        return;
      }
    }

    const comments =
      taskActionComments.value.trim();

    taskActionConfirmButton.disabled = true;
    taskActionConfirmButton.textContent =
      "Completing Task...";

    clearTaskActionMessage();

    try {
      const state = await auth.completeMyTask(
        currentSession.sessionToken,
        currentActiveJob.job_id,
        completedQuantity,
        comments || null
      );

      closeTaskActionModal();

      renderActiveJob(
        state?.active_job || null
      );

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        isProductive
          ? "The task was completed and sent to Ready for QA."
          : "The task was completed successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The task could not be completed."
      );

      taskActionConfirmButton.disabled = false;
      taskActionConfirmButton.textContent =
        "Complete Task";
    }
  }

  function openResumeModal(job) {
    if (!job?.job_id) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The selected job could not be resumed.";

      return;
    }

    if (currentActiveJob) {
      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "You already have a job in progress. Pause or complete it before resuming another job.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);

      return;
    }

    currentTaskAction = "resume";

    taskActionModalBackdrop.dataset.jobId =
      job.job_id;

    taskActionModalEyebrow.textContent =
      "Resume Task";

    taskActionModalTitle.textContent =
      `Resume Job #${job.job_number}`;

    taskActionModalDescription.textContent =
      "Resume this paused or blocked task and begin a new working session.";

    taskActionReasonField.hidden = true;
    taskActionQuantityField.hidden = true;

    taskActionCommentRequiredNote.hidden = true;
    taskActionCommentsRequiredMarker.hidden = true;

    taskActionComments.value = "";
    taskActionComments.placeholder =
      "Optional details about resuming this task";

    taskActionConfirmButton.textContent =
      "Resume Task";

    clearTaskActionMessage();

    taskActionModalBackdrop.hidden = false;
  }

  async function submitResumeTask() {
    const jobId =
      taskActionModalBackdrop.dataset.jobId;

    if (!jobId) {
      showTaskActionMessage(
        "The selected job could not be identified."
      );

      return;
    }

    if (currentActiveJob) {
      showTaskActionMessage(
        "You already have a job in progress."
      );

      return;
    }

    const comments =
      taskActionComments.value.trim();

    taskActionConfirmButton.disabled = true;
    taskActionConfirmButton.textContent =
      "Resuming Task...";

    clearTaskActionMessage();

    try {
      const state = await auth.resumeMyTask(
        currentSession.sessionToken,
        jobId,
        comments || null
      );

      closeTaskActionModal();

      renderActiveJob(
        state?.active_job || null
      );

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The task was resumed successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showTaskActionMessage(
        error.message ||
        "The task could not be resumed."
      );

      taskActionConfirmButton.disabled = false;
      taskActionConfirmButton.textContent =
        "Resume Task";
    }
  }

  function getInitials(employeeName) {
    return String(employeeName || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "TT";
  }

  function setVisible(element, isVisible) {
    element.hidden = !isVisible;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

    function configureNavigation(permissionContext) {
    const role = permissionContext.employee_role;

    setVisible(employeeNav, true);

    setVisible(
      supervisorNav,
      ["Supervisor", "Manager", "Administrator"]
        .includes(role)
    );

    setVisible(
      managerNav,
      ["Manager", "Administrator"].includes(role)
    );

    const canManageEmployees =
      Boolean(
        permissionContext.can_manage_employees
      );

    const canManageDropdowns =
      Boolean(
        permissionContext.can_manage_dropdowns
      );

    setVisible(
      administratorNav,
      canManageEmployees || canManageDropdowns
    );

    setVisible(
      employeeAdminNavButton,
      canManageEmployees
    );

    setVisible(
      dropdownAdminNavButton,
      canManageDropdowns
    );
  }

      function showApplicationPage(pageName) {
    const showDashboard =
      pageName === "dashboard";
    const showStartTask =
      pageName === "start-task";
    const showMyMemos =
      pageName === "my-memos";
    const showCreateMemo =
      pageName === "create-memo";
    const showEmployeeAdmin =
      pageName === "employee-admin";
    const showDropdownAdmin =
      pageName === "dropdown-admin";

    dashboardPage.hidden = !showDashboard;
    startTaskPage.hidden = !showStartTask;
    myMemosPage.hidden = !showMyMemos;
    createMemoPage.hidden = !showCreateMemo;
    employeeAdminPage.hidden =
      !showEmployeeAdmin;
    dropdownAdminPage.hidden =
      !showDropdownAdmin;

    dashboardNavButton.classList.toggle(
      "active",
      showDashboard
    );

    startTaskNavButton.classList.toggle(
      "active",
      showStartTask
    );

    myMemosNavButton.classList.toggle(
      "active",
      showMyMemos
    );

    createMemoNavButton.classList.toggle(
      "active",
      showCreateMemo
    );

    employeeAdminNavButton.classList.toggle(
      "active",
      showEmployeeAdmin
    );

    dropdownAdminNavButton.classList.toggle(
      "active",
      showDropdownAdmin
    );
  }

  function formatDateTime(value) {
    if (!value) {
      return "Not available";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(
      0,
      Number(totalSeconds) || 0
    );

    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor(
      (safeSeconds % 3600) / 60
    );
    const seconds = Math.floor(safeSeconds % 60);

    if (hours > 0) {
      return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
      ].join(":");
    }

    return [
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0")
    ].join(":");
  }

  function stopElapsedTimer() {
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }

    activeJobStartedAt = null;
  }

  function startElapsedTimer(startedAt) {
    stopElapsedTimer();

    const startDate = new Date(startedAt);

    if (Number.isNaN(startDate.getTime())) {
      return;
    }

    activeJobStartedAt = startDate;

    const updateTimer = () => {
      const timerElement =
        document.getElementById("active-task-timer");

      if (!timerElement || !activeJobStartedAt) {
        return;
      }

      const seconds = Math.floor(
        (Date.now() - activeJobStartedAt.getTime()) / 1000
      );

      timerElement.textContent =
        formatDuration(seconds);
    };

    updateTimer();

    elapsedTimer = window.setInterval(
      updateTimer,
      1000
    );
  }

  function getTaskDisplayName(job) {
    if (job?.task_type_name === "Non-Productive") {
      return (
        job.non_productive_task_name ||
        job.job_type ||
        "Non-Productive Task"
      );
    }

    return (
      job?.item_name ||
      job?.item_not_listed_detail ||
      job?.job_type ||
      "Productive Task"
    );
  }

  function getJobReference(job) {
    const parts = [];

    if (job?.work_order_number) {
      parts.push(`WO ${job.work_order_number}`);
    }

    if (job?.work_order_type) {
      parts.push(job.work_order_type);
    }

    if (job?.internal_id) {
      parts.push(job.internal_id);
    }

    return parts.join(" · ");
  }

    function renderActiveJob(activeJob) {
    stopElapsedTimer();

    currentActiveJob = activeJob || null;

    if (!activeJob) {
      currentTaskContent.innerHTML = `
        <div class="task-empty-state">
          <div class="task-empty-icon">✓</div>

          <div>
            <h3>No task currently running</h3>

            <p>
              You are available to start a new productive or
              non-productive task.
            </p>
          </div>
        </div>
      `;

      return;
    }

    const taskName =
      escapeHtml(getTaskDisplayName(activeJob));
    const reference =
      escapeHtml(getJobReference(activeJob));
    const comments =
      escapeHtml(activeJob.comments || "");

    currentTaskContent.innerHTML = `
      <div class="active-task-layout">

        <div class="active-task-primary">

          <div class="task-status-row">
            <span class="status-pill status-active">
              In Progress
            </span>

            <span class="task-number">
              Job #${escapeHtml(activeJob.job_number)}
            </span>
          </div>

          <h3 class="active-task-title">
            ${taskName}
          </h3>

          ${
            reference
              ? `
                <div class="active-task-reference">
                  ${reference}
                </div>
              `
              : ""
          }

          <div class="task-detail-grid">

            <div class="task-detail">
              <span class="task-detail-label">
                Task Type
              </span>

              <strong>
                ${escapeHtml(activeJob.task_type_name)}
              </strong>
            </div>

            <div class="task-detail">
              <span class="task-detail-label">
                Job Type
              </span>

              <strong>
                ${escapeHtml(
                  activeJob.job_type || "Not specified"
                )}
              </strong>
            </div>

            <div class="task-detail">
              <span class="task-detail-label">
                Started
              </span>

              <strong>
                ${escapeHtml(
                  formatDateTime(
                    activeJob.session_started_at
                  )
                )}
              </strong>
            </div>

            <div class="task-detail">
              <span class="task-detail-label">
                Current Status
              </span>

              <strong>
                ${escapeHtml(activeJob.job_status)}
              </strong>
            </div>

          </div>

          ${
            comments
              ? `
                <div class="task-comments">
                  <span class="task-detail-label">
                    Comments
                  </span>

                  <p>${comments}</p>
                </div>
              `
              : ""
          }

        </div>

        <div class="active-task-timer-panel">
          <span class="timer-label">
            Current session
          </span>

          <strong
            id="active-task-timer"
            class="active-task-timer"
          >
            ${formatDuration(activeJob.elapsed_seconds)}
          </strong>

          <span class="timer-note">
            Live elapsed time
          </span>
        </div>

      </div>

            <div class="task-action-row">
        ${
          [
            "Supervisor",
            "Manager",
            "Administrator"
          ].includes(
            currentSession?.employee?.role || ""
          )
            ? `
              <button
                id="edit-task-button"
                class="task-action secondary"
                type="button"
              >
                Edit Task
              </button>
            `
            : ""
        }

        <button
          id="pause-task-button"
          class="task-action secondary"
          type="button"
        >
          Pause
        </button>

        <button
          id="block-task-button"
          class="task-action warning"
          type="button"
        >
          Block
        </button>

        <button
          id="return-task-button"
          class="task-action secondary"
          type="button"
        >
          Return
        </button>

        <button
          id="complete-task-button"
          class="task-action primary"
          type="button"
        >
          Complete
        </button>
      </div>

             
    `;

        const pauseTaskButton =
      document.getElementById("pause-task-button");

        const blockTaskButton =
      document.getElementById("block-task-button");

        const returnTaskButton =
      document.getElementById("return-task-button");

        const completeTaskButton =
      document.getElementById("complete-task-button");

    const editTaskButton =
      document.getElementById("edit-task-button");

    if (editTaskButton) {
      editTaskButton.addEventListener(
        "click",
        openEditJobModal
      );
    }

    pauseTaskButton.addEventListener(
      "click",
      openPauseModal
    );

    blockTaskButton.addEventListener(
      "click",
      openBlockModal
    );

    returnTaskButton.addEventListener(
      "click",
      openReturnModal
    );

    completeTaskButton.addEventListener(
      "click",
      openCompleteModal
    );

    startElapsedTimer(activeJob.session_started_at);
  }

    function renderUnfinishedJobs(unfinishedJobs) {
    const jobs = Array.isArray(unfinishedJobs)
      ? unfinishedJobs
      : [];

    if (jobs.length === 0) {
      unfinishedJobsContent.innerHTML = `
        <div class="compact-empty-state">
          No paused or blocked jobs are waiting to be resumed.
        </div>
      `;

      return;
    }

    unfinishedJobsContent.innerHTML = jobs
      .map((job) => {
        const statusClass =
          job.job_status === "Blocked"
            ? "status-blocked"
            : "status-paused";

        return `
          <article class="unfinished-job">

            <div class="unfinished-job-main">

              <div class="task-status-row">
                <span class="status-pill ${statusClass}">
                  ${escapeHtml(job.job_status)}
                </span>

                <span class="task-number">
                  Job #${escapeHtml(job.job_number)}
                </span>
              </div>

              <h3>
                ${escapeHtml(getTaskDisplayName(job))}
              </h3>

              <p>
                ${escapeHtml(
                  getJobReference(job) ||
                  job.stop_reason ||
                  "No additional reference"
                )}
              </p>

              ${
                job.stop_reason
                  ? `
                    <div class="stop-reason">
                      ${escapeHtml(job.stop_reason)}
                    </div>
                  `
                  : ""
              }

            </div>

            <div class="unfinished-job-side">
              <span>Updated</span>

              <strong>
                ${escapeHtml(
                  formatDateTime(job.last_updated_at)
                )}
              </strong>

              <button
                class="resume-preview-button resume-task-button"
                type="button"
                data-job-id="${escapeHtml(job.job_id)}"
              >
                Resume
              </button>
            </div>

          </article>
        `;
      })
      .join("");

    unfinishedJobsContent
      .querySelectorAll(".resume-task-button")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const selectedJob = jobs.find(
              (job) =>
                String(job.job_id) ===
                String(button.dataset.jobId)
            );

            openResumeModal(selectedJob);
          }
        );
      });
  }

  async function loadTaskState() {
    if (!currentSession) {
      return;
    }

    dashboardRefreshButton.disabled = true;
    dashboardRefreshButton.textContent = "Refreshing...";

    taskStateMessage.hidden = false;
    taskStateMessage.textContent =
      "Loading current task status...";

    try {
      const state = await auth.getMyTaskState(
        currentSession.sessionToken
      );

      renderActiveJob(state?.active_job || null);
      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = true;
    } catch (error) {
      stopElapsedTimer();

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        error.message ||
        "The current task status could not be loaded.";
    } finally {
      dashboardRefreshButton.disabled = false;
      dashboardRefreshButton.textContent = "Refresh";
    }
  }

  function renderTaskTypeOptions(taskTypes) {
    taskTypeOptions.innerHTML = "";

    taskTypes.forEach((taskType) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "task-type-option";
      button.dataset.taskTypeId =
        taskType.task_type_id;
      button.dataset.taskTypeName =
        taskType.task_type_name;

      const description =
        taskType.task_type_name === "Productive"
          ? "Work tied to an item, work order, or production activity."
          : "Meetings, training, cleaning, inventory support, and other indirect work.";

      button.innerHTML = `
        <span class="task-type-option-title">
          ${escapeHtml(taskType.task_type_name)}
        </span>

        <span class="task-type-option-description">
          ${escapeHtml(description)}
        </span>
      `;

      button.addEventListener("click", () => {
        selectTaskType(taskType);
      });

      taskTypeOptions.appendChild(button);
    });
  }

  function populateNonProductiveTasks(tasks) {
    nonProductiveTaskSelect.innerHTML = `
      <option value="">
        Select a non-productive task
      </option>
    `;

    tasks.forEach((task) => {
      const option = document.createElement("option");

      option.value =
        task.non_productive_task_id;
      option.textContent = task.task_name;
      option.dataset.requiresComment =
        String(task.requires_comment);

      nonProductiveTaskSelect.appendChild(option);
    });
  }

  async function loadStartTaskOptions() {
    if (!currentSession) {
      return;
    }

    if (startTaskOptionsData) {
      return;
    }

    taskTypeOptions.innerHTML =
      `<div class="compact-empty-state">
        Loading task options...
      </div>`;

    startTaskOptionsData =
      await auth.getStartTaskOptions(
        currentSession.sessionToken
      );

    renderTaskTypeOptions(
      startTaskOptionsData.task_types || []
    );

    populateNonProductiveTasks(
      startTaskOptionsData.non_productive_tasks || []
    );
  }

  function selectTaskType(taskType) {
    selectedTaskType = taskType;

    document
      .querySelectorAll(".task-type-option")
      .forEach((button) => {
        button.classList.toggle(
          "selected",
          button.dataset.taskTypeId ===
            taskType.task_type_id
        );
      });

    const isProductive =
      taskType.task_type_name === "Productive";

    productiveTaskSection.hidden = !isProductive;
    nonProductiveTaskSection.hidden = isProductive;
    commentsSection.hidden = false;

    clearStartTaskMessage();
    updateCommentRequirement();
  }

  function updateCommentRequirement() {
    let commentsRequired = false;

    if (
      selectedTaskType?.task_type_name ===
      "Non-Productive"
    ) {
      const selectedOption =
        nonProductiveTaskSelect.selectedOptions[0];

      commentsRequired =
        selectedOption?.dataset.requiresComment ===
        "true";
    }

    commentsRequiredMarker.hidden =
      !commentsRequired;

    commentRequiredNote.hidden =
      !commentsRequired;
  }

  function clearSelectedItem() {
    selectedItem = null;
    selectedItemDisplay.hidden = true;
    selectedItemDisplay.innerHTML = "";
    itemNotListedField.hidden = true;
    itemNotListedDetail.value = "";
  }

    async function submitEditJob() {
    if (!currentActiveJob) {
      showEditJobMessage(
        "There is no active job to edit."
      );

      return;
    }

    const jobId =
      editJobModalBackdrop.dataset.jobId;

    if (
      !jobId ||
      jobId !== currentActiveJob.job_id
    ) {
      showEditJobMessage(
        "The active job changed. Close the editor and try again."
      );

      return;
    }

    const selectedTaskTypeOption =
      editJobTaskType.selectedOptions[0];

    const taskTypeId =
      editJobTaskType.value;

    const taskTypeName =
      selectedTaskTypeOption
        ?.dataset.taskTypeName || "";

    const correctionReason =
      editJobCorrectionReason.value.trim();

    if (!taskTypeId) {
      showEditJobMessage(
        "Select a task type."
      );

      return;
    }

    if (!correctionReason) {
      showEditJobMessage(
        "A correction reason is required."
      );

      return;
    }

    const isProductive =
      taskTypeName === "Productive";

    const isNonProductive =
      taskTypeName === "Non-Productive";

    if (!isProductive && !isNonProductive) {
      showEditJobMessage(
        "Select a supported task type."
      );

      return;
    }

    let itemId = null;
    let itemNotListedDetail = null;
    let nonProductiveTaskId = null;
    let workOrderNumber = null;
    let workOrderTypeValue = null;
    let jobType = null;

    if (isProductive) {
      if (!selectedEditItem?.item_id) {
        showEditJobMessage(
          "Select an item for the Productive job."
        );

        return;
      }

      itemId =
        selectedEditItem.item_id;

      const placeholderItemId =
        startTaskOptionsData
          ?.placeholder_item
          ?.item_id;

      if (itemId === placeholderItemId) {
        itemNotListedDetail =
          editJobItemNotListedDetail
            .value
            .trim();

        if (!itemNotListedDetail) {
          showEditJobMessage(
            "Enter an Item Description when Item Not Listed is selected."
          );

          return;
        }
      }

      workOrderNumber =
        editJobWorkOrderNumber.value.trim();

      workOrderTypeValue =
        editJobWorkOrderType.value.trim();

      jobType =
        editJobJobType.value.trim();

      if (!workOrderNumber) {
        showEditJobMessage(
          "Enter a Work Order Number."
        );

        return;
      }

      if (!workOrderTypeValue) {
        showEditJobMessage(
          "Enter a Work Order Type."
        );

        return;
      }

      if (!jobType) {
        showEditJobMessage(
          "Enter a Job Type."
        );

        return;
      }
    }

    if (isNonProductive) {
      nonProductiveTaskId =
        editJobNonProductiveTask.value;

      if (!nonProductiveTaskId) {
        showEditJobMessage(
          "Select a Non-Productive Task."
        );

        return;
      }
    }

    clearEditJobMessage();

    editJobSaveButton.disabled = true;
    editJobSaveButton.textContent =
      "Saving Changes...";

    try {
      const state =
        await auth.editPermittedActiveJob(
          currentSession.sessionToken,
          jobId,
          {
            correctionReason,
            taskTypeId,
            itemId,
            itemNotListedDetail,
            nonProductiveTaskId,
            workOrderNumber,
            workOrderType:
              workOrderTypeValue,
            jobType,
            comments:
              editJobComments.value.trim()
          }
        );

      closeEditJobModal();

      renderActiveJob(
        state?.active_job || null
      );

      renderUnfinishedJobs(
        state?.unfinished_jobs || []
      );

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        "The active job details were updated successfully.";

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showEditJobMessage(
        error.message ||
        "The active job details could not be updated."
      );

      editJobSaveButton.disabled = false;
      editJobSaveButton.textContent =
        "Save Changes";
    }
  }

    function renderEditItemSearchResults(items) {
    editJobItemResults.innerHTML = "";

    if (!items.length) {
      editJobItemResults.innerHTML = `
        <div class="item-search-empty">
          No matching items were found.
        </div>
      `;

      editJobItemResults.hidden = false;
      return;
    }

    items.forEach((item) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "item-search-result";

      button.innerHTML = `
        <strong>
          ${escapeHtml(item.item_name || "")}
        </strong>

        <span>
          ${escapeHtml(item.internal_id || "")}
        </span>
      `;

      button.addEventListener(
        "click",
        () => {
          renderEditSelectedItem(item);

          editJobItemSearch.value = "";
          editJobItemResults.innerHTML = "";
          editJobItemResults.hidden = true;
        }
      );

      editJobItemResults.appendChild(button);
    });

    editJobItemResults.hidden = false;
  }

  async function searchEditJobItems() {
    const searchText =
      editJobItemSearch.value.trim();

    if (searchText.length < 2) {
      editJobItemResults.innerHTML = "";
      editJobItemResults.hidden = true;
      return;
    }

    try {
      const items =
        await auth.searchStartTaskItems(
          currentSession.sessionToken,
          searchText,
          25
        );

      renderEditItemSearchResults(items);
    } catch (error) {
      showEditJobMessage(
        error.message ||
        "The item search could not be completed."
      );
    }
  }

  function selectItem(item) {
    selectedItem = item;

    itemSearchInput.value = "";
    itemSearchResults.hidden = true;
    itemSearchResults.innerHTML = "";

    selectedItemDisplay.innerHTML = `
      <div class="selected-item-header">
        <strong>
          ${escapeHtml(item.item_name)}
        </strong>

        <button
          class="clear-selected-item"
          type="button"
        >
          Change
        </button>
      </div>

      <div class="selected-item-meta">
        ${escapeHtml(item.internal_id)}
        ${
          item.sku_group
            ? ` · ${escapeHtml(item.sku_group)}`
            : ""
        }
      </div>
    `;

    selectedItemDisplay.hidden = false;
    itemNotListedField.hidden =
      !item.is_placeholder;

    selectedItemDisplay
      .querySelector(".clear-selected-item")
      .addEventListener("click", clearSelectedItem);
  }

  async function searchItems(searchText) {
    if (!currentSession) {
      return;
    }

    const cleanSearchText = searchText.trim();

    if (cleanSearchText.length < 2) {
      itemSearchResults.hidden = true;
      itemSearchResults.innerHTML = "";
      return;
    }

    itemSearchResults.hidden = false;
    itemSearchResults.innerHTML = `
      <div class="compact-empty-state">
        Searching items...
      </div>
    `;

    try {
      const items =
        await auth.searchStartTaskItems(
          currentSession.sessionToken,
          cleanSearchText,
          25
        );

      if (items.length === 0) {
        itemSearchResults.innerHTML = `
          <div class="compact-empty-state">
            No matching items were found.
          </div>
        `;

        return;
      }

      itemSearchResults.innerHTML = "";

      items.forEach((item) => {
        const button =
          document.createElement("button");

        button.type = "button";
        button.className = "item-search-result";

        button.innerHTML = `
          <span class="item-result-name">
            ${escapeHtml(item.item_name)}
          </span>

          <span class="item-result-details">
            ${escapeHtml(item.internal_id)}
            ${
              item.sku_group
                ? ` · ${escapeHtml(item.sku_group)}`
                : ""
            }
          </span>
        `;

        button.addEventListener("click", () => {
          selectItem(item);
        });

        itemSearchResults.appendChild(button);
      });
    } catch (error) {
      itemSearchResults.innerHTML = `
        <div class="compact-empty-state">
          ${escapeHtml(
            error.message ||
            "The item search could not be completed."
          )}
        </div>
      `;
    }
  }

  function resetStartTaskForm() {
    startTaskForm.reset();

    selectedTaskType = null;
    clearSelectedItem();
    clearStartTaskMessage();

    productiveTaskSection.hidden = true;
    nonProductiveTaskSection.hidden = true;
    commentsSection.hidden = true;
    commentRequiredNote.hidden = true;
    commentsRequiredMarker.hidden = true;

    document
      .querySelectorAll(".task-type-option")
      .forEach((button) => {
        button.classList.remove("selected");
      });
  }

  function validateStartTask() {
    if (!selectedTaskType) {
      return "Select Productive or Non-Productive work.";
    }

    if (
      selectedTaskType.task_type_name ===
      "Productive"
    ) {
      if (!selectedItem) {
        return "Search for and select an item.";
      }

      if (
        selectedItem.is_placeholder &&
        !itemNotListedDetail.value.trim()
      ) {
        return "Enter the item details.";
      }
    }

    if (
      selectedTaskType.task_type_name ===
      "Non-Productive"
    ) {
      if (!nonProductiveTaskSelect.value) {
        return "Select a non-productive task.";
      }

      const selectedOption =
        nonProductiveTaskSelect.selectedOptions[0];

      if (
        selectedOption?.dataset.requiresComment ===
          "true" &&
        !startTaskComments.value.trim()
      ) {
        return "Comments are required for the selected task.";
      }
    }

    return null;
  }

  async function submitStartTask() {
    const validationMessage =
      validateStartTask();

    if (validationMessage) {
      showStartTaskMessage(validationMessage);
      return;
    }

    startTaskSubmitButton.disabled = true;
    startTaskSubmitButton.textContent =
      "Starting Task...";

    clearStartTaskMessage();

    const isProductive =
      selectedTaskType.task_type_name ===
      "Productive";

    try {
      const result = await auth.startMyTask(
        currentSession.sessionToken,
        {
          taskTypeId:
            selectedTaskType.task_type_id,

          itemId:
            isProductive
              ? selectedItem?.item_id
              : null,

          itemNotListedDetail:
            isProductive &&
            selectedItem?.is_placeholder
              ? itemNotListedDetail.value.trim()
              : null,

          workOrderNumber:
            isProductive
              ? workOrderNumber.value.trim()
              : null,

          workOrderType:
            isProductive
              ? workOrderType.value.trim()
              : null,

          jobType:
            isProductive
              ? productiveJobType.value.trim()
              : nonProductiveJobType.value.trim(),

          nonProductiveTaskId:
            isProductive
              ? null
              : nonProductiveTaskSelect.value,

          comments:
            startTaskComments.value.trim()
        }
      );

      resetStartTaskForm();
      showApplicationPage("dashboard");

      await loadTaskState();

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        `Job #${result.job_number} started successfully.`;

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);
    } catch (error) {
      showStartTaskMessage(
        error.message ||
        "The task could not be started."
      );
    } finally {
      startTaskSubmitButton.disabled = false;
      startTaskSubmitButton.textContent =
        "Start Task";
    }
  }

    function showMyMemosMessage(message) {
    myMemosMessage.textContent = message;
    myMemosMessage.hidden = !message;
  }

  function clearMyMemosMessage() {
    myMemosMessage.textContent = "";
    myMemosMessage.hidden = true;
  }

  function showCreateMemoMessage(
    message,
    type = "error"
  ) {
    createMemoMessage.textContent = message;
    createMemoMessage.className =
      `login-message ${type}`;
    createMemoMessage.hidden = !message;
  }

  function clearCreateMemoMessage() {
    createMemoMessage.textContent = "";
    createMemoMessage.hidden = true;
  }

  function updatePendingMemoCount(memos) {
    const pendingCount = memos.filter(
      (memo) => !memo.acknowledged_at
    ).length;

    pendingMemoCount.textContent =
      String(pendingCount);

    pendingMemoCount.hidden =
      pendingCount === 0;
  }

  function renderMyMemos(memos) {
    currentMemos = Array.isArray(memos)
      ? memos
      : [];

    updatePendingMemoCount(currentMemos);

    if (currentMemos.length === 0) {
      myMemosContent.innerHTML = `
        <section class="workspace-card">
          <div class="task-empty-state">
            <div class="task-empty-icon">✓</div>

            <div>
              <h3>No memos to display</h3>

              <p>
                You do not currently have any memos matching
                this view.
              </p>
            </div>
          </div>
        </section>
      `;

      return;
    }

    myMemosContent.innerHTML = currentMemos
      .map((memo) => {
        const acknowledged =
          Boolean(memo.acknowledged_at);

        return `
          <article
            class="memo-card ${
              acknowledged
                ? "acknowledged"
                : ""
            }"
          >
            <div class="memo-card-header">
              <div>
                <span class="memo-category-badge">
                  ${escapeHtml(
                    memo.category_name ||
                    "General"
                  )}
                </span>

                <h2 class="memo-card-title">
                  ${escapeHtml(
                    memo.memo_title || "Memo"
                  )}
                </h2>
              </div>

              <span
                class="memo-status-badge ${
                  acknowledged
                    ? "acknowledged"
                    : ""
                }"
              >
                ${
                  acknowledged
                    ? "Acknowledged"
                    : "Action Required"
                }
              </span>
            </div>

            <div class="memo-card-body">${
              escapeHtml(memo.memo_body || "")
            }</div>

            <div class="memo-card-meta">
              <span>
                From:
                ${escapeHtml(
                  memo.created_by_employee_name ||
                  "Task Tracker"
                )}
              </span>

              <span>
                Assigned:
                ${escapeHtml(
                  formatDateTime(memo.assigned_at)
                )}
              </span>

              ${
                acknowledged
                  ? `
                    <span>
                      Acknowledged:
                      ${escapeHtml(
                        formatDateTime(
                          memo.acknowledged_at
                        )
                      )}
                    </span>
                  `
                  : ""
              }
            </div>

            ${
              acknowledged
                ? memo.acknowledgment_comments
                  ? `
                    <div class="memo-acknowledgment">
                      <strong>
                        Your acknowledgment comments
                      </strong>

                      <div class="memo-card-body">
                        ${escapeHtml(
                          memo.acknowledgment_comments
                        )}
                      </div>
                    </div>
                  `
                  : ""
                : `
                  <div class="memo-acknowledgment">
                    <div class="form-field">
                      <label
                        for="memo-comments-${
                          memo.assignment_id
                        }"
                      >
                        Acknowledgment Comments
                      </label>

                      <textarea
                        id="memo-comments-${
                          memo.assignment_id
                        }"
                        class="memo-acknowledgment-comments"
                        maxlength="2000"
                        placeholder="Optional comments or response"
                      ></textarea>
                    </div>

                    <div class="memo-acknowledge-row">
                      <button
                        class="memo-acknowledge-button"
                        type="button"
                        data-assignment-id="${escapeHtml(
                          memo.assignment_id
                        )}"
                      >
                        Acknowledge Memo
                      </button>
                    </div>
                  </div>
                `
            }
          </article>
        `;
      })
      .join("");

    myMemosContent
      .querySelectorAll(
        ".memo-acknowledge-button"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const assignmentId =
              button.dataset.assignmentId;

            const commentsInput =
              document.getElementById(
                `memo-comments-${assignmentId}`
              );

            button.disabled = true;
            button.textContent =
              "Acknowledging...";

            clearMyMemosMessage();

            try {
              await auth.acknowledgeMyMemo(
                currentSession.sessionToken,
                assignmentId,
                commentsInput?.value.trim() || null
              );

              await loadMyMemos();

              showMyMemosMessage(
                "The memo was acknowledged successfully."
              );

              window.setTimeout(() => {
                clearMyMemosMessage();
              }, 5000);
            } catch (error) {
              showMyMemosMessage(
                error.message ||
                "The memo could not be acknowledged."
              );

              button.disabled = false;
              button.textContent =
                "Acknowledge Memo";
            }
          }
        );
      });
  }

  async function loadMyMemos() {
    if (!currentSession) {
      return;
    }

    refreshMemosButton.disabled = true;
    refreshMemosButton.textContent =
      "Refreshing...";

    showMyMemosMessage(
      "Loading employee memos..."
    );

    try {
      const memos = await auth.getMyMemos(
        currentSession.sessionToken,
        includeAcknowledgedMemos.checked
      );

      renderMyMemos(memos);
      clearMyMemosMessage();
    } catch (error) {
      showMyMemosMessage(
        error.message ||
        "The employee memos could not be loaded."
      );
    } finally {
      refreshMemosButton.disabled = false;
      refreshMemosButton.textContent =
        "Refresh";
    }
  }

  async function refreshPendingMemoCount() {
    if (!currentSession) {
      return;
    }

    try {
      const pendingMemos =
        await auth.getMyMemos(
          currentSession.sessionToken,
          false
        );

      updatePendingMemoCount(pendingMemos);
    } catch (error) {
      console.warn(
        "The pending memo count could not be loaded:",
        error.message
      );
    }
  }

  function populateMemoCategories(categories) {
    memoCategorySelect.innerHTML = `
      <option value="">
        Select a memo category
      </option>
    `;

    categories.forEach((category) => {
      const option =
        document.createElement("option");

      option.value = category.id;
      option.textContent =
        category.category_name;

      memoCategorySelect.appendChild(option);
    });
  }

  function renderMemoEmployeeOptions(employees) {
    memoEmployeeOptions.innerHTML = "";

    if (!employees.length) {
      memoEmployeeOptions.innerHTML = `
        <div class="compact-empty-state">
          No employees are available for memo assignment.
        </div>
      `;

      return;
    }

    employees.forEach((employee) => {
      const label =
        document.createElement("label");

      label.className = "memo-employee-option";

      label.innerHTML = `
        <input
          type="checkbox"
          class="memo-employee-checkbox"
          value="${escapeHtml(employee.id)}"
        >

        <span>
          <span class="memo-employee-name">
            ${escapeHtml(
              employee.employee_name
            )}
          </span>

          <span class="memo-employee-details">
            ${escapeHtml(
              [
                employee.department,
                employee.role
              ]
                .filter(Boolean)
                .join(" · ")
            )}
          </span>
        </span>
      `;

      memoEmployeeOptions.appendChild(label);
    });
  }

  async function loadMemoCreationOptions() {
    if (!currentSession) {
      return;
    }

    if (!memoCreationOptionsData) {
      memoEmployeeOptions.innerHTML = `
        <div class="compact-empty-state">
          Loading employees and memo categories...
        </div>
      `;

      memoCreationOptionsData =
        await auth.getMemoCreationOptions(
          currentSession.sessionToken
        );
    }

    populateMemoCategories(
      memoCreationOptionsData.memo_categories || []
    );

    renderMemoEmployeeOptions(
      memoCreationOptionsData.employees || []
    );
  }

  function resetCreateMemoForm() {
    createMemoForm.reset();
    clearCreateMemoMessage();

    memoEmployeeOptions
      .querySelectorAll(
        ".memo-employee-checkbox"
      )
      .forEach((checkbox) => {
        checkbox.checked = false;
      });

    selectAllMemoEmployees.textContent =
      "Select All";
  }

  async function submitCreateMemo() {
    const memoCategoryId =
      memoCategorySelect.value;
    const memoTitle =
      memoTitleInput.value.trim();
    const memoBody =
      memoBodyInput.value.trim();

    const assignedEmployeeIds = Array.from(
      memoEmployeeOptions.querySelectorAll(
        ".memo-employee-checkbox:checked"
      )
    ).map((checkbox) => checkbox.value);

    if (!memoCategoryId) {
      showCreateMemoMessage(
        "Select a memo category."
      );
      return;
    }

    if (!memoTitle) {
      showCreateMemoMessage(
        "Enter a memo title."
      );
      return;
    }

    if (!memoBody) {
      showCreateMemoMessage(
        "Enter the memo message."
      );
      return;
    }

    if (assignedEmployeeIds.length === 0) {
      showCreateMemoMessage(
        "Select at least one employee."
      );
      return;
    }

    createMemoSubmitButton.disabled = true;
    createMemoSubmitButton.textContent =
      "Creating Memo...";

    clearCreateMemoMessage();

    try {
      const result =
        await auth.createAndAssignMemo(
          currentSession.sessionToken,
          {
            memoCategoryId,
            memoTitle,
            memoBody,
            assignedEmployeeIds
          }
        );

      resetCreateMemoForm();
      showApplicationPage("dashboard");

      taskStateMessage.hidden = false;
      taskStateMessage.textContent =
        `The memo was assigned to ${
          result?.assignment_count || 0
        } employee(s).`;

      window.setTimeout(() => {
        taskStateMessage.hidden = true;
      }, 5000);

      await refreshPendingMemoCount();
    } catch (error) {
      showCreateMemoMessage(
        error.message ||
        "The memo could not be created."
      );
    } finally {
      createMemoSubmitButton.disabled = false;
      createMemoSubmitButton.textContent =
        "Create and Assign Memo";
    }
  }
    function showEmployeeAdminMessage(message) {
    employeeAdminMessage.textContent = message;
    employeeAdminMessage.hidden = !message;
  }

  function clearEmployeeAdminMessage() {
    employeeAdminMessage.textContent = "";
    employeeAdminMessage.hidden = true;
  }

  function showEmployeeAdminFormMessage(
    message,
    type = "error"
  ) {
    employeeAdminFormMessage.textContent = message;
    employeeAdminFormMessage.className =
      `login-message ${type}`;
    employeeAdminFormMessage.hidden = !message;
  }

  function clearEmployeeAdminFormMessage() {
    employeeAdminFormMessage.textContent = "";
    employeeAdminFormMessage.hidden = true;
  }

  function closeEmployeeAdminModal() {
    employeeAdminModalBackdrop.hidden = true;
    employeeAdminForm.reset();
    employeeAdminId.value = "";
    clearEmployeeAdminFormMessage();
  }

  function populateEmployeeAdminOptions() {
    const options =
      employeeAdminOptionsData || {
        roles: [],
        departments: [],
        supervisors: []
      };

    employeeAdminRole.innerHTML = `
      <option value="">
        Select a role
      </option>
    `;

    options.roles.forEach((role) => {
      const option =
        document.createElement("option");

      option.value = role;
      option.textContent = role;

      employeeAdminRole.appendChild(option);
    });

    employeeDepartmentOptions.innerHTML = "";

    options.departments.forEach((department) => {
      const option =
        document.createElement("option");

      option.value = department;

      employeeDepartmentOptions.appendChild(
        option
      );
    });

    employeeAdminSupervisor.innerHTML = `
      <option value="">
        No supervisor
      </option>
    `;

    options.supervisors.forEach((supervisor) => {
      const option =
        document.createElement("option");

      option.value = supervisor.id;
      option.textContent =
        supervisor.employee_name;

      if (supervisor.department) {
        option.textContent +=
          ` — ${supervisor.department}`;
      }

      if (!supervisor.is_active) {
        option.textContent += " — Inactive";
      }

      employeeAdminSupervisor.appendChild(
        option
      );
    });
  }

  async function loadEmployeeAdminOptions(
    forceRefresh = false
  ) {
    if (
      !employeeAdminOptionsData ||
      forceRefresh
    ) {
      employeeAdminOptionsData =
        await auth.getEmployeeAdminOptions(
          currentSession.sessionToken
        );
    }

    populateEmployeeAdminOptions();
  }

  function renderAdminEmployees(result) {
    currentAdminEmployees =
      Array.isArray(result?.records)
        ? result.records
        : [];

    const totalCount =
      Number(result?.total_count) || 0;

    employeeAdminSummary.textContent =
      `${totalCount} employee record${
        totalCount === 1 ? "" : "s"
      } found`;

    if (currentAdminEmployees.length === 0) {
      employeeAdminRecords.innerHTML = `
        <div class="task-empty-state">
          <div class="task-empty-icon">✓</div>

          <div>
            <h3>No employees found</h3>

            <p>
              Change the search or inactive filter and try
              again.
            </p>
          </div>
        </div>
      `;

      return;
    }

    employeeAdminRecords.innerHTML =
      currentAdminEmployees
        .map((employee) => {
          const statusClass =
            employee.is_active
              ? ""
              : " inactive";

          const meta = [
            employee.department,
            employee.role,
            employee.supervisor_name
              ? `Supervisor: ${
                  employee.supervisor_name
                }`
              : "No supervisor",
            `Order: ${employee.display_order}`,
            employee.has_pin
              ? "PIN configured"
              : "PIN not configured"
          ]
            .filter(Boolean)
            .map(
              (value) =>
                `<span>${escapeHtml(value)}</span>`
            )
            .join("");

          return `
            <article
              class="admin-record-card${statusClass}"
            >
              <div>
                <div class="admin-record-title-row">
                  <span class="admin-record-title">
                    ${escapeHtml(
                      employee.employee_name
                    )}
                  </span>

                  <span
                    class="admin-record-status${statusClass}"
                  >
                    ${
                      employee.is_active
                        ? "Active"
                        : "Inactive"
                    }
                  </span>
                </div>

                <div class="admin-record-meta">
                  ${meta}
                </div>
              </div>

              <button
                class="admin-edit-button"
                type="button"
                data-employee-id="${escapeHtml(
                  employee.id
                )}"
              >
                Edit
              </button>
            </article>
          `;
        })
        .join("");

    employeeAdminRecords
      .querySelectorAll(".admin-edit-button")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const employee =
              currentAdminEmployees.find(
                (record) =>
                  record.id ===
                  button.dataset.employeeId
              );

            if (employee) {
              openEmployeeAdminModal(employee);
            }
          }
        );
      });
  }

  async function loadAdminEmployees() {
    if (!currentSession) {
      return;
    }

    employeeAdminRefreshButton.disabled = true;
    employeeAdminRefreshButton.textContent =
      "Refreshing...";

    showEmployeeAdminMessage(
      "Loading employee records..."
    );

    try {
      const result =
        await auth.searchAdminEmployees(
          currentSession.sessionToken,
          {
            searchText:
              employeeAdminSearch.value,
            includeInactive:
              employeeAdminIncludeInactive.checked,
            resultLimit: 200,
            resultOffset: 0
          }
        );

      renderAdminEmployees(result);
      clearEmployeeAdminMessage();
    } catch (error) {
      showEmployeeAdminMessage(
        error.message ||
        "The employee records could not be loaded."
      );
    } finally {
      employeeAdminRefreshButton.disabled =
        false;
      employeeAdminRefreshButton.textContent =
        "Refresh";
    }
  }

  function openEmployeeAdminModal(
    employee = null
  ) {
    employeeAdminForm.reset();
    clearEmployeeAdminFormMessage();

    const isEditing = Boolean(employee);

    employeeAdminModalTitle.textContent =
      isEditing
        ? "Edit Employee"
        : "Add Employee";

    employeeAdminSaveButton.textContent =
      isEditing
        ? "Save Employee"
        : "Add Employee";

    employeeAdminId.value =
      employee?.id || "";

    employeeAdminName.value =
      employee?.employee_name || "";

    employeeAdminDepartment.value =
      employee?.department || "";

    employeeAdminRole.value =
      employee?.role || "Employee";

    employeeAdminSupervisor.value =
      employee?.supervisor_id || "";

    employeeAdminDisplayOrder.value =
      String(employee?.display_order ?? 0);

    employeeAdminActive.checked =
      employee
        ? Boolean(employee.is_active)
        : true;

    employeeAdminPin.value = "";

    employeeAdminPinLabel.textContent =
      isEditing
        ? "New PIN"
        : "Employee PIN";

    employeeAdminPin.required =
      !isEditing;

    employeeAdminPinNote.textContent =
      isEditing
        ? "Leave blank to keep the employee’s current PIN."
        : "Enter a PIN containing 4 to 12 numbers.";

    employeeAdminModalBackdrop.hidden = false;
    employeeAdminName.focus();
  }

  async function submitAdminEmployee() {
    const employeeName =
      employeeAdminName.value.trim();

    const employeeRole =
      employeeAdminRole.value;

    const newPin =
      employeeAdminPin.value.trim();

    if (!employeeName) {
      showEmployeeAdminFormMessage(
        "Enter the employee name."
      );
      return;
    }

    if (!employeeRole) {
      showEmployeeAdminFormMessage(
        "Select an employee role."
      );
      return;
    }

    if (
      !employeeAdminId.value &&
      !newPin
    ) {
      showEmployeeAdminFormMessage(
        "Enter a PIN for the new employee."
      );
      return;
    }

    if (
      newPin &&
      !/^[0-9]{4,12}$/.test(newPin)
    ) {
      showEmployeeAdminFormMessage(
        "The PIN must contain 4 to 12 numbers."
      );
      return;
    }

    employeeAdminSaveButton.disabled = true;
    employeeAdminSaveButton.textContent =
      "Saving Employee...";

    clearEmployeeAdminFormMessage();

    try {
      await auth.saveAdminEmployee(
        currentSession.sessionToken,
        {
          employeeId:
            employeeAdminId.value || null,
          employeeName,
          department:
            employeeAdminDepartment.value.trim() ||
            null,
          supervisorId:
            employeeAdminSupervisor.value || null,
          employeeRole,
          isActive:
            employeeAdminActive.checked,
          displayOrder:
            employeeAdminDisplayOrder.value,
          newPin: newPin || null
        }
      );

      closeEmployeeAdminModal();

      await loadEmployeeAdminOptions(true);
      await loadAdminEmployees();

      showEmployeeAdminMessage(
        "The employee record was saved successfully."
      );

      window.setTimeout(() => {
        clearEmployeeAdminMessage();
      }, 5000);
    } catch (error) {
      showEmployeeAdminFormMessage(
        error.message ||
        "The employee record could not be saved."
      );
    } finally {
      employeeAdminSaveButton.disabled = false;
      employeeAdminSaveButton.textContent =
        employeeAdminId.value
          ? "Save Employee"
          : "Add Employee";
    }
  }
    function showDropdownAdminMessage(message) {
    dropdownAdminMessage.textContent = message;
    dropdownAdminMessage.hidden = !message;
  }

  function clearDropdownAdminMessage() {
    dropdownAdminMessage.textContent = "";
    dropdownAdminMessage.hidden = true;
  }

  function showDropdownAdminFormMessage(
    message,
    type = "error"
  ) {
    dropdownAdminFormMessage.textContent = message;
    dropdownAdminFormMessage.className =
      `login-message ${type}`;
    dropdownAdminFormMessage.hidden = !message;
  }

  function clearDropdownAdminFormMessage() {
    dropdownAdminFormMessage.textContent = "";
    dropdownAdminFormMessage.hidden = true;
  }

  function getSelectedDropdownRecordType() {
    return (
      dropdownAdminConfigurationData
        ?.record_types
        ?.find(
          (recordType) =>
            recordType.value ===
            dropdownRecordTypeSelect.value
        ) || null
    );
  }

  function populateDropdownAdminConfiguration() {
    dropdownRecordTypeSelect.innerHTML = "";

    (
      dropdownAdminConfigurationData
        ?.record_types || []
    ).forEach((recordType) => {
      const option =
        document.createElement("option");

      option.value = recordType.value;
      option.textContent = recordType.label;

      dropdownRecordTypeSelect.appendChild(
        option
      );
    });

    dropdownAdminReasonType.innerHTML = `
      <option value="">
        Select a reason type
      </option>
    `;

    (
      dropdownAdminConfigurationData
        ?.stop_reason_types || []
    ).forEach((reasonType) => {
      const option =
        document.createElement("option");

      option.value = reasonType;
      option.textContent = reasonType;

      dropdownAdminReasonType.appendChild(
        option
      );
    });

    updateDropdownAdminControls();
  }

  async function loadDropdownAdminConfiguration(
    forceRefresh = false
  ) {
    if (
      !dropdownAdminConfigurationData ||
      forceRefresh
    ) {
      dropdownAdminConfigurationData =
        await auth.getDropdownAdminConfiguration(
          currentSession.sessionToken
        );
    }

    populateDropdownAdminConfiguration();
  }

  function updateDropdownAdminControls() {
    const recordType =
      getSelectedDropdownRecordType();

    dropdownAdminSearch.disabled =
      !recordType;

    newDropdownRecordButton.hidden =
      !recordType?.supports_create;

    dropdownAdminSearch.placeholder =
      recordType?.value === "items"
        ? "Search by item name, Internal ID, SKU group, or department"
        : "Search the selected list";
  }

  function getDropdownRecordMeta(
    recordType,
    record
  ) {
    if (recordType === "items") {
      return [
        record.internal_id
          ? `Internal ID: ${record.internal_id}`
          : null,
        record.sku_group
          ? `SKU Group: ${record.sku_group}`
          : null,
        record.work_order_department,
        record.make,
        record.build_type,
        record.item_cycle_time_minutes !== null &&
        record.item_cycle_time_minutes !== undefined
          ? `Cycle: ${
              record.item_cycle_time_minutes
            } minutes`
          : null,
        record.is_placeholder
          ? "Placeholder item"
          : null
      ];
    }

    if (recordType === "stop_reasons") {
      return [
        record.reason_type,
        record.resulting_job_status,
        record.requires_comment
          ? "Comments required"
          : "Comments optional",
        `Order: ${record.display_order}`
      ];
    }

    if (
      recordType ===
      "non_productive_tasks"
    ) {
      return [
        record.requires_comment
          ? "Comments required"
          : "Comments optional",
        `Order: ${record.display_order}`
      ];
    }

    return [
      `Order: ${record.display_order}`
    ];
  }

  function renderDropdownAdminRecords(result) {
    currentDropdownRecords =
      Array.isArray(result?.records)
        ? result.records
        : [];

    const totalCount =
      Number(result?.total_count) || 0;

    dropdownAdminSummary.textContent =
      `${totalCount} record${
        totalCount === 1 ? "" : "s"
      } found`;

    if (
      currentDropdownRecords.length === 0
    ) {
      dropdownAdminRecords.innerHTML = `
        <div class="task-empty-state">
          <div class="task-empty-icon">✓</div>

          <div>
            <h3>No records found</h3>

            <p>
              Change the search or inactive filter and try
              again.
            </p>
          </div>
        </div>
      `;

      return;
    }

    const recordType =
      dropdownRecordTypeSelect.value;

    dropdownAdminRecords.innerHTML =
      currentDropdownRecords
        .map((record) => {
          const statusClass =
            record.is_active
              ? ""
              : " inactive";

          const meta =
            getDropdownRecordMeta(
              recordType,
              record
            )
              .filter(Boolean)
              .map(
                (value) =>
                  `<span>${escapeHtml(value)}</span>`
              )
              .join("");

          return `
            <article
              class="admin-record-card${statusClass}"
            >
              <div>
                <div class="admin-record-title-row">
                  <span class="admin-record-title">
                    ${escapeHtml(
                      record.name || "Unnamed record"
                    )}
                  </span>

                  <span
                    class="admin-record-status${statusClass}"
                  >
                    ${
                      record.is_active
                        ? "Active"
                        : "Inactive"
                    }
                  </span>
                </div>

                <div class="admin-record-meta">
                  ${meta}
                </div>
              </div>

              <button
                class="admin-edit-button"
                type="button"
                data-record-id="${escapeHtml(
                  record.id
                )}"
              >
                Edit
              </button>
            </article>
          `;
        })
        .join("");

    dropdownAdminRecords
      .querySelectorAll(".admin-edit-button")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const record =
              currentDropdownRecords.find(
                (item) =>
                  item.id ===
                  button.dataset.recordId
              );

            if (record) {
              openDropdownAdminModal(record);
            }
          }
        );
      });
  }

  async function loadAdminDropdownRecords() {
    const recordType =
      dropdownRecordTypeSelect.value;

    if (!currentSession || !recordType) {
      return;
    }

    dropdownAdminRefreshButton.disabled =
      true;
    dropdownAdminRefreshButton.textContent =
      "Refreshing...";

    showDropdownAdminMessage(
      "Loading administration records..."
    );

    try {
      const result =
        await auth.searchAdminDropdownRecords(
          currentSession.sessionToken,
          {
            recordType,
            searchText:
              dropdownAdminSearch.value,
            includeInactive:
              dropdownAdminIncludeInactive.checked,
            resultLimit:
              recordType === "items"
                ? 100
                : 250,
            resultOffset: 0
          }
        );

      renderDropdownAdminRecords(result);
      clearDropdownAdminMessage();
    } catch (error) {
      showDropdownAdminMessage(
        error.message ||
        "The administration records could not be loaded."
      );
    } finally {
      dropdownAdminRefreshButton.disabled =
        false;
      dropdownAdminRefreshButton.textContent =
        "Refresh";
    }
  }

  function updateDropdownEditorFields() {
    const recordType =
      dropdownRecordTypeSelect.value;

    const isItem =
      recordType === "items";
    const isStopReason =
      recordType === "stop_reasons";
    const isNonProductive =
      recordType ===
      "non_productive_tasks";
    const isTaskType =
      recordType === "task_types";

    dropdownAdminNameField.hidden =
      isTaskType;

    dropdownAdminInternalIdField.hidden =
      !isItem;
    dropdownAdminSkuGroupField.hidden =
      !isItem;
    dropdownAdminDepartmentField.hidden =
      !isItem;
    dropdownAdminMakeField.hidden =
      !isItem;
    dropdownAdminBuildTypeField.hidden =
      !isItem;
    dropdownAdminCycleTimeField.hidden =
      !isItem;
    dropdownAdminPlaceholderField.hidden =
      !isItem;

    dropdownAdminReasonTypeField.hidden =
      !isStopReason;

    dropdownAdminRequiresCommentField.hidden =
      !(
        isStopReason ||
        isNonProductive
      );

    dropdownAdminDisplayOrderField.hidden =
      isItem;
  }

  function closeDropdownAdminModal() {
    dropdownAdminModalBackdrop.hidden = true;
    dropdownAdminForm.reset();
    dropdownAdminRecordId.value = "";
    clearDropdownAdminFormMessage();
  }

  function openDropdownAdminModal(
    record = null
  ) {
    const recordType =
      dropdownRecordTypeSelect.value;

    dropdownAdminForm.reset();
    clearDropdownAdminFormMessage();
    updateDropdownEditorFields();

    const isEditing = Boolean(record);

    dropdownAdminModalTitle.textContent =
      isEditing
        ? "Edit Record"
        : "Add Record";

    dropdownAdminRecordId.value =
      record?.id || "";

    dropdownAdminName.value =
      record?.name || "";

    dropdownAdminInternalId.value =
      record?.internal_id || "";

    dropdownAdminSkuGroup.value =
      record?.sku_group || "";

    dropdownAdminDepartment.value =
      record?.work_order_department || "";

    dropdownAdminMake.value =
      record?.make || "";

    dropdownAdminBuildType.value =
      record?.build_type || "";

    dropdownAdminCycleTime.value =
      record?.item_cycle_time_minutes ?? "";

    dropdownAdminReasonType.value =
      record?.reason_type || "";

    dropdownAdminDisplayOrder.value =
      String(record?.display_order ?? 0);

    dropdownAdminRequiresComment.checked =
      Boolean(record?.requires_comment);

    dropdownAdminPlaceholder.checked =
      Boolean(record?.is_placeholder);

    dropdownAdminActive.checked =
      record
        ? Boolean(record.is_active)
        : true;

    dropdownAdminSaveButton.textContent =
      isEditing
        ? "Save Record"
        : "Add Record";

    dropdownAdminModalBackdrop.hidden = false;

    if (!dropdownAdminNameField.hidden) {
      dropdownAdminName.focus();
    }
  }

  async function submitAdminDropdownRecord() {
    const recordType =
      dropdownRecordTypeSelect.value;

    const recordId =
      dropdownAdminRecordId.value || null;

    if (!recordType) {
      showDropdownAdminFormMessage(
        "Select a record type."
      );
      return;
    }

    if (
      recordType !== "task_types" &&
      !dropdownAdminName.value.trim()
    ) {
      showDropdownAdminFormMessage(
        "Enter the record name."
      );
      return;
    }

    if (
      recordType === "items" &&
      !dropdownAdminInternalId.value.trim()
    ) {
      showDropdownAdminFormMessage(
        "Enter the Internal ID."
      );
      return;
    }

    if (
      recordType === "stop_reasons" &&
      !dropdownAdminReasonType.value
    ) {
      showDropdownAdminFormMessage(
        "Select a reason type."
      );
      return;
    }

    dropdownAdminSaveButton.disabled = true;
    dropdownAdminSaveButton.textContent =
      "Saving Record...";

    clearDropdownAdminFormMessage();

    const recordData = {
      name:
        dropdownAdminName.value.trim(),
      internal_id:
        dropdownAdminInternalId.value.trim(),
      sku_group:
        dropdownAdminSkuGroup.value.trim(),
      work_order_department:
        dropdownAdminDepartment.value.trim(),
      make:
        dropdownAdminMake.value.trim(),
      build_type:
        dropdownAdminBuildType.value.trim(),
      item_cycle_time_minutes:
        dropdownAdminCycleTime.value,
      reason_type:
        dropdownAdminReasonType.value,
      display_order:
        dropdownAdminDisplayOrder.value,
      requires_comment:
        dropdownAdminRequiresComment.checked,
      is_placeholder:
        dropdownAdminPlaceholder.checked,
      is_active:
        dropdownAdminActive.checked
    };

    try {
      await auth.saveAdminDropdownRecord(
        currentSession.sessionToken,
        recordType,
        recordId,
        recordData
      );

      closeDropdownAdminModal();
      await loadAdminDropdownRecords();

      showDropdownAdminMessage(
        "The administration record was saved successfully."
      );

      window.setTimeout(() => {
        clearDropdownAdminMessage();
      }, 5000);
    } catch (error) {
      showDropdownAdminFormMessage(
        error.message ||
        "The administration record could not be saved."
      );
    } finally {
      dropdownAdminSaveButton.disabled = false;
      dropdownAdminSaveButton.textContent =
        recordId
          ? "Save Record"
          : "Add Record";
    }
  }
  async function displayApplication(session) {
    const permissions =
      await auth.getPermissionContext(
        session.sessionToken
      );

    currentSession = {
      ...session,
      permissions
    };

    currentEmployeeName.textContent =
      session.employee.name || "Employee";

    currentEmployeeDetails.textContent = [
      session.employee.department,
      session.employee.role
    ]
      .filter(Boolean)
      .join(" · ");

    currentEmployeeInitials.textContent =
      getInitials(session.employee.name);

    welcomeName.textContent =
      session.employee.name || "Employee";

    roleBadge.textContent =
      session.employee.role || "Employee";

    configureNavigation(permissions);

    loginView.hidden = true;
    appView.hidden = false;
    pinInput.value = "";

    clearLoginMessage();
        showApplicationPage("dashboard");

    await loadTaskState();
    await refreshPendingMemoCount();
  }

  function displayLogin() {
    stopElapsedTimer();

    currentSession = null;
    appView.hidden = true;
    loginView.hidden = false;
    pinInput.value = "";
  }

  async function loadEmployeeList() {
    employeeSelect.innerHTML = `
      <option value="">Select your name</option>
    `;

    const employees = await auth.listEmployees();

    employees.forEach((employee) => {
      const option =
        document.createElement("option");

      option.value = employee.employee_id;
      option.textContent = employee.employee_name;

      if (employee.department) {
        option.textContent +=
          ` — ${employee.department}`;
      }

      employeeSelect.appendChild(option);
    });
  }

  async function initializeApplication() {
    setLoginLoading(true);

    showLoginMessage(
      "Connecting securely to Task Tracker...",
      "info"
    );

    try {
      const restoredSession =
        await auth.restoreSession();

      if (restoredSession) {
        await displayApplication(restoredSession);
        return;
      }

      await loadEmployeeList();
      clearLoginMessage();
      displayLogin();
    } catch (error) {
      displayLogin();

      showLoginMessage(
        error.message ||
        "Task Tracker could not connect to the database."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  loginForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      clearLoginMessage();

      const employeeId = employeeSelect.value;
      const pin = pinInput.value.trim();

      if (!employeeId) {
        showLoginMessage(
          "Select your employee name."
        );

        return;
      }

      if (!pin) {
        showLoginMessage(
          "Enter your secure PIN."
        );

        return;
      }

      setLoginLoading(true);

      try {
        const result =
          await auth.login(employeeId, pin);

        if (!result.successful) {
          showLoginMessage(result.message);
          pinInput.value = "";
          return;
        }

        await displayApplication({
          sessionToken: result.sessionToken,
          employee: result.employee
        });
      } catch (error) {
        showLoginMessage(
          error.message ||
          "The login request could not be completed."
        );
      } finally {
        setLoginLoading(false);
      }
    }
  );

  dashboardNavButton.addEventListener(
    "click",
    async () => {
      showApplicationPage("dashboard");
      await loadTaskState();
    }
  );

    startTaskNavButton.addEventListener(
    "click",
    async () => {
      if (currentActiveJob) {
        showApplicationPage("dashboard");

        taskStateMessage.hidden = false;
        taskStateMessage.textContent =
          "You already have a job in progress. Pause or complete it before starting another task.";

        window.setTimeout(() => {
          taskStateMessage.hidden = true;
        }, 5000);

        return;
      }

      showApplicationPage("start-task");

      try {
        await loadStartTaskOptions();
      } catch (error) {
        showStartTaskMessage(
          error.message ||
          "The Start Task page could not be loaded."
        );
      }
    }
  );

    cancelStartTaskButton.addEventListener(
    "click",
    () => {
      resetStartTaskForm();
      showApplicationPage("dashboard");
    }
  );

  myMemosNavButton.addEventListener(
    "click",
    async () => {
      showApplicationPage("my-memos");
      await loadMyMemos();
    }
  );

  createMemoNavButton.addEventListener(
    "click",
    async () => {
      showApplicationPage("create-memo");
      clearCreateMemoMessage();

      try {
        await loadMemoCreationOptions();
      } catch (error) {
        showCreateMemoMessage(
          error.message ||
          "The Create Memo page could not be loaded."
        );
      }
    }
  );

  refreshMemosButton.addEventListener(
    "click",
    loadMyMemos
  );

  includeAcknowledgedMemos.addEventListener(
    "change",
    loadMyMemos
  );

  cancelCreateMemoButton.addEventListener(
    "click",
    () => {
      resetCreateMemoForm();
      showApplicationPage("dashboard");
    }
  );

  selectAllMemoEmployees.addEventListener(
    "click",
    () => {
      const checkboxes = Array.from(
        memoEmployeeOptions.querySelectorAll(
          ".memo-employee-checkbox"
        )
      );

      const shouldSelectAll =
        checkboxes.some(
          (checkbox) => !checkbox.checked
        );

      checkboxes.forEach((checkbox) => {
        checkbox.checked = shouldSelectAll;
      });

      selectAllMemoEmployees.textContent =
        shouldSelectAll
          ? "Clear All"
          : "Select All";
    }
  );

    createMemoForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      await submitCreateMemo();
    }
  );

  employeeAdminNavButton.addEventListener(
    "click",
    async () => {
      showApplicationPage("employee-admin");

      try {
        await loadEmployeeAdminOptions();
        await loadAdminEmployees();
      } catch (error) {
        showEmployeeAdminMessage(
          error.message ||
          "Employee Administration could not be loaded."
        );
      }
    }
  );

  dropdownAdminNavButton.addEventListener(
    "click",
    async () => {
      showApplicationPage("dropdown-admin");

      try {
        await loadDropdownAdminConfiguration();

        if (dropdownRecordTypeSelect.value) {
          await loadAdminDropdownRecords();
        }
      } catch (error) {
        showDropdownAdminMessage(
          error.message ||
          "Dropdown Administration could not be loaded."
        );
      }
    }
  );

  employeeAdminRefreshButton.addEventListener(
    "click",
    loadAdminEmployees
  );

  employeeAdminIncludeInactive.addEventListener(
    "change",
    loadAdminEmployees
  );

  employeeAdminSearch.addEventListener(
    "input",
    () => {
      window.clearTimeout(
        employeeAdminSearchTimer
      );

      employeeAdminSearchTimer =
        window.setTimeout(
          loadAdminEmployees,
          300
        );
    }
  );

  newEmployeeButton.addEventListener(
    "click",
    async () => {
      try {
        await loadEmployeeAdminOptions();
        openEmployeeAdminModal();
      } catch (error) {
        showEmployeeAdminMessage(
          error.message ||
          "The employee editor could not be opened."
        );
      }
    }
  );

  employeeAdminModalClose.addEventListener(
    "click",
    closeEmployeeAdminModal
  );

  employeeAdminCancelButton.addEventListener(
    "click",
    closeEmployeeAdminModal
  );

  employeeAdminModalBackdrop.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        employeeAdminModalBackdrop
      ) {
        closeEmployeeAdminModal();
      }
    }
  );

  employeeAdminForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      await submitAdminEmployee();
    }
  );

  dropdownAdminRefreshButton.addEventListener(
    "click",
    loadAdminDropdownRecords
  );

  dropdownAdminIncludeInactive.addEventListener(
    "change",
    loadAdminDropdownRecords
  );

  dropdownAdminSearch.addEventListener(
    "input",
    () => {
      window.clearTimeout(
        dropdownAdminSearchTimer
      );

      dropdownAdminSearchTimer =
        window.setTimeout(
          loadAdminDropdownRecords,
          300
        );
    }
  );

  dropdownRecordTypeSelect.addEventListener(
    "change",
    async () => {
      dropdownAdminSearch.value = "";
      currentDropdownRecords = [];

      updateDropdownAdminControls();

      dropdownAdminRecords.innerHTML = "";
      dropdownAdminSummary.textContent = "";

      if (dropdownRecordTypeSelect.value) {
        await loadAdminDropdownRecords();
      }
    }
  );

  newDropdownRecordButton.addEventListener(
    "click",
    () => {
      const recordType =
        getSelectedDropdownRecordType();

      if (!recordType) {
        showDropdownAdminMessage(
          "Select a record type first."
        );
        return;
      }

      if (!recordType.supports_create) {
        showDropdownAdminMessage(
          "New records cannot be added to this list."
        );
        return;
      }

      openDropdownAdminModal();
    }
  );

  dropdownAdminModalClose.addEventListener(
    "click",
    closeDropdownAdminModal
  );

  dropdownAdminCancelButton.addEventListener(
    "click",
    closeDropdownAdminModal
  );

  dropdownAdminModalBackdrop.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        dropdownAdminModalBackdrop
      ) {
        closeDropdownAdminModal();
      }
    }
  );

  dropdownAdminForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      await submitAdminDropdownRecord();
    }
  );

  dashboardRefreshButton.addEventListener(
    "click",
    loadTaskState
  );

  itemSearchInput.addEventListener(
    "input",
    () => {
      window.clearTimeout(itemSearchTimer);

      itemSearchTimer = window.setTimeout(
        () => {
          searchItems(itemSearchInput.value);
        },
        300
      );
    }
  );

  nonProductiveTaskSelect.addEventListener(
    "change",
    updateCommentRequirement
  );

    startTaskForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      await submitStartTask();
    }
  );

  taskActionReasonSelect.addEventListener(
    "change",
    updateTaskActionCommentRequirement
  );

    taskActionModalClose.addEventListener(
    "click",
    closeTaskActionModal
  );

  editJobModalClose.addEventListener(
    "click",
    closeEditJobModal
  );

  editJobCancelButton.addEventListener(
    "click",
    closeEditJobModal
  );

    editJobModalBackdrop.addEventListener(
    "click",
    (event) => {
      if (event.target === editJobModalBackdrop) {
        closeEditJobModal();
      }
    }
  );

  editJobTaskType.addEventListener(
    "change",
    () => {
      updateEditJobFieldVisibility();

      const selectedOption =
        editJobTaskType.selectedOptions[0];

      const taskTypeName =
        selectedOption?.dataset.taskTypeName ||
        "";

      if (taskTypeName === "Productive") {
        editJobNonProductiveTask.value = "";
      }

      if (taskTypeName === "Non-Productive") {
        renderEditSelectedItem(null);

        editJobWorkOrderNumber.value = "";
        editJobWorkOrderType.value = "";
        editJobJobType.value = "";
      }
    }
  );

  editJobItemSearch.addEventListener(
    "input",
    () => {
      window.clearTimeout(
        editItemSearchTimer
      );

      editItemSearchTimer =
        window.setTimeout(
          searchEditJobItems,
          300
        );
    }
  );

    editJobForm.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      submitEditJob();
    }
  );

  taskActionCancelButton.addEventListener(
    "click",
    closeTaskActionModal
  );

  taskActionModalBackdrop.addEventListener(
    "click",
    (event) => {
      if (event.target === taskActionModalBackdrop) {
        closeTaskActionModal();
      }
    }
  );

    taskActionForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

            if (currentTaskAction === "pause") {
        await submitPauseTask();
        return;
      }

      if (currentTaskAction === "block") {
        await submitBlockTask();
        return;
      }

      if (currentTaskAction === "return") {
        await submitReturnTask();
        return;
      }

      if (currentTaskAction === "complete") {
        await submitCompleteTask();
        return;
      }

      if (currentTaskAction === "resume") {
        await submitResumeTask();
      }
    }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!employeeAdminModalBackdrop.hidden) {
        closeEmployeeAdminModal();
        return;
      }

      if (!dropdownAdminModalBackdrop.hidden) {
        closeDropdownAdminModal();
      }
    }
  );

  logoutButton.addEventListener(
    "click",
    async () => {
      logoutButton.disabled = true;
      logoutButton.textContent =
        "Signing out...";

      try {
        await auth.logout();
      } finally {
        logoutButton.disabled = false;
        logoutButton.textContent =
          "Sign out";

                resetStartTaskForm();
        resetCreateMemoForm();

        closeEmployeeAdminModal();
        closeDropdownAdminModal();

        window.clearTimeout(
          employeeAdminSearchTimer
        );

        window.clearTimeout(
          dropdownAdminSearchTimer
        );

        startTaskOptionsData = null;
        memoCreationOptionsData = null;
        currentMemos = [];

        employeeAdminOptionsData = null;
        currentAdminEmployees = [];
        employeeAdminSearchTimer = null;

        dropdownAdminConfigurationData = null;
        currentDropdownRecords = [];
        dropdownAdminSearchTimer = null;

        employeeAdminSearch.value = "";
        employeeAdminRecords.innerHTML = "";
        employeeAdminSummary.textContent = "";
        clearEmployeeAdminMessage();

        dropdownAdminSearch.value = "";
        dropdownAdminRecords.innerHTML = "";
        dropdownAdminSummary.textContent = "";
        clearDropdownAdminMessage();

        pendingMemoCount.hidden = true;
        pendingMemoCount.textContent = "";

        displayLogin();

        try {
          await loadEmployeeList();
        } catch (error) {
          showLoginMessage(
            error.message ||
            "The employee list could not be refreshed."
          );
        }
      }
    }
  );

  initializeApplication();
});
