"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const qaTable = document.getElementById("qa-table");
  const app = document.getElementById("app");
  if (!config || !supabaseLib || !qaTable || !app) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));

  let setup = null;
  let isAdmin = false;
  let records = [];
  let activeRecord = null;
  let selectedItemId = null;
  let decorateTimer = null;
  let decorateBusy = false;

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function currentQaOffset() {
    const text = $("qa-page-info")?.textContent || "";
    const match = text.match(/Showing\s+(\d+)/i);
    return match ? Math.max(0, Number(match[1]) - 1) : 0;
  }

  function ensureOption(options, id, name, department = null) {
    const list = [...(options || [])];
    if (id && !list.some((row) => row.employee_id === id)) {
      list.unshift({ employee_id: id, employee_name: name || "Current Employee", department });
    }
    return list;
  }

  function optionHtml(options, selectedId, includeDepartment = false) {
    return (options || []).map((row) => {
      const label = includeDepartment && row.department
        ? `${row.employee_name} · ${row.department}`
        : row.employee_name;
      return `<option value="${esc(row.employee_id)}" ${row.employee_id === selectedId ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
  }

  async function refreshRecordMap() {
    if (!isAdmin || decorateBusy || !token()) return;
    const buttons = [...qaTable.querySelectorAll(".qa-edit-history")];
    if (!buttons.length) return;

    const start = $("qa-start")?.value;
    const end = $("qa-end")?.value;
    if (!start || !end) return;

    decorateBusy = true;
    try {
      const data = await rpc("get_qa_history_page", {
        p_session_token: token(),
        p_start_date: start,
        p_end_date: end,
        p_builder_employee_id: $("builder-filter")?.value || null,
        p_qa_employee_id: $("qa-filter")?.value || null,
        p_page_size: 50,
        p_page_offset: currentQaOffset()
      });

      records = data?.records || [];
      buttons.forEach((button, index) => {
        button.dataset.qaIdentityIndex = String(index);
      });
    } catch (error) {
      console.warn("QA identity correction mapping skipped:", error.message);
    } finally {
      decorateBusy = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(() => refreshRecordMap(), 120);
  }

  function findFieldContainer(modal, labelText) {
    return [...modal.querySelectorAll(".qa-history-edit-grid > div")].find((node) => {
      return node.querySelector("label")?.textContent?.trim() === labelText;
    }) || null;
  }

  function showModalError(modal, text) {
    const message = modal.querySelector("#qh-message");
    if (!message) return;
    message.textContent = text;
    message.dataset.type = "error";
    message.hidden = false;
  }

  function enhanceModal(modal) {
    if (!isAdmin || !activeRecord || modal.dataset.qaIdentityEnhanced === "1") return;
    modal.dataset.qaIdentityEnhanced = "1";

    const row = activeRecord;
    const isManual = row.entry_source === "QA_MANUAL";
    selectedItemId = row.item_id || null;

    const note = modal.querySelector("h2")?.nextElementSibling;
    if (note) {
      note.textContent = "Administrator correction. QA Employee can be corrected. Builder / Employee can only be changed for QA manual entries. QA completion date and Task Type remain locked. All changes require a reason and are audited.";
    }

    const builderContainer = findFieldContainer(modal, "Builder");
    if (builderContainer && isManual) {
      const builderOptions = ensureOption(
        setup?.employee_options,
        row.builder_employee_id,
        row.builder_name
      );
      builderContainer.innerHTML = `
        <label>Builder / Employee</label>
        <select id="qh-builder-employee">${optionHtml(builderOptions, row.builder_employee_id, true)}</select>
        <div class="muted" style="font-size:11px;margin-top:5px">Manual QA entry — Administrator correction only.</div>`;
    }

    if (builderContainer) {
      const qaOptions = ensureOption(
        setup?.qa_rep_options,
        row.qa_employee_id,
        row.qa_rep
      );
      const qaContainer = document.createElement("div");
      qaContainer.innerHTML = `
        <label>QA Employee</label>
        <select id="qh-qa-employee">${optionHtml(qaOptions, row.qa_employee_id)}</select>`;
      builderContainer.insertAdjacentElement("afterend", qaContainer);
    }

    const itemSearch = modal.querySelector("#qh-item-search");
    if (itemSearch) {
      itemSearch.addEventListener("input", () => {
        selectedItemId = null;
      }, true);
    }

    modal.addEventListener("click", (event) => {
      const itemButton = event.target.closest(".qa-history-item-result");
      if (itemButton?.dataset?.id) selectedItemId = itemButton.dataset.id;
    }, true);

    const saveButton = modal.querySelector("#qh-save");
    if (!saveButton) return;

    saveButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const reason = modal.querySelector("#qh-reason")?.value.trim();
      const qaEmployeeId = modal.querySelector("#qh-qa-employee")?.value || row.qa_employee_id;
      const builderEmployeeId = isManual
        ? modal.querySelector("#qh-builder-employee")?.value
        : row.builder_employee_id;
      const quantity = Number(modal.querySelector("#qh-qty")?.value) || 0;
      const passed = Number(modal.querySelector("#qh-pass")?.value) || 0;
      const rejected = Number(modal.querySelector("#qh-reject")?.value) || 0;

      if (!reason) {
        showModalError(modal, "A correction reason is required.");
        return;
      }
      if (!qaEmployeeId) {
        showModalError(modal, "Select a QA Employee.");
        return;
      }
      if (isManual && !builderEmployeeId) {
        showModalError(modal, "Select the Employee for the manual QA entry.");
        return;
      }
      if (!selectedItemId) {
        showModalError(modal, "Select a listed Item.");
        return;
      }
      if (quantity <= 0) {
        showModalError(modal, "Quantity must be greater than zero.");
        return;
      }
      if (Math.abs((passed + rejected) - quantity) > 0.000001) {
        showModalError(modal, "Passed plus Rejected must equal Quantity.");
        return;
      }

      const errors = [...modal.querySelectorAll("input[data-error-type-id]")]
        .map((input) => ({
          error_type_id: input.dataset.errorTypeId,
          quantity: Number(input.value) || 0
        }))
        .filter((entry) => entry.quantity > 0);

      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      try {
        await rpc("admin_edit_qa_history_review_v2", {
          p_session_token: token(),
          p_qa_review_id: row.qa_review_id,
          p_correction_reason: reason,
          p_qa_employee_id: qaEmployeeId,
          p_builder_employee_id: builderEmployeeId,
          p_item_id: selectedItemId,
          p_assigned_quantity: quantity,
          p_work_order_number: modal.querySelector("#qh-wo")?.value || null,
          p_job_type: modal.querySelector("#qh-job-type")?.value || null,
          p_quantity_passed: passed,
          p_quantity_rejected: rejected,
          p_error_entries: errors,
          p_qa_comments: modal.querySelector("#qh-comments")?.value.trim() || null
        });

        modal.closest(".qa-history-backdrop")?.remove();
        activeRecord = null;
        selectedItemId = null;
        $("qa-load")?.click();
      } catch (error) {
        showModalError(modal, error.message);
        saveButton.disabled = false;
        saveButton.textContent = "Save Correction";
      }
    }, true);
  }

  qaTable.addEventListener("click", (event) => {
    const button = event.target.closest(".qa-edit-history");
    if (!button || !isAdmin) return;
    const index = Number(button.dataset.qaIdentityIndex);
    activeRecord = Number.isFinite(index) ? records[index] || null : null;
  }, true);

  const tableObserver = new MutationObserver(() => scheduleRefresh());
  tableObserver.observe(qaTable, { childList: true, subtree: true });

  const modalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const modal = node.matches?.(".qa-history-modal")
          ? node
          : node.querySelector?.(".qa-history-modal");
        if (modal) enhanceModal(modal);
      }
    }
  });
  modalObserver.observe(document.body, { childList: true, subtree: true });

  async function init() {
    const sessionToken = token();
    if (!sessionToken) return;
    try {
      setup = await rpc("get_history_workspace_options", { p_session_token: sessionToken });
      isAdmin = setup?.viewer?.role === "Administrator";
      if (isAdmin) scheduleRefresh();
    } catch (error) {
      isAdmin = false;
    }
  }

  new MutationObserver(() => {
    if (!app.hidden) setTimeout(init, 80);
  }).observe(app, { attributes: true, attributeFilter: ["hidden"] });

  window.addEventListener("pageshow", () => setTimeout(init, 150));
  setTimeout(init, 500);
})();
