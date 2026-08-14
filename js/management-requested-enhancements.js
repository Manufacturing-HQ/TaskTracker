"use strict";

(() => {
  const config=window.TaskTrackerConfig, supabaseLib=window.supabase;
  if(!config||!supabaseLib) return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const pct=v=>v===null||v===undefined?"—":`${Number(v).toFixed(1)}%`;
  const minutes=v=>{const n=Number(v||0);if(!n)return"—";if(n<60)return`${Math.round(n)} min`;const h=Math.floor(n/60),m=Math.round(n%60);return`${h}h ${m}m`;};
  let setup=null, role="", itemPage=0, itemPageSize=50, itemSort="item_name", itemDir="asc", employeeSort="employee_name", employeeDir="asc";
  let attendanceMap=new Map(), auditMap=new Map();
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}
  const style=document.createElement("style");
  style.textContent=`
    .req-filterbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0 14px}.req-filterbar .field{margin:0}.req-filterbar select{min-height:40px;min-width:150px;border:1px solid #94a3b8;border-radius:9px;padding:0 8px;background:#fff}
    .req-overdue td{background:#fee2e2!important}.req-sort{cursor:pointer;user-select:none}.req-sort:hover{text-decoration:underline}.req-pager{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}.req-pager .left,.req-pager .right{display:flex;align-items:center;gap:8px}.req-pager select{min-height:36px;border:1px solid #94a3b8;border-radius:8px;background:#fff}.req-muted{font-size:11px;color:#64748b}
  `;
  document.head.appendChild(style);

  function downloadCsv(filename,rows){
    if(!rows.length) return;
    const headers=Object.keys(rows[0]);
    const q=v=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};
    const csv=[headers.map(q).join(","),...rows.map(r=>headers.map(h=>q(r[h])).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
  }

  async function initSetup(){
    const t=token(); if(!t) return false;
    try{setup=await rpc("get_operations_master_options",{p_session_token:t});role=setup?.viewer?.role||"";installLive();installAuditFilters();installMasterControls();return true;}catch{return false;}
  }

  function supervisorOptions(){return '<option value="">All Supervisors</option>'+((setup?.supervisors||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.employee_name)}</option>`).join(""));}

  function installLive(){
    if(!["Manager","Administrator"].includes(role)) return;
    const perfPanel=document.querySelector("#view-home .panel"); if(!perfPanel||document.getElementById("req-live-supervisor")) return;
    const bar=document.createElement("div");bar.className="req-filterbar";bar.innerHTML=`<div class="field"><label>Supervisor</label><select id="req-live-supervisor">${supervisorOptions()}</select></div>`;
    perfPanel.insertBefore(bar,perfPanel.firstChild.nextSibling);
    document.getElementById("req-live-supervisor").addEventListener("change",loadLiveFiltered);
    document.getElementById("performance-period")?.addEventListener("change",()=>setTimeout(loadLiveFiltered,60));
    document.getElementById("refresh-status")?.addEventListener("click",()=>setTimeout(loadLiveFiltered,60));
    loadLiveFiltered();
  }

  async function loadLiveFiltered(){
    if(!token()) return;
    try{
      const data=await rpc("get_live_status_dashboard_filtered",{p_session_token:token(),p_period:document.getElementById("performance-period")?.value||"WEEK",p_supervisor_id:document.getElementById("req-live-supervisor")?.value||null});
      const p=data?.performance||{};document.getElementById("perf-productivity").textContent=pct(p.productivity_percent);document.getElementById("perf-efficiency").textContent=pct(p.efficiency_percent);document.getElementById("perf-error").textContent=pct(p.error_rate_percent);
      const body=document.getElementById("status-body");if(!body)return;body.innerHTML="";
      (data?.employees||[]).forEach(e=>{const task=e.has_active_task?[e.task_type,e.work_order_number,e.item_name||e.non_productive_task,e.job_type].filter(Boolean).join(" · "):"—";const tr=document.createElement("tr");const overdue=e.has_active_task&&e.task_type==="Productive"&&Number(e.expected_minutes)>0&&Number(e.minutes_on_task)>Number(e.expected_minutes);if(overdue)tr.className="req-overdue";tr.innerHTML=`<td><strong>${esc(e.employee_name)}</strong><div class="req-muted">${esc(e.department||"")}</div></td><td><span class="status-pill ${e.has_active_task?"":"status-idle"}">${esc(e.status||"No Active Task")}</span></td><td>${esc(task)}</td><td>${e.has_active_task?esc(minutes(e.minutes_on_task)):"—"}${overdue?`<div class="req-muted"><strong>Expected ${esc(minutes(e.expected_minutes))}</strong></div>`:""}</td><td>${esc(e.total_stops||0)}</td><td>${esc(e.supervisor_name||"—")}</td>`;body.appendChild(tr);});
      if(!body.children.length)body.innerHTML='<tr><td colspan="6">No employees are available for this filter.</td></tr>';
    }catch(e){console.warn("Filtered live status skipped:",e.message);}
  }

  function installAuditFilters(){
    if(!["Manager","Administrator"].includes(role)) return;
    if(!document.getElementById("req-att-supervisor")){
      const title=document.querySelector("#view-attendance .section-title");if(title){const d=document.createElement("div");d.className="field";d.style.margin="0";d.innerHTML=`<label>Supervisor</label><select id="req-att-supervisor">${supervisorOptions()}</select>`;title.appendChild(d);d.querySelector("select").addEventListener("change",applyAttendanceFilter);}
      const body=document.getElementById("attendance-body");if(body)new MutationObserver(()=>refreshAttendanceMap()).observe(body,{childList:true});document.getElementById("attendance-date")?.addEventListener("change",()=>setTimeout(refreshAttendanceMap,80));
    }
    if(!document.getElementById("req-audit-supervisor")){
      const tb=document.querySelector("#view-audit .toolbar");if(tb){const d=document.createElement("div");d.className="field";d.innerHTML=`<label>Supervisor</label><select id="req-audit-supervisor">${supervisorOptions()}</select>`;tb.insertBefore(d,tb.firstChild);d.querySelector("select").addEventListener("change",applyAuditFilter);}
      const select=document.getElementById("audit-employee");if(select)new MutationObserver(()=>refreshAuditMap()).observe(select,{childList:true});document.getElementById("audit-date")?.addEventListener("change",()=>setTimeout(refreshAuditMap,80));
    }
    refreshAttendanceMap();refreshAuditMap();
  }
  async function refreshAttendanceMap(){try{const d=await rpc("get_attendance_audit",{p_session_token:token(),p_business_date:document.getElementById("attendance-date")?.value||null});attendanceMap=new Map((d?.employees||[]).map(e=>[e.employee_name,e.supervisor_id||""]));applyAttendanceFilter();}catch{}}
  function applyAttendanceFilter(){const sup=document.getElementById("req-att-supervisor")?.value||"";document.querySelectorAll("#attendance-body tr").forEach(tr=>{const name=tr.querySelector("td")?.innerText.trim()||"";tr.hidden=!!sup&&attendanceMap.get(name)!==sup;});}
  async function refreshAuditMap(){try{const d=await rpc("get_task_tracker_audit_setup",{p_session_token:token(),p_business_date:document.getElementById("audit-date")?.value||null});auditMap=new Map((d?.employees||[]).map(e=>[e.employee_id,e.supervisor_id||""]));applyAuditFilter();}catch{}}
  function applyAuditFilter(){const sel=document.getElementById("audit-employee"),sup=document.getElementById("req-audit-supervisor")?.value||"";if(!sel)return;[...sel.options].forEach(o=>{if(!o.value)return;o.hidden=!!sup&&auditMap.get(o.value)!==sup;});if(sel.value&&sel.selectedOptions[0]?.hidden){sel.value="";sel.dispatchEvent(new Event("change",{bubbles:true}));}}

  function replaceWithClone(id,event,handler){const old=document.getElementById(id);if(!old||old.dataset.reqOwned)return old;const c=old.cloneNode(true);c.dataset.reqOwned="1";old.replaceWith(c);c.addEventListener(event,handler);return c;}
  function installMasterControls(){
    const host=document.getElementById("ops-master");if(!host){setTimeout(installMasterControls,250);return;}
    const empTb=document.querySelector("#ops-employees .ops-toolbar"),itemTb=document.querySelector("#ops-items .ops-toolbar");if(!empTb||!itemTb)return;
    if(!document.getElementById("req-employee-export")){
      replaceWithClone("ops-employee-search","input",()=>loadEmployeesEnhanced());replaceWithClone("ops-employee-inactive","change",()=>loadEmployeesEnhanced());replaceWithClone("ops-employee-refresh","click",()=>loadEmployeesEnhanced());
      if(["Manager","Administrator"].includes(role)){
        const sup=document.createElement("select");sup.id="req-employee-supervisor";sup.innerHTML=supervisorOptions();const dept=document.createElement("select");dept.id="req-employee-dept";dept.innerHTML='<option value="">All Departments</option>'+((setup?.departments||[]).map(x=>`<option>${esc(x)}</option>`).join(""));const r=document.createElement("select");r.id="req-employee-role";r.innerHTML='<option value="">All Roles</option>'+((setup?.roles||[]).map(x=>`<option>${esc(x)}</option>`).join(""));[sup,dept,r].forEach(s=>{s.addEventListener("change",loadEmployeesEnhanced);empTb.insertBefore(s,document.getElementById("ops-employee-refresh"));});
      }
      const exp=document.createElement("button");exp.id="req-employee-export";exp.className="ghost";exp.type="button";exp.textContent="Export CSV";exp.onclick=exportEmployees;empTb.appendChild(exp);
    }
    if(!document.getElementById("req-item-export")){
      replaceWithClone("ops-item-search","input",()=>{itemPage=0;loadItemsEnhanced();});replaceWithClone("ops-item-inactive","change",()=>{itemPage=0;loadItemsEnhanced();});replaceWithClone("ops-item-refresh","click",()=>loadItemsEnhanced());
      const make=document.createElement("select");make.id="req-item-make";make.innerHTML='<option value="">All Makes</option>';const dept=document.createElement("select");dept.id="req-item-dept";dept.innerHTML='<option value="">All Departments</option>';[make,dept].forEach(s=>{s.addEventListener("change",()=>{itemPage=0;loadItemsEnhanced();});itemTb.insertBefore(s,document.getElementById("ops-item-refresh"));});
      const exp=document.createElement("button");exp.id="req-item-export";exp.className="ghost";exp.type="button";exp.textContent="Export CSV";exp.onclick=exportItems;itemTb.appendChild(exp);
    }
    loadEmployeesEnhanced();loadItemsEnhanced();
  }

  async function loadEmployeesEnhanced(){
    if(!document.getElementById("ops-employees-table"))return;try{const d=await rpc("search_operations_employees_v2",{p_session_token:token(),p_search_text:document.getElementById("ops-employee-search")?.value||null,p_include_inactive:document.getElementById("ops-employee-inactive")?.checked??true,p_supervisor_id:document.getElementById("req-employee-supervisor")?.value||null,p_department:document.getElementById("req-employee-dept")?.value||null,p_role:document.getElementById("req-employee-role")?.value||null,p_sort_by:employeeSort,p_sort_direction:employeeDir,p_result_limit:5000,p_result_offset:0});renderEmployees(d?.records||[]);}catch(e){console.warn(e.message);}}
  function sortHead(label,key){const arrow=employeeSort===key?(employeeDir==="asc"?" ▲":" ▼"):"";return`<th class="req-sort" data-emp-sort="${key}">${label}${arrow}</th>`;}
  function renderEmployees(rows){const canEdit=!!setup?.viewer?.can_edit;const html=rows.map(r=>`<tr><td><strong>${esc(r.employee_name)}</strong>${r.is_probationary?' <span class="ops-badge probation">Probationary</span>':""}</td><td>${esc(r.department||"—")}</td><td>${esc(r.role)}</td><td>${esc(r.supervisor_name||"—")}</td><td>${esc(r.hire_date||"—")}</td><td>${esc(r.probation_end_date||"—")}</td><td>${r.is_active?"Active":"Inactive"}</td><td>${canEdit?'Use existing Edit control after Refresh':"—"}</td></tr>`).join("");const host=document.getElementById("ops-employees-table");host.innerHTML=`<table class="ops-table"><thead><tr>${sortHead("Employee","employee_name")}${sortHead("Department","department")}${sortHead("Role","role")}${sortHead("Supervisor","supervisor_name")}${sortHead("Hire Date","hire_date")}${sortHead("Probation Ends","probation_end_date")}${sortHead("Status","is_active")}<th>Action</th></tr></thead><tbody>${html||'<tr><td colspan="8" class="ops-empty">No employees found.</td></tr>'}</tbody></table>`;host.querySelectorAll("[data-emp-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.empSort;if(employeeSort===k)employeeDir=employeeDir==="asc"?"desc":"asc";else{employeeSort=k;employeeDir="asc";}loadEmployeesEnhanced();});}
  async function exportEmployees(){const d=await rpc("search_operations_employees_v2",{p_session_token:token(),p_search_text:document.getElementById("ops-employee-search")?.value||null,p_include_inactive:document.getElementById("ops-employee-inactive")?.checked??true,p_supervisor_id:document.getElementById("req-employee-supervisor")?.value||null,p_department:document.getElementById("req-employee-dept")?.value||null,p_role:document.getElementById("req-employee-role")?.value||null,p_sort_by:employeeSort,p_sort_direction:employeeDir,p_result_limit:10000,p_result_offset:0});downloadCsv("employees-filtered.csv",(d?.records||[]).map(r=>({id:r.id,employee_name:r.employee_name,department:r.department,role:r.role,supervisor_id:r.supervisor_id,supervisor_name:r.supervisor_name,is_active:r.is_active,display_order:r.display_order,hire_date:r.hire_date,probation_end_date:r.probation_end_date,is_probationary:r.is_probationary,created_at:r.created_at,updated_at:r.updated_at})));}

  async function loadItemsEnhanced(){
    const host=document.getElementById("ops-items-table");if(!host)return;try{const d=await rpc("search_operations_items_v2",{p_session_token:token(),p_search_text:document.getElementById("ops-item-search")?.value||null,p_include_inactive:document.getElementById("ops-item-inactive")?.checked??true,p_make:document.getElementById("req-item-make")?.value||null,p_department:document.getElementById("req-item-dept")?.value||null,p_sort_by:itemSort,p_sort_direction:itemDir,p_result_limit:itemPageSize,p_result_offset:itemPage*itemPageSize});const f=d?.filter_options||{};const make=document.getElementById("req-item-make"),dept=document.getElementById("req-item-dept");if(make&&make.options.length<=1){make.innerHTML='<option value="">All Makes</option>'+((f.makes||[]).map(x=>`<option>${esc(x)}</option>`).join(""));}if(dept&&dept.options.length<=1){dept.innerHTML='<option value="">All Departments</option>'+((f.departments||[]).map(x=>`<option>${esc(x)}</option>`).join(""));}renderItems(d?.records||[],Number(d?.total_count||0));}catch(e){host.innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}}
  function itemHead(label,key){const arrow=itemSort===key?(itemDir==="asc"?" ▲":" ▼"):"";return`<th class="req-sort" data-item-sort="${key}">${label}${arrow}</th>`;}
  function renderItems(rows,total){const canEdit=!!setup?.viewer?.can_edit;const html=rows.map(r=>`<tr><td><strong>${esc(r.item_name)}</strong></td><td>${esc(r.internal_id)}</td><td>${esc(r.make||"—")}</td><td>${esc(r.work_order_department||"—")}</td><td>${esc(r.build_type||"—")}</td><td>${esc(r.operation_code||"—")}</td><td>${esc(r.item_cycle_time_minutes??"—")}</td><td>${r.is_placeholder?'<span class="ops-badge">Placeholder</span>':(r.is_active?"Active":"Inactive")}</td><td>${canEdit?'Use existing Edit control after Refresh':"—"}</td></tr>`).join("");const host=document.getElementById("ops-items-table");host.innerHTML=`<table class="ops-table"><thead><tr>${itemHead("Item","item_name")}<th>Internal ID</th>${itemHead("Make","make")}${itemHead("WO Department","work_order_department")}${itemHead("Build Type","build_type")}<th>Operation</th><th>Cycle Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${html||'<tr><td colspan="9" class="ops-empty">No items found.</td></tr>'}</tbody></table><div class="req-pager"><div class="left"><span>Rows per page</span><select id="req-item-pagesize"><option>25</option><option selected>50</option><option>100</option></select><span class="req-muted">Showing ${total?itemPage*itemPageSize+1:0}–${Math.min((itemPage+1)*itemPageSize,total)} of ${total}</span></div><div class="right"><button class="ghost" id="req-item-prev" ${itemPage<=0?"disabled":""}>Previous</button><button class="ghost" id="req-item-next" ${(itemPage+1)*itemPageSize>=total?"disabled":""}>Next</button></div></div>`;host.querySelectorAll("[data-item-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.itemSort;if(itemSort===k)itemDir=itemDir==="asc"?"desc":"asc";else{itemSort=k;itemDir="asc";}itemPage=0;loadItemsEnhanced();});host.querySelector("#req-item-pagesize").value=String(itemPageSize);host.querySelector("#req-item-pagesize").onchange=e=>{itemPageSize=Number(e.target.value);itemPage=0;loadItemsEnhanced();};host.querySelector("#req-item-prev").onclick=()=>{if(itemPage>0){itemPage--;loadItemsEnhanced();}};host.querySelector("#req-item-next").onclick=()=>{if((itemPage+1)*itemPageSize<total){itemPage++;loadItemsEnhanced();}};}
  async function exportItems(){const d=await rpc("search_operations_items_v2",{p_session_token:token(),p_search_text:document.getElementById("ops-item-search")?.value||null,p_include_inactive:document.getElementById("ops-item-inactive")?.checked??true,p_make:document.getElementById("req-item-make")?.value||null,p_department:document.getElementById("req-item-dept")?.value||null,p_sort_by:itemSort,p_sort_direction:itemDir,p_result_limit:10000,p_result_offset:0});downloadCsv("items-filtered.csv",(d?.records||[]).map(r=>({id:r.id,item_name:r.item_name,internal_id:r.internal_id,sku_group:r.sku_group,work_order_department:r.work_order_department,make:r.make,item_cycle_time_minutes:r.item_cycle_time_minutes,build_type:r.build_type,operation_code:r.operation_code,is_active:r.is_active,is_placeholder:r.is_placeholder,updated_at:r.updated_at})));}

  const app=document.getElementById("app");if(app)new MutationObserver(()=>{if(!app.hidden)setTimeout(initSetup,100);}).observe(app,{attributes:true,attributeFilter:["hidden"]});
  window.addEventListener("pageshow",()=>setTimeout(initSetup,500));setTimeout(initSetup,900);
})();
