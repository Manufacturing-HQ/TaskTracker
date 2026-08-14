"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  let viewer = null;
  let memoData = null;
  let activeTab = "daily";
  let preparing = false;

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }

  function addStyles(){
    if(document.getElementById("ops-hub-style")) return;
    const s=document.createElement("style"); s.id="ops-hub-style";
    s.textContent=`
      .ops-hub-tabs{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 0 18px}
      .ops-hub-tab{border:1px solid #94a3b8;background:#fff;border-radius:10px;padding:10px 18px;font-weight:900;cursor:pointer}
      .ops-hub-tab.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
      .ops-hub-pane>.panel{margin-bottom:18px}.memo-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
      .memo-filters .field{margin:0;min-width:170px}.memo-table-wrap{overflow:auto;border:1px solid #94a3b8;border-radius:12px}
      .memo-table{width:100%;border-collapse:collapse;min-width:1050px}.memo-table th,.memo-table td{padding:10px 12px;border-bottom:1px solid #dbe3ef;text-align:left;font-size:12px;vertical-align:top}
      .memo-table th{background:#1e293b;color:#fff}.memo-pill{display:inline-block;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;background:#fff3bf;color:#7c5c00}
      .memo-pill.ack{background:#dcfce7;color:#166534}.memo-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:20px;z-index:80}
      .memo-modal{width:min(820px,96vw);max-height:90vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}
      .memo-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.memo-form .full{grid-column:1/-1}.memo-form label{font-size:12px;font-weight:800}
      .memo-form input,.memo-form select,.memo-form textarea{width:100%;margin-top:5px;min-height:42px;border:1px solid #94a3b8;border-radius:9px;padding:8px 10px;background:#fff}
      .memo-form select[multiple]{min-height:220px}.memo-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
      @media(max-width:800px){.memo-form{grid-template-columns:1fr}.memo-form .full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function ensureHub(){
    const overview=document.getElementById("view-overview");
    if(!overview || document.getElementById("ops-hub")) return;
    addStyles();
    const intro=overview.querySelector(".panel");
    if(intro) intro.hidden=true;
    const hub=document.createElement("div"); hub.id="ops-hub";
    hub.innerHTML=`
      <div class="ops-hub-tabs">
        <button class="ops-hub-tab active" data-hub-tab="daily">Daily Operations</button>
        <button class="ops-hub-tab" data-hub-tab="setup">Employees &amp; Setup</button>
      </div>
      <div id="ops-hub-daily" class="ops-hub-pane"></div>
      <div id="ops-hub-setup" class="ops-hub-pane" hidden></div>`;
    overview.appendChild(hub);
    hub.querySelectorAll("[data-hub-tab]").forEach(b=>b.addEventListener("click",()=>showHubTab(b.dataset.hubTab)));
  }

  function moveExistingSections(){
    ensureHub();
    const daily=document.getElementById("ops-hub-daily"), setup=document.getElementById("ops-hub-setup");
    const attendance=document.getElementById("view-attendance"), audit=document.getElementById("view-audit");
    if(attendance && attendance.parentElement!==daily) daily.appendChild(attendance);
    if(audit && audit.parentElement!==daily) daily.appendChild(audit);
    const master=document.getElementById("ops-master");
    if(master && master.parentElement!==setup) setup.appendChild(master);
    if(!document.getElementById("management-memos-panel")) buildMemoPanel(daily);
    if(attendance) attendance.hidden=false;
    if(audit) audit.hidden=false;
  }

  function showHubTab(tab){
    activeTab=tab;
    document.querySelectorAll("[data-hub-tab]").forEach(b=>b.classList.toggle("active",b.dataset.hubTab===tab));
    const daily=document.getElementById("ops-hub-daily"), setup=document.getElementById("ops-hub-setup");
    if(daily) daily.hidden=tab!=="daily";
    if(setup) setup.hidden=tab!=="setup";
    if(tab==="setup") setTimeout(moveExistingSections,0);
    if(tab==="daily") loadMemos().catch(showError);
  }

  function buildMemoPanel(daily){
    const panel=document.createElement("div"); panel.id="management-memos-panel"; panel.className="panel";
    panel.innerHTML=`
      <div class="section-title"><h2>Memos</h2><button id="memo-create" class="primary">Create Memo</button></div>
      <div class="memo-filters">
        <div class="field"><label>Status</label><select id="memo-status"><option value="PENDING">Pending / Unacknowledged</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="ALL">All</option></select></div>
        <div class="field" id="memo-supervisor-field" hidden><label>Supervisor</label><select id="memo-supervisor"><option value="">All Supervisors</option></select></div>
        <div class="field"><label>Employee</label><select id="memo-employee"><option value="">All Employees</option></select></div>
        <button id="memo-refresh" class="ghost">Refresh</button>
      </div>
      <div id="memo-message" class="msg" hidden></div>
      <div id="memo-table" class="memo-table-wrap" style="margin-top:14px"></div>`;
    daily.appendChild(panel);
    document.getElementById("memo-status").addEventListener("change",loadMemos);
    document.getElementById("memo-supervisor").addEventListener("change",()=>{populateEmployeeFilter();loadMemos();});
    document.getElementById("memo-employee").addEventListener("change",loadMemos);
    document.getElementById("memo-refresh").addEventListener("click",loadMemos);
    document.getElementById("memo-create").addEventListener("click",()=>openCreateMemo().catch(showError));
  }

  function setMemoMessage(message,type="info"){
    const el=document.getElementById("memo-message"); if(!el) return;
    el.textContent=message||""; el.dataset.type=type; el.hidden=!message;
  }

  function populateSupervisorFilter(){
    const f=document.getElementById("memo-supervisor-field"), s=document.getElementById("memo-supervisor");
    const can=!!memoData?.viewer?.can_filter_supervisor; if(f) f.hidden=!can;
    if(!s) return; const cur=s.value;
    s.innerHTML='<option value="">All Supervisors</option>'+(memoData?.supervisors||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.employee_name)}</option>`).join("");
    if([...s.options].some(o=>o.value===cur)) s.value=cur;
  }

  function populateEmployeeFilter(){
    const e=document.getElementById("memo-employee"), s=document.getElementById("memo-supervisor"); if(!e) return;
    const cur=e.value, supervisor=s?.value||"";
    const rows=(memoData?.employees||[]).filter(x=>!supervisor||x.supervisor_id===supervisor);
    e.innerHTML='<option value="">All Employees</option>'+rows.map(x=>`<option value="${esc(x.id)}">${esc(x.employee_name)}</option>`).join("");
    if([...e.options].some(o=>o.value===cur)) e.value=cur;
  }

  function renderMemos(){
    const host=document.getElementById("memo-table"); if(!host) return;
    const rows=memoData?.records||[];
    host.innerHTML=`<table class="memo-table"><thead><tr><th>Status</th><th>Employee</th><th>Memo Type</th><th>Subject</th><th>Submitted By</th><th>Submitted</th><th>Acknowledged</th><th>View</th></tr></thead><tbody>${rows.map(r=>`<tr>
      <td><span class="memo-pill ${r.acknowledged_at?'ack':''}">${r.acknowledged_at?'Acknowledged':'Pending'}</span></td>
      <td><strong>${esc(r.employee_name)}</strong><div>${esc(r.supervisor_name||"")}</div></td>
      <td>${esc(r.category_name)}</td><td>${esc(r.memo_title)}</td><td>${esc(r.created_by_employee_name)}</td>
      <td>${new Date(r.assigned_at||r.created_at).toLocaleString()}</td><td>${r.acknowledged_at?new Date(r.acknowledged_at).toLocaleString():'—'}</td>
      <td><button class="ghost" data-view-memo="${esc(r.assignment_id)}">View</button></td></tr>`).join("")||'<tr><td colspan="8">No memos match the selected filters.</td></tr>'}</tbody></table>`;
    host.querySelectorAll("[data-view-memo]").forEach(b=>b.addEventListener("click",()=>openMemoDetail(rows.find(r=>r.assignment_id===b.dataset.viewMemo))));
  }

  async function loadMemos(){
    if(!token()||!document.getElementById("management-memos-panel")) return;
    try{
      setMemoMessage("Loading memos...");
      const status=document.getElementById("memo-status")?.value||"PENDING";
      const supervisor=document.getElementById("memo-supervisor")?.value||null;
      const employee=document.getElementById("memo-employee")?.value||null;
      memoData=await rpc("get_management_memos",{p_session_token:token(),p_status:status,p_supervisor_id:supervisor,p_employee_id:employee});
      viewer=memoData?.viewer||viewer; populateSupervisorFilter(); populateEmployeeFilter(); renderMemos(); setMemoMessage("");
    }catch(e){setMemoMessage(e.message,"error");}
  }

  function openMemoDetail(row){
    if(!row) return;
    const d=document.createElement("div");d.className="memo-modal-backdrop";
    d.innerHTML=`<div class="memo-modal"><h2>${esc(row.memo_title)}</h2><div style="color:#64748b;margin-bottom:12px">${esc(row.category_name)} · ${esc(row.employee_name)} · ${new Date(row.assigned_at||row.created_at).toLocaleString()}</div><div style="white-space:pre-wrap">${esc(row.memo_body)}</div>${row.acknowledgment_comments?`<hr><strong>Employee acknowledgment comments</strong><div style="white-space:pre-wrap;margin-top:8px">${esc(row.acknowledgment_comments)}</div>`:""}<div class="memo-actions"><button class="ghost">Close</button></div></div>`;
    d.querySelector("button").onclick=()=>d.remove(); document.body.appendChild(d);
  }

  async function openCreateMemo(){
    const options=await rpc("get_memo_creation_options",{p_session_token:token()});
    const d=document.createElement("div");d.className="memo-modal-backdrop";
    d.innerHTML=`<div class="memo-modal"><h2>Create Memo</h2><form id="memo-create-form" class="memo-form">
      <label>Category<select id="memo-new-category" required><option value="">Select category</option>${(options.memo_categories||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.category_name)}</option>`).join("")}</select></label>
      <label>Subject<input id="memo-new-title" required></label>
      <label class="full">Employees<select id="memo-new-employees" multiple required>${(options.employees||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.employee_name)}${x.department?' · '+esc(x.department):''}</option>`).join("")}</select><div style="font-size:11px;color:#64748b;margin-top:5px">Ctrl/Cmd-click to select multiple employees.</div></label>
      <label class="full">Memo<textarea id="memo-new-body" rows="7" required></textarea></label>
      <div class="full memo-actions"><button type="button" class="ghost" id="memo-new-cancel">Cancel</button><button type="submit" class="primary">Submit Memo</button></div>
    </form></div>`;
    document.body.appendChild(d); d.querySelector("#memo-new-cancel").onclick=()=>d.remove();
    d.querySelector("#memo-create-form").onsubmit=async(e)=>{e.preventDefault();try{
      const employeeIds=[...d.querySelector("#memo-new-employees").selectedOptions].map(o=>o.value);
      if(!employeeIds.length) throw new Error("Select at least one employee.");
      await rpc("create_and_assign_memo",{p_session_token:token(),p_memo_category_id:d.querySelector("#memo-new-category").value,p_memo_title:d.querySelector("#memo-new-title").value.trim(),p_memo_body:d.querySelector("#memo-new-body").value.trim(),p_assigned_employee_ids:employeeIds});
      d.remove(); setMemoMessage("Memo submitted."); await loadMemos();
    }catch(err){alert(err.message);}};
  }

  function showError(e){setMemoMessage(e.message||String(e),"error");}

  async function prepareOperations(){
    if(preparing) return; preparing=true;
    try{
      ensureHub();
      const attendanceNav=document.querySelector('button[data-view="attendance"]');
      const auditNav=document.querySelector('button[data-view="audit"]');
      const overviewNav=document.querySelector('button[data-view="overview"]');
      if(attendanceNav) attendanceNav.style.display="none";
      if(auditNav) auditNav.style.display="none";
      // Prime existing attendance/audit loaders once, then restore the Operations view.
      if(attendanceNav && auditNav && overviewNav){
        attendanceNav.click(); auditNav.click(); overviewNav.click();
      }
      await new Promise(r=>setTimeout(r,120));
      moveExistingSections(); showHubTab(activeTab); await loadMemos();
    } finally { preparing=false; }
  }

  function init(){
    const overviewNav=document.querySelector('button[data-view="overview"]');
    if(!overviewNav) return;
    const attendanceNav=document.querySelector('button[data-view="attendance"]'); if(attendanceNav) attendanceNav.style.display="none";
    const auditNav=document.querySelector('button[data-view="audit"]'); if(auditNav) auditNav.style.display="none";
    overviewNav.addEventListener("click",()=>setTimeout(()=>prepareOperations().catch(showError),0));
    // Master-data script also builds on the same click; a second pass places it under Employees & Setup.
    overviewNav.addEventListener("click",()=>setTimeout(moveExistingSections,300));
  }

  init();
})();
