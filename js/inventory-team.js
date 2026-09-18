"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $ = (id) => document.getElementById(id);
  const token = sessionStorage.getItem(config.sessionStorageKey);

  let dashboard = null;
  let currentTaskId = null;
  let currentTaskDetail = null;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function dateText(value) {
    if (!value) return "—";
    const d = new Date(String(value).length===10 ? value+"T12:00:00" : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  function dateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function num(value) {
    const n=Number(value||0);
    return Number.isFinite(n) ? n.toLocaleString("en-US",{maximumFractionDigits:2}) : String(value||0);
  }

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if (error) throw new Error(error.message || (name+" failed."));
    return data;
  }

  function setMessage(text,type="info") {
    const el=$("message");
    el.textContent=text||"";
    el.dataset.type=type;
    el.hidden=!text;
  }

  function showError(error) {
    setMessage(error?.message || String(error),"error");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function priorityText(priority) {
    return String(priority||"NORMAL").toUpperCase();
  }

  function renderDashboard() {
    const viewer=dashboard?.viewer||{};
    const counts=dashboard?.counts||{};
    $("viewer-meta").textContent=[viewer.employee_name,viewer.employee_role,viewer.department].filter(Boolean).join(" · ");

    $("tile-stage-count").textContent=num(counts.pending_work_orders||0)+" Pending";
    $("tile-history-count").textContent=num(counts.history_rows||0)+" Records";
    $("tile-fgi-count").textContent=num(counts.stalled_fgi_put_away||0)+" Stalled";

    $("add-task").hidden=!viewer.can_manage;

    const tasks=Array.isArray(dashboard?.tasks)?dashboard.tasks:[];
    $("task-list").innerHTML=tasks.length ? tasks.map((task)=>{
      const p=priorityText(task.priority).toLowerCase();
      return '<article class="task-card '+p+'" data-task-id="'+esc(task.id)+'">'+
        '<div class="task-head"><div><div class="task-title">'+esc(task.title)+'</div>'+
        '<div class="task-meta">'+esc(task.created_by||"")+' · '+dateTime(task.created_at)+
        (task.due_date?' · Due '+dateText(task.due_date):'')+
        ' · '+num(task.comment_count)+' comment'+(Number(task.comment_count)===1?'':'s')+'</div></div>'+
        '<span class="priority-pill '+p+'">'+esc(priorityText(task.priority))+'</span></div>'+
        (task.description?'<div style="margin-top:8px;font-size:12px;white-space:pre-wrap">'+esc(task.description)+'</div>':'')+
      '</article>';
    }).join("") : '<div class="muted" style="padding:12px;text-align:center">No open Inventory team tasks.</div>';

    $("task-list").querySelectorAll("[data-task-id]").forEach((card)=>{
      card.addEventListener("click",()=>openTaskDetail(card.dataset.taskId).catch(showError));
    });

    const stalled=Array.isArray(dashboard?.stalled_work_orders)?dashboard.stalled_work_orders:[];
    $("stalled-body").innerHTML=stalled.length ? stalled.map((row)=>
      '<tr><td><strong>'+esc(row.document_number||"—")+'</strong></td>'+
      '<td>'+esc(row.item_name||"—")+'</td>'+
      '<td>'+num(row.quantity)+'</td>'+
      '<td><span class="operation">'+esc(row.operation_in_progress||"—")+'</span></td>'+
      '<td>'+dateText(row.operation_started_date)+'</td>'+
      '<td class="age">'+num(row.days_in_operation)+'</td>'+
      '<td>'+esc(row.work_order_job_type||"—")+'</td></tr>'
    ).join("") : '<tr><td colspan="7" class="muted" style="text-align:center">No stalled Material Pull or FGI Put Away Work Orders.</td></tr>';
  }

  async function loadDashboard() {
    dashboard=await rpc("get_inventory_team_dashboard",{p_session_token:token});
    renderDashboard();
  }

  function openTaskEditor(task=null) {
    currentTaskId=task?.id||null;
    $("task-editor-title").textContent=task ? "Edit Inventory Task" : "Add Inventory Task";
    $("task-title").value=task?.title||"";
    $("task-priority").value=priorityText(task?.priority||"NORMAL");
    $("task-due").value=task?.due_date||"";
    $("task-description").value=task?.description||"";
    $("task-editor").hidden=false;
  }

  function closeModal(id) {
    $(id).hidden=true;
  }

  async function saveTask() {
    const title=$("task-title").value.trim();
    if (!title) throw new Error("Task Title is required.");

    $("task-save").disabled=true;
    try {
      await rpc("save_inventory_team_task",{
        p_session_token:token,
        p_task_id:currentTaskId,
        p_title:title,
        p_description:$("task-description").value.trim()||null,
        p_priority:$("task-priority").value,
        p_due_date:$("task-due").value||null
      });
      closeModal("task-editor");
      setMessage(currentTaskId?"Inventory task updated.":"Inventory task created.","success");
      currentTaskId=null;
      await loadDashboard();
    } finally {
      $("task-save").disabled=false;
    }
  }

  function renderTaskDetail() {
    const task=currentTaskDetail?.task||{};
    const comments=Array.isArray(currentTaskDetail?.comments)?currentTaskDetail.comments:[];

    $("detail-title").textContent=task.title||"Task";
    $("detail-meta").textContent=[
      priorityText(task.priority),
      "Created by "+(task.created_by||"Unknown"),
      dateTime(task.created_at),
      task.due_date ? "Due "+dateText(task.due_date) : null,
      task.status==="COMPLETED" ? "Completed by "+(task.completed_by||"Unknown")+" "+dateTime(task.completed_at) : null
    ].filter(Boolean).join(" · ");
    $("detail-description").textContent=task.description||"No description.";

    $("detail-manager-actions").hidden=!task.can_manage;
    $("detail-complete").textContent=task.status==="COMPLETED" ? "Reopen Task" : "Complete Task";

    $("comment-list").innerHTML=comments.length ? comments.map((c)=>
      '<div class="comment"><div><strong>'+esc(c.employee_name||"")+'</strong><time>'+esc(dateTime(c.created_at))+'</time></div><p>'+esc(c.comment_text||"")+'</p></div>'
    ).join("") : '<div class="muted">No comments yet.</div>';
  }

  async function openTaskDetail(taskId) {
    currentTaskId=taskId;
    currentTaskDetail=await rpc("get_inventory_team_task_detail",{
      p_session_token:token,
      p_task_id:taskId
    });
    renderTaskDetail();
    $("comment-text").value="";
    $("task-detail").hidden=false;
  }

  async function addComment() {
    const text=$("comment-text").value.trim();
    if (!text) throw new Error("Enter a comment first.");

    $("comment-add").disabled=true;
    try {
      currentTaskDetail=await rpc("add_inventory_team_task_comment",{
        p_session_token:token,
        p_task_id:currentTaskId,
        p_comment:text
      });
      $("comment-text").value="";
      renderTaskDetail();
      await loadDashboard();
    } finally {
      $("comment-add").disabled=false;
    }
  }

  async function toggleTaskCompleted() {
    const task=currentTaskDetail?.task;
    if (!task) return;
    const completing=task.status!=="COMPLETED";
    if (!window.confirm(completing ? "Mark this Inventory task complete?" : "Reopen this Inventory task?")) return;

    currentTaskDetail=await rpc("set_inventory_team_task_completed",{
      p_session_token:token,
      p_task_id:currentTaskId,
      p_completed:completing
    });
    renderTaskDetail();
    await loadDashboard();
    if (completing) {
      closeModal("task-detail");
      setMessage("Inventory task completed.","success");
    } else {
      setMessage("Inventory task reopened.","success");
    }
  }

  async function init() {
    if (!token) {
      window.location.replace("index.html");
      return;
    }

    try {
      $("app").hidden=false;
      await loadDashboard();
    } catch (error) {
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("refresh").addEventListener("click",()=>loadDashboard().then(()=>setMessage("Inventory Dashboard refreshed.","success")).catch(showError));
  $("add-task").addEventListener("click",()=>openTaskEditor());
  $("task-save").addEventListener("click",()=>saveTask().catch(showError));
  $("comment-add").addEventListener("click",()=>addComment().catch(showError));
  $("detail-complete").addEventListener("click",()=>toggleTaskCompleted().catch(showError));
  $("detail-edit").addEventListener("click",()=>{
    const task=currentTaskDetail?.task;
    if (!task) return;
    closeModal("task-detail");
    openTaskEditor(task);
  });

  document.querySelectorAll("[data-close]").forEach((button)=>{
    button.addEventListener("click",()=>closeModal(button.dataset.close));
  });
  ["task-editor","task-detail"].forEach((id)=>{
    $(id).addEventListener("click",(event)=>{if(event.target===$(id))closeModal(id);});
  });

  init();
})();
