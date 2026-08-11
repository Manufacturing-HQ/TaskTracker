"use strict";
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;

  function setMessage(message, type="info") {
    const el=$("message");
    if (!el) return;
    el.textContent=message||"";
    el.dataset.type=type;
    el.hidden=!message;
  }

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }

  function pct(v){
    return v===null||v===undefined||Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`;
  }

  function escapeHtml(v){
    return String(v??"").replace(/[&<>'\"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  }

  function ensureTaskFrame(){
    const f=$("task-frame");
    if(f && !f.getAttribute("src")) f.setAttribute("src", f.dataset.src || "task.html");
  }

  async function listEmployees(){
    const rows=await rpc("list_login_employees");
    const s=$("employee");
    if (!s) return;
    s.innerHTML='<option value="">Select employee</option>';
    (rows||[]).forEach(r=>{
      const o=document.createElement("option");
      o.value=r.employee_id;
      o.textContent=r.employee_name;
      s.appendChild(o);
    });
  }

  async function restoreSession(){
    if(!sessionToken) return false;
    try{
      const rows=await rpc("get_employee_session_context",{p_session_token:sessionToken});
      const row=Array.isArray(rows)?rows[0]:rows;
      if(!row) return false;
      sessionEmployee=row;
      return true;
    }catch{
      sessionStorage.removeItem(sessionKey);
      sessionToken=null;
      return false;
    }
  }

  async function login(e){
    e.preventDefault();
    setMessage("Signing in...");
    const rows=await rpc("login_with_employee_pin",{
      p_employee_id:$("employee").value,
      p_pin:$("pin").value
    });
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row?.login_successful||!row.session_token){
      setMessage(row?.login_message||"Login failed.","error");
      return;
    }
    sessionToken=row.session_token;
    sessionStorage.setItem(sessionKey,sessionToken);
    sessionEmployee=row;
    $("pin").value="";
    await enterApp();
  }

  async function logout(){
    const token=sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken=null;
    sessionEmployee=null;
    const frame=$("task-frame");
    if(frame) frame.removeAttribute("src");
    if(token){
      try{await rpc("logout_employee_session",{p_session_token:token});}catch{}
    }
    $("app").hidden=true;
    $("login").hidden=false;
    setMessage("Signed out.");
  }

  function showView(name){
    const meta={
      task:["Start / Current Task","Your active task or the next task to start."],
      dashboard:["Dashboard","Performance, attendance, memos, and active corrective actions."],
      memos:["Memos","Pending and acknowledged employee communications."]
    };
    if(!meta[name]) return;
    document.querySelectorAll(".nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    ["task","dashboard","memos"].forEach(v=>{
      const section=$("view-"+v);
      if(section) section.hidden=v!==name;
    });
    $("page-title").textContent=meta[name][0];
    $("page-subtitle").textContent=meta[name][1];
    if(name==="task") ensureTaskFrame();
    if(name==="dashboard") loadDashboard().catch(showError);
    if(name==="memos") loadMemos(false).catch(showError);
  }

  function showError(e){ alert(e.message||String(e)); }

  async function enterApp(){
    const role=sessionEmployee?.employee_role||sessionEmployee?.role||"Employee";
    if(role!=="Employee"){
      const frame=$("task-frame");
      if(frame) frame.removeAttribute("src");
      sessionStorage.removeItem(sessionKey);
      sessionToken=null;
      sessionEmployee=null;
      $("app").hidden=true;
      $("login").hidden=false;
      setMessage("This workspace is for Employee accounts. Please sign in with an Employee account.","error");
      return;
    }
    const name=sessionEmployee?.employee_name||sessionEmployee?.name||"Employee";
    const dept=sessionEmployee?.department||"";
    $("login").hidden=true;
    $("app").hidden=false;
    $("side-name").textContent=name;
    $("side-meta").textContent=[role,dept].filter(Boolean).join(" · ");
    setMessage("");
    ensureTaskFrame();
    showView("task");
  }

  async function loadDashboard(){
    const period=$("performance-period").value;
    const d=await rpc("get_my_employee_dashboard",{p_session_token:sessionToken,p_period:period});
    const p=d?.performance||{};
    $("metric-productivity").textContent=pct(p.productivity_percent);
    $("metric-efficiency").textContent=pct(p.efficiency_percent);
    $("metric-error").textContent=pct(p.error_rate_percent);
    const a=d?.attendance_summary||{};
    $("att-absence").textContent=a.unplanned_absence_or_left_early??0;
    $("att-tardy").textContent=a.tardies??0;
    $("att-ncns").textContent=a.no_call_no_show??0;
    renderCorrective(d?.active_corrective_actions||[]);
    renderDashboardMemos(d?.pending_memos||[]);
  }

  function renderCorrective(rows){
    const c=$("corrective-actions");
    if(!rows.length){
      c.innerHTML='<div class="empty">No active coaching or corrective actions.</div>';
      return;
    }
    c.innerHTML=rows.map(r=>`<div class="tile"><strong>${escapeHtml(r.category)} · ${escapeHtml(r.reason)}</strong><small>Incident: ${escapeHtml(r.incident_date||"")} · Roll off: ${escapeHtml(r.roll_off_display||"")}</small><div class="details" style="margin-top:8px">${escapeHtml(r.description||"")}</div></div>`).join("");
  }

  function renderDashboardMemos(rows){
    const c=$("dashboard-memos");
    if(!rows.length){
      c.innerHTML='<div class="empty">No pending memos.</div>';
      return;
    }
    c.innerHTML=rows.slice(0,5).map(m=>`<div class="tile"><strong>${escapeHtml(m.memo_title||m.category_name||"Memo")}</strong><small>${escapeHtml(m.category_name||"")} · ${new Date(m.assigned_at||m.created_at).toLocaleDateString()}</small></div>`).join("");
  }

  async function loadMemos(include){
    const rows=await rpc("get_my_memos",{p_session_token:sessionToken,p_include_acknowledged:include});
    const c=$("memo-list");
    if(!rows?.length){
      c.innerHTML='<div class="empty">No memos found.</div>';
      return;
    }
    c.innerHTML=rows.map(m=>`<article class="memo-card"><span class="status-pill">${m.acknowledged_at?"Acknowledged":"Pending"}</span><h3>${escapeHtml(m.memo_title||m.category_name||"Memo")}</h3><div class="details">${escapeHtml(m.category_name||"")} · ${new Date(m.assigned_at||m.created_at).toLocaleString()}</div><p>${escapeHtml(m.memo_body||"")}</p>${m.acknowledgment_comments?`<div class="details"><strong>Your comments:</strong> ${escapeHtml(m.acknowledgment_comments)}</div>`:""}</article>`).join("");
  }

  async function init(){
    try{
      await listEmployees();
      if(await restoreSession()) await enterApp();
    }catch(e){
      setMessage(e.message,"error");
    }
  }

  $("login-form")?.addEventListener("submit",e=>login(e).catch(x=>setMessage(x.message,"error")));
  $("sign-out")?.addEventListener("click",()=>logout().catch(()=>{}));
  document.querySelectorAll(".nav button[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  $("performance-period")?.addEventListener("change",()=>loadDashboard().catch(showError));
  $("memos-pending")?.addEventListener("click",()=>loadMemos(false).catch(showError));
  $("memos-all")?.addEventListener("click",()=>loadMemos(true).catch(showError));

  init();
})();