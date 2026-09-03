"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const overview = document.getElementById("view-overview");
  if (!config || !supabaseLib || !overview) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  let setup = null;
  let employeeRows = [];
  let itemRows = [];
  let importRows = [];
  let previewRows = [];

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  const style = document.createElement("style");
  style.textContent = `
    .ops-master{margin-top:16px}.ops-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 16px}.ops-tab{border:1px solid #94a3b8;background:#fff;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer}.ops-tab.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.ops-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px}.ops-toolbar input{min-height:40px;border:1px solid #94a3b8;border-radius:9px;padding:0 10px}.ops-toolbar .grow{flex:1;min-width:220px}.ops-note{font-size:12px;color:#64748b;margin:8px 0 12px}.ops-table-wrap{overflow:auto;border:1px solid #94a3b8;border-radius:12px}.ops-table{width:100%;border-collapse:collapse;min-width:1050px;background:#fff}.ops-table th,.ops-table td{padding:9px 10px;border-bottom:1px solid #dbe3ef;text-align:left;font-size:12px;vertical-align:middle}.ops-table th{background:#1e293b;color:#fff;position:sticky;top:0}.ops-badge{display:inline-block;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;background:#e2e8f0}.ops-badge.probation{background:#fff3bf;color:#7c5c00}.ops-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;padding:20px;z-index:50}.ops-modal{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}.ops-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ops-form-grid .full{grid-column:1/-1}.ops-form-grid label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.ops-form-grid input,.ops-form-grid select{width:100%;min-height:42px;border:1px solid #94a3b8;border-radius:9px;padding:8px 10px;background:#fff}.ops-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ops-import-preview td.ready{background:#e9fbe9}.ops-import-preview td.bad{background:#ffe3e3}.ops-import-preview td.same{background:#f1f5f9}.ops-empty{padding:14px;color:#64748b;text-align:center}
    @media(max-width:800px){.ops-form-grid{grid-template-columns:1fr}.ops-form-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  function buildShell() {
    if (document.getElementById("ops-master")) return;
    const host = document.createElement("div");
    host.id = "ops-master";
    host.className = "ops-master";
    host.innerHTML = `
      <div class="ops-tabs"><button class="ops-tab active" data-ops-tab="employees">Employees</button><button class="ops-tab" data-ops-tab="items">Items</button><button class="ops-tab" data-ops-tab="import">Cycle Time Import</button></div>
      <div id="ops-permission-note" class="ops-note"></div>
      <section id="ops-employees">
        <div class="ops-toolbar"><input id="ops-employee-search" class="grow" placeholder="Search employee, department, role, supervisor"><label><input id="ops-employee-inactive" type="checkbox" checked> Include inactive</label><button id="ops-employee-refresh" class="ghost">Refresh</button><button id="ops-employee-new" class="primary">New Employee</button></div>
        <div id="ops-employees-table" class="ops-table-wrap"></div>
      </section>
      <section id="ops-items" hidden>
        <div class="ops-toolbar"><input id="ops-item-search" class="grow" placeholder="Search item, Internal ID, make, build type"><label><input id="ops-item-inactive" type="checkbox" checked> Include inactive</label><button id="ops-item-refresh" class="ghost">Refresh</button><button id="ops-item-new" class="primary">New Item</button></div>
        <div id="ops-items-table" class="ops-table-wrap"></div>
      </section>
      <section id="ops-import" hidden>
        <div class="ops-note">CSV headers supported: <strong>internal_id</strong>, optional <strong>item_name</strong>, and <strong>cycle_time_minutes</strong> (or item_cycle_time_minutes). Preview is required before applying.</div>
        <div class="ops-toolbar"><input id="ops-import-file" type="file" accept=".csv,text/csv"><button id="ops-import-preview-btn" class="ghost">Preview Import</button><button id="ops-import-apply" class="primary">Apply Ready Rows</button></div>
        <div id="ops-import-summary" class="ops-note"></div><div id="ops-import-table" class="ops-table-wrap"></div>
      </section>`;
    overview.appendChild(host);

    host.querySelectorAll(".ops-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.opsTab)));
    document.getElementById("ops-employee-refresh").addEventListener("click", loadEmployees);
    document.getElementById("ops-item-refresh").addEventListener("click", loadItems);
    document.getElementById("ops-employee-search").addEventListener("input", debounce(loadEmployees,250));
    document.getElementById("ops-item-search").addEventListener("input", debounce(loadItems,250));
    document.getElementById("ops-employee-inactive").addEventListener("change", loadEmployees);
    document.getElementById("ops-item-inactive").addEventListener("change", loadItems);
    document.getElementById("ops-employee-new").addEventListener("click", () => openEmployeeModal(null));
    document.getElementById("ops-item-new").addEventListener("click", () => openItemModal(null));
    document.getElementById("ops-import-file").addEventListener("change", readImportFile);
    document.getElementById("ops-import-preview-btn").addEventListener("click", previewImport);
    document.getElementById("ops-import-apply").addEventListener("click", applyImport);
  }

  function debounce(fn,ms){let t;return()=>{clearTimeout(t);t=setTimeout(fn,ms);};}

  function showTab(tab) {
    document.querySelectorAll(".ops-tab").forEach((b) => b.classList.toggle("active", b.dataset.opsTab === tab));
    ["employees","items","import"].forEach((name) => { document.getElementById(`ops-${name}`).hidden = name !== tab; });
    if (tab === "employees") loadEmployees();
    if (tab === "items") loadItems();
  }

  async function loadSetup() {
    setup = await rpc("get_operations_master_options", { p_session_token: token() });
    const canEditMaster = !!setup?.viewer?.can_edit;
    const canEditEmployees = !!setup?.viewer?.can_edit_employees;

    let note = "Read-only access.";
    if (canEditMaster && canEditEmployees) note = "Employee Master and Operations master data can be edited.";
    else if (canEditEmployees) note = "Employee Master can be edited.";
    else if (canEditMaster) note = "Operations master data can be edited.";
    document.getElementById("ops-permission-note").textContent = note;

    document.getElementById("ops-employee-new").hidden = !canEditEmployees;
    ["ops-item-new","ops-import-apply"].forEach((id) => { document.getElementById(id).hidden = !canEditMaster; });
  }

  async function loadEmployees() {
    if (!token()) return;
    const result = await rpc("search_operations_employees", {
      p_session_token: token(), p_search_text: document.getElementById("ops-employee-search").value || null,
      p_include_inactive: document.getElementById("ops-employee-inactive").checked, p_result_limit: 500, p_result_offset: 0
    });
    employeeRows = result?.records || [];
    const canEditEmployees = !!setup?.viewer?.can_edit_employees;
    const rows = employeeRows.map((r) => `<tr><td><strong>${esc(r.employee_name)}</strong>${r.is_probationary ? ' <span class="ops-badge probation">Probationary</span>' : ""}</td><td>${esc(r.department||"—")}</td><td>${esc(r.role)}</td><td>${esc(r.supervisor_name||"—")}</td><td>${esc(r.hire_date||"—")}</td><td>${esc(r.probation_end_date||"—")}</td><td>${r.is_active?"Active":"Inactive"}</td><td>${canEditEmployees?`<button class="ghost" data-edit-employee="${r.id}">Edit</button>`:"—"}</td></tr>`).join("");
    document.getElementById("ops-employees-table").innerHTML = `<table class="ops-table"><thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Supervisor</th><th>Hire Date</th><th>Probation Ends</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="ops-empty">No employees found.</td></tr>'}</tbody></table>`;
    document.querySelectorAll("[data-edit-employee]").forEach((b) => b.addEventListener("click", () => openEmployeeModal(employeeRows.find((r) => r.id === b.dataset.editEmployee))));
  }

  async function loadItems() {
    if (!token()) return;
    const result = await rpc("search_operations_items", {
      p_session_token: token(), p_search_text: document.getElementById("ops-item-search").value || null,
      p_include_inactive: document.getElementById("ops-item-inactive").checked, p_result_limit: 500, p_result_offset: 0
    });
    itemRows = result?.records || [];
    const canEdit = !!setup?.viewer?.can_edit;
    const rows = itemRows.map((r) => `<tr><td><strong>${esc(r.item_name)}</strong></td><td>${esc(r.internal_id)}</td><td>${esc(r.make||"—")}</td><td>${esc(r.work_order_department||"—")}</td><td>${esc(r.build_type||"—")}</td><td>${esc(r.operation_code||"—")}</td><td>${esc(r.item_cycle_time_minutes??"—")}</td><td>${r.is_placeholder?'<span class="ops-badge">Placeholder</span>':(r.is_active?"Active":"Inactive")}</td><td>${canEdit?`<button class="ghost" data-edit-item="${r.id}">Edit</button>`:"—"}</td></tr>`).join("");
    document.getElementById("ops-items-table").innerHTML = `<table class="ops-table"><thead><tr><th>Item</th><th>Internal ID</th><th>Make</th><th>WO Department</th><th>Build Type</th><th>Operation</th><th>Cycle Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="ops-empty">No items found.</td></tr>'}</tbody></table>`;
    document.querySelectorAll("[data-edit-item]").forEach((b) => b.addEventListener("click", () => openItemModal(itemRows.find((r) => r.id === b.dataset.editItem))));
  }

  function modalShell(title, body) {
    const backdrop = document.createElement("div"); backdrop.className = "ops-modal-backdrop";
    backdrop.innerHTML = `<div class="ops-modal"><h2 style="margin-top:0">${esc(title)}</h2>${body}</div>`;
    document.body.appendChild(backdrop); return backdrop;
  }

  function optionRows(rows, valueKey, labelFn, selected) {
    return (rows||[]).map((r) => `<option value="${esc(r[valueKey])}" ${String(r[valueKey])===String(selected||"")?"selected":""}>${esc(labelFn(r))}</option>`).join("");
  }

  function openEmployeeModal(row) {
    if (!setup?.viewer?.can_edit_employees) return;
    const roles = (setup.roles||[]).map((r)=>`<option value="${esc(r)}" ${r===(row?.role||"Employee")?"selected":""}>${esc(r)}</option>`).join("");
    const supervisors = optionRows(setup.supervisors,"id",r=>[r.employee_name,r.role].filter(Boolean).join(" · "),row?.supervisor_id);
    const departmentValues = [
      ...new Set([
        ...(setup?.departments || []),
        row?.department
      ].filter(Boolean))
    ];
    const departmentOptions = departmentValues.map((d)=>`<option value="${esc(d)}" ${d===(row?.department||"")?"selected":""}>${esc(d)}</option>`).join("");
    const modal = modalShell(row?"Edit Employee":"New Employee", `<form id="ops-employee-form" class="ops-form-grid">
      <label>Employee Name<input id="oe-name" required value="${esc(row?.employee_name||"")}"></label>
      <label>Department<select id="oe-dept" required><option value="">Select Department</option>${departmentOptions}</select></label>
      <label>Role<select id="oe-role">${roles}</select></label>
      <label>Supervisor<select id="oe-supervisor"><option value="">None</option>${supervisors}</select></label>
      <label>Hire Date<input id="oe-hire" type="date" value="${esc(row?.hire_date||"")}"></label>
      <label>Probation End Date<input id="oe-probation" type="date" value="${esc(row?.probation_end_date||"")}"></label>
      <label>Display Order<input id="oe-order" type="number" min="0" value="${esc(row?.display_order??0)}"></label>
      <label>PIN ${row?"(leave blank to keep existing)":""}<input id="oe-pin" type="password" inputmode="numeric" ${row?"":"required"}></label>
      <label class="full"><input id="oe-active" type="checkbox" ${row?.is_active===false?"":"checked"}> Active</label>
      <div class="full ops-actions"><button type="button" class="ghost" id="oe-cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>`);
    modal.querySelector("#oe-cancel").onclick=()=>modal.remove();
    modal.querySelector("#ops-employee-form").onsubmit=async(e)=>{e.preventDefault();try{await rpc("save_operations_employee",{p_session_token:token(),p_employee_id:row?.id||null,p_employee_name:modal.querySelector("#oe-name").value,p_department:modal.querySelector("#oe-dept").value||null,p_supervisor_id:modal.querySelector("#oe-supervisor").value||null,p_employee_role:modal.querySelector("#oe-role").value,p_is_active:modal.querySelector("#oe-active").checked,p_display_order:Number(modal.querySelector("#oe-order").value||0),p_hire_date:modal.querySelector("#oe-hire").value||null,p_probation_end_date:modal.querySelector("#oe-probation").value||null,p_new_pin:modal.querySelector("#oe-pin").value||null});modal.remove();await loadSetup();await loadEmployees();}catch(err){alert(err.message);}};
  }

  function openItemModal(row) {
    if (!setup?.viewer?.can_edit) return;
    const modal = modalShell(row?"Edit Item":"New Item", `<form id="ops-item-form" class="ops-form-grid">
      <label>Item Name<input id="oi-name" required value="${esc(row?.item_name||"")}"></label>
      <label>Internal ID<input id="oi-internal" required value="${esc(row?.internal_id||"")}"></label>
      <label>SKU Group<input id="oi-sku" value="${esc(row?.sku_group||"")}"></label>
      <label>WO Department<input id="oi-dept" value="${esc(row?.work_order_department||"")}"></label>
      <label>Make<input id="oi-make" value="${esc(row?.make||"")}"></label>
      <label>Build Type<input id="oi-build" value="${esc(row?.build_type||"")}"></label>
      <label>Operation Code<select id="oi-op"><option value="">None</option>${["P","SA","T"].map(x=>`<option ${x===row?.operation_code?"selected":""}>${x}</option>`).join("")}</select></label>
      <label>Cycle Time (minutes)<input id="oi-cycle" type="number" min="0" step="0.0001" value="${esc(row?.item_cycle_time_minutes??"")}"></label>
      <label class="full"><input id="oi-active" type="checkbox" ${row?.is_active===false?"":"checked"}> Active</label>
      <div class="full ops-actions"><button type="button" class="ghost" id="oi-cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
    </form>`);
    modal.querySelector("#oi-cancel").onclick=()=>modal.remove();
    modal.querySelector("#ops-item-form").onsubmit=async(e)=>{e.preventDefault();try{await rpc("save_operations_item",{p_session_token:token(),p_item_id:row?.id||null,p_item_name:modal.querySelector("#oi-name").value,p_internal_id:modal.querySelector("#oi-internal").value,p_sku_group:modal.querySelector("#oi-sku").value||null,p_work_order_department:modal.querySelector("#oi-dept").value||null,p_make:modal.querySelector("#oi-make").value||null,p_item_cycle_time_minutes:modal.querySelector("#oi-cycle").value===""?null:Number(modal.querySelector("#oi-cycle").value),p_build_type:modal.querySelector("#oi-build").value||null,p_operation_code:modal.querySelector("#oi-op").value||null,p_is_active:modal.querySelector("#oi-active").checked});modal.remove();await loadItems();}catch(err){alert(err.message);}};
  }

  function parseCsv(text) {
    const out=[]; let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(c==='"'){if(quoted&&n==='"'){field+='"';i++;}else quoted=!quoted;} else if(c===','&&!quoted){row.push(field);field="";} else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);field="";if(row.some(x=>x!==""))out.push(row);row=[];} else field+=c;}
    row.push(field);if(row.some(x=>x!==""))out.push(row);if(out.length<2)return[];
    const headers=out[0].map(h=>h.trim().toLowerCase()); return out.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??"").trim()])));
  }

  async function readImportFile() { const f=document.getElementById("ops-import-file").files[0]; if(!f){importRows=[];return;} importRows=parseCsv(await f.text()); document.getElementById("ops-import-summary").textContent=`${importRows.length} CSV rows loaded. Click Preview Import.`; }
  async function previewImport(){if(!importRows.length){alert("Choose a CSV file first.");return;} previewRows=await rpc("preview_item_cycle_time_import",{p_session_token:token(),p_rows:importRows});renderImportPreview();}
  function renderImportPreview(){const counts={};previewRows.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);document.getElementById("ops-import-summary").textContent=Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(" · ");const rows=previewRows.map(r=>`<tr><td>${esc(r.row_number)}</td><td>${esc(r.internal_id||"—")}</td><td>${esc(r.matched_item_name||r.item_name||"—")}</td><td>${esc(r.current_cycle_time_minutes??"—")}</td><td>${esc(r.cycle_time_minutes??"—")}</td><td class="${r.status==='READY'?'ready':r.status==='UNCHANGED'?'same':'bad'}">${esc(r.status)}</td></tr>`).join("");document.getElementById("ops-import-table").innerHTML=`<table class="ops-table ops-import-preview"><thead><tr><th>Row</th><th>Internal ID</th><th>Matched Item</th><th>Current Cycle</th><th>New Cycle</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="ops-empty">No preview rows.</td></tr>'}</tbody></table>`;}
  async function applyImport(){if(!setup?.viewer?.can_edit)return;if(!importRows.length||!previewRows.length){alert("Preview the import first.");return;}if(!confirm("Apply all READY cycle-time rows?"))return;try{const result=await rpc("apply_item_cycle_time_import",{p_session_token:token(),p_rows:importRows});alert(`${result.updated_count||0} item cycle times updated.`);previewRows=result.preview||[];renderImportPreview();await loadItems();}catch(err){alert(err.message);}}

  async function init() {
    buildShell();
    try { await loadSetup(); await loadEmployees(); } catch (e) { document.getElementById("ops-permission-note").textContent = e.message; }
  }

  const overviewButton = document.querySelector('button[data-view="overview"]');
  overviewButton?.addEventListener("click", () => setTimeout(init,0));
  setTimeout(() => { if (!overview.hidden) init(); }, 400);
})();
