"use strict";

/** Full Item Master table view. Owns Item-table rendering after the base Management modules load. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  let setup = null;
  let page = 0;
  let pageSize = 50;
  let sortBy = "item_name";
  let sortDir = "asc";
  let installed = false;
  let ownershipObserver = null;
  let ownershipRepairPending = false;

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function replaceWithClone(id,event,handler) {
    const old=document.getElementById(id);
    if (!old) return null;
    const clone=old.cloneNode(true);
    clone.dataset.itemMasterOwned="1";
    old.replaceWith(clone);
    clone.addEventListener(event,handler);
    return clone;
  }

  function sortable(label,key) {
    const arrow=sortBy===key?(sortDir==="asc"?" ▲":" ▼"):"";
    return `<th class="req-sort" data-im-sort="${esc(key)}">${esc(label)}${arrow}</th>`;
  }

  function notesCell(value) {
    const text=String(value??"").trim();
    if (!text) return "—";
    const preview=text.length>90?`${text.slice(0,90)}…`:text;
    return `<details><summary style="cursor:pointer;font-weight:700">${esc(preview)}</summary><div style="white-space:pre-wrap;min-width:260px;max-width:520px;margin-top:8px">${esc(text)}</div></details>`;
  }

  function render(rows,total) {
    const host=document.getElementById("ops-items-table");
    if (!host) return;
    const canEdit=!!setup?.viewer?.can_edit;
    const body=rows.map((r)=>`<tr>
      <td><strong>${esc(r.item_name)}</strong></td>
      <td>${esc(r.internal_id)}</td>
      <td>${esc(r.item_type||"—")}</td>
      <td>${esc(r.inventory_planning_role||"—")}</td>
      <td>${esc(r.item_category||"—")}</td>
      <td>${esc(r.make||"—")}</td>
      <td>${esc(r.sku_group||"—")}</td>
      <td>${esc(r.work_order_department||"—")}</td>
      <td>${esc(r.build_type||"—")}</td>
      <td>${esc(r.operation_code||"—")}</td>
      <td>${esc(r.item_cycle_time_minutes??"—")}</td>
      <td>${esc(r.item_status||"—")}</td>
      <td>${notesCell(r.build_notes)}</td>
      <td>${r.allow_productive_task?"Yes":"No"}</td>
      <td>${r.is_placeholder?'<span class="ops-badge">Placeholder</span>':(r.is_active?"Active":"Inactive")}</td>
      <td>${canEdit?`<button class="ghost" type="button" data-im-edit="${esc(r.id)}">Edit</button>`:"—"}</td>
    </tr>`).join("");

    host.innerHTML=`<table class="ops-table" data-item-master-table="1" style="min-width:2100px"><thead><tr>
      ${sortable("Item","item_name")}
      <th>Internal ID</th>
      ${sortable("Item Type","item_type")}
      ${sortable("Inventory Planning Role","inventory_planning_role")}
      <th>Item Category</th>
      ${sortable("Make","make")}
      ${sortable("SKU Group","sku_group")}
      ${sortable("WO Department","work_order_department")}
      ${sortable("Build Type","build_type")}
      <th>Operation</th><th>Cycle Time</th>
      ${sortable("Item Status","item_status")}
      <th>Build Notes</th>
      ${sortable("Productive Task","allow_productive_task")}
      ${sortable("Active","is_active")}
      <th>Action</th>
    </tr></thead><tbody>${body||'<tr><td colspan="16" class="ops-empty">No Items found.</td></tr>'}</tbody></table>
    <div class="req-pager"><div class="left"><span>Rows per page</span><select id="im-pagesize"><option>25</option><option>50</option><option>100</option></select><span class="req-muted">Showing ${total?page*pageSize+1:0}–${Math.min((page+1)*pageSize,total)} of ${total}</span></div><div class="right"><button class="ghost" id="im-prev" ${page<=0?"disabled":""}>Previous</button><button class="ghost" id="im-next" ${(page+1)*pageSize>=total?"disabled":""}>Next</button></div></div>`;

    host.querySelectorAll("[data-im-sort]").forEach((th)=>{
      th.onclick=()=>{const key=th.dataset.imSort;if(sortBy===key)sortDir=sortDir==="asc"?"desc":"asc";else{sortBy=key;sortDir="asc";}page=0;load();};
    });
    host.querySelectorAll("[data-im-edit]").forEach((button)=>{
      button.onclick=()=>{
        const row=rows.find((r)=>String(r.id)===String(button.dataset.imEdit));
        const editor=window.TaskTrackerManagementMaster?.openItemModal;
        if (row && typeof editor==="function") editor(row);
      };
    });
    const ps=host.querySelector("#im-pagesize");
    if(ps){ps.value=String(pageSize);ps.onchange=(e)=>{pageSize=Number(e.target.value);page=0;load();};}
    host.querySelector("#im-prev")?.addEventListener("click",()=>{if(page>0){page--;load();}});
    host.querySelector("#im-next")?.addEventListener("click",()=>{if((page+1)*pageSize<total){page++;load();}});
  }

  async function load() {
    const host=document.getElementById("ops-items-table");
    if (!host || !token()) return;
    try {
      const d=await rpc("search_operations_items_v2",{
        p_session_token:token(),
        p_search_text:document.getElementById("ops-item-search")?.value||null,
        p_include_inactive:document.getElementById("ops-item-inactive")?.checked??true,
        p_make:document.getElementById("req-item-make")?.value||null,
        p_department:document.getElementById("req-item-dept")?.value||null,
        p_sort_by:sortBy,p_sort_direction:sortDir,p_result_limit:pageSize,p_result_offset:page*pageSize
      });
      const f=d?.filter_options||{};
      const make=document.getElementById("req-item-make"), dept=document.getElementById("req-item-dept");
      if(make){const selected=make.value;make.innerHTML='<option value="">All Makes</option>'+(f.makes||[]).map((x)=>`<option>${esc(x)}</option>`).join("");if([...make.options].some((o)=>o.value===selected))make.value=selected;}
      if(dept){const selected=dept.value;dept.innerHTML='<option value="">All Departments</option>'+(f.departments||[]).map((x)=>`<option>${esc(x)}</option>`).join("");if([...dept.options].some((o)=>o.value===selected))dept.value=selected;}
      render(d?.records||[],Number(d?.total_count||0));
    } catch(error) {
      host.innerHTML=`<div class="msg" data-type="error">${esc(error.message)}</div>`;
    }
  }

  async function exportItems() {
    const d=await rpc("search_operations_items_v2",{
      p_session_token:token(),p_search_text:document.getElementById("ops-item-search")?.value||null,
      p_include_inactive:document.getElementById("ops-item-inactive")?.checked??true,
      p_make:document.getElementById("req-item-make")?.value||null,p_department:document.getElementById("req-item-dept")?.value||null,
      p_sort_by:sortBy,p_sort_direction:sortDir,p_result_limit:10000,p_result_offset:0
    });
    const rows=(d?.records||[]).map((r)=>({
      Item:r.item_name,"Internal ID":r.internal_id,"Item Type":r.item_type,"Inventory Planning Role":r.inventory_planning_role,
      "Item Category":r.item_category,Make:r.make,"SKU Group":r.sku_group,"WO Department":r.work_order_department,
      "Build Type":r.build_type,Operation:r.operation_code,"Cycle Time":r.item_cycle_time_minutes,"Item Status":r.item_status,
      "Build Notes":r.build_notes,"Productive Task Allowed":r.allow_productive_task?"Yes":"No",Active:r.is_active?"Active":"Inactive"
    }));
    if(!rows.length)return;
    const headers=Object.keys(rows[0]);
    const q=(v)=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};
    const csv=[headers.map(q).join(","),...rows.map((r)=>headers.map((h)=>q(r[h])).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="item-master-filtered.csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
  }

  function installOwnershipGuard(host) {
    if (ownershipObserver) return;
    ownershipObserver = new MutationObserver(() => {
      if (!installed || ownershipRepairPending) return;
      if (host.querySelector('table[data-item-master-table="1"]')) return;
      ownershipRepairPending = true;
      setTimeout(async () => {
        try {
          if (installed && !host.querySelector('table[data-item-master-table="1"]')) await load();
        } finally {
          ownershipRepairPending = false;
        }
      }, 0);
    });
    ownershipObserver.observe(host,{childList:true});
  }

  async function install() {
    if(installed)return true;
    const host=document.getElementById("ops-items-table");
    const exportButton=document.getElementById("req-item-export");
    if(!host || !exportButton)return false;
    setup=await rpc("get_operations_master_options",{p_session_token:token()});
    replaceWithClone("ops-item-search","input",()=>{page=0;load();});
    replaceWithClone("ops-item-inactive","change",()=>{page=0;load();});
    replaceWithClone("ops-item-refresh","click",load);
    replaceWithClone("req-item-make","change",()=>{page=0;load();});
    replaceWithClone("req-item-dept","change",()=>{page=0;load();});
    const exp=replaceWithClone("req-item-export","click",exportItems);
    if(exp)exp.textContent="Export CSV";
    installed=true;
    installOwnershipGuard(host);
    await load();
    return true;
  }

  async function waitForShell() {
    try{if(await install())return;}catch{}
    const observer=new MutationObserver(async()=>{try{if(await install())observer.disconnect();}catch{}});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.TaskTrackerItemMasterView = Object.assign(window.TaskTrackerItemMasterView || {}, {
    load,
    isInstalled:()=>installed
  });

  waitForShell();
})();

/** BOM browser + preview-first CSV import for the Operations master-data shell. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  let installed = false;
  let installPromise = null;
  let importRows = [];
  let preview = null;
  let canEdit = false;
  let bomPage = 0;
  let bomPageSize = 50;
  let bomSearchTimer = null;

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function parseCsv(text) {
    const rows=[];
    let row=[],cell="",quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){
        if(ch==='"' && text[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"'){quoted=false;}
        else cell+=ch;
      }else if(ch==='"'){quoted=true;}
      else if(ch===','){row.push(cell);cell="";}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
      else if(ch!=='\r'){cell+=ch;}
    }
    row.push(cell);
    if(row.some((v)=>String(v).trim()!=="")) rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value||"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  }

  function readFile(file) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(new Error("Unable to read the selected CSV file."));
      reader.readAsText(file);
    });
  }

  function formatDate(value) {
    if(!value)return "—";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }

  function setMessage(text,type="") {
    const el=document.getElementById("bom-import-message");
    if(!el)return;
    el.hidden=!text;
    el.textContent=text||"";
    if(type)el.dataset.type=type;else delete el.dataset.type;
  }

  function resetPreview() {
    preview=null;
    const summary=document.getElementById("bom-import-summary");
    const table=document.getElementById("bom-import-table");
    const apply=document.getElementById("bom-import-apply");
    if(summary)summary.textContent=importRows.length?`${importRows.length} data row(s) loaded. Preview the file before applying.`:"";
    if(table)table.innerHTML="";
    if(apply)apply.disabled=true;
  }

  function renderPreview(data) {
    preview=data||null;
    const s=data?.summary||{};
    const rows=data?.rows||[];
    const summary=document.getElementById("bom-import-summary");
    if(summary){
      summary.innerHTML=`<strong>${Number(s.bom_count||0)} BOM(s)</strong> · ${Number(s.row_count||0)} component row(s) · <span style="color:#166534">${Number(s.ready_count||0)} ready</span> · <span style="color:#92400e">${Number(s.warning_count||0)} warning</span> · <span style="color:#991b1b">${Number(s.error_count||0)} error</span>${Number(s.existing_bom_count||0)?` · ${Number(s.existing_bom_count)} existing BOM(s) will be refreshed`:""}`;
    }
    const body=rows.slice(0,500).map((r)=>{
      const status=String(r.status||"");
      const bg=status==="ERROR"?"#fee2e2":status==="WARNING"?"#fef3c7":"#dcfce7";
      const issues=(r.issues||[]).map(esc).join("<br>")||"—";
      return `<tr><td>${esc(r.row_number)}</td><td>${esc(r.internal_id)}</td><td>${esc(r.bill_name)}</td><td>${esc(r.revision||"—")}</td><td>${esc(r.component)}</td><td>${esc(r.component_quantity??"—")}</td><td style="background:${bg};font-weight:900">${esc(status)}</td><td>${issues}</td></tr>`;
    }).join("");
    const table=document.getElementById("bom-import-table");
    if(table)table.innerHTML=`<table class="ops-table" style="min-width:1250px"><thead><tr><th>Row</th><th>Internal ID</th><th>Bill Name</th><th>Revision</th><th>Component</th><th>Component Qty</th><th>Status</th><th>Issues / Matching Notes</th></tr></thead><tbody>${body||'<tr><td colspan="8" class="ops-empty">No rows to preview.</td></tr>'}</tbody></table>${rows.length>500?'<div class="ops-note">Preview shows the first 500 rows. All rows will be validated and imported.</div>':""}`;
    const apply=document.getElementById("bom-import-apply");
    if(apply)apply.disabled=!(canEdit && s.can_apply && rows.length);
  }

  function componentsCell(row) {
    const components=Array.isArray(row.components)?row.components:[];
    if(!components.length)return "0 components";
    const body=components.map((c)=>`<tr><td><strong>${esc(c.component_name)}</strong></td><td>${c.matched_item_name?esc(c.matched_item_name):'<span style="color:#92400e;font-weight:800">Not linked</span>'}</td><td>${esc(c.component_quantity)}</td></tr>`).join("");
    return `<details><summary style="cursor:pointer;font-weight:800">${components.length} component${components.length===1?"":"s"}</summary><div style="margin-top:8px;min-width:480px;max-width:760px;max-height:340px;overflow:auto"><table class="ops-table" style="min-width:460px"><thead><tr><th>Component</th><th>Item Master Link</th><th>Quantity</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
  }

  function renderBoms(rows,total) {
    const host=document.getElementById("bom-browser-table");
    if(!host)return;
    const body=rows.map((r)=>`<tr>
      <td><strong>${esc(r.bill_name)}</strong></td>
      <td>${esc(r.internal_id)}</td>
      <td>${esc(r.revision||"—")}</td>
      <td>${r.parent_item_name?esc(r.parent_item_name):'<span style="color:#92400e;font-weight:800">Not linked</span>'}</td>
      <td>${componentsCell(r)}</td>
      <td>${esc(formatDate(r.updated_at))}</td>
    </tr>`).join("");
    host.innerHTML=`<table class="ops-table" style="min-width:1100px"><thead><tr><th>Bill Name</th><th>Internal ID</th><th>Revision</th><th>Parent Item</th><th>Components</th><th>Last Updated</th></tr></thead><tbody>${body||'<tr><td colspan="6" class="ops-empty">No BOM records found.</td></tr>'}</tbody></table>
      <div class="req-pager"><div class="left"><span>Rows per page</span><select id="bom-pagesize"><option>25</option><option>50</option><option>100</option></select><span class="req-muted">Showing ${total?bomPage*bomPageSize+1:0}–${Math.min((bomPage+1)*bomPageSize,total)} of ${total}</span></div><div class="right"><button class="ghost" id="bom-prev" ${bomPage<=0?"disabled":""}>Previous</button><button class="ghost" id="bom-next" ${(bomPage+1)*bomPageSize>=total?"disabled":""}>Next</button></div></div>`;
    const ps=host.querySelector("#bom-pagesize");
    if(ps){ps.value=String(bomPageSize);ps.onchange=(e)=>{bomPageSize=Number(e.target.value);bomPage=0;loadBoms();};}
    host.querySelector("#bom-prev")?.addEventListener("click",()=>{if(bomPage>0){bomPage--;loadBoms();}});
    host.querySelector("#bom-next")?.addEventListener("click",()=>{if((bomPage+1)*bomPageSize<total){bomPage++;loadBoms();}});
  }

  async function loadBoms() {
    const host=document.getElementById("bom-browser-table");
    if(!host || !token())return;
    host.innerHTML='<div class="ops-empty">Loading BOMs...</div>';
    try{
      const data=await rpc("search_operations_boms",{
        p_session_token:token(),
        p_search_text:document.getElementById("bom-browser-search")?.value||null,
        p_result_limit:bomPageSize,
        p_result_offset:bomPage*bomPageSize
      });
      renderBoms(data?.records||[],Number(data?.total_count||0));
    }catch(err){
      host.innerHTML=`<div class="msg" data-type="error">${esc(err.message)}</div>`;
    }
  }

  async function handleFileChange() {
    setMessage("");
    importRows=[];
    const file=document.getElementById("bom-import-file")?.files?.[0];
    if(!file){resetPreview();return;}
    try{
      const matrix=parseCsv(await readFile(file));
      if(matrix.length<2)throw new Error("The CSV contains no BOM data rows.");
      const headers=matrix[0].map(normalizeHeader);
      const required=["internal_id","bill_name","revision","component","component_quantity"];
      const missing=required.filter((h)=>!headers.includes(h));
      if(missing.length)throw new Error(`Missing required CSV header(s): ${missing.map((h)=>h.replaceAll("_"," ")).join(", ")}.`);
      const pos=Object.fromEntries(headers.map((h,i)=>[h,i]));
      importRows=matrix.slice(1)
        .filter((r)=>r.some((v)=>String(v||"").trim()!==""))
        .map((r)=>({
          internal_id:String(r[pos.internal_id]??"").trim(),
          bill_name:String(r[pos.bill_name]??"").trim(),
          revision:String(r[pos.revision]??"").trim(),
          component:String(r[pos.component]??"").trim(),
          component_quantity:String(r[pos.component_quantity]??"").trim()
        }));
      if(!importRows.length)throw new Error("The CSV contains no BOM data rows.");
      resetPreview();
      setMessage(`Loaded ${importRows.length} BOM component row(s). Select Preview Import to validate matching and quantities.`);
    }catch(err){
      importRows=[];resetPreview();setMessage(err.message,"error");
    }
  }

  async function previewImport() {
    if(!importRows.length){setMessage("Choose a BOM CSV file first.","error");return;}
    const btn=document.getElementById("bom-import-preview-btn");
    if(btn)btn.disabled=true;
    setMessage("Validating BOM import...");
    try{
      const data=await rpc("preview_bom_import",{p_session_token:token(),p_rows:importRows});
      renderPreview(data);
      setMessage(data?.summary?.error_count?"Preview found validation errors. Correct those rows before applying.":data?.summary?.warning_count?"Preview is valid. Warnings indicate item links that could not be made automatically; the imported names will still be retained.":"Preview is valid and ready to apply.",data?.summary?.error_count?"error":"");
    }catch(err){preview=null;resetPreview();setMessage(err.message,"error");}
    finally{if(btn)btn.disabled=false;}
  }

  async function applyImport() {
    if(!canEdit || !preview?.summary?.can_apply || !importRows.length)return;
    const bomCount=Number(preview?.summary?.bom_count||0);
    if(!confirm(`Apply ${bomCount} BOM(s) and replace the component lists for those imported BOM Internal IDs with this CSV?`))return;
    const btn=document.getElementById("bom-import-apply");
    if(btn)btn.disabled=true;
    setMessage("Applying BOM import...");
    try{
      const result=await rpc("apply_bom_import",{p_session_token:token(),p_rows:importRows});
      setMessage(`BOM import complete: ${Number(result?.bom_count||0)} BOM record(s) updated and ${Number(result?.component_count||0)} component row(s) stored.${Number(result?.warning_count||0)?` ${Number(result.warning_count)} warning row(s) were imported with preserved text values.`:""}`);
      renderPreview(result?.preview||preview);
      bomPage=0;
    }catch(err){setMessage(err.message,"error");}
    finally{if(btn)btn.disabled=!(canEdit && preview?.summary?.can_apply);}
  }

  function hideBaseSections() {
    ["ops-employees","ops-items","ops-import"].forEach((id)=>{const el=document.getElementById(id);if(el)el.hidden=true;});
  }

  function hideBomSections() {
    const browser=document.getElementById("ops-boms");
    const importer=document.getElementById("ops-bom-import");
    if(browser)browser.hidden=true;
    if(importer)importer.hidden=true;
  }

  function showBomTab(name) {
    document.querySelectorAll("#ops-master .ops-tab").forEach((b)=>b.classList.toggle("active",b.dataset.opsTab===name));
    hideBaseSections();
    hideBomSections();
    if(name==="boms"){
      const browser=document.getElementById("ops-boms");
      if(browser)browser.hidden=false;
      loadBoms();
    }else if(name==="bom-import"){
      const importer=document.getElementById("ops-bom-import");
      if(importer)importer.hidden=false;
    }
  }

  function ensureSingleTab(tabs,name,label,anchorSelector) {
    const matches=[...tabs.querySelectorAll(`[data-ops-tab="${name}"]`)];
    let tab=matches.shift()||null;
    matches.forEach((extra)=>extra.remove());
    if(!tab){
      tab=document.createElement("button");
      tab.className="ops-tab";
      tab.type="button";
      tab.dataset.opsTab=name;
    }
    tab.textContent=label;
    tab.dataset.bomOwned="1";
    const anchor=tabs.querySelector(anchorSelector);
    if(anchor && tab.previousElementSibling!==anchor)anchor.insertAdjacentElement("afterend",tab);
    else if(!anchor && !tab.parentElement)tabs.appendChild(tab);
    return tab;
  }

  function removeDuplicateSections(id) {
    const matches=[...document.querySelectorAll(`[id="${id}"]`)];
    const first=matches.shift()||null;
    matches.forEach((extra)=>extra.remove());
    return first;
  }

  async function doInstall() {
    const master=document.getElementById("ops-master");
    const tabs=master?.querySelector(".ops-tabs");
    const permissionNote=document.getElementById("ops-permission-note");
    if(!master || !tabs || !permissionNote || !token())return false;

    const setup=await rpc("get_operations_master_options",{p_session_token:token()});
    if(!document.getElementById("ops-master") || !document.querySelector("#ops-master .ops-tabs"))return false;
    canEdit=!!setup?.viewer?.can_edit;

    const freshTabs=document.querySelector("#ops-master .ops-tabs");
    const bomTab=ensureSingleTab(freshTabs,"boms","BOM",'[data-ops-tab="items"]');
    const importTab=ensureSingleTab(freshTabs,"bom-import","BOM Import",'[data-ops-tab="import"]');

    let browser=removeDuplicateSections("ops-boms");
    if(!browser){
      browser=document.createElement("section");
      browser.id="ops-boms";
      browser.hidden=true;
      browser.innerHTML=`
        <div class="ops-note">Current Bill of Materials records. Use the component count to expand and review the exact component list and quantities stored for each BOM.</div>
        <div class="ops-toolbar"><input id="bom-browser-search" class="grow" placeholder="Search Bill Name, Internal ID, Revision, Parent Item, or Component"><button id="bom-browser-refresh" class="ghost" type="button">Refresh</button></div>
        <div id="bom-browser-table" class="ops-table-wrap"></div>`;
      const itemsSection=document.getElementById("ops-items");
      if(itemsSection)itemsSection.insertAdjacentElement("afterend",browser);else master.appendChild(browser);
    }

    let importer=removeDuplicateSections("ops-bom-import");
    if(!importer){
      importer=document.createElement("section");
      importer.id="ops-bom-import";
      importer.hidden=true;
      importer.innerHTML=`
        <div class="ops-note">Import a CSV with these five headers: <strong>Internal ID</strong>, <strong>Bill Name</strong>, <strong>Revision</strong>, <strong>Component</strong>, and <strong>Component Quantity</strong>. Revision is stored for reference only. Preview is required before applying.</div>
        <div class="ops-note"><strong>Import behavior:</strong> Internal ID identifies the BOM. Re-importing an Internal ID refreshes that BOM's current component list; BOMs not present in the file are untouched. Unmatched Bill Names or Components are clearly warned and retained as text instead of silently failing.</div>
        <div class="ops-toolbar"><input id="bom-import-file" type="file" accept=".csv,text/csv"><button id="bom-import-preview-btn" class="ghost" type="button">Preview Import</button><button id="bom-import-apply" class="primary" type="button" disabled>Apply BOM Import</button></div>
        <div id="bom-import-message" class="msg" hidden></div>
        <div id="bom-import-summary" class="ops-note"></div>
        <div id="bom-import-table" class="ops-table-wrap"></div>`;
      const baseImport=document.getElementById("ops-import");
      if(baseImport)baseImport.insertAdjacentElement("afterend",importer);else master.appendChild(importer);
    }

    if(!freshTabs.dataset.bomTabsBound){
      freshTabs.dataset.bomTabsBound="1";
      freshTabs.addEventListener("click",(event)=>{
        const button=event.target.closest(".ops-tab");
        if(!button)return;
        const name=button.dataset.opsTab;
        if(name==="boms" || name==="bom-import")showBomTab(name);
        else hideBomSections();
      });
    }

    if(!bomTab.dataset.bomClickBound)bomTab.dataset.bomClickBound="1";
    if(!importTab.dataset.bomClickBound)importTab.dataset.bomClickBound="1";

    const search=document.getElementById("bom-browser-search");
    if(search && !search.dataset.bound){
      search.dataset.bound="1";
      search.addEventListener("input",()=>{clearTimeout(bomSearchTimer);bomSearchTimer=setTimeout(()=>{bomPage=0;loadBoms();},250);});
    }
    const refresh=document.getElementById("bom-browser-refresh");
    if(refresh && !refresh.dataset.bound){refresh.dataset.bound="1";refresh.addEventListener("click",loadBoms);}
    const file=document.getElementById("bom-import-file");
    if(file && !file.dataset.bound){file.dataset.bound="1";file.addEventListener("change",handleFileChange);}
    const previewBtn=document.getElementById("bom-import-preview-btn");
    if(previewBtn && !previewBtn.dataset.bound){previewBtn.dataset.bound="1";previewBtn.addEventListener("click",previewImport);}
    const applyBtn=document.getElementById("bom-import-apply");
    if(applyBtn && !applyBtn.dataset.bound){applyBtn.dataset.bound="1";applyBtn.addEventListener("click",applyImport);}
    if(applyBtn && !canEdit)applyBtn.hidden=true;

    installed=true;
    return true;
  }

  async function install() {
    if(installed)return true;
    if(installPromise)return installPromise;
    installPromise=doInstall();
    try{return await installPromise;}
    finally{if(!installed)installPromise=null;}
  }

  async function waitForShell() {
    try{if(await install())return;}catch{}
    const observer=new MutationObserver(async()=>{
      try{
        if(await install())observer.disconnect();
      }catch{}
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  window.TaskTrackerBomImport=Object.assign(window.TaskTrackerBomImport||{}, {
    isInstalled:()=>installed,
    loadBoms,
    previewImport,
    applyImport
  });

  waitForShell();
})();
