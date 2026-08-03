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

  let currentSession = null;
  let elapsedTimer = null;
  let activeJobStartedAt = null;

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

  function configureNavigation(permissionContext) {
    const role = permissionContext.employee_role;

    setVisible(employeeNav, true);

    setVisible(
      supervisorNav,
      role === "Supervisor" ||
      role === "Manager" ||
      role === "Administrator"
    );

    setVisible(
      managerNav,
      role === "Manager" ||
      role === "Administrator"
    );

    setVisible(
      administratorNav,
      role === "Administrator"
    );
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

    if (!startedAt) {
      return;
    }

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
    if (!job) {
      return "Task";
    }

    if (job.task_type_name === "Non-Productive") {
      return (
        job.non_productive_task_name ||
        job.job_type ||
        "Non-Productive Task"
      );
    }

    return (
      job.item_name ||
      job.item_not_listed_detail ||
      job.job_type ||
      "Productive Task"
    );
  }

  function getJobReference(job) {
    const parts = [];

    if (job.work_order_number) {
      parts.push(`WO ${job.work_order_number}`);
    }

    if (job.work_order_type) {
      parts.push(job.work_order_type);
    }

    if (job.internal_id) {
      parts.push(job.internal_id);
    }

    return parts.join(" · ");
  }

  function renderActiveJob(activeJob) {
    stopElapsedTimer();

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
                ${escapeHtml(activeJob.job_type || "Not specified")}
              </strong>
            </div>

            <div class="task-detail">
              <span class="task-detail-label">
                Started
              </span>

              <strong>
                ${escapeHtml(
                  formatDateTime(activeJob.session_started_at)
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
          class="task-action secondary"
          type="button"
          disabled
        >
          Pause
        </button>

        <button
          class="task-action warning"
          type="button"
          disabled
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
        Task controls are displayed for design review. They will
        be activated individually in the next workflow rollout.
      </div>
    `;

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

              <span>
                Updated
              </span>

              <strong>
                ${escapeHtml(
                  formatDateTime(job.last_updated_at)
                )}
              </strong>

              <button
                class="resume-preview-button"
                type="button"
                disabled
              >
                Resume
              </button>

            </div>

          </article>
        `;
      })
      .join("");
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
      taskStateMessage.textContent = "";
    } catch (error) {
      console.error(error);

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

  async function displayApplication(session) {
    const permissions =
      await auth.getPermissionContext(session.sessionToken);

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
      const option = document.createElement("option");

      option.value = employee.employee_id;
      option.textContent = employee.employee_name;

      if (employee.department) {
        option.textContent += ` — ${employee.department}`;
      }

      employeeSelect.appendChild(option);
    });

    if (employees.length === 0) {
      showLoginMessage(
        "No active employees are currently available.",
        "warning"
      );
    }
  }

  async function initializeApplication() {
    setLoginLoading(true);

    showLoginMessage(
      "Connecting securely to Task Tracker...",
      "info"
    );

    try {
      const restoredSession = await auth.restoreSession();

      if (restoredSession) {
        await displayApplication(restoredSession);
        return;
      }

      await loadEmployeeList();
      clearLoginMessage();
      displayLogin();
    } catch (error) {
      console.error(error);

      displayLogin();

      showLoginMessage(
        error.message ||
        "Task Tracker could not connect to the database."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearLoginMessage();

    const employeeId = employeeSelect.value;
    const pin = pinInput.value.trim();

    if (!employeeId) {
      showLoginMessage("Select your employee name.");
      employeeSelect.focus();
      return;
    }

    if (!pin) {
      showLoginMessage("Enter your secure PIN.");
      pinInput.focus();
      return;
    }

    if (!/^\d+$/.test(pin)) {
      showLoginMessage("The PIN must contain numbers only.");
      pinInput.focus();
      return;
    }

    setLoginLoading(true);

    try {
      const result = await auth.login(employeeId, pin);

      if (!result.successful) {
        showLoginMessage(result.message);
        pinInput.value = "";
        pinInput.focus();
        return;
      }

      await displayApplication({
        sessionToken: result.sessionToken,
        employee: result.employee
      });
    } catch (error) {
      console.error(error);

      showLoginMessage(
        error.message ||
        "The login request could not be completed."
      );
    } finally {
      setLoginLoading(false);
    }
  });

  dashboardRefreshButton.addEventListener(
    "click",
    loadTaskState
  );

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
      await auth.logout();
    } finally {
      logoutButton.disabled = false;
      logoutButton.textContent = "Sign out";

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
  });

  initializeApplication();
});
