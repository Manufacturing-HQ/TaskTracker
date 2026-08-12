"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const list = document.getElementById("employee-list");
  if (!config || !supabaseLib || !list) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  let admin = false;
  let decorateTimer = null;
  let decorateBusy = false;
  let currentItem = null;
  let searchTimer = null;

  const style = document.createElement("style");
  style.textContent = `
    .history-admin-edit-row{display:flex;justify-content:flex-end;margin-bottom:10px}.history-admin-edit{font-size:12px}
    .history-edit-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;padding:20px;z-index:1000}.history-edit-modal{width:min(780px,96vw);max-height:92vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}.history-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.history-edit-grid .full{grid-column:1/-1}.history-edit-grid label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.history-edit-grid input,.history-edit-grid select,.history-edit-grid textarea{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px;background:#fff}.history-edit-grid textarea{min-height:100px;resize:vertical}.history-item-results{max-height:180px;overflow:auto;border:1px solid #cbd5e1;border-radius:9px;margin-top:6px}.history-item-result{display:block;width:100%;border:0;border-bottom:1px solid #e2e8f0;background:#fff;padding:9px;text-align:left;cursor:pointer}.history-item-result:hover{background:#f8fafc}.history-edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.history-edit-note{font-size:12px;color:#64748b;margin:-6px 0 14px}
    @media(max-width:700px){.history-edit-grid{grid-template-columns:1fr}.history-edit-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function showPageMessage(text, type = "info") {
    const el = document.getElementById("message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function pageOffset() {
    const text = document.getElementById("employee-page-info")?.textContent || "";
    const match = text.match(/Showing\s+(\d+)/i);
    return match ? Math.max(0, Number(match[1]) - 1) : 0;
  }

  async function currentPageJobs() {
    const employeeId = document.getElementById("employee-filter")?.value;
    const start = document.getElementById("employee-start")?.value;
    const end = document.getElementById("employee-end")?.value;
    if (!employeeId || !start || !end) return [];
    const data = await rpc("get_employee_history_timeline_page", {
      p_session_token: token(),
      p_employee_id: employeeId,
      p_start_date: start,
      p_end_date: end,
      p_page_size: 50,
      p_page_offset: pageOffset()
    });
    return data?.jobs || [];
  }

  async function decorate() {
    if (!admin || decorateBusy || !token()) return;
    const cards = [...list.querySelectorAll("details.history-card")];
    if (!cards.length) return;
    if (cards.every((c) => c.dataset.adminEditDecorated === "1")) return;
    decorateBusy = true;
    try {
      const jobs = await currentPageJobs();
      cards.forEach((card, index) => {
        if (card.dataset.adminEditDecorated === "1") return;
        const job = jobs[index];
        if (!job) return;
        card.dataset.adminEditDecorated = "1";
        if (job.task_type !== "Productive") return;
        const detail = card.querySelector(".history-detail");
        if (!detail) return;
        const row = document.createElement("div");
        row.className = "history-admin-edit-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost history-admin-edit";
        button.textContent = "Edit Job Details";
        button.onclick = () => openEditor(job).catch((e) => showPageMessage(e.message, "error"));
        row.appendChild(button);
        detail.insertAdjacentElement("afterbegin", row);
      });
    } catch (e) {
      console.warn("History admin edit decoration skipped:", e.message);
    } finally {
      decorateBusy = false;
    }
  }

  async function searchItems(modal) {
    const q = modal.querySelector("#history-edit-item-search").value.trim();
    const rows = await rpc("search_start_task_items_v2", {
      p_session_token: token(),
      p_search_text: q || null,
      p_department: null,
      p_make: null,
      p_result_limit: 30
    });
    const box = modal.querySelector("#history-edit-item-results");
    box.innerHTML = (rows || []).map((r) => `<button type="button" class="history-item-result" data-id="${esc(r.item_id)}" data-name="${esc(r.item_name)}"><strong>${esc(r.item_name)}</strong><div style="font-size:11px;color:#64748b">${esc(r.internal_id || "")}${r.make ? ` · ${esc(r.make)}` : ""}</div></button>`).join("") || '<div style="padding:9px;color:#64748b">No matching items.</div>';
    box.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        currentItem = { item_id: b.dataset.id, item_name: b.dataset.name };
        modal.querySelector("#history-edit-selected-item").textContent = `Selected: ${currentItem.item_name}`;
        box.innerHTML = "";
      };
    });
  }

  async function openEditor(job) {
    const [context, options] = await Promise.all([
      rpc("get_qa_job_context", { p_session_token: token(), p_job_id: job.job_id }),
      rpc("get_start_task_options_v2", { p_session_token: token(), p_department: null, p_make: null })
    ]);
    const j = context?.job;
    if (!j) throw new Error("Unable to load the selected Job details.");
    const productiveTask = (options?.task_types || []).find((t) => t.task_type_name === "Productive");
    if (!productiveTask?.task_type_id) throw new Error("Productive task type is unavailable.");
    currentItem = j.item_id ? { item_id: j.item_id, item_name: j.item_name } : null;

    const backdrop = document.createElement("div");
    backdrop.className = "history-edit-backdrop";
    backdrop.innerHTML = `<div class="history-edit-modal"><h2 style="margin-top:0">Edit Job #${esc(j.job_number)}</h2><div class="history-edit-note">Administrator correction. Saving recalculates cycle time, expected minutes, and operation code and writes a structured correction audit.</div><div class="history-edit-grid">
      <div class="full"><label>Correction Reason</label><input id="history-edit-reason" placeholder="Required"></div>
      <div class="full"><label>Item Search</label><input id="history-edit-item-search" value="${esc(j.item_name || "")}" placeholder="Search item or Internal ID"><div id="history-edit-item-results" class="history-item-results"></div><div id="history-edit-selected-item" style="font-size:12px;color:#64748b;margin-top:5px">Selected: ${esc(j.item_name || "—")}</div></div>
      <div><label>Assigned Quantity</label><input id="history-edit-qty" type="number" min="0.01" step="0.01" value="${esc(j.assigned_quantity ?? "")}"></div>
      <div><label>Work Order Number</label><input id="history-edit-wo" value="${esc(j.work_order_number || "")}"></div>
      <div><label>Work Order Type</label><select id="history-edit-wo-type">${(options?.work_order_types || ["Production","Priority"]).map((x) => `<option value="${esc(x)}" ${x === j.work_order_type ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
      <div><label>Job Type</label><select id="history-edit-job-type">${(options?.job_types || ["Build Line","Solid Keys","Aftermarket","New In Bag"]).map((x) => `<option value="${esc(x)}" ${x === j.job_type ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="full"><label>Job Comments</label><textarea id="history-edit-comments">${esc(j.comments || "")}</textarea></div>
    </div><div id="history-edit-message" class="msg" hidden></div><div class="history-edit-actions"><button id="history-edit-cancel" type="button" class="ghost">Cancel</button><button id="history-edit-save" type="button" class="primary">Save Correction</button></div></div>`;
    document.body.appendChild(backdrop);
    const modal = backdrop.querySelector(".history-edit-modal");
    modal.querySelector("#history-edit-cancel").onclick = () => backdrop.remove();
    modal.querySelector("#history-edit-item-search").oninput = () => {
      currentItem = null;
      modal.querySelector("#history-edit-selected-item").textContent = "Select an item from the search results before saving.";
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => searchItems(modal).catch(() => {}), 250);
    };
    modal.querySelector("#history-edit-save").onclick = async () => {
      const msg = modal.querySelector("#history-edit-message");
      const reason = modal.querySelector("#history-edit-reason").value.trim();
      if (!reason) {
        msg.textContent = "A correction reason is required.";
        msg.dataset.type = "error";
        msg.hidden = false;
        return;
      }
      if (!currentItem?.item_id) {
        msg.textContent = "Select a listed Item.";
        msg.dataset.type = "error";
        msg.hidden = false;
        return;
      }
      const save = modal.querySelector("#history-edit-save");
      save.disabled = true;
      save.textContent = "Saving...";
      try {
        await rpc("edit_permitted_job_v2", {
          p_session_token: token(),
          p_job_id: j.job_id,
          p_correction_reason: reason,
          p_task_type_id: productiveTask.task_type_id,
          p_assigned_quantity: Number(modal.querySelector("#history-edit-qty").value),
          p_item_id: currentItem.item_id,
          p_item_not_listed_detail: null,
          p_non_productive_task_id: null,
          p_work_order_number: modal.querySelector("#history-edit-wo").value,
          p_work_order_type: modal.querySelector("#history-edit-wo-type").value,
          p_job_type: modal.querySelector("#history-edit-job-type").value,
          p_job_comments: modal.querySelector("#history-edit-comments").value.trim() || null
        });
        backdrop.remove();
        showPageMessage("Job details corrected and audit record created.", "success");
        document.getElementById("employee-load")?.click();
      } catch (e) {
        msg.textContent = e.message;
        msg.dataset.type = "error";
        msg.hidden = false;
        save.disabled = false;
        save.textContent = "Save Correction";
      }
    };
  }

  async function initAdmin() {
    const t = token();
    if (!t) return false;
    try {
      const rows = await rpc("get_employee_session_context", { p_session_token: t });
      const ctx = Array.isArray(rows) ? rows[0] : rows;
      admin = (ctx?.employee_role || ctx?.role) === "Administrator";
      if (admin) decorate();
      return admin;
    } catch {
      return false;
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(() => {
      if (admin) decorate();
      else initAdmin();
    }, 160);
  });
  observer.observe(list, { childList: true, subtree: true });

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    initAdmin();
    if (admin || tries > 30) clearInterval(timer);
  }, 300);
})();