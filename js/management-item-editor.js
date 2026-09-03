"use strict";

/**
 * Authoritative Management Item editor and Item Master Import enhancer.
 *
 * Enhanced Item tables delegate editing here instead of creating their own
 * modal implementations. The base master-data module continues to own the
 * Item listing shell; this file owns the Item edit modal and upgrades the
 * legacy Cycle Time Import tab into the Phase 3 Item Master Import.
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

  const fieldLabels = {
    item_name:"Item",
    sku_group:"SKU Group",
    make:"Make",
    work_order_department:"WO Department",
    build_type:"Build Type",
    operation_code:"Operation",
    item_cycle_time_minutes:"Cycle Time",
    is_active:"Active",
    item_type:"Item Type",
    inventory_planning_role:"Inventory Planning Role",
    item_category:"Item Category",
    item_status:"Item Status",
    build_notes:"Build Notes"
  };

  let importRows = [];
  let previewRows = [];
  let importFileName = "";

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
      <label>Item Type<input id="oi-type" value="${esc(row?.item_type || "")}"></label>
      <label>Inventory Planning Role<input id="oi-planning-role" value="${esc(row?.inventory_planning_role || "")}"></label>
      <label>Item Category<input id="oi-category" value="${esc(row?.item_category || "")}"></label>
      <label>Item Status<input id="oi-item-status" value="${esc(row?.item_status || "")}"></label>
      <label class="full">Build Notes<textarea id="oi-notes" rows="4">${esc(row?.build_notes || "")}</textarea></label>
      <label class="full"><input id="oi-active" type="checkbox" ${row?.is_active === false ? "" : "checked"}> Active in Task Tracker</label>
      <div class="full ops-actions"><button type="button" class="ghost" id="oi-cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>`);

    modal.querySelector("#oi-cancel").addEventListener("click", () => modal.remove());
    modal.querySelector("#ops-item-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const save = modal.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        await rpc("save_operations_item_v2", {
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
          p_is_active:modal.querySelector("#oi-active").checked,
          p_item_type:modal.querySelector("#oi-type").value || null,
          p_inventory_planning_role:modal.querySelector("#oi-planning-role").value || null,
          p_item_category:modal.querySelector("#oi-category").value || null,
          p_item_status:modal.querySelector("#oi-item-status").value || null,
          p_build_notes:modal.querySelector("#oi-notes").value || null
        });
        modal.remove();
        document.getElementById("ops-item-refresh")?.click();
      } catch (error) {
        alert(error.message || "Unable to save Item changes.");
        save.disabled = false;
      }
    });
  }

  function canonicalHeader(value) {
    const key = String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[()]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const map = {
      "internal id":"internal_id",
      "internalid":"internal_id",
      "item":"item_name",
      "item name":"item_name",
      "sku group":"sku_group",
      "make":"make",
      "wo department":"work_order_department",
      "work order department":"work_order_department",
      "build type":"build_type",
      "operation":"operation_code",
      "operation code":"operation_code",
      "cycle time":"item_cycle_time_minutes",
      "cycle time minutes":"item_cycle_time_minutes",
      "item cycle time":"item_cycle_time_minutes",
      "item cycle time minutes":"item_cycle_time_minutes",
      "status":"is_active",
      "active":"is_active",
      "active status":"is_active",
      "task tracker status":"is_active",
      "item type":"item_type",
      "inventory planning role":"inventory_planning_role",
      "item category":"item_category",
      "item status":"item_status",
      "build notes":"build_notes"
    };

    return map[key] || key.replace(/\s+/g, "_");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = "";
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }

    row.push(cell.replace(/\r$/, ""));
    if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    if (!rows.length) return [];

    const headers = rows.shift().map(canonicalHeader);
    if (!headers.includes("internal_id")) {
      throw new Error("The import file must contain an Internal ID column.");
    }

    return rows
      .filter((values) => values.some((value) => String(value).trim() !== ""))
      .map((values) => {
        const item = {};
        headers.forEach((header,index) => {
          if (!header) return;
          item[header] = values[index] ?? "";
        });
        return item;
      });
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "(blank)";
    if (value === true || value === "true") return "Active";
    if (value === false || value === "false") return "Inactive";
    return String(value);
  }

  function changeSummary(row) {
    const changes = row?.changes && typeof row.changes === "object" ? row.changes : {};
    const entries = Object.entries(changes);
    if (!entries.length) return row?.error_message ? esc(row.error_message) : "No changes";

    return entries.map(([field,change]) => {
      const label = fieldLabels[field] || field;
      return `<div><strong>${esc(label)}</strong>: ${esc(displayValue(change?.old))} &rarr; ${esc(displayValue(change?.new))}</div>`;
    }).join("");
  }

  function previewSummary() {
    const counts = previewRows.reduce((acc,row) => {
      const status = String(row?.status || "UNKNOWN");
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const parts = [
      `${previewRows.length} row${previewRows.length === 1 ? "" : "s"} previewed`,
      `${counts.READY || 0} ready`,
      `${counts.UNCHANGED || 0} unchanged`
    ];
    const blocked = previewRows.length - (counts.READY || 0) - (counts.UNCHANGED || 0);
    if (blocked > 0) parts.push(`${blocked} blocked`);
    return parts.join(" · ");
  }

  function renderPreview() {
    const summary = document.getElementById("ops-import-summary");
    const table = document.getElementById("ops-import-table");
    const apply = document.getElementById("ops-import-apply");
    if (!summary || !table || !apply) return;

    if (!previewRows.length) {
      summary.textContent = importRows.length
        ? `${importRows.length} row${importRows.length === 1 ? "" : "s"} loaded from ${importFileName || "CSV"}. Preview is required before applying.`
        : "Choose a CSV file to begin.";
      table.innerHTML = "";
      apply.disabled = true;
      return;
    }

    summary.textContent = previewSummary();
    const readyCount = previewRows.filter((row) => row.status === "READY").length;
    apply.disabled = readyCount === 0;

    const rows = previewRows.map((row) => {
      const status = esc(row.status || "UNKNOWN");
      const statusClass = row.status === "READY" ? "ready" : row.status === "UNCHANGED" ? "same" : "bad";
      return `<tr>
        <td>${esc(row.row_number ?? "")}</td>
        <td><strong>${esc(row.internal_id || "—")}</strong></td>
        <td>${esc(row.matched_item_name || "—")}</td>
        <td class="${statusClass}"><span class="ops-badge">${status}</span></td>
        <td>${changeSummary(row)}</td>
      </tr>`;
    }).join("");

    table.innerHTML = `<table class="ops-table ops-import-preview"><thead><tr><th>Row</th><th>Internal ID</th><th>Matched Item</th><th>Status</th><th>Changes / Issue</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function readImportFile(event) {
    const file = event.target.files?.[0];
    importRows = [];
    previewRows = [];
    importFileName = file?.name || "";

    if (!file) {
      renderPreview();
      return;
    }

    try {
      importRows = parseCsv(await file.text());
      if (!importRows.length) throw new Error("The CSV does not contain any data rows.");
      renderPreview();
    } catch (error) {
      const summary = document.getElementById("ops-import-summary");
      if (summary) summary.textContent = error.message || "Unable to read the CSV file.";
      document.getElementById("ops-import-table").innerHTML = "";
      document.getElementById("ops-import-apply").disabled = true;
    }
  }

  async function previewImport() {
    if (!importRows.length) {
      alert("Choose an Item Master CSV file first.");
      return;
    }

    const button = document.getElementById("ops-import-preview-btn");
    const apply = document.getElementById("ops-import-apply");
    button.disabled = true;
    apply.disabled = true;
    try {
      previewRows = await rpc("preview_item_master_import", {
        p_session_token:token(),
        p_rows:importRows
      }) || [];
      renderPreview();
    } catch (error) {
      previewRows = [];
      renderPreview();
      alert(error.message || "Unable to preview Item Master import.");
    } finally {
      button.disabled = false;
    }
  }

  async function applyImport() {
    const readyCount = previewRows.filter((row) => row.status === "READY").length;
    if (!readyCount) {
      alert("Preview the file first. There are no ready rows to apply.");
      return;
    }

    if (!window.confirm(`Apply ${readyCount} ready Item Master row${readyCount === 1 ? "" : "s"}? Rows marked NOT_FOUND or INVALID will not be changed.`)) return;

    const apply = document.getElementById("ops-import-apply");
    const preview = document.getElementById("ops-import-preview-btn");
    apply.disabled = true;
    preview.disabled = true;
    try {
      const result = await rpc("apply_item_master_import", {
        p_session_token:token(),
        p_rows:importRows
      });
      previewRows = result?.preview || [];
      renderPreview();
      const count = Number(result?.updated_count || 0);
      alert(`${count} Item Master row${count === 1 ? "" : "s"} updated successfully.`);
      document.getElementById("ops-item-refresh")?.click();
    } catch (error) {
      alert(error.message || "Unable to apply Item Master import.");
    } finally {
      preview.disabled = false;
      renderPreview();
    }
  }

  async function installItemMasterImport() {
    const section = document.getElementById("ops-import");
    if (!section || section.dataset.phase3ItemMasterImport === "1") return false;

    section.dataset.phase3ItemMasterImport = "1";
    const tab = document.querySelector('.ops-tab[data-ops-tab="import"]');
    if (tab) tab.textContent = "Item Master Import";

    section.innerHTML = `
      <div class="ops-note"><strong>Item Master Import.</strong> Internal ID is the required matching key. Existing Items can be updated; missing Internal IDs are flagged <strong>NOT_FOUND</strong> and are never created. Blank cells leave the current value unchanged. Enter <strong>CLEAR</strong> to intentionally erase a nullable field.</div>
      <div class="ops-note">Supported headers: Item, Internal ID, SKU Group, Make, WO Department, Build Type, Operation, Cycle Time, Status, Item Type, Inventory Planning Role, Item Category, Item Status, Build Notes.</div>
      <div class="ops-toolbar"><input id="ops-import-file" type="file" accept=".csv,text/csv"><button id="ops-import-preview-btn" class="ghost" type="button">Preview Import</button><button id="ops-import-apply" class="primary" type="button" disabled>Apply Ready Rows</button></div>
      <div id="ops-import-summary" class="ops-note">Choose a CSV file to begin.</div>
      <div id="ops-import-table" class="ops-table-wrap"></div>`;

    document.getElementById("ops-import-file").addEventListener("change", readImportFile);
    document.getElementById("ops-import-preview-btn").addEventListener("click", previewImport);
    document.getElementById("ops-import-apply").addEventListener("click", applyImport);

    try {
      const setup = await rpc("get_operations_master_options", {p_session_token:token()});
      document.getElementById("ops-import-apply").hidden = !setup?.viewer?.can_edit;
    } catch {
      document.getElementById("ops-import-apply").hidden = true;
    }

    return true;
  }

  async function watchForImportShell() {
    if (await installItemMasterImport()) return;
    const observer = new MutationObserver(async () => {
      if (await installItemMasterImport()) observer.disconnect();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.TaskTrackerManagementMaster = Object.assign(window.TaskTrackerManagementMaster || {}, {
    openItemModal
  });

  watchForImportShell();
})();
