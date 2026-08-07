"use strict";
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");
  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let historyRows = [];
  let historySort = { key:"date", dir:1 };

  function setMessage(message, type="info") { const el=$("message"); el.textContent=message||""; el.dataset.type=type; el.hidden=!message; }
  async function rpc(name,args={}) { const {data,error}=await client.rpc(name,args); if(error) throw new Error(error.message||`${name} failed.`); return data; }
  function pct(v){ return v===null||v===undefined||Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`; }
  function fmtDate(v){ if(!v) return ""; const d=new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime())?v:d.toLocaleDateString(); }
  function todayIso(){ return new Date().toISOString().slice(0,10); }
  function ensureTaskFrame(){ const f=$("task-frame"); if(f && !f.getAttribute("src")) f.setAttribute("src", f.dataset.src || "phase5-pilot.html"); }

  async function listEmployees(){ const rows=await rpc("list_login_employees"); const s=$("employee"); s.innerHTML='<option value="">Select employee</option>'; (rows||[]).forEach(r=>{const o=document.createElement("option");o.value=r.employee_id;o.textContent=r.employee_name;s.appendChild(o);}); }
  async function restoreSession(){ if(!sessionToken) return false; try{ const rows=await rpc("get_employee_session_context",{p_session_token:sessionToken}); const row=Array.isArray(rows)?rows[0]:rows; if(!row)return false; sessionEmployee=row; return true;}catch{sessionStorage.removeItem(sessionKey);sessionToken=null;return false;} }
  async function login(e){ e.preventDefault(); setMessage("Signing in..."); const rows=await rpc("login_with_employee_pin",{p_employee_id:$("employee").value,p_pin:$("pin").value}); const row=Array.isArray(rows)?rows[0]:rows; if(!row?.login_successful||!row.session_token){setMessage(row?.login_message||"Login failed.","error");return;} sessionToken=row.session_token;sessionStorage.setItem(sessionKey,sessionToken);sessionEmployee=row;$("pin").value="";await enterApp(); }
  async function logout(){ const token=sessionToken;sessionStorage.removeItem(sessionKey);sessionToken=null;sessionEmployee=null; const frame=$("task-frame"); if(frame) frame.removeAttribute("src"); if(token){try{await rpc("logout_employee_session",{p_session_token:token});}catch{}} $("app").hidden=true;$("login").hidden=false;setMessage("Signed out."); }

  function showView(name){ const meta={task:["Start / Current Task","Your active task or the next task to start."],dashboard:["Dashboard","Performance, attendance, memos, and active corrective actions."],history:["History","Review your jobs, stops, QA errors, and corrections."],memos:["Memos","Pending and acknowledged employee communications."]}; document.querySelectorAll(".nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name)); ["task","dashboard","history","memos"].forEach(v=>$("view-"+v).hidden=v!==name); $("page-title").textContent=meta[name][0];$("page-subtitle").textContent=meta[name][1]; if(name==="task") ensureTaskFrame(); if(name==="dashboard") loadDashboard().catch(showError); if(name==="history" && historyRows.length===0) loadHistory().catch(showError); if(name==="memos") loadMemos(false).catch(showError); }
  function showError(e){ alert(e.message||String(e)); }

  async function enterApp(){
    const role=sessionEmployee?.employee_role||sessionEmployee?.role||"Employee";
    if(role!=="Employee"){
      const frame=$("task-frame"); if(frame) frame.removeAttribute("src");
      sessionStorage.removeItem(sessionKey); sessionToken=null; sessionEmployee=null;
      $("app").hidden=true; $("login").hidden=false;
      setMessage("This workspace is for Employee accounts. Please sign in with an Employee account.","error");
      return;
    }
    const name=sessionEmployee?.employee_name||sessionEmployee?.name||"Employee";
    const dept=sessionEmployee?.department||"";
    $("login").hidden=true;$("app").hidden=false;$("side-name").textContent=name;$("side-meta").textContent=[role,dept].filter(Boolean).join(" · "); setMessage(""); ensureTaskFrame(); showView("task");
  }

  async function loadDashboard(){ const period=$("performance-period").value; const d=await rpc("get_my_employee_dashboard",{p_session_token:sessionToken,p_period:period}); const p=d?.performance||{}; $("metric-productivity").textContent=pct(p.productivity_percent);$("metric-efficiency").textContent=pct(p.efficiency_percent);$("metric-error").textContent=pct(p.error_rate_percent); const a=d?.attendance_summary||{}; $("att-absence").textContent=a.unplanned_absence_or_left_early??0;$("att-tardy").textContent=a.tardies??0;$("att-ncns").textContent=a.no_call_no_show??0; renderCorrective(d?.active_corrective_actions||[]); renderDashboardMemos(d?.pending_memos||[]); }
  function renderCorrective(rows){ const c=$("corrective-actions"); if(!rows.length){c.innerHTML='<div class="empty">No active coaching or corrective actions.</div>';return;} c.innerHTML=rows.map(r=>`<div class="tile"><strong>${escapeHtml(r.category)} · ${escapeHtml(r.reason)}</strong><small>Incident: ${fmtDate(r.incident_date)} · Roll off: ${escapeHtml(r.roll_off_display||"")}</small><div class="details" style="margin-top:8px">${escapeHtml(r.description||"")}</div></div>`).join(""); }
  function renderDashboardMemos(rows){ const c=$("dashboard-memos"); if(!rows.length){c.innerHTML='<div class="empty">No pending memos.</div>';return;} c.innerHTML=rows.slice(0,5).map(m=>`<div class="tile"><strong>${escapeHtml(m.memo_title||m.category_name||"Memo")}</strong><small>${escapeHtml(m.category_name||"")} · ${new Date(m.assigned_at||m.created_at).toLocaleDateString()}</small></div>`).join(""); }

  async function loadHistory(){ const s=$("history-start").value,e=$("history-end").value; const d=await rpc("get_my_employee_history",{p_session_token:sessionToken,p_start_date:s,p_end_date:e}); const sum=d?.summary||{}; $("history-productivity").textContent=pct(sum.productivity_percent);$("history-efficiency").textContent=pct(sum.efficiency_percent);$("history-error").textContent=pct(sum.error_rate_percent); historyRows=d?.jobs||[]; renderHistory(); }
  function sortValue(row,key){ if(["stop_count","productivity_percent"].includes(key)) return Number(row[key]??-Infinity); return String(row[key]??"").toLowerCase(); }
  function renderHistory(){ const rows=[...historyRows].sort((a,b)=>{const av=sortValue(a,historySort.key),bv=sortValue(b,historySort.key); return (av<bv?-1:av>bv?1:0)*historySort.dir;}); const tb=$("history-table").querySelector("tbody"); if(!rows.length){tb.innerHTML='<tr><td colspan="8" class="empty">No jobs found for this date range.</td></tr>';return;} tb.innerHTML=rows.map(r=>{const qa=r.qa||{}; const title=r.task_type==="Productive"?(r.work_order_number||""):(r.non_productive_task||r.task_type||""); const reasons=(r.stop_reasons||[]).join(", "); const errors=(qa.errors||[]).map(x=>`${x.error_name} (${x.quantity})`).join(", "); const corrections=(r.corrections||[]).map(x=>`${x.correction_type}: ${x.reason}`).join("; "); return `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.task_type||"")}</td><td><strong>${escapeHtml(title)}</strong><div class="details">${escapeHtml(r.item_name||r.job_type||"")}</div></td><td>${r.stop_count??0}</td><td>${escapeHtml(reasons)}</td><td>${pct(r.productivity_percent)}</td><td>${pct(qa.error_rate_percent)}</td><td>${escapeHtml([errors,corrections].filter(Boolean).join(" | "))}</td></tr>`;}).join(""); }

  async function loadMemos(include){ const rows=await rpc("get_my_memos",{p_session_token:sessionToken,p_include_acknowledged:include}); const c=$("memo-list"); if(!rows?.length){c.innerHTML='<div class="empty">No memos found.</div>';return;} c.innerHTML=rows.map(m=>`<article class="memo-card"><span class="status-pill">${m.acknowledged_at?"Acknowledged":"Pending"}</span><h3>${escapeHtml(m.memo_title||m.category_name||"Memo")}</h3><div class="details">${escapeHtml(m.category_name||"")} · ${new Date(m.assigned_at||m.created_at).toLocaleString()}</div><p>${escapeHtml(m.memo_body||"")}</p>${m.acknowledgment_comments?`<div class="details"><strong>Your comments:</strong> ${escapeHtml(m.acknowledgment_comments)}</div>`:""}</article>`).join(""); }
  function escapeHtml(v){ return String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }

  async function init(){ try{await listEmployees(); const t=todayIso();$("history-start").value=t;$("history-end").value=t; if(await restoreSession()) await enterApp();}catch(e){setMessage(e.message,"error");} }
  $("login-form").addEventListener("submit",e=>login(e).catch(x=>setMessage(x.message,"error")));
  $("sign-out").addEventListener("click",()=>logout().catch(()=>{}));
  document.querySelectorAll(".nav button[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  $("performance-period").addEventListener("change",()=>loadDashboard().catch(showError));
  $("history-load").addEventListener("click",()=>loadHistory().catch(showError));
  $("memos-pending").addEventListener("click",()=>loadMemos(false).catch(showError));
  $("memos-all").addEventListener("click",()=>loadMemos(true).catch(showError));
  $("history-table").querySelectorAll("th[data-sort]").forEach(th=>th.addEventListener("click",()=>{ if(historySort.key===th.dataset.sort) historySort.dir*=-1; else historySort={key:th.dataset.sort,dir:1}; renderHistory(); }));
  init();
})();