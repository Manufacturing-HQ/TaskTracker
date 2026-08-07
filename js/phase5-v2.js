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
  let actionOptions = null;
  let selectedTaskType = null;
  let selectedItem = null;
  let itemNotListedMode = false;
  let itemSearchTimer = null;
  let currentState = null;
  let currentAction = null;
  let editSelectedItem = null;
  let editItemNotListedMode = false;
  let editSearchTimer = null;

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
      option.value = valueKey ? item[valueKey] : item;
      option.textContent = labelKey ? item[labelKey] : item;
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

    fillSelect("department", startOptions.filters?.departments || [], null, null, "All departments");
    fillSelect("make", startOptions.filters?.makes || [], null, null, "All makes");

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

  async function loadActionOptions() {
    if (actionOptions) return actionOptions;
    actionOptions = await rpc("get_task_action_options", {
      p_session_token: sessionToken
    });
    return actionOptions;
  }

  function selectTaskType(task, button) {
    selectedTaskType = task;
    document.querySelectorAll("#task-types .choice").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");

    const productive = task.task_type_name === "Productive";
    $("productive-fields").hidden = !productive;
    $("np-fields").hidden = productive;
    if (!productive) setItemNotListedMode(false);
  }

  function setItemNotListedMode(enabled) {
    itemNotListedMode = enabled;
    $("item-not-listed-fields").hidden = !enabled;
    $("item-not-listed-toggle").textContent = enabled ? "Cancel Item Not Listed" : "Item Not Listed";
    $("item-search").disabled = enabled;
    $("department").disabled = enabled;
    $("make").disabled = enabled;

    if (enabled) {
      selectedItem = null;
      $("item-search").value = "";
      $("item-results").innerHTML = "";
      renderSelectedItem();
    } else {
      $("item-not-listed-detail").value = "";
    }
  }

  async function refreshFilterOptions() {
    if (itemNotListedMode) return;
    selectedItem = null;
    renderSelectedItem();
    await loadOptions();
    await searchItems();
  }

  async function searchItems() {
    if (!sessionToken || itemNotListedMode) return;
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
      if (itemNotListedMode) {
        if (!startOptions?.placeholder_item?.item_id) return "Item Not Listed is not configured.";
        if (!$("item-not-listed-detail").value.trim()) return "Enter the Item Not Listed description.";
      } else if (!selectedItem) {
        return "Select an item.";
      }
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
    const startItem = productive && itemNotListedMode ? startOptions.placeholder_item : selectedItem;
    const itemDetail = productive && itemNotListedMode ? $("item-not-listed-detail").value.trim() : null;
    $("start-button").disabled = true;
    setMessage("Starting task...");

    try {
      const rows = await rpc("start_my_task_v2", {
        p_session_token: sessionToken,
        p_task_type_id: selectedTaskType.task_type_id,
        p_item_id: productive ? startItem.item_id : null,
        p_item_not_listed_detail: itemDetail,
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
    itemNotListedMode = false;
    $("productive-fields").hidden = true;
    $("np-fields").hidden = true;
    $("item-not-listed-fields").hidden = true;
    $("item-not-listed-toggle").textContent = "Item Not Listed";
    $("item-search").disabled = false;
    $("department").disabled = false;
    $("make").disabled = false;
    $("selected-item").hidden = true;
    $("selected-item").innerHTML = "";
    $("item-results").innerHTML = "";
    document.querySelectorAll("#task-types .choice").forEach((b) => b.classList.remove("selected"));
  }

  function renderUnfinishedJobs(jobs) {
    const box = $("unfinished");
    box.innerHTML = "";

    if (!(jobs || []).length) {
      box.innerHTML = '<div class="empty">No unfinished jobs.</div>';
      return;
    }

    jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "mini-card";
      card.innerHTML = `
        <strong>Job #${escapeHtml(job.job_number)} · ${escapeHtml(job.job_status)}</strong>
        <div>${escapeHtml(job.item_not_listed_detail || job.item_name || job.non_productive_task_name || "")}</div>
        <div class="state-meta">${escapeHtml([job.work_order_number, job.job_type].filter(Boolean).join(" · "))}</div>
        ${["Paused", "Blocked"].includes(job.job_status) ? `<div style="margin-top:10px"><button class="secondary resume-job" type="button" data-job-id="${escapeHtml(job.job_id)}">Resume</button></div>` : ""}
      `;
      box.appendChild(card);
    });

    box.querySelectorAll(".resume-job").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const state = await rpc("resume_my_task", {
            p_session_token: sessionToken,
            p_job_id: button.dataset.jobId,
            p_comments: null
          });
          setMessage("Task resumed successfully.", "success");
          renderState(state);
        } catch (error) {
          setMessage(error.message, "error");
        }
      });
    });
  }

  function renderReworkRequests(requests) {
    const box = $("rework-list");
    box.innerHTML = "";

    if (!(requests || []).length) {
      box.innerHTML = '<div class="empty">No pending QA rework.</div>';
      return;
    }

    requests.forEach((request) => {
      const card = document.createElement("div");
      card.className = "mini-card";
      card.innerHTML = `
        <strong>${escapeHtml(request.item_name || "QA Rework")}</strong>
        <div>${escapeHtml([request.work_order_number, `Qty ${request.requested_quantity}`].filter(Boolean).join(" · "))}</div>
        <div class="state-meta">${escapeHtml(request.comments || "")}</div>
        ${request.can_start ? `<div style="margin-top:10px"><button class="primary start-rework" type="button" data-request-id="${escapeHtml(request.rework_request_id)}">Start Rework</button></div>` : ""}
      `;
      box.appendChild(card);
    });

    box.querySelectorAll(".start-rework").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await rpc("start_my_qa_rework", {
            p_session_token: sessionToken,
            p_rework_request_id: button.dataset.requestId,
            p_comments: null
          });
          setMessage("QA rework started as Non-Productive work.", "success");
          await loadState();
        } catch (error) {
          setMessage(error.message, "error");
        }
      });
    });
  }

  function renderState(state) {
    currentState = state || {};
    const active = currentState.active_job;
    const box = $("state");

    if (!active) {
      box.innerHTML = '<div class="empty">No active task.</div>';
      $("active-actions").hidden = true;
      closeEditPanel();
    } else {
      box.innerHTML = `
        <div class="state-title">${escapeHtml(active.task_type_name)} · Job #${escapeHtml(active.job_number)}</div>
        <div>${escapeHtml(active.item_not_listed_detail || active.item_name || active.non_productive_task_name || "")}</div>
        <div class="state-meta">${escapeHtml([active.work_order_number, active.job_type, active.assigned_quantity ? `Qty ${active.assigned_quantity}` : null].filter(Boolean).join(" · "))}</div>
      `;
      $("active-actions").hidden = false;
      $("edit-current-job").hidden = active.task_type_name !== "Productive";
    }

    const unfinished = currentState.unfinished_jobs || [];
    const rework = currentState.pending_qa_rework_requests || [];
    $("rework-count").textContent = String(rework.length);
    renderUnfinishedJobs(unfinished);
    renderReworkRequests(rework);
  }

  async function loadState() {
    const state = await rpc("get_my_task_state_v2", { p_session_token: sessionToken });
    renderState(state);
  }

  function fillEditSelects() {
    fillSelect("edit-work-order-type", startOptions?.work_order_types || [], null, null, "Select work order type");
    fillSelect("edit-job-type", startOptions?.job_types || [], null, null, "Select job type");
  }

  function renderEditSelectedItem() {
    const el = $("edit-selected-item");
    if (!editSelectedItem) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<strong>${escapeHtml(editSelectedItem.item_name || "Item Not Listed")}</strong><span>${escapeHtml([editSelectedItem.internal_id, editSelectedItem.operation_code ? `Operation ${editSelectedItem.operation_code}` : null].filter(Boolean).join(" · "))}</span>`;
  }

  function setEditItemNotListedMode(enabled) {
    editItemNotListedMode = enabled;
    $("edit-item-not-listed-fields").hidden = !enabled;
    $("edit-item-not-listed-toggle").textContent = enabled ? "Cancel Item Not Listed" : "Item Not Listed";
    $("edit-item-search").disabled = enabled;
    $("edit-item-results").innerHTML = "";

    if (enabled) {
      editSelectedItem = startOptions?.placeholder_item || null;
      $("edit-item-search").value = "";
      renderEditSelectedItem();
    } else {
      $("edit-item-not-listed-detail").value = "";
      editSelectedItem = null;
      renderEditSelectedItem();
    }
  }

  async function openEditPanel() {
    const active = currentState?.active_job;
    if (!active) {
      setMessage("There is no active task to edit.", "error");
      return;
    }
    if (active.task_type_name !== "Productive") {
      setMessage("Only the current Productive job can be edited here.", "error");
      return;
    }

    if (!startOptions) await loadOptions();
    fillEditSelects();
    $("edit-reason").value = "";
    $("edit-work-order").value = active.work_order_number || "";
    $("edit-quantity").value = active.assigned_quantity ?? "";
    $("edit-work-order-type").value = active.work_order_type || "";
    $("edit-job-type").value = active.job_type || "";
    $("edit-comments").value = active.comments || "";
    $("edit-item-results").innerHTML = "";
    $("edit-item-search").value = "";

    editItemNotListedMode = Boolean(active.item_not_listed_detail);
    $("edit-item-not-listed-fields").hidden = !editItemNotListedMode;
    $("edit-item-not-listed-toggle").textContent = editItemNotListedMode ? "Cancel Item Not Listed" : "Item Not Listed";
    $("edit-item-search").disabled = editItemNotListedMode;
    $("edit-item-not-listed-detail").value = active.item_not_listed_detail || "";

    if (editItemNotListedMode) {
      editSelectedItem = startOptions.placeholder_item;
    } else {
      editSelectedItem = {
        item_id: active.item_id,
        item_name: active.item_name,
        internal_id: active.internal_id,
        operation_code: active.operation_code
      };
    }
    renderEditSelectedItem();
    $("action-editor").hidden = true;
    $("edit-job-panel").hidden = false;
  }

  function closeEditPanel() {
    if (!$('edit-job-panel')) return;
    $("edit-job-panel").hidden = true;
    editSelectedItem = null;
    editItemNotListedMode = false;
    $("edit-item-results").innerHTML = "";
  }

  async function searchEditItems() {
    if (!sessionToken || editItemNotListedMode) return;
    const search = $("edit-item-search").value.trim();
    const items = await rpc("search_start_task_items_v2", {
      p_session_token: sessionToken,
      p_search_text: search || null,
      p_department: null,
      p_make: null,
      p_result_limit: 50
    });

    const results = $("edit-item-results");
    results.innerHTML = "";
    (items || []).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "item-row";
      button.innerHTML = `<strong>${escapeHtml(item.item_name)}</strong><span>${escapeHtml([item.internal_id, item.work_order_department, item.make].filter(Boolean).join(" · "))}</span>`;
      button.addEventListener("click", () => {
        editSelectedItem = item;
        renderEditSelectedItem();
        results.innerHTML = "";
      });
      results.appendChild(button);
    });
    if (!(items || []).length) results.innerHTML = '<div class="empty">No matching items.</div>';
  }

  async function saveJobEdit() {
    const active = currentState?.active_job;
    if (!active) {
      setMessage("There is no active task to edit.", "error");
      return;
    }

    const reason = $("edit-reason").value.trim();
    const workOrder = $("edit-work-order").value.trim();
    const quantity = Number($("edit-quantity").value);
    const workOrderType = $("edit-work-order-type").value;
    const jobType = $("edit-job-type").value;
    const comments = $("edit-comments").value.trim() || null;
    const detail = editItemNotListedMode ? $("edit-item-not-listed-detail").value.trim() : null;

    if (!reason) return setMessage("Enter a correction reason.", "error");
    if (!workOrder) return setMessage("Enter the work order number.", "error");
    if (!(quantity > 0)) return setMessage("Assigned quantity must be greater than zero.", "error");
    if (!workOrderType) return setMessage("Select the work order type.", "error");
    if (!jobType) return setMessage("Select the job type.", "error");
    if (editItemNotListedMode) {
      if (!startOptions?.placeholder_item?.item_id) return setMessage("Item Not Listed is not configured.", "error");
      if (!detail) return setMessage("Enter the Item Not Listed description.", "error");
    } else if (!editSelectedItem?.item_id) {
      return setMessage("Select an item.", "error");
    }

    const productiveType = (startOptions?.task_types || []).find((t) => t.task_type_name === "Productive");
    if (!productiveType) return setMessage("Productive task type is not configured.", "error");

    $("save-job-edit").disabled = true;
    setMessage("Saving job changes...");
    try {
      const state = await rpc("edit_permitted_job_v2", {
        p_session_token: sessionToken,
        p_job_id: active.job_id,
        p_correction_reason: reason,
        p_task_type_id: productiveType.task_type_id,
        p_assigned_quantity: quantity,
        p_item_id: editItemNotListedMode ? startOptions.placeholder_item.item_id : editSelectedItem.item_id,
        p_item_not_listed_detail: detail,
        p_non_productive_task_id: null,
        p_work_order_number: workOrder,
        p_work_order_type: workOrderType,
        p_job_type: jobType,
        p_job_comments: comments
      });
      closeEditPanel();
      setMessage("Job details updated successfully.", "success");
      renderState(state);
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("save-job-edit").disabled = false;
    }
  }

  async function openAction(action) {
    const active = currentState?.active_job;
    if (!active) {
      setMessage("There is no active task.", "error");
      return;
    }

    closeEditPanel();
    currentAction = action;
    $("action-editor").hidden = false;
    $("action-title").textContent = `${action.charAt(0).toUpperCase()}${action.slice(1)} Job #${active.job_number}`;
    $("action-comments").value = "";

    const reasonField = $("action-reason-field");
    const reasonSelect = $("action-reason");

    if (action === "complete") {
      reasonField.hidden = true;
      reasonSelect.innerHTML = "";
    } else {
      reasonField.hidden = false;
      const options = await loadActionOptions();
      const key = `${action}_reasons`;
      fillSelect("action-reason", options?.[key] || [], "stop_reason_id", "reason_name", `Select ${action} reason`);
    }
  }

  function closeActionEditor() {
    currentAction = null;
    $("action-editor").hidden = true;
    $("action-comments").value = "";
    $("action-reason").innerHTML = "";
  }

  async function confirmAction() {
    const active = currentState?.active_job;
    if (!active || !currentAction) return;

    const comments = $("action-comments").value.trim() || null;
    const reasonId = $("action-reason").value || null;

    if (currentAction !== "complete" && !reasonId) {
      setMessage(`Select a ${currentAction} reason.`, "error");
      return;
    }

    const functionName = currentAction === "complete"
      ? "complete_my_task_v2"
      : `${currentAction}_my_task`;

    const args = {
      p_session_token: sessionToken,
      p_job_id: active.job_id,
      p_comments: comments
    };

    if (currentAction !== "complete") {
      args.p_stop_reason_id = reasonId;
    }

    try {
      const state = await rpc(functionName, args);
      closeActionEditor();
      setMessage(`Task ${currentAction === "complete" ? "completed" : `${currentAction}d`} successfully.`, "success");
      renderState(state);
    } catch (error) {
      setMessage(error.message, "error");
    }
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
  $("item-not-listed-toggle").addEventListener("click", () => setItemNotListedMode(!itemNotListedMode));
  $("edit-current-job").addEventListener("click", () => openEditPanel().catch((e) => setMessage(e.message, "error")));
  $("cancel-job-edit").addEventListener("click", closeEditPanel);
  $("save-job-edit").addEventListener("click", () => saveJobEdit().catch((e) => setMessage(e.message, "error")));
  $("edit-item-not-listed-toggle").addEventListener("click", () => setEditItemNotListedMode(!editItemNotListedMode));
  $("edit-item-search").addEventListener("input", () => {
    clearTimeout(editSearchTimer);
    editSearchTimer = setTimeout(() => searchEditItems().catch((e) => setMessage(e.message, "error")), 250);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => openAction(button.dataset.action).catch((e) => setMessage(e.message, "error")));
  });
  $("confirm-action").addEventListener("click", () => confirmAction());
  $("cancel-action").addEventListener("click", closeActionEditor);

  init();
})();
