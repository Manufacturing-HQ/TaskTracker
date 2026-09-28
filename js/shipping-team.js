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

  let dashboard=null;
  let currentTaskId=null;
  let currentTaskDetail=null;
  let cancelTab="pending";
  let cancellationExpanded=false;
  const selectedCancellations=new Set();

  function esc(value){
    return String(value??"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function dateText(value){
    if(!value) return "—";
    const raw=String(value);
    const d=new Date(raw.length===10?raw+"T12:00:00":raw);
    return Number.isNaN(d.getTime())?raw:d.toLocaleDateString();
  }

  function dateTime(value){
    if(!value) return "—";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }

  function num(value){
    const n=Number(value||0);
    return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:2}):String(value||0);
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

  function priorityText(priority){
    return String(priority||"NORMAL").toUpperCase();
  }

  function cancellationKey(row){
    return String(row.sales_order_internal_id)+"|"+String(row.line_unique_key);
  }

  function pendingCancellations(){
    return Array.isArray(dashboard?.pending_cancellations)?dashboard.pending_cancellations:[];
  }

  function cancellationHistory(){
    return Array.isArray(dashboard?.cancellation_history)?dashboard.cancellation_history:[];
  }

  function syncSelectedCancellations(){
    const valid=new Set(pendingCancellations().map(cancellationKey));
    [...selectedCancellations].forEach((key)=>{if(!valid.has(key))selectedCancellations.delete(key);});
  }

  function setCancellationExpanded(expanded){
    cancellationExpanded=Boolean(expanded);
    const tile=$("cancel-tile");
    const detail=$("cancellations");
    const toggle=$("cancel-tile-toggle");
    const action=$("cancel-tile-action");

    tile?.classList.toggle("expanded",cancellationExpanded);
    if(detail) detail.hidden=!cancellationExpanded;
    if(toggle) toggle.setAttribute("aria-expanded",cancellationExpanded?"true":"false");
    if(action) action.textContent=cancellationExpanded?"Hide Queue ▲":"View Queue ▼";
  }

  function renderCancellationTabs(){
    document.querySelectorAll("[data-cancel-tab]").forEach((button)=>{
      button.classList.toggle("active",button.dataset.cancelTab===cancelTab);
    });
    $("cancel-pending-panel").hidden=cancelTab!=="pending";
    $("cancel-history-panel").hidden=cancelTab!=="history";
    $("cancel-employee-panel").hidden=cancelTab!=="employee";
  }

  function renderPendingCancellations(){
    const rows=pendingCancellations();
    syncSelectedCancellations();
    const allSelected=rows.length>0&&rows.every((row)=>selectedCancellations.has(cancellationKey(row)));

    $("cancel-select-all").checked=allSelected;
    $("cancel-select-all").indeterminate=selectedCancellations.size>0&&!allSelected;
    $("cancel-selection-count").textContent=selectedCancellations.size+" selected";
    $("mark-cancelled").disabled=selectedCancellations.size===0;

    $("cancel-pending-body").innerHTML=rows.length?rows.map((row)=>{
      const key=cancellationKey(row);
      return '<tr>'+
        '<td><input type="checkbox" data-cancel-select="'+esc(key)+'" '+(selectedCancellations.has(key)?"checked":"")+'></td>'+
        '<td>'+esc(dateText(row.order_date))+'</td>'+
        '<td>'+esc(dateText(row.ship_date))+'</td>'+
        '<td><strong>'+esc(row.document_number||"—")+'</strong></td>'+
        '<td>'+esc(row.sales_order_type||"—")+'</td>'+
        '<td>'+esc(row.item_name||"—")+'</td>'+
        '<td>'+esc(row.requested_by||"—")+'</td>'+
        '<td>'+esc(dateTime(row.requested_at))+'</td>'+
      '</tr>';
    }).join(""):'<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">No pending cancellations.</td></tr>';

    $("cancel-pending-body").querySelectorAll("[data-cancel-select]").forEach((box)=>{
      box.addEventListener("change",()=>{
        if(box.checked) selectedCancellations.add(box.dataset.cancelSelect);
        else selectedCancellations.delete(box.dataset.cancelSelect);
        renderPendingCancellations();
      });
    });
  }

  function renderCancellationHistory(){
    const rows=cancellationHistory();
    $("cancel-history-body").innerHTML=rows.length?rows.map((row)=>
      '<tr><td>'+esc(dateTime(row.completed_at))+'</td>'+
      '<td>'+esc(dateText(row.order_date))+'</td>'+
      '<td>'+esc(dateText(row.ship_date))+'</td>'+
      '<td><strong>'+esc(row.document_number||"—")+'</strong></td>'+
      '<td>'+esc(row.sales_order_type||"—")+'</td>'+
      '<td>'+esc(row.item_name||"—")+'</td>'+
      '<td>'+esc(row.requested_by||"—")+'</td>'+
      '<td>'+esc(row.completed_by||"—")+'</td></tr>'
    ).join(""):'<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">No completed cancellations yet.</td></tr>';
  }

  function renderCancellationByEmployee(){
    const summary=new Map();

    for(const row of pendingCancellations()){
      const name=String(row.requested_by||"Unknown");
      if(!summary.has(name)) summary.set(name,{pending:0,completed:0});
      summary.get(name).pending+=1;
    }

    for(const row of cancellationHistory()){
      const name=String(row.completed_by||"Unknown");
      if(!summary.has(name)) summary.set(name,{pending:0,completed:0});
      summary.get(name).completed+=1;
    }

    const rows=[...summary.entries()]
      .map(([employee,counts])=>({employee,...counts}))
      .sort((a,b)=>(b.pending+b.completed)-(a.pending+a.completed)||a.employee.localeCompare(b.employee));

    $("cancel-employee-body").innerHTML=rows.length?rows.map((row)=>
      '<tr><td><strong>'+esc(row.employee)+'</strong></td><td>'+num(row.pending)+'</td><td>'+num(row.completed)+'</td></tr>'
    ).join(""):'<tr><td colspan="3" class="muted" style="text-align:center;padding:18px">No cancellation activity yet.</td></tr>';
  }

  function renderTasks(){
    const viewer=dashboard?.viewer||{};
    $("add-task").hidden=!viewer.can_manage;

    const tasks=Array.isArray(dashboard?.tasks)?dashboard.tasks:[];
    $("task-list").innerHTML=tasks.length?tasks.map((task)=>{
      const p=priorityText(task.priority).toLowerCase();
      return '<article class="task-card '+p+'" data-task-id="'+esc(task.id)+'">'+
        '<div class="task-head"><div><div class="task-title">'+esc(task.title)+'</div>'+
        '<div class="task-meta">'+esc(task.created_by||"")+' · '+dateTime(task.created_at)+
        (task.due_date?' · Due '+dateText(task.due_date):'')+
        ' · '+num(task.comment_count)+' comment'+(Number(task.comment_count)===1?'':'s')+'</div></div>'+
        '<span class="priority-pill '+p+'">'+esc(priorityText(task.priority))+'</span></div>'+
        (task.description?'<div style="margin-top:8px;font-size:12px;white-space:pre-wrap">'+esc(task.description)+'</div>':'')+
      '</article>';
    }).join(""):'<div class="muted" style="padding:12px;text-align:center">No open Shipping team tasks.</div>';

    $("task-list").querySelectorAll("[data-task-id]").forEach((card)=>{
      card.addEventListener("click",()=>openTaskDetail(card.dataset.taskId).catch(showError));
    });
  }

  function renderDashboard(){
    const viewer=dashboard?.viewer||{};
    const counts=dashboard?.counts||{};
    $("viewer-meta").textContent=[viewer.employee_name,viewer.employee_role,viewer.department].filter(Boolean).join(" · ");
    $("tile-cancel-count").textContent=num(counts.pending_cancellations||0)+" Pending";

    const todayLabel=dashboard?.today?dateText(dashboard.today):"Today";
    $("activity-subtitle").textContent="Picks and pending PPS QA batches for "+todayLabel+".";

    const picked=Array.isArray(dashboard?.picked_today_by_employee)?dashboard.picked_today_by_employee:[];
    $("picked-today-body").innerHTML=picked.length?picked.map((row)=>
      '<tr><td><strong>'+esc(row.picker_name||"—")+'</strong></td><td><strong>'+num(row.picked_orders)+'</strong></td></tr>'
    ).join(""):'<tr><td colspan="2" class="muted" style="text-align:center">No picked orders recorded today.</td></tr>';

    const qa=Array.isArray(dashboard?.pending_qa_batches)?dashboard.pending_qa_batches:[];
    $("qa-batches-body").innerHTML=qa.length?qa.map((row)=>
      '<tr><td><strong>'+esc(row.batch_number||"—")+'</strong></td>'+
      '<td>'+esc(row.picker_name||"—")+'</td>'+
      '<td>'+num(row.order_count)+'</td>'+
      '<td>'+num(row.discrepancy_count)+'</td>'+
      '<td><span class="status-pill">'+esc(String(row.status||"").replaceAll("_"," "))+'</span></td>'+
      '<td>'+esc(dateTime(row.submitted_at))+'</td></tr>'
    ).join(""):'<tr><td colspan="6" class="muted" style="text-align:center">No PPS QA batches are pending.</td></tr>';

    const stalled=Array.isArray(dashboard?.stalled_orders)?dashboard.stalled_orders:[];
    $("stalled-body").innerHTML=stalled.length?stalled.map((row)=>
      '<tr><td>'+esc(dateText(row.ship_date))+'</td>'+
      '<td><strong>'+esc(row.document_number||"—")+'</strong></td>'+
      '<td>'+esc(row.sales_order_type||"—")+'</td>'+
      '<td>'+esc(row.item_name||"—")+'</td>'+
      '<td><span class="status-pill">'+esc(row.item_status||"—")+'</span></td>'+
      '<td class="age">'+num(row.status_age_days)+'</td></tr>'
    ).join(""):'<tr><td colspan="6" class="muted" style="text-align:center">No Printed - Stalled or Ready to Pick - Stalled orders.</td></tr>';

    renderPendingCancellations();
    renderCancellationHistory();
    renderCancellationByEmployee();
    renderCancellationTabs();
    renderTasks();
  }

  async function loadDashboard(){
    dashboard=await rpc("get_shipping_team_dashboard",{p_session_token:token});
    renderDashboard();
  }

  async function markSelectedCancelled(){
    const rows=pendingCancellations().filter((row)=>selectedCancellations.has(cancellationKey(row)));
    if(!rows.length) throw new Error("Select at least one pending cancellation.");

    if(!window.confirm("Mark "+rows.length+" selected cancellation"+(rows.length===1?"":"s")+" complete?\n\nUse this only after the order has been cancelled in the internal database.")) return;

    $("mark-cancelled").disabled=true;
    try{
      const result=await rpc("mark_shipping_cancellations_completed",{
        p_session_token:token,
        p_lines:rows.map((row)=>({
          sales_order_internal_id:row.sales_order_internal_id,
          line_unique_key:row.line_unique_key
        }))
      });
      selectedCancellations.clear();
      setMessage(num(result?.completed_count||0)+" cancellation"+(Number(result?.completed_count)===1?"":"s")+" marked complete.","success");
      await loadDashboard();
    }finally{
      $("mark-cancelled").disabled=false;
    }
  }

  function openTaskEditor(task=null){
    currentTaskId=task?.id||null;
    $("task-editor-title").textContent=task?"Edit Shipping Task":"Add Shipping Task";
    $("task-title").value=task?.title||"";
    $("task-priority").value=priorityText(task?.priority||"NORMAL");
    $("task-due").value=task?.due_date||"";
    $("task-description").value=task?.description||"";
    $("task-editor").hidden=false;
  }

  function closeModal(id){
    $(id).hidden=true;
  }

  async function saveTask(){
    const title=$("task-title").value.trim();
    if(!title) throw new Error("Task Title is required.");

    $("task-save").disabled=true;
    try{
      await rpc("save_shipping_team_task",{
        p_session_token:token,
        p_task_id:currentTaskId,
        p_title:title,
        p_description:$("task-description").value.trim()||null,
        p_priority:$("task-priority").value,
        p_due_date:$("task-due").value||null
      });
      closeModal("task-editor");
      setMessage(currentTaskId?"Shipping task updated.":"Shipping task created.","success");
      currentTaskId=null;
      await loadDashboard();
    }finally{
      $("task-save").disabled=false;
    }
  }

  function renderTaskDetail(){
    const task=currentTaskDetail?.task||{};
    const comments=Array.isArray(currentTaskDetail?.comments)?currentTaskDetail.comments:[];

    $("detail-title").textContent=task.title||"Task";
    $("detail-meta").textContent=[
      priorityText(task.priority),
      "Created by "+(task.created_by||"Unknown"),
      dateTime(task.created_at),
      task.due_date?"Due "+dateText(task.due_date):null,
      task.status==="COMPLETED"?"Completed by "+(task.completed_by||"Unknown")+" "+dateTime(task.completed_at):null
    ].filter(Boolean).join(" · ");
    $("detail-description").textContent=task.description||"No description.";

    $("detail-manager-actions").hidden=!task.can_manage;
    $("detail-complete").textContent=task.status==="COMPLETED"?"Reopen Task":"Complete Task";

    $("comment-list").innerHTML=comments.length?comments.map((c)=>
      '<div class="comment"><div><strong>'+esc(c.employee_name||"")+'</strong><time>'+esc(dateTime(c.created_at))+'</time></div><p>'+esc(c.comment_text||"")+'</p></div>'
    ).join(""):'<div class="muted">No comments yet.</div>';
  }

  async function openTaskDetail(taskId){
    currentTaskId=taskId;
    currentTaskDetail=await rpc("get_shipping_team_task_detail",{
      p_session_token:token,
      p_task_id:taskId
    });
    renderTaskDetail();
    $("comment-text").value="";
    $("task-detail").hidden=false;
  }

  async function addComment(){
    const text=$("comment-text").value.trim();
    if(!text) throw new Error("Enter a comment first.");

    $("comment-add").disabled=true;
    try{
      currentTaskDetail=await rpc("add_shipping_team_task_comment",{
        p_session_token:token,
        p_task_id:currentTaskId,
        p_comment:text
      });
      $("comment-text").value="";
      renderTaskDetail();
      await loadDashboard();
    }finally{
      $("comment-add").disabled=false;
    }
  }

  async function toggleTaskCompleted(){
    const task=currentTaskDetail?.task;
    if(!task) return;
    const completing=task.status!=="COMPLETED";
    if(!window.confirm(completing?"Mark this Shipping task complete?":"Reopen this Shipping task?")) return;

    currentTaskDetail=await rpc("set_shipping_team_task_completed",{
      p_session_token:token,
      p_task_id:currentTaskId,
      p_completed:completing
    });
    renderTaskDetail();
    await loadDashboard();
    if(completing){
      closeModal("task-detail");
      setMessage("Shipping task completed.","success");
    }else{
      setMessage("Shipping task reopened.","success");
    }
  }

  async function init(){
    if(!token){
      window.location.replace("index.html");
      return;
    }

    try{
      $("app").hidden=false;
      await loadDashboard();
    }catch(error){
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("cancel-tile-toggle").addEventListener("click",()=>{
    setCancellationExpanded(!cancellationExpanded);
  });

  document.querySelectorAll("[data-cancel-tab]").forEach((button)=>{
    button.addEventListener("click",()=>{
      cancelTab=button.dataset.cancelTab;
      renderCancellationTabs();
    });
  });

  $("cancel-select-all").addEventListener("change",(event)=>{
    pendingCancellations().forEach((row)=>{
      const key=cancellationKey(row);
      if(event.target.checked) selectedCancellations.add(key);
      else selectedCancellations.delete(key);
    });
    renderPendingCancellations();
  });

  $("mark-cancelled").addEventListener("click",()=>markSelectedCancelled().catch(showError));
  $("refresh").addEventListener("click",()=>loadDashboard().then(()=>setMessage("Shipping Dashboard refreshed.","success")).catch(showError));
  $("add-task").addEventListener("click",()=>openTaskEditor());
  $("task-save").addEventListener("click",()=>saveTask().catch(showError));
  $("comment-add").addEventListener("click",()=>addComment().catch(showError));
  $("detail-complete").addEventListener("click",()=>toggleTaskCompleted().catch(showError));
  $("detail-edit").addEventListener("click",()=>{
    const task=currentTaskDetail?.task;
    if(!task) return;
    closeModal("task-detail");
    openTaskEditor(task);
  });

  document.querySelectorAll("[data-close]").forEach((button)=>{
    button.addEventListener("click",()=>closeModal(button.dataset.close));
  });
  ["task-editor","task-detail"].forEach((id)=>{
    $(id).addEventListener("click",(event)=>{if(event.target===$(id))closeModal(id);});
  });

  setCancellationExpanded(false);
  init();
})();