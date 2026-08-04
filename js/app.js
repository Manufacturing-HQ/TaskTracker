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

  function openResumeModal(job) {

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

    setVisible(
      administratorNav,
      role === "Administrator"
    );
  }

  function showApplicationPage(pageName) {
    const showDashboard = pageName === "dashboard";

    dashboardPage.hidden = !showDashboard;
    startTaskPage.hidden = showDashboard;

    dashboardNavButton.classList.toggle(
      "active",
      showDashboard
    );

    startTaskNavButton.classList.toggle(
      "active",
      !showDashboard
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
          class="task-action secondary"
          type="button"
          disabled
        >
          Return
        </button>

        <button
          class="task-action primary"
          type="button"
          disabled
        >
          Complete
        </button>
      </div>

            <div class="action-preview-note">
        Block, Return, and Complete will be activated after
        Pause is tested successfully.
      </div>
    `;

        const pauseTaskButton =
      document.getElementById("pause-task-button");

    const blockTaskButton =
      document.getElementById("block-task-button");

    pauseTaskButton.addEventListener(
      "click",
      openPauseModal
    );

    blockTaskButton.addEventListener(
      "click",
      openBlockModal
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

      if (currentTaskAction === "resume") {
        await submitResumeTask();
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
        startTaskOptionsData = null;
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
