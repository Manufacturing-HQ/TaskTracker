"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const $ = (id) => document.getElementById(id);
  const key = config.sessionStorageKey;
  let token = sessionStorage.getItem(key);
  let ctx = null;

  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const pageLabels = {
    "index.html":"Home",
    "employee.html":"Employee Task Tracker",
    "task.html":"Employee Task Tracker",
    "qa.html":"QA Review",
    "management.html":"Management",
    "history.html":"History",
    "attendance.html":"Attendance / Employee Summary",
    "training.html":"Training",
    "reporting.html":"Reporting",
    "feedback.html":"Feedback"
  };

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }
  function msg(id,text,type="info") {
    const el=$(id); if(!el) return;
    el.textContent=text||""; el.dataset.type=type; el.hidden=!text;
  }
  async function listEmployees() {
    const rows=await rpc("list_login_employees");
    $("employee").innerHTML='<option value="">Select employee</option>'+(rows||[]).map(r=>`<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
  }
  async function restore() {
    if(!token) return false;
    try {
      const rows=await rpc("get_employee_session_context",{p_session_token:token});
      ctx=Array.isArray(rows)?rows[0]:rows;
      if(!ctx) throw new Error("Session not found.");
      return true;
    } catch {
      sessionStorage.removeItem(key); token=null; ctx=null; return false;
    }
  }
  function sourcePage() {
    const qp=new URLSearchParams(location.search);
    return qp.get("from") || document.referrer.split('/').pop()?.split('?')[0] || "index.html";
  }
  function sourceLabel(page) { return pageLabels[page] || "Task Tracker"; }
  function setFeedbackType(type) {
    const bug=type==="Bug";
    $("feedback-type").value=type;
    $("bug-choice").classList.toggle("active",bug);
    $("improvement-choice").classList.toggle("active",!bug);
    $("action-wrap").hidden=!bug;
    $("feedback-action").required=bug;
    $("details-label").textContent=bug?"What happened?":"What would you improve?";
    $("feedback-text").placeholder=bug?"Describe what you expected and what happened instead.":"Describe your idea and how it would make the tool easier or better to use.";
  }
  async function enter() {
    $("login").hidden=true;
    $("app").hidden=false;
    const role=ctx?.employee_role||ctx?.role||"";
    $("who").textContent=[ctx?.employee_name,role,ctx?.department].filter(Boolean).join(" · ");
    const page=sourcePage();
    $("feedback-page").value=page;
    $("feedback-area-label").textContent=sourceLabel(page);
    $("admin-tab").hidden=role!=="Administrator";
    setDates();
    setFeedbackType("Bug");
    try { await loadMine(); }
    catch(e) { msg("mine-message",`Your previous feedback could not be loaded right now: ${e.message}`,"error"); }
  }
  async function login(e) {
    e.preventDefault();
    msg("login-message","Signing in...");
    try {
      const rows=await rpc("login_with_employee_pin",{p_employee_id:$("employee").value,p_pin:$("pin").value});
      const row=Array.isArray(rows)?rows[0]:rows;
      if(!row?.login_successful||!row.session_token){msg("login-message",row?.login_message||"Login failed.","error");return;}
      token=row.session_token;
      sessionStorage.setItem(key,token);
      ctx=row;
      $("pin").value="";
      msg("login-message","");
      await enter();
    } catch(err) {
      $("login").hidden=false;
      $("app").hidden=true;
      msg("login-message",err.message,"error");
    }
  }
  async function logout() {
    const t=token; sessionStorage.removeItem(key); token=null; ctx=null;
    if(t){try{await rpc("logout_employee_session",{p_session_token:t});}catch{}}
    location.href="index.html";
  }
  function show(view) {
    ["submit","mine","admin"].forEach(v=>{$(`${v}-view`).hidden=v!==view;$(`${v}-tab`).classList.toggle("active",v===view);});
    if(view==="mine") loadMine().catch(e=>msg("mine-message",e.message,"error"));
    if(view==="admin") loadAdmin().catch(e=>alert(e.message));
  }
  function setDates() {
    const e=new Date(), s=new Date(); s.setDate(s.getDate()-90);
    $("admin-end").value=e.toISOString().slice(0,10);
    $("admin-start").value=s.toISOString().slice(0,10);
  }

  $("bug-choice").onclick=()=>setFeedbackType("Bug");
  $("improvement-choice").onclick=()=>setFeedbackType("Improvement");

  $("feedback-form").addEventListener("submit",async e=>{
    e.preventDefault(); msg("submit-message","Submitting...");
    try {
      await rpc("submit_feedback",{
        p_session_token:token,
        p_feedback_type:$("feedback-type").value,
        p_action_attempted:$("feedback-action").value||null,
        p_feedback_text:$("feedback-text").value,
        p_page_path:$("feedback-page").value||null
      });
      msg("submit-message","Feedback submitted. Thank you.","success");
      $("feedback-action").value=""; $("feedback-text").value="";
      try { await loadMine(); } catch {}
    } catch(err) { msg("submit-message",err.message,"error"); }
  });

  async function loadMine() {
    if(!token) return;
    msg("mine-message","");
    const rows=await rpc("get_my_feedback",{p_session_token:token});
    $("mine-list").innerHTML=(rows||[]).map(r=>`<div class="card"><div><span class="badge ${r.feedback_type.toLowerCase()}">${esc(r.feedback_type)}</span> <span class="badge ${r.status.toLowerCase()}">${esc(r.status)}</span></div><strong style="display:block;margin-top:8px">${esc(r.action_attempted||r.feedback_text)}</strong><div class="meta">${new Date(r.submitted_at).toLocaleString()}${r.page_path?` · ${esc(sourceLabel(r.page_path))}`:""}</div><div style="margin-top:8px">${esc(r.feedback_text)}</div>${r.latest_admin_comment?`<div class="updates"><strong>Admin response:</strong> ${esc(r.latest_admin_comment)}</div>`:""}</div>`).join("")||'<div class="empty">No feedback submitted yet.</div>';
  }

  async function loadAdmin() {
    if((ctx?.employee_role||ctx?.role)!=="Administrator") return;
    const data=await rpc("get_feedback_dashboard",{
      p_session_token:token,
      p_feedback_type:$("admin-type").value||null,
      p_status:$("admin-status").value||null,
      p_employee_id:$("admin-employee").value||null,
      p_start_date:$("admin-start").value,
      p_end_date:$("admin-end").value
    });
    if(!$("admin-employee").dataset.loaded){
      $("admin-employee").innerHTML='<option value="">All</option>'+(data.employees||[]).map(e=>`<option value="${esc(e.employee_id)}">${esc(e.employee_name)}</option>`).join("");
      $("admin-employee").dataset.loaded="1";
    }
    renderAdmin(data.records||[]);
  }
  function renderAdmin(rows) {
    $("admin-list").innerHTML=rows.map(r=>`<div class="card" data-feedback-id="${esc(r.feedback_id)}"><div><span class="badge ${r.feedback_type.toLowerCase()}">${esc(r.feedback_type)}</span> <span class="badge ${r.status.toLowerCase()}">${esc(r.status)}</span></div><strong style="display:block;margin-top:8px">${esc(r.submitted_by_name)}</strong><div class="meta">${esc([r.role,r.department,sourceLabel(r.page_path)].filter(Boolean).join(" · "))} · ${new Date(r.submitted_at).toLocaleString()}</div>${r.action_attempted?`<div style="margin-top:8px"><strong>Trying to:</strong> ${esc(r.action_attempted)}</div>`:""}<div style="margin-top:8px">${esc(r.feedback_text)}</div><div class="updates">${(r.updates||[]).map(u=>`<div class="update"><strong>${esc(u.updated_by)}</strong> · ${esc(u.new_status||"")} · ${new Date(u.updated_at).toLocaleString()}${u.comment?`<br>${esc(u.comment)}`:""}</div>`).join("")||'<div class="meta">No admin updates yet.</div>'}</div><div class="form-stack" style="margin-top:12px"><div><label>Status</label><select data-status style="width:100%;padding:10px;border:1px solid #94a3b8;border-radius:9px"><option ${r.status==="Pending"?"selected":""}>Pending</option><option ${r.status==="Resolved"?"selected":""}>Resolved</option></select></div><div><label>Admin Comment</label><textarea data-comment rows="3"></textarea></div><div><button class="primary" data-save type="button">Save Update</button></div></div></div>`).join("")||'<div class="empty">No feedback found.</div>';
    document.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
      const card=b.closest("[data-feedback-id]");
      try {
        await rpc("update_feedback_item",{p_session_token:token,p_feedback_id:card.dataset.feedbackId,p_status:card.querySelector("[data-status]").value,p_comment:card.querySelector("[data-comment]").value||null});
        await loadAdmin();
      } catch(e) { alert(e.message); }
    });
  }

  $("submit-tab").onclick=()=>show("submit");
  $("mine-tab").onclick=()=>show("mine");
  $("admin-tab").onclick=()=>show("admin");
  $("admin-load").onclick=()=>loadAdmin().catch(e=>alert(e.message));
  $("sign-out").onclick=logout;
  $("login-form").addEventListener("submit",login);

  (async()=>{
    try {
      await listEmployees();
      if(await restore()) await enter();
    } catch(e) {
      $("login").hidden=false; $("app").hidden=true; msg("login-message",e.message,"error");
    }
  })();
})();