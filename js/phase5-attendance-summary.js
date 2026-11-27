"use strict";
(() => {
  const config = window.TaskTrackerConfig;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } });
  const $ = id => document.getElementById(id);
  const key = config.sessionStorageKey;
  let token = sessionStorage.getItem(key);
  let employee = null;
  let setup = null;
  let summary = null;
  let currentAction = null;
  let currentActionTimeline = [];

  const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  function msg(text,type="info"){ const el=$("message"); el.textContent=text||""; el.dataset.type=type; el.hidden=!text; }
  async function rpc(name,args={}){ const {data,error}=await client.rpc(name,args); if(error) throw new Error(error.message||`${name} failed.`); return data; }
  function fillSelect(id,rows,valueKey,labelKey,placeholder){ const s=$(id); s.innerHTML=`<option value="">${esc(placeholder)}</option>`; (rows||[]).forEach(r=>{const o=document.createElement("option");o.value=r[valueKey];o.textContent=typeof labelKey==="function"?labelKey(r):r[labelKey];s.appendChild(o);}); }
  async function listLogin(){ const rows=await rpc("list_login_employees"); fillSelect("employee",rows,"employee_id","employee_name","Select employee"); }
  async function restore(){ if(!token) return false; try{ const r=await rpc("get_employee_session_context",{p_session_token:token}); employee=Array.isArray(r)?r[0]:r; return !!employee; }catch{ sessionStorage.removeItem(key); token=null; return false; } }
  async function login(ev){ ev.preventDefault(); const r=await rpc("login_with_employee_pin",{p_employee_id:$("employee").value,p_pin:$("pin").value}); const row=Array.isArray(r)?r[0]:r; if(!row?.login_successful||!row.session_token){msg(row?.login_message||"Login failed.","error");return;} token=row.session_token;sessionStorage.setItem(key,token);employee=row;$("pin").value="";await enter(); }
  async function signOut(){ const t=token; sessionStorage.removeItem(key); token=null;employee=null;setup=null;summary=null; if(t){try{await rpc("logout_employee_session",{p_session_token:t});}catch{}} window.location.replace("index.html"); }
  async function loadSetup(){ setup=await rpc("get_corrective_action_setup",{p_session_token:token}); fillSelect("action-employee",setup.employees,"employee_id",r=>[r.employee_name,r.department].filter(Boolean).join(" · "),"Select employee"); fillSelect("action-category",setup.categories,"category_id","display_name","Select category"); fillSelect("action-reason",setup.reasons,"reason_id","display_name","Select reason"); }
  async function loadSummary(){
    summary=await rpc("get_attendance_employee_summary",{
      p_session_token:token,
      p_employee_id:null,
      p_supervisor_id:null,
      p_include_inactive_actions:$("include-inactive").checked
    });
    const canIncludeTerminated=setup?.viewer?.role==="Administrator";
    if(canIncludeTerminated && $("include-terminated")?.checked){
      const terminated=await rpc("get_attendance_terminated_corrective_actions",{p_session_token:token});
      summary.corrective_actions=[
        ...(summary.corrective_actions||[]),
        ...(Array.isArray(terminated)?terminated:[])
      ];
    }
    renderFilters();
    renderAttendance();
    renderActions();
  }
  function renderFilters(){
    if(!summary) return;
    const employeeSelect=$("filter-employee");
    const supervisorSelect=$("filter-supervisor");
    const currentEmployee=employeeSelect.value;
    const currentSupervisor=supervisorSelect.value;

    const can=summary.viewer?.can_filter_supervisors;
    $("supervisor-filter-wrap").hidden=!can;
    if(can){
      fillSelect("filter-supervisor",summary.supervisors,"employee_id","employee_name","All supervisors");
      if([...supervisorSelect.options].some(option=>option.value===currentSupervisor)) supervisorSelect.value=currentSupervisor;
    }else{
      supervisorSelect.value="";
    }

    const supervisorId=supervisorSelect.value;
    const employeeMap=new Map((summary.employees||[]).map(row=>[String(row.employee_id),row]));
    if($("include-terminated")?.checked){
      (summary.corrective_actions||[]).filter(row=>row.is_terminated).forEach(row=>{
        const key=String(row.employee_id);
        if(!employeeMap.has(key)) employeeMap.set(key,{
          employee_id:row.employee_id,
          employee_name:`${row.employee_name} (Terminated)`,
          department:row.department,
          supervisor_id:row.supervisor_id,
          supervisor_name:row.supervisor_name
        });
      });
    }
    const employeeRows=[...employeeMap.values()].filter(row=>!supervisorId || String(row.supervisor_id||"")===String(supervisorId));
    employeeRows.sort((a,b)=>String(a.employee_name||"").localeCompare(String(b.employee_name||"")));
    fillSelect("filter-employee",employeeRows,"employee_id","employee_name","All employees");
    if([...employeeSelect.options].some(option=>option.value===currentEmployee)) employeeSelect.value=currentEmployee;
    else employeeSelect.value="";
  }

  function filteredAttendanceRows(){
    const supervisorId=$("filter-supervisor").value;
    const employeeId=$("filter-employee").value;
    return (summary?.attendance_rows||[]).filter(row=>
      (!supervisorId || String(row.supervisor_id||"")===String(supervisorId)) &&
      (!employeeId || String(row.employee_id||"")===String(employeeId))
    );
  }

  function filteredCorrectiveActions(){
    const supervisorId=$("filter-supervisor").value;
    const employeeId=$("filter-employee").value;
    return (summary?.corrective_actions||[]).filter(row=>
      (!supervisorId || String(row.supervisor_id||"")===String(supervisorId)) &&
      (!employeeId || String(row.employee_id||"")===String(employeeId))
    );
  }

  function applySummaryFilters(){
    renderFilters();
    renderAttendance();
    renderActions();
  }
  function renderAttendance(){
    const body=$("attendance-body");
    body.innerHTML="";
    const rows=filteredAttendanceRows();
    if(!rows.length){body.innerHTML='<tr><td colspan="7">No employees match this view.</td></tr>';return;}
    rows.forEach(r=>{
      const actions=Array.isArray(r.attendance_actions)?r.attendance_actions:[];
      const actionHtml=actions.length
        ? actions.map(a=>`<span class="attendance-action-badge ${a.level==="CORRECTIVE_ACTION"?"corrective":"coaching"}">${esc(a.label||a.reason||"Attendance Action")}</span>`).join("")
        : '<span class="attendance-clear">No threshold reached</span>';
      const tr=document.createElement("tr");
      if(r.is_probationary) tr.classList.add("attendance-probationary");
      const historyCount=(value,metric,label)=>`<button type="button" class="attendance-history-jump" data-attendance-history-employee="${esc(r.employee_id)}" data-attendance-history-metric="${esc(metric)}" title="View ${esc(label)} history">${value||0}</button>`;
      tr.innerHTML=`<td><strong>${esc(r.employee_name)}</strong>${r.is_probationary?'<span class="probationary-label">Probationary</span>':""}</td><td>${esc(r.supervisor_name||"")}</td><td>${historyCount(r.unplanned_absence,"UNPLANNED_ABSENCE_UNAPPROVED","unplanned absence")}</td><td>${historyCount(r.unplanned_leave_early,"UNPLANNED_LEFT_EARLY_UNAPPROVED","unplanned leave early")}</td><td>${historyCount(r.tardies,"TARDY","tardy")}</td><td>${historyCount(r.no_call_no_show,"NCNS","no call / no show")}</td><td class="attendance-action-cell">${actionHtml}</td>`;
      body.appendChild(tr);
    });
  }
  function categoryRank(code){
    const cats=setup?.categories||[];
    const index=cats.findIndex(c=>c.category_code===code);
    return index>=0?index+1:0;
  }
  function isActiveAction(a){ return a?.is_active===true || a?.is_active==="true"; }
  function chooseCurrentAction(items){
    const active=items.filter(isActiveAction);
    const pool=active.length?active:items;
    return [...pool].sort((a,b)=>{
      const rankDiff=categoryRank(b.category_code)-categoryRank(a.category_code);
      if(rankDiff) return rankDiff;
      return String(b.incident_date||"").localeCompare(String(a.incident_date||""));
    })[0]||null;
  }
  function groupedActions(rows){
    const groups=new Map();
    (rows||[]).forEach(a=>{
      const key=String(a.employee_id);
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(a);
    });
    return [...groups.values()].map(items=>({
      items,
      current:chooseCurrentAction(items),
      activeItems:items.filter(isActiveAction),
      isTerminated:items.some(a=>a.is_terminated===true)
    })).filter(group=>group.current);
  }
  function actionBucket(group){
    if(group.isTerminated) return "TERMINATED";
    if(!group.activeItems.length) return "INACTIVE";
    return group.current.category_code;
  }
  function renderActions(){
    const wrap=$("action-sections");
    wrap.innerHTML="";
    const groups=groupedActions(filteredCorrectiveActions());
    if(!groups.length){
      wrap.innerHTML='<div class="empty">No coaching or corrective-action records match this view.</div>';
      return;
    }
    const cats=setup?.categories||[];
    const buckets=[
      ...cats.map(c=>({code:c.category_code,label:c.display_name})),
      {code:"INACTIVE",label:"Inactive / Historical"},
      {code:"TERMINATED",label:"Terminated"}
    ];
    buckets.forEach(bucket=>{
      const bucketGroups=groups.filter(group=>actionBucket(group)===bucket.code)
        .sort((a,b)=>String(a.current.employee_name||"").localeCompare(String(b.current.employee_name||"")));
      if(!bucketGroups.length) return;
      const title=document.createElement("div");
      title.className="action-row-title";
      title.textContent=bucket.label;
      wrap.appendChild(title);
      const grid=document.createElement("div");
      grid.className="tiles";
      bucketGroups.forEach(group=>{
        const a=group.current;
        const reasons=[...new Set((group.activeItems.length?group.activeItems:group.items).map(item=>item.reason_name).filter(Boolean))];
        const tile=document.createElement("div");
        tile.className="tile consolidated-action-card";
        if(group.isTerminated) tile.classList.add("terminated");
        const status=group.isTerminated
          ? `Terminated ${a.termination_date||""}`
          : group.activeItems.length
            ? `Current Level: ${a.category_name}`
            : `Historical: ${a.category_name}`;
        const stepCount=group.activeItems.length
          ? `${group.activeItems.length} active action${group.activeItems.length===1?"":"s"}`
          : `${group.items.length} historical record${group.items.length===1?"":"s"}`;
        tile.innerHTML=`<strong>${esc(a.employee_name)}</strong><span class="action-level">${esc(status)}</span><small>${esc(reasons.join(" · ")||a.reason_name||"")}</small><small>Current since: ${esc(a.incident_date||"—")} · Roll off: ${esc(a.roll_off_display||"—")}</small><small>${esc(stepCount)} · View History</small>`;
        tile.addEventListener("click",()=>openEmployeeActionCard(group).catch(e=>alert(e.message)));
        grid.appendChild(tile);
      });
      wrap.appendChild(grid);
    });
  }
  function calcRolloff(){ const cat=(setup?.categories||[]).find(c=>c.category_id===$("action-category").value); const date=$("action-date").value; if(!cat){$("action-rolloff").value="";return;} if(cat.requires_manual_close){$("action-rolloff").value="End of Probationary Period";return;} if(!date){$("action-rolloff").value="";return;} const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+Math.max(Number(cat.active_days||0)-1,0));$("action-rolloff").value=d.toLocaleDateString(); }
  function openNew(){
    currentAction=null;
    currentActionTimeline=[];
    $("action-employee").querySelectorAll('option[data-terminated-historical="1"]').forEach(option=>option.remove());
    $("modal-title").textContent="Enter Coaching / Corrective Action";
    $("action-detail").hidden=true;
    $("action-form").reset();
    $("action-id").value="";
    $("action-employee").disabled=false;
    $("action-date").value=new Date().toISOString().slice(0,10);
    $("delete-action").hidden=true;
    $("deactivate-action").hidden=true;
    $("terminate-action").hidden=true;
    $("action-form").querySelector('button[type="submit"]').hidden=false;
    $("action-category").disabled=false;
    $("action-reason").disabled=false;
    $("action-date").disabled=false;
    $("action-description").disabled=false;
    calcRolloff();
    $("action-modal").hidden=false;
  }
  function renderActionTimeline(a,timeline){
    const rows=Array.isArray(timeline)?timeline:[];
    const history=rows.map(item=>`<div class="action-history-row ${isActiveAction(item)?"active":"inactive"}"><div class="action-history-head"><div><strong>${esc(item.category_name)}</strong> · ${esc(item.reason_name)}</div>${a.is_terminated?"":`<button type="button" class="ghost action-history-edit" data-edit-action-id="${esc(item.corrective_action_id)}">${String(item.corrective_action_id)===String(a.corrective_action_id)?"Editing":"Edit Record"}</button>`}</div><div class="muted">${esc(item.incident_date)} · Roll off: ${esc(item.roll_off_display||"—")} · ${isActiveAction(item)?"Active":"Inactive"}</div>${item.description?`<div class="action-history-description">${esc(item.description)}</div>`:""}</div>`).join("");
    const termination=a.is_terminated
      ? `<div class="termination-summary"><strong>Terminated ${esc(a.termination_date||"")}</strong>${a.termination_reason?`<div>${esc(a.termination_reason)}</div>`:""}${a.termination_recorded_by?`<div class="muted">Recorded by ${esc(a.termination_recorded_by)}</div>`:""}</div>`
      : "";
    $("action-detail").innerHTML=`${termination}<div><strong>Current displayed step:</strong> ${esc(a.category_name)} · ${esc(a.reason_name)}</div><div class="muted">Incident: ${esc(a.incident_date)} · Roll off: ${esc(a.roll_off_display||"—")}</div><div class="action-history-title">Corrective Action History</div><div class="action-history-list">${history||'<div class="muted">No history found.</div>'}</div>`;
    if(!a.is_terminated){
      $("action-detail").querySelectorAll("[data-edit-action-id]").forEach(button=>{
        button.addEventListener("click",()=>{
          const item=rows.find(row=>String(row.corrective_action_id)===String(button.dataset.editActionId));
          if(item) openEdit(item,rows);
        });
      });
    }
  }
  async function openEmployeeActionCard(group){
    const a=group.current;
    currentAction=a;
    currentActionTimeline=[];
    openEdit(a,[]);
    try{
      const timeline=await rpc("get_employee_corrective_action_timeline",{p_session_token:token,p_employee_id:a.employee_id});
      currentActionTimeline=Array.isArray(timeline)?timeline:[];
      if(currentAction?.employee_id===a.employee_id) renderActionTimeline(a,currentActionTimeline);
    }catch(e){
      if(currentAction?.employee_id===a.employee_id) $("action-detail").innerHTML+=`<div class="muted" style="margin-top:10px">History could not be loaded: ${esc(e.message)}</div>`;
    }
  }
  function openEdit(a,timeline=[]){
    currentAction=a;
    $("modal-title").textContent="Employee Corrective Action Status";
    $("action-id").value=a.corrective_action_id;
    const employeeSelect=$("action-employee");
    if(![...employeeSelect.options].some(option=>String(option.value)===String(a.employee_id))){
      const option=document.createElement("option");
      option.value=a.employee_id;
      option.textContent=`${a.employee_name} · Terminated`;
      option.dataset.terminatedHistorical="1";
      employeeSelect.appendChild(option);
    }
    employeeSelect.value=a.employee_id;
    $("action-employee").disabled=true;
    $("action-category").value=a.category_id;
    $("action-reason").value=a.reason_id;
    $("action-date").value=a.incident_date;
    $("action-description").value=a.description||"";
    $("action-rolloff").value=a.roll_off_display||"";
    $("action-detail").hidden=false;
    renderActionTimeline(a,timeline);
    $("delete-action").hidden=!(setup?.viewer?.can_delete_corrective_actions) || !!a.is_terminated;
    $("deactivate-action").hidden=!(summary?.viewer?.can_close_probationary_final && a.category_code==="PROBATIONARY_FINAL" && isActiveAction(a)) || !!a.is_terminated;
    $("terminate-action").hidden=!(setup?.viewer?.role==="Administrator") || !!a.is_terminated;
    $("action-form").querySelector('button[type="submit"]').hidden=!!a.is_terminated;
    $("action-category").disabled=!!a.is_terminated;
    $("action-reason").disabled=!!a.is_terminated;
    $("action-date").disabled=!!a.is_terminated;
    $("action-description").disabled=!!a.is_terminated;
    $("action-modal").hidden=false;
  }
  async function saveAction(ev){ev.preventDefault(); try{ if(currentAction){await rpc("update_corrective_action",{p_session_token:token,p_corrective_action_id:currentAction.corrective_action_id,p_category_id:$("action-category").value,p_reason_id:$("action-reason").value,p_incident_date:$("action-date").value,p_description:$("action-description").value.trim()});} else {await rpc("create_corrective_action",{p_session_token:token,p_employee_id:$("action-employee").value,p_category_id:$("action-category").value,p_reason_id:$("action-reason").value,p_incident_date:$("action-date").value,p_description:$("action-description").value.trim()});} $("action-modal").hidden=true;await loadSummary(); }catch(e){alert(e.message);} }
  async function deleteAction(){
    if(!currentAction||!setup?.viewer?.can_delete_corrective_actions) return;
    if(!confirm(`Delete this ${currentAction.category_name} record for ${currentAction.employee_name}? It will disappear from the employee record but the deletion remains audited.`)) return;
    const reason=prompt("Optional deletion reason (for example: Test record):")||null;
    try{
      await rpc("delete_corrective_action",{
        p_session_token:token,
        p_corrective_action_id:currentAction.corrective_action_id,
        p_reason:reason
      });
      $("action-modal").hidden=true;
      currentAction=null;
      await loadSummary();
    }catch(e){alert(e.message);}
  }

  async function terminateEmployee(){
    if(!currentAction || setup?.viewer?.role!=="Administrator" || currentAction.is_terminated) return;
    if(!confirm(`Mark ${currentAction.employee_name} as terminated? This will make the employee inactive in Task Tracker, revoke active Task Tracker sessions, and hide their active Attendance Summary card.`)) return;
    const defaultDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const terminationDate=prompt("Termination date (YYYY-MM-DD):",defaultDate);
    if(terminationDate===null) return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)){alert("Enter the termination date as YYYY-MM-DD.");return;}
    const reason=prompt("Optional termination note / reason:")||null;
    try{
      await rpc("terminate_attendance_employee",{
        p_session_token:token,
        p_employee_id:currentAction.employee_id,
        p_termination_date:terminationDate,
        p_reason:reason
      });
      $("action-modal").hidden=true;
      currentAction=null;
      currentActionTimeline=[];
      await loadSetup();
      await loadSummary();
    }catch(e){alert(e.message);}
  }

  async function deactivate(){ if(!currentAction) return; const reason=prompt("Optional reason for marking this Probationary Final inactive:")||null; try{await rpc("deactivate_probationary_final",{p_session_token:token,p_corrective_action_id:currentAction.corrective_action_id,p_reason:reason});$("action-modal").hidden=true;await loadSummary();}catch(e){alert(e.message);} }
  async function enter(){ const role=employee?.employee_role||employee?.role; if(!["Supervisor","Manager","Administrator"].includes(role)){sessionStorage.removeItem(key);token=null;window.location.replace("index.html");return;} $("login").hidden=true;$("app").hidden=false;$("side-name").textContent=employee.employee_name||employee.name||"";$("side-meta").textContent=[role,employee.department].filter(Boolean).join(" · "); await loadSetup(); $("include-terminated-wrap").hidden=setup?.viewer?.role!=="Administrator"; await loadSummary(); }
  async function init(){try{await listLogin();if(await restore())await enter();}catch(e){msg(e.message,"error");}}
  $("login-form").addEventListener("submit",e=>login(e).catch(x=>msg(x.message,"error")));$("sign-out").addEventListener("click",()=>signOut());$("refresh").addEventListener("click",()=>loadSummary().catch(e=>alert(e.message)));$("filter-employee").addEventListener("change",()=>{ renderAttendance(); renderActions(); });$("filter-supervisor").addEventListener("change",()=>{ $("filter-employee").value=""; applySummaryFilters(); });$("include-inactive").addEventListener("change",()=>loadSummary().catch(e=>alert(e.message)));$("include-terminated").addEventListener("change",()=>loadSummary().catch(e=>alert(e.message)));$("new-action").addEventListener("click",openNew);$("close-modal").addEventListener("click",()=>$("action-modal").hidden=true);$("action-category").addEventListener("change",calcRolloff);$("action-date").addEventListener("change",calcRolloff);$("action-form").addEventListener("submit",saveAction);$("delete-action").addEventListener("click",deleteAction);$("deactivate-action").addEventListener("click",deactivate);$("terminate-action").addEventListener("click",terminateEmployee);init();
})();