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

  let currentSession = null;

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
  }

  function displayLogin() {
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
