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
  let setupOptions = null;
  let tasks = [];
  let selectedTaskId = null;

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function fillSelect(id, items, valueKey, labelBuilder, placeholder) {
    const select = $(id);
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    (items || []).forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = typeof labelBuilder === "function" ? labelBuilder(item) : item[labelBuilder];
      select.appendChild(option);
    });
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

  async function signOut() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    sessionEmployee = null;
    setupOptions = null;
    tasks = [];
    selectedTaskId = null;

    if (token) {
      try {
        await rpc("logout_employee_session", { p_session_token: token });
      } catch (error) {
        console.warn("Server logout did not complete:", error.message);
      }
    }

    $("app").hidden = true;
    $("login").hidden = false;
    $("employee").value = "";
    $("pin").value = "";
    setMessage("Signed out. Select the next employee to continue.", "success");
  }

  async function loadSetupOptions() {
    setupOptions = await rpc("get_supervisor_operations_setup_options", {
      p_session_token: sessionToken
    });

    $("create-card").hidden = !setupOptions.can_assign_tasks;

    fillSelect(
      "assigned-supervisor",
      setupOptions.supervisors || [],
      "employee_id",
      (item) => [item.employee_name, item.department].filter(Boolean).join(" · "),
      "Select supervisor"
    );

    fillSelect(
      "task-type",
      setupOptions.task_types || [],
      "task_type_code",
      (item) => item.task_type_name,
      "Select task type"
    );

    fillSelect(
      "linked-employee",
      setupOptions.employees || [],
      "employee_id",
      (item) => [item.employee_name, item.department].filter(Boolean).join(" · "),
      "No linked employee"
    );
  }

  function renderTasks() {
    const wrap = $("tasks");
    wrap.innerHTML = "";
    $("task-count").textContent = String(tasks.length);

    if (!tasks.length) {
      wrap.innerHTML = '<div class="muted">No Supervisor Operations tasks match this view.</div>';
      return;
    }

    tasks.forEach((task) => {
      const card = document.createElement("div");
      card.className = "task";
      const priorityClass = String(task.priority || "Normal").toLowerCase();
      card.innerHTML = `
        <div class="row">
          <div>
            <h3>${escapeHtml(task.title || task.task_type_name || "Supervisor Task")}</h3>
            <div class="meta">${escapeHtml([task.task_type_name, task.employee_name, task.business_date ? `Business ${task.business_date}` : null, task.due_date ? `Due ${task.due_date}` : null].filter(Boolean).join(" · "))}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill ${priorityClass}">${escapeHtml(task.priority || "Normal")}</span><span class="pill">${escapeHtml(task.status)}</span></div>
        </div>
        ${task.details ? `<div style="margin-top:10px">${escapeHtml(task.details)}</div>` : ""}
        ${task.completion_notes ? `<div class="meta" style="margin-top:8px">Completion: ${escapeHtml(task.completion_notes)}</div>` : ""}
        <div class="actions"></div>
      `;

      const actions = card.querySelector(".actions");
      if (task.status === "Pending") {
        const start = document.createElement("button");
        start.type = "button";
        start.className = "secondary";
        start.textContent = "Start";
        start.addEventListener("click", () => startTask(task.supervisor_task_id));
        actions.appendChild(start);
      }
      if (["Pending", "In Progress"].includes(task.status)) {
        const complete = document.createElement("button");
        complete.type = "button";
        complete.className = "primary";
        complete.textContent = "Complete";
        complete.addEventListener("click", () => openComplete(task));
        actions.appendChild(complete);

        if (setupOptions?.can_cancel_tasks) {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "danger";
          cancel.textContent = "Cancel";
          cancel.addEventListener("click", () => openCancel(task));
          actions.appendChild(cancel);
        }
      }

      wrap.appendChild(card);
    });
  }

  async function loadTasks() {
    tasks = await rpc("get_my_supervisor_tasks", {
      p_session_token: sessionToken,
      p_include_completed: $("include-completed").checked
    });
    tasks = Array.isArray(tasks) ? tasks : [];
    renderTasks();
  }

  async function startTask(id) {
    setMessage("Starting Supervisor Operations task...");
    try {
      await rpc("start_supervisor_task", {
        p_session_token: sessionToken,
        p_supervisor_task_id: id
      });
      setMessage("Supervisor Operations task started.", "success");
      await loadTasks();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function openComplete(task) {
    selectedTaskId = task.supervisor_task_id;
    $("complete-summary").textContent = `${task.title} · ${task.assigned_supervisor_name || ""}`;
    $("completion-notes").value = "";
    $("complete-card").hidden = false;
    $("cancel-card").hidden = true;
  }

  function openCancel(task) {
    selectedTaskId = task.supervisor_task_id;
    $("cancel-summary").textContent = `${task.title} · ${task.assigned_supervisor_name || ""}`;
    $("cancel-reason").value = "";
    $("cancel-card").hidden = false;
    $("complete-card").hidden = true;
  }

  async function completeSelected() {
    if (!selectedTaskId) return;
    setMessage("Completing Supervisor Operations task...");
    try {
      await rpc("complete_supervisor_task", {
        p_session_token: sessionToken,
        p_supervisor_task_id: selectedTaskId,
        p_completion_notes: $("completion-notes").value.trim() || null
      });
      $("complete-card").hidden = true;
      selectedTaskId = null;
      setMessage("Supervisor Operations task completed.", "success");
      await loadTasks();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function cancelSelected() {
    if (!selectedTaskId) return;
    const reason = $("cancel-reason").value.trim();
    if (!reason) {
      setMessage("Cancellation reason is required.", "error");
      return;
    }
    setMessage("Cancelling Supervisor Operations task...");
    try {
      await rpc("cancel_supervisor_task", {
        p_session_token: sessionToken,
        p_supervisor_task_id: selectedTaskId,
        p_reason: reason
      });
      $("cancel-card").hidden = true;
      selectedTaskId = null;
      setMessage("Supervisor Operations task cancelled.", "success");
      await loadTasks();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function createTask(event) {
    event.preventDefault();
    setMessage("Creating Supervisor Operations task...");
    try {
      await rpc("create_supervisor_task", {
        p_session_token: sessionToken,
        p_assigned_supervisor_id: $("assigned-supervisor").value,
        p_task_type_code: $("task-type").value,
        p_title: $("title").value.trim(),
        p_details: $("details").value.trim() || null,
        p_employee_id: $("linked-employee").value || null,
        p_business_date: $("business-date").value || null,
        p_due_date: $("due-date").value || null,
        p_priority: $("priority").value
      });
      $("create-form").reset();
      setMessage("Supervisor Operations task created.", "success");
      await loadTasks();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || sessionEmployee?.name || "Employee";
    setMessage("");
    await loadSetupOptions();
    await loadTasks();
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
  $("create-form").addEventListener("submit", createTask);
  $("refresh").addEventListener("click", () => loadTasks().catch((e) => setMessage(e.message, "error")));
  $("include-completed").addEventListener("change", () => loadTasks().catch((e) => setMessage(e.message, "error")));
  $("sign-out").addEventListener("click", () => signOut().catch((e) => setMessage(e.message, "error")));
  $("confirm-complete").addEventListener("click", completeSelected);
  $("cancel-complete").addEventListener("click", () => { selectedTaskId = null; $("complete-card").hidden = true; });
  $("confirm-cancel").addEventListener("click", cancelSelected);
  $("close-cancel").addEventListener("click", () => { selectedTaskId = null; $("cancel-card").hidden = true; });

  init();
})();
