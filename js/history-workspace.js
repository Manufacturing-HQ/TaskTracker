"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $=(id)=>document.getElementById(id);
  const sessionKey=config.sessionStorageKey;
  let sessionToken=sessionStorage.getItem(sessionKey);
  let sessionEmployee=null;
  let setup=null;
  let activeView="EMPLOYEE";
  let employeeOffset=0;
  let qaOffset=0;
  const pageSize=50;

  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const min=(v)=>v===null||v===undefined?"—":`${Number(v).toFixed(2)} min`;
  const pct=(v)=>v===null||v===undefined?"—":`${Number(v).toFixed(2)}%`;
  const fmtDate=(v)=>v?new Date(`${v}T00:00:00`).toLocaleDateString():"—";
  const todayIso=()=>new Date().toISOString().slice(0,10);

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}
  function msg(text,type="info"){const el=$("message");el.textContent=text||"";el.dataset.type=type;el.hidden=!text;}

  async function listEmployees(){
    const rows=await rpc("list_login_employees");
    $("employee").innerHTML='<option value="">Select employee</option>'+ (rows||[]).map(r=>`<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
  }
  async function restore(){
    if(!sessionToken)return false;
    try{const rows=await rpc("get_employee_session_context",{p_session_token:sessionToken});sessionEmployee=Array.isArray(rows)?rows[0]:rows;return !!sessionEmployee;}
    catch{sessionStorage.removeItem(sessionKey);sessionToken=null;return false;}
  }
  async function login(e){
    e.preventDefault();msg("Signing in...");
    const rows=await rpc("login_with_employee_pin",{p_employee_id:$("employee").value,p_pin:$("pin").value});
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row?.login_successful||!row.session_token){msg(row?.login_message||"Login failed.","error");return;}
    sessionToken=row.session_token;sessionStorage.setItem(sessionKey,sessionToken);sessionEmployee=row;$("pin").value="";await enter();
  }
  async function logout(){
    const token=sessionToken;sessionStorage.removeItem(sessionKey);sessionToken=null;sessionEmployee=null;
    if(token){try{await rpc("logout_employee_session",{p_session_token:token});}catch{}}
    $("app").hidden=true;$("login").hidden=false;msg("Signed out.");
  }

  async function enter(){
    setup=await rpc("get_history_workspace_options",{p_session_token:sessionToken});
    $("login").hidden=true;$("app").hidden=false;msg("");
    $("user-name").textContent=setup.viewer?.employee_name||sessionEmployee?.employee_name||"Employee";
    $("user-meta").textContent=[setup.viewer?.role,setup.viewer?.department].filter(Boolean).join(" · ");
    fillOptions();
    activeView=setup.viewer?.default_view||"EMPLOYEE";
    configureViewButtons();
    setDates();
    await showView(activeView,true);
  }

  function fillOptions(){
    const employeeOptions=setup.employee_options||[];
    const builderOptions=setup.builder_options||[];
    const qaOptions=setup.qa_rep_options||[];
    $("employee-filter").innerHTML=employeeOptions.map(r=>`<option value="${esc(r.employee_id)}">${esc([r.employee_name,r.department].filter(Boolean).join(" · "))}</option>`).join("");
    if(!setup.viewer?.is_management && setup.viewer?.employee_id) $("employee-filter").value=setup.viewer.employee_id;
    $("builder-filter").innerHTML='<option value="">All Builders</option>'+builderOptions.map(r=>`<option value="${esc(r.employee_id)}">${esc([r.employee_name,r.department].filter(Boolean).join(" · "))}</option>`).join("");
    $("qa-filter").innerHTML='<option value="">All QA Employees</option>'+qaOptions.map(r=>`<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
    $("employee-filter-wrap").hidden=!setup.viewer?.is_management;
    $("builder-filter-wrap").hidden=!setup.viewer?.is_management;
    $("qa-filter-wrap").hidden=!setup.viewer?.is_management;
  }

  function configureViewButtons(){
    const management=!!setup.viewer?.is_management;
    const hasQa=!!setup.viewer?.has_qa_history;
    $("view-switch").hidden=!(management||hasQa);
    $("qa-view-btn").hidden=!hasQa;
    if(!management && !hasQa) $("employee-view-btn").hidden=true;
  }

  function setDates(){
    const end=todayIso();const start=new Date();start.setDate(start.getDate()-30);const s=start.toISOString().slice(0,10);
    ["employee-start","qa-start"].forEach(id=>$(id).value=s);
    ["employee-end","qa-end"].forEach(id=>$(id).value=end);
  }

  async function showView(view,reset=false){
    activeView=view;
    $("employee-view-btn").classList.toggle("active",view==="EMPLOYEE");
    $("qa-view-btn").classList.toggle("active",view==="QA");
    $("employee-history-view").hidden=view!=="EMPLOYEE";
    $("qa-history-view").hidden=view!=="QA";
    $("page-subtitle").textContent=view==="EMPLOYEE"?"Employee jobs, sessions, stops, duration, and time between tasks.":"Completed QA inspections, findings, status, and comments.";
    if(reset){employeeOffset=0;qaOffset=0;}
    if(view==="EMPLOYEE") await loadEmployee(); else await loadQa();
  }

  function renderEmployee(data){
    const sum=data?.summary||{};
    $("emp-productivity").textContent=pct(sum.productivity_percent);
    $("emp-efficiency").textContent=pct(sum.efficiency_percent);
    $("emp-error").textContent=pct(sum.error_rate_percent);
    const jobs=data?.jobs||[];
    const list=$("employee-list");
    if(!jobs.length){list.innerHTML='<div class="empty">No employee history found for this date range.</div>';}
    else list.innerHTML=jobs.map(job=>{
      const label=job.task_type==="Productive"?(job.work_order_number||job.item_name||"Productive"):(job.non_productive_task||job.task_type||"Task");
      const sessions=(job.sessions||[]).map(s=>{
        const gap=Number(s.time_between_tasks_minutes);const hasGap=Number.isFinite(gap)&&gap>0;
        const cls=hasGap?(s.gap_type==="WITHIN_JOB"?"gap-within":"gap-between"):"";
        const gl=hasGap?`<span class="gap-label">${s.gap_type==="WITHIN_JOB"?"Within same job":"Between jobs"}</span>`:"";
        return `<tr><td>${fmtDate(s.business_date)}</td><td>${esc(s.start_time||"—")}</td><td>${esc(s.stop_time||"—")}</td><td>${esc(s.stop_reason||"—")}</td><td>${min(s.duration_minutes)}</td><td class="${cls}">${hasGap?min(gap):"—"}${gl}</td><td>${esc(s.comments||"—")}</td></tr>`;
      }).join("");
      return `<details class="history-card"><summary class="history-summary"><div><strong>${fmtDate(job.first_date)}</strong><small>${esc(job.task_type||"")}</small></div><div><strong>${esc(label)}</strong><small>${esc([job.item_name,job.job_type,job.job_status].filter(Boolean).join(" · "))}</small></div><div><strong>${min(job.actual_minutes)}</strong><small>Tracked Duration</small></div><div><strong>${min(job.within_job_gap_minutes)}</strong><small>Within-Job Gap</small></div><div><strong>${min(job.between_job_gap_minutes)}</strong><small>Next-Task Gap</small></div></summary><div class="history-detail"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Start Time</th><th>Stop Time</th><th>Stop Reason</th><th>Duration</th><th>Time Between Tasks</th><th>Comments</th></tr></thead><tbody>${sessions}</tbody></table></div></div></details>`;
    }).join("");
    renderPager("employee",data.total_count||0,employeeOffset);
  }

  async function loadEmployee(){
    const employeeId=setup.viewer?.is_management?$("employee-filter").value:setup.viewer?.employee_id;
    if(!employeeId){$("employee-list").innerHTML='<div class="empty">Select an employee.</div>';return;}
    $("employee-list").innerHTML='<div class="empty">Loading history...</div>';
    try{renderEmployee(await rpc("get_employee_history_timeline_page",{p_session_token:sessionToken,p_employee_id:employeeId,p_start_date:$("employee-start").value,p_end_date:$("employee-end").value,p_page_size:pageSize,p_page_offset:employeeOffset}));}
    catch(e){$("employee-list").innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}
  }

  function renderQa(data){
    const rows=data?.records||[];
    const body=rows.map(r=>`<tr><td>${fmtDate(r.review_date)}</td><td>${esc(r.builder_name||"—")}</td><td><strong>${esc(r.item_name||"—")}</strong><div class="subtle">WO ${esc(r.work_order_number||"—")}</div></td><td>${esc(r.job_type||"—")}</td><td>${esc(r.quantity_reviewed??0)}</td><td>${esc(r.qa_rep||"—")}</td><td><strong>${esc(r.quality_status||"—")}</strong></td><td><div class="error-pills">${(r.errors||[]).map(e=>`<span>${esc(e.error_name)} × ${esc(e.quantity)}</span>`).join("")||"—"}</div></td><td>${esc(r.qa_comments||"—")}</td></tr>`).join("");
    $("qa-table").innerHTML=`<div class="table-wrap"><table class="qa-table"><thead><tr><th>Date</th><th>Builder</th><th>Item / WO</th><th>Job Type</th><th>Quantity</th><th>QA Rep</th><th>Quality Status</th><th>Errors</th><th>QA Comments</th></tr></thead><tbody>${body||'<tr><td colspan="9" class="empty">No QA history found for this date range.</td></tr>'}</tbody></table></div>`;
    renderPager("qa",data.total_count||0,qaOffset);
  }

  async function loadQa(){
    $("qa-table").innerHTML='<div class="empty">Loading QA history...</div>';
    try{renderQa(await rpc("get_qa_history_page",{p_session_token:sessionToken,p_start_date:$("qa-start").value,p_end_date:$("qa-end").value,p_builder_employee_id:setup.viewer?.is_management?($("builder-filter").value||null):null,p_qa_employee_id:setup.viewer?.is_management?($("qa-filter").value||null):null,p_page_size:pageSize,p_page_offset:qaOffset}));}
    catch(e){$("qa-table").innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}
  }

  function renderPager(prefix,total,offset){
    const from=total?offset+1:0;const to=Math.min(offset+pageSize,total);
    $(`${prefix}-page-info`).textContent=`Showing ${from}–${to} of ${total}`;
    $(`${prefix}-prev`).disabled=offset<=0;
    $(`${prefix}-next`).disabled=offset+pageSize>=total;
  }

  $("login-form").addEventListener("submit",e=>login(e).catch(x=>msg(x.message,"error")));
  $("sign-out").addEventListener("click",()=>logout().catch(()=>{}));
  $("employee-view-btn").addEventListener("click",()=>showView("EMPLOYEE",true));
  $("qa-view-btn").addEventListener("click",()=>showView("QA",true));
  $("employee-load").addEventListener("click",()=>{employeeOffset=0;loadEmployee();});
  $("qa-load").addEventListener("click",()=>{qaOffset=0;loadQa();});
  $("employee-prev").addEventListener("click",()=>{employeeOffset=Math.max(0,employeeOffset-pageSize);loadEmployee();});
  $("employee-next").addEventListener("click",()=>{employeeOffset+=pageSize;loadEmployee();});
  $("qa-prev").addEventListener("click",()=>{qaOffset=Math.max(0,qaOffset-pageSize);loadQa();});
  $("qa-next").addEventListener("click",()=>{qaOffset+=pageSize;loadQa();});

  async function init(){try{await listEmployees();if(await restore())await enter();}catch(e){msg(e.message,"error");}}
  init();
})();
