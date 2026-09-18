"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $=(id)=>document.getElementById(id);
  const token=sessionStorage.getItem(config.sessionStorageKey);

  let bootstrap=null;
  let rows=[];
  let items=[];
  let itemMap=new Map();
  let page=1;
  const pageSize=100;
  let editingId=null;

  function esc(value){
    return String(value??"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function num(value){
    const n=Number(value||0);
    return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:2}):String(value||0);
  }

  function dateText(value){
    if(!value) return "—";
    const d=new Date(String(value).length===10?value+"T12:00:00":value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("en-US");
  }

  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||(name+" failed."));
    return data;
  }

  function setMessage(text,type="info"){
    const el=$("message");
    el.textContent=text||"";
    el.dataset.type=type;
    el.hidden=!text;
  }

  function showError(error){
    setMessage(error?.message||String(error),"error");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function fillSelect(id,values){
    const el=$(id);
    const selected=el.value;
    const first=el.options[0]?.outerHTML||'<option value="">All</option>';
    el.innerHTML=first+values.map((v)=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if([...el.options].some((o)=>o.value===selected)) el.value=selected;
  }

  function unique(key){
    return [...new Set(rows.map((r)=>String(r?.[key]??"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  }

  function filteredRows(){
    const search=$("filter-search").value.trim().toLowerCase();
    const status=$("filter-status").value;
    const source=$("filter-source").value;
    const created=$("filter-created").value;
    const start=$("filter-start").value;
    const end=$("filter-end").value;

    return rows.filter((row)=>{
      if(status&&row.status!==status) return false;
      if(source&&row.source!==source) return false;
      if(created&&row.created_by!==created) return false;
      if(start&&String(row.date_created||"")<start) return false;
      if(end&&String(row.date_created||"")>end) return false;
      if(search){
        const hay=[row.item_name,row.external_id,row.created_by,row.source_label,row.work_order_type,row.work_order_job_type,row.priority_department]
          .map((x)=>String(x??"").toLowerCase()).join(" ");
        if(!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function statusPill(status){
    return status==="IMPORTED"
      ? '<span class="pill imported">Imported</span>'
      : '<span class="pill pending">'+esc(status==="DRAFT"?"Draft":"Pending Import")+'</span>';
  }

  function render(){
    fillSelect("filter-source",unique("source"));
    fillSelect("filter-created",unique("created_by"));

    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if(page>pages) page=pages;
    const start=(page-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);

    $("history-body").innerHTML=pageRows.length?pageRows.map((row)=>
      '<tr>'+
        '<td>'+dateText(row.date_created)+'</td>'+
        '<td>'+esc(row.external_id||"—")+'</td>'+
        '<td class="source">'+esc(row.source_label||row.source||"—")+'</td>'+
        '<td>'+esc(row.work_order_type||"—")+'</td>'+
        '<td><strong>'+esc(row.item_name||"—")+'</strong></td>'+
        '<td>'+num(row.quantity)+'</td>'+
        '<td>'+esc(row.work_order_job_type||"—")+'</td>'+
        '<td>'+esc(row.priority_department||"—")+'</td>'+
        '<td>'+esc(row.created_by||"—")+'</td>'+
        '<td>'+statusPill(row.status)+'</td>'+
        '<td>'+dateText(row.import_date)+'</td>'+
        '<td>'+esc(row.imported_by||"—")+'</td>'+
        '<td>'+(row.can_edit?'<button type="button" class="secondary" data-edit="'+esc(row.id)+'">Edit</button>':'<span class="muted">Read only</span>')+'</td>'+
      '</tr>'
    ).join(""):'<tr><td colspan="13" class="muted" style="text-align:center">No Work Order history rows match the current filters.</td></tr>';

    $("summary").textContent=(filtered.length
      ?"Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length
      :"0 rows")+" · Page "+page+" of "+pages;
    $("prev").disabled=page<=1;
    $("next").disabled=page>=pages;

    $("history-body").querySelectorAll("[data-edit]").forEach((button)=>{
      button.addEventListener("click",()=>openEdit(button.dataset.edit));
    });
  }

  function jobTypeOptions(selected){
    return (bootstrap?.job_types||[]).map((v)=>'<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
  }

  function priorityOptions(selected){
    return '<option value="">—</option>'+(bootstrap?.priority_departments||[]).map((v)=>'<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
  }

  function openEdit(id){
    const row=rows.find((r)=>String(r.id)===String(id));
    if(!row||!row.can_edit) return;
    editingId=id;

    $("edit-meta").textContent=[row.external_id,row.source_label||row.source,row.created_by].filter(Boolean).join(" · ");
    $("edit-item").value=row.item_name||"";
    $("edit-qty").value=row.quantity||"";
    $("edit-type").value=row.work_order_type||"Production";
    $("edit-job-type").innerHTML=jobTypeOptions(row.work_order_job_type);
    $("edit-priority-dept").innerHTML=priorityOptions(row.priority_department||"");
    $("edit-memo").value=row.work_order_memo||"";
    $("edit-modal").hidden=false;
  }

  function closeEdit(){
    $("edit-modal").hidden=true;
    editingId=null;
  }

  function resolveItem(name){
    return itemMap.get(String(name||"").trim().toLowerCase())||null;
  }

  async function saveEdit(){
    const item=resolveItem($("edit-item").value);
    if(!item) throw new Error("Item does not exactly match an active Item.");
    const qty=Number($("edit-qty").value);
    if(!(qty>0)) throw new Error("Quantity must be greater than zero.");

    $("edit-save").disabled=true;
    try{
      await rpc("update_inventory_staged_work_order",{
        p_session_token:token,
        p_staging_id:editingId,
        p_item_id:item.item_id,
        p_quantity:qty,
        p_work_order_type:$("edit-type").value,
        p_work_order_job_type:$("edit-job-type").value,
        p_priority_department:$("edit-priority-dept").value||null,
        p_work_order_memo:$("edit-memo").value.trim()||null
      });
      closeEdit();
      setMessage("Staged Work Order updated.","success");
      await loadRows();
    }finally{
      $("edit-save").disabled=false;
    }
  }

  async function deleteEdit(){
    const row=rows.find((r)=>String(r.id)===String(editingId));
    if(!row) return;
    if(!window.confirm("Delete this pending staged Work Order? This cannot be undone.")) return;

    $("edit-delete").disabled=true;
    try{
      await rpc("delete_inventory_staged_work_order",{
        p_session_token:token,
        p_staging_id:editingId
      });
      closeEdit();
      setMessage("Pending staged Work Order deleted.","success");
      await loadRows();
    }finally{
      $("edit-delete").disabled=false;
    }
  }

  async function loadRows(){
    rows=await rpc("get_inventory_work_order_staging",{
      p_session_token:token,
      p_include_imported:true
    })||[];
    if(!Array.isArray(rows)) rows=[];
    render();
  }

  async function load(){
    const [b,h]=await Promise.all([
      rpc("get_inventory_staging_bootstrap",{p_session_token:token}),
      rpc("get_inventory_work_order_staging",{p_session_token:token,p_include_imported:true})
    ]);
    bootstrap=b||{};
    rows=Array.isArray(h)?h:[];
    items=Array.isArray(bootstrap.items)?bootstrap.items:[];
    itemMap=new Map(items.map((item)=>[String(item.item_name||"").trim().toLowerCase(),item]));

    $("viewer-meta").textContent=[
      bootstrap?.viewer?.employee_name,
      bootstrap?.viewer?.employee_role,
      bootstrap?.viewer?.department
    ].filter(Boolean).join(" · ");
    $("item-list").innerHTML=items.map((item)=>'<option value="'+esc(item.item_name)+'"></option>').join("");
    render();
  }

  function clearFilters(){
    ["filter-search","filter-status","filter-source","filter-created","filter-start","filter-end"].forEach((id)=>{$(id).value="";});
    page=1;
    render();
  }

  async function init(){
    if(!token){
      window.location.replace("index.html");
      return;
    }
    try{
      $("app").hidden=false;
      await load();
    }catch(error){
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  ["filter-search"].forEach((id)=>$(id).addEventListener("input",()=>{page=1;render();}));
  ["filter-status","filter-source","filter-created","filter-start","filter-end"].forEach((id)=>$(id).addEventListener("change",()=>{page=1;render();}));
  $("clear-filters").addEventListener("click",clearFilters);
  $("refresh").addEventListener("click",()=>loadRows().then(()=>setMessage("Work Order history refreshed.","success")).catch(showError));
  $("prev").addEventListener("click",()=>{if(page>1){page--;render();}});
  $("next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(page<pages){page++;render();}});
  $("edit-close").addEventListener("click",closeEdit);
  $("edit-modal").addEventListener("click",(event)=>{if(event.target===$("edit-modal"))closeEdit();});
  $("edit-save").addEventListener("click",()=>saveEdit().catch(showError));
  $("edit-delete").addEventListener("click",()=>deleteEdit().catch(showError));

  init();
})();
