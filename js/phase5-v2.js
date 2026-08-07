"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;

  if (!config || !supabaseLib) {
    throw new Error("Task Tracker configuration failed to load.");
  }

  const client = supabaseLib.createClient(
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

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;

  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let startOptions = null;
  let selectedTaskType = null;
  let selectedItem = null;
  let itemSearchTimer = null;

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
      const rows = await rpc("get_employee_session_context", {
        p_session_token: sessionToken
      });
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
      try {
        await rpc("logout_employee_session", { p_session_token: token });
      } catch {}
    }
    $("app").hidden = true;
    $("login").hidden = false;
    setMessage("Signed out.");
  }

  function fillSelect(id, items, valueKey, labelKey, placeholder) {
    const select = $(id);
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    (items || []).forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey] ?? item;
      option.textContent = item[labelKey] ?? item;
      select.appendChild(option);
    });
  }

  async function loadOptions() {
    startOptions = await rpc("get_start_task_options_v2", {
      p_session_token: sessionToken,
      p_department: $("department").value || null,
      p_make: $("make").value || null
    });

    const currentDepartment = $("department").value;
    const currentMake = $("make").value;

    fillSelect("department", startOptions.filters?.departments || [], "department", "department", "All departments");
    fillSelect("make", startOptions.filters?.makes || [], "make", "make", "All makes");

    if ([...$("department").options].some((o) => o.value === currentDepartment)) $("department").value = currentDepartment;
    if ([...$("make").options].some((o) => o.value === currentMake)) $("make").value = currentMake;

    fillSelect("work-order-type", startOptions.work_order_types || [], null, null, "Select work order type");
    fillSelect("job-type", startOptions.job_types || [], null, null, "Select job type");
    fillSelect("np-task", startOptions.non_productive_tasks || [], "non_productive_task_id", "task_name", "Select non-productive task");

    const taskWrap = $("task-types");
    taskWrap.innerHTML = "";
    (startOptions.task_types || []).forEach((task) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.textContent = task.task_type_name;
      button.addEventListener("click", () => selectTaskType(task, button));
      taskWrap.appendChild(button);
    });
  }

  function selectTaskType(task, button) {
    selectedTaskType = task;
    document.querySelectorAll("#task-types .choice").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");

    const productive = task.task_type_name === "Productive";
    $("productive-fields").hidden = !productive;
    $("np-fields").hidden = productive;
  }

  async function refreshFilterOptions() {
    selectedItem = null;
    renderSelectedItem();
    await loadOptions();
    await searchItems();
  }

  async function searchItems() {
    if (!sessionToken) return;
    const search = $("item-search").value.trim();

    const items = await rpc("search_start_task_items_v2", {
      p_session_token: sessionToken,
      p_search_text: search || null,
      p_department: $("department").value || null,
      p_make: $("make").value || null,
      p_result_limit: 50
    });

    const results = $("item-results");
    results.innerHTML = "";

    (items || []).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "item-row";
      button.innerHTML = `<strong>${escapeHtml(item.item_name)}</strong><span>${escapeHtml([item.work_order_department, item.make].filter(Boolean).join(" · "))}</span>`;
      button.addEventListener("click", () => {
        selectedItem = item;
        renderSelectedItem();
        results.innerHTML = "";
      });
      results.appendChild(button);
    });

    if (!(items || []).length) {
      results.innerHTML = '<div class="empty">No matching items.</div>';
    }
  }

  function renderSelectedItem() {
    const el = $("selected-item");
    if (!selectedItem) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<strong>${escapeHtml(selectedItem.item_name)}</strong><span>${escapeHtml([selectedItem.work_order_department, selectedItem.make, selectedItem.operation_code ? `Operation ${selectedItem.operation_code}` : null].filter(Boolean).join(" · "))}</span>`;
  }

  function validateStart() {
    if (!selectedTaskType) return "Select Productive or Non-Productive.";

    if (selectedTaskType.task_type_name === "Productive") {
      if (!selectedItem) return "Select an item.";
      if (!$("work-order").value.trim()) return "Enter the work order number.";
      if (!$("work-order-type").value) return "Select the work order type.";
      if (!$("job-type").value) return "Select the job type.";
      if (!(Number($("quantity").value) > 0)) return "Enter an assigned quantity greater than zero.";
    } else {
      if (!$("np-task").value) return "Select a non-productive task.";
      const duration = $("scheduled-minutes").value.trim();
      if (duration && (Number(duration) < 1 || Number(duration) > 30)) return "Scheduled duration must be between 1 and 30 minutes.";
    }
    return null;
  }

  async function startTask(event) {
    event.preventDefault();
    const validation = validateStart();
    if (validation) {
      setMessage(validation, "error");
      return;
    }

    const productive = selectedTaskType.task_type_name === "Productive";
    $("start-button").disabled = true;
    setMessage("Starting task...");

    try {
      const rows = await rpc("start_my_task_v2", {
        p_session_token: sessionToken,
        p_task_type_id: selectedTaskType.task_type_id,
        p_item_id: productive ? selectedItem.item_id : null,
        p_item_not_listed_detail: null,
        p_work_order_number: productive ? $("work-order").value.trim() : null,
        p_work_order_type: productive ? $("work-order-type").value : null,
        p_job_type: productive ? $("job-type").value : null,
        p_assigned_quantity: productive ? Number($("quantity").value) : null,
        p_non_productive_task_id: productive ? null : $("np-task").value,
        p_scheduled_duration_minutes: productive || !$("scheduled-minutes").value ? null : Number($("scheduled-minutes").value),
        p_comments: $("comments").value.trim() || null
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      setMessage(`Job #${row?.job_number ?? ""} started successfully.`, "success");
      resetForm();
      await loadState();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("start-button").disabled = false;
    }
  }

  function resetForm() {
    $("start-form").reset();
    selectedTaskType = null;
    selectedItem = null;
    $("productive-fields").hidden = true;
    $("np-fields").hidden = true;
    $("selected-item").hidden = true;
    $("selected-item").innerHTML = "";
    $("item-results").innerHTML = "";
    document.querySelectorAll("#task-types .choice").forEach((b) => b.classList.remove("selected"));
  }

  async function loadState() {
    const state = await rpc("get_my_task_state_v2", { p_session_token: sessionToken });
    const active = state?.active_job;
    const box = $("state");

    if (!active) {
      box.innerHTML = '<div class="empty">No active task.</div>';
    } else {
      box.innerHTML = `
        <div class="state-title">${escapeHtml(active.task_type_name)} · Job #${escapeHtml(active.job_number)}</div>
        <div>${escapeHtml(active.item_name || active.non_productive_task_name || "")}</div>
        <div class="state-meta">${escapeHtml([active.work_order_number, active.job_type, active.assigned_quantity ? `Qty ${active.assigned_quantity}` : null].filter(Boolean).join(" · "))}</div>
      `;
    }

    const rework = state?.pending_qa_rework_requests || [];
    $("rework-count").textContent = String(rework.length);
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || sessionEmployee?.name || "Employee";
    setMessage("");
    await loadOptions();
    await loadState();
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
  $("logout").addEventListener("click", () => logout().catch(() => {}));
  $("start-form").addEventListener("submit", startTask);
  $("refresh-state").addEventListener("click", () => loadState().catch((e) => setMessage(e.message, "error")));
  $("department").addEventListener("change", () => refreshFilterOptions().catch((e) => setMessage(e.message, "error")));
  $("make").addEventListener("change", () => refreshFilterOptions().catch((e) => setMessage(e.message, "error")));
  $("item-search").addEventListener("input", () => {
    clearTimeout(itemSearchTimer);
    itemSearchTimer = setTimeout(() => searchItems().catch((e) => setMessage(e.message, "error")), 250);
  });

  init();
})();
