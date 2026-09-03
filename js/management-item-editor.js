"use strict";

/**
 * Authoritative Management Item editor.
 *
 * Enhanced Item tables delegate editing here instead of creating their own
 * modal implementations. The base master-data module continues to own Item
 * listing/import setup; this file owns the enhanced-table edit modal.
 */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function modalShell(title,body) {
    document.querySelector(".ops-modal-backdrop[data-phase1-item-editor='1']")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "ops-modal-backdrop";
    backdrop.dataset.phase1ItemEditor = "1";
    backdrop.innerHTML = `<div class="ops-modal"><h2 style="margin-top:0">${esc(title)}</h2>${body}</div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openItemModal(row) {
    const modal = modalShell(row ? "Edit Item" : "New Item", `<form id="ops-item-form" class="ops-form-grid" data-phase1-item-editor="1">
      <label>Item Name<input id="oi-name" required value="${esc(row?.item_name || "")}"></label>
      <label>Internal ID<input id="oi-internal" required value="${esc(row?.internal_id || "")}"></label>
      <label>SKU Group<input id="oi-sku" value="${esc(row?.sku_group || "")}"></label>
      <label>WO Department<input id="oi-dept" value="${esc(row?.work_order_department || "")}"></label>
      <label>Make<input id="oi-make" value="${esc(row?.make || "")}"></label>
      <label>Build Type<input id="oi-build" value="${esc(row?.build_type || "")}"></label>
      <label>Operation Code<select id="oi-op"><option value="">None</option>${["P","SA","T"].map((x) => `<option ${x===row?.operation_code ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Cycle Time (minutes)<input id="oi-cycle" type="number" min="0" step="0.0001" value="${esc(row?.item_cycle_time_minutes ?? "")}"></label>
      <label class="full"><input id="oi-active" type="checkbox" ${row?.is_active === false ? "" : "checked"}> Active</label>
      <div class="full ops-actions"><button type="button" class="ghost" id="oi-cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>`);

    modal.querySelector("#oi-cancel").addEventListener("click", () => modal.remove());
    modal.querySelector("#ops-item-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const save = modal.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        await rpc("save_operations_item", {
          p_session_token:token(),
          p_item_id:row?.id || null,
          p_item_name:modal.querySelector("#oi-name").value,
          p_internal_id:modal.querySelector("#oi-internal").value,
          p_sku_group:modal.querySelector("#oi-sku").value || null,
          p_work_order_department:modal.querySelector("#oi-dept").value || null,
          p_make:modal.querySelector("#oi-make").value || null,
          p_item_cycle_time_minutes:modal.querySelector("#oi-cycle").value === "" ? null : Number(modal.querySelector("#oi-cycle").value),
          p_build_type:modal.querySelector("#oi-build").value || null,
          p_operation_code:modal.querySelector("#oi-op").value || null,
          p_is_active:modal.querySelector("#oi-active").checked
        });
        modal.remove();
        document.getElementById("ops-item-refresh")?.click();
      } catch (error) {
        alert(error.message || "Unable to save Item changes.");
        save.disabled = false;
      }
    });
  }

  window.TaskTrackerManagementMaster = Object.assign(window.TaskTrackerManagementMaster || {}, {
    openItemModal
  });
})();
