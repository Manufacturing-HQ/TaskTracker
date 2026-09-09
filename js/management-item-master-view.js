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
