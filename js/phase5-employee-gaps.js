"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const token = () => sessionStorage.getItem(sessionKey);
  let itemNotListedMode = false;
  let startOptions = null;
  let editState = null;
  let editSelectedItem = null;
  let editSearchTimer = null;

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function esc(v) {
    return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function message(text, type = "info") {
    const el = $("message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  async function getOptions() {
    startOptions = await rpc("get_start_task_options_v2", {
      p_session_token: token(), p_department: null, p_make: null
    });
    return startOptions;
  }

  function selectedTaskTypeName() {
    return document.querySelector("#task-types .choice.selected")?.textContent?.trim() || "";
  }

  function addItemNotListedControls() {
    const search = $("item-search");
    if (!search || $("item-not-listed-toggle")) return;
    const wrap = search.parentElement;
    const controls = document.createElement("div");
    controls.style.marginTop = "10px";
    controls.innerHTML = `
      <button id="item-not-listed-toggle" class="secondary" type="button">Item Not Listed</button>
      <div id="item-not-listed-fields" style="margin-top:10px" hidden>
        <label for="item-not-listed-detail">Item Description</label>
        <input id="item-not-listed-detail" type="text" placeholder="Type the item that is not listed">
        <div class="muted" style="margin-top:6px">This will use the system Item Not Listed placeholder and preserve your description on the job.</div>
      </div>`;
    wrap.appendChild(controls);
    $("item-not-listed-toggle").addEventListener("click", () => {
      itemNotListedMode = !itemNotListedMode;
      $("item-not-listed-fields").hidden = !itemNotListedMode;
      $("item-not-listed-toggle").textContent = itemNotListedMode ? "Use Listed Item Instead" : "Item Not Listed";
      search.disabled = itemNotListedMode;
      if (itemNotListedMode) {
        search.value = "";
        $("item-results").innerHTML = "";
        $("selected-item").hidden = true;
      }
    });
  }

  async function handlePlaceholderStart(event) {
    if (!itemNotListedMode) return;
    if (selectedTaskTypeName() !== "Productive") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const opts = startOptions || await getOptions();
      const productiveType = (opts.task_types || []).find(x => x.task_type_name === "Productive");
      const placeholder = opts.placeholder_item;
      const detail = $("item-not-listed-detail")?.value.trim();
      if (!placeholder?.item_id) throw new Error("The Item Not Listed placeholder is not configured.");
      if (!detail) throw new Error("Enter the item description.");
      if (!$("work-order").value.trim()) throw new Error("Enter the work order number.");
      if (!$("work-order-type").value) throw new Error("Select the work order type.");
      if (!$("job-type").value) throw new Error("Select the job type.");
      if (!(Number($("quantity").value) > 0)) throw new Error("Enter an assigned quantity greater than zero.");

      $("start-button").disabled = true;
      message("Starting Item Not Listed task...");
      const rows = await rpc("start_my_task_v2", {
        p_session_token: token(),
        p_task_type_id: productiveType.task_type_id,
        p_item_id: placeholder.item_id,
        p_item_not_listed_detail: detail,
        p_work_order_number: $("work-order").value.trim(),
        p_work_order_type: $("work-order-type").value,
        p_job_type: $("job-type").value,
        p_assigned_quantity: Number($("quantity").value),
        p_non_productive_task_id: null,
        p_scheduled_duration_minutes: null,
        p_comments: $("comments").value.trim() || null
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      message(`Job #${row?.job_number ?? ""} started successfully.`, "success");
      itemNotListedMode = false;
      $("item-not-listed-fields").hidden = true;
      $("item-not-listed-toggle").textContent = "Item Not Listed";
      $("item-search").disabled = false;
      $("start-form").reset();
      document.querySelectorAll("#task-types .choice").forEach(b => b.classList.remove("selected"));
      $("productive-fields").hidden = true;
      $("np-fields").hidden = true;
      $("selected-item").hidden = true;
      $("item-results").innerHTML = "";
      $("refresh-state").click();
    } catch (e) {
      message(e.message, "error");
    } finally {
      $("start-button").disabled = false;
    }
  }

  function ensureEditUi() {
    if ($("edit-job-panel")) return;
    const activeActions = $("active-actions");
    if (!activeActions) return;
    const btn = document.createElement("button");
    btn.id = "edit-current-job";
    btn.className = "secondary";
    btn.type = "button";
    btn.textContent = "Edit Job Details";
    activeActions.querySelector(".actions")?.prepend(btn);

    const panel = document.createElement("div");
    panel.id = "edit-job-panel";
    panel.className = "action-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="state-title">Edit Active Job</div>
      <div class="grid" style="margin-top:14px">
        <div><label>Correction Reason</label><input id="edit-reason" type="text" placeholder="Required reason for edit"></div>
        <div><label>Assigned Quantity</label><input id="edit-quantity" type="number" min="0.01" step="0.01"></div>
        <div><label>Work Order Number</label><input id="edit-work-order" type="text"></div>
        <div><label>Work Order Type</label><select id="edit-work-order-type"></select></div>
        <div><label>Job Type</label><select id="edit-job-type"></select></div>
        <div class="full"><label>Item Search</label><input id="edit-item-search" type="text" placeholder="Search item name or internal ID"><div id="edit-item-results" class="item-results"></div><div id="edit-selected-item" style="margin-top:10px"></div></div>
        <div class="full"><button id="edit-placeholder-toggle" class="secondary" type="button">Item Not Listed</button></div>
        <div id="edit-placeholder-field" class="full" hidden><label>Item Description</label><input id="edit-item-detail" type="text"></div>
        <div class="full"><label>Job Comments</label><textarea id="edit-comments"></textarea></div>
        <div class="full actions"><button id="save-job-edit" class="primary" type="button">Save Changes</button><button id="cancel-job-edit" class="secondary" type="button">Cancel</button></div>
      </div>`;
    activeActions.parentElement.appendChild(panel);

    btn.addEventListener("click", openEdit);
    $("cancel-job-edit").addEventListener("click", () => panel.hidden = true);
    $("save-job-edit").addEventListener("click", saveEdit);
    $("edit-placeholder-toggle").addEventListener("click", () => {
      const f = $("edit-placeholder-field");
      f.hidden = !f.hidden;
      $("edit-item-search").disabled = !f.hidden;
      if (!f.hidden) {
        editSelectedItem = startOptions?.placeholder_item || null;
        renderEditSelectedItem();
      }
    });
    $("edit-item-search").addEventListener("input", () => {
      clearTimeout(editSearchTimer);
      editSearchTimer = setTimeout(() => searchEditItems().catch(e => message(e.message, "error")), 250);
    });
  }

  async function openEdit() {
    try {
      const state = await rpc("get_my_task_state_v2", { p_session_token: token() });
      const active = state?.active_job;
      if (!active) throw new Error("There is no active task to edit.");
      if (active.task_type_name !== "Productive") throw new Error("Employee editing is currently available for active Productive jobs.");
      editState = active;
      const opts = startOptions || await getOptions();
      const fill = (id, values) => {
        const s = $(id);
        s.innerHTML = '<option value="">Select</option>';
        values.forEach(v => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v;
          s.appendChild(o);
        });
      };
      fill("edit-work-order-type", opts.work_order_types || []);
      fill("edit-job-type", opts.job_types || []);
      $("edit-reason").value = "";
      $("edit-quantity").value = active.assigned_quantity ?? "";
      $("edit-work-order").value = active.work_order_number ?? "";
      $("edit-work-order-type").value = active.work_order_type ?? "";
      $("edit-job-type").value = active.job_type ?? "";
      $("edit-comments").value = active.comments ?? "";
      $("edit-item-detail").value = active.item_not_listed_detail ?? "";
      const isPlaceholder = Boolean(active.item_not_listed_detail);
      $("edit-placeholder-field").hidden = !isPlaceholder;
      $("edit-item-search").disabled = isPlaceholder;
      if (isPlaceholder) editSelectedItem = opts.placeholder_item;
      else editSelectedItem = { item_id: active.item_id, item_name: active.item_name, internal_id: active.internal_id };
      renderEditSelectedItem();
      $("edit-job-panel").hidden = false;
    } catch (e) {
      message(e.message, "error");
    }
  }

  async function searchEditItems() {
    const q = $("edit-item-search").value.trim();
    const items = await rpc("search_start_task_items_v2", {
      p_session_token: token(), p_search_text: q || null, p_department: null, p_make: null, p_result_limit: 30
    });
    const box = $("edit-item-results");
    box.innerHTML = "";
    (items || []).forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "item-row";
      b.innerHTML = `<strong>${esc(item.item_name)}</strong><span>${esc(item.internal_id || "")}</span>`;
      b.addEventListener("click", () => {
        editSelectedItem = item;
        renderEditSelectedItem();
        box.innerHTML = "";
      });
      box.appendChild(b);
    });
  }

  function renderEditSelectedItem() {
    const el = $("edit-selected-item");
    if (!editSelectedItem) {
      el.textContent = "No item selected";
      return;
    }
    el.innerHTML = `<strong>${esc(editSelectedItem.item_name || "Item Not Listed")}</strong><div class="muted">${esc(editSelectedItem.internal_id || "")}</div>`;
  }

  async function saveEdit() {
    try {
      if (!editState) throw new Error("No active job is loaded.");
      const reason = $("edit-reason").value.trim();
      if (!reason) throw new Error("Enter a correction reason.");
      if (!editSelectedItem?.item_id) throw new Error("Select an item.");
      const isPlaceholder = !$("edit-placeholder-field").hidden;
      const detail = isPlaceholder ? $("edit-item-detail").value.trim() : null;
      if (isPlaceholder && !detail) throw new Error("Enter the Item Not Listed description.");
      const qty = Number($("edit-quantity").value);
      if (!(qty > 0)) throw new Error("Assigned quantity must be greater than zero.");
      const opts = startOptions || await getOptions();
      const productiveType = (opts.task_types || []).find(x => x.task_type_name === "Productive");
      await rpc("edit_permitted_job_v2", {
        p_session_token: token(),
        p_job_id: editState.job_id,
        p_correction_reason: reason,
        p_task_type_id: productiveType.task_type_id,
        p_assigned_quantity: qty,
        p_item_id: editSelectedItem.item_id,
        p_item_not_listed_detail: detail,
        p_non_productive_task_id: null,
        p_work_order_number: $("edit-work-order").value.trim(),
        p_work_order_type: $("edit-work-order-type").value,
        p_job_type: $("edit-job-type").value,
        p_job_comments: $("edit-comments").value.trim() || null
      });
      $("edit-job-panel").hidden = true;
      message("Active job details updated successfully.", "success");
      $("refresh-state").click();
    } catch (e) {
      message(e.message, "error");
    }
  }

  document.addEventListener("submit", handlePlaceholderStart, true);
  addItemNotListedControls();
  ensureEditUi();
})();
