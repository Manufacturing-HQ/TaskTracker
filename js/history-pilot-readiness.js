"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib) return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  let setup=null;
  let records=[];
  let initialized=false;

  document.querySelectorAll("aside .nav a").forEach(a=>{
    const text=(a.textContent||"").trim();
    if(!["Home","History"].includes(text)) a.remove();
  });

  const style=document.createElement("style");
  style.textContent=`
    .tx-panel{margin-top:18px}.tx-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.tx-toolbar .field{margin:0}.tx-note{font-size:12px;color:#64748b;margin:8px 0 12px}.tx-table{width:100%;border-collapse:collapse;min-width:1050px}.tx-table th,.tx-table td{padding:9px 10px;border-bottom:1px solid #dbe3ef;text-align:left;font-size:12px}.tx-open{display:inline-block;border-radius:999px;padding:3px 7px;background:#fee2e2;color:#991b1b;font-size:10px;font-weight:900}.tx-modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;padding:20px;z-index:100}.tx-modal{width:min(600px,96vw);background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}.tx-modal label{display:block;font-size:12px;font-weight:800;margin:10px 0 5px}.tx-modal input,.tx-modal textarea{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px}.tx-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
  `;
  document.head.appendChild(style);

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}
  const localInput=(v)=>v?String(v).replace(" ","T"):"";

  function buildPanel(){
    if(initialized||!setup?.viewer?.is_management) return;
    const employeeView=document.getElementById("employee-history-view");
    if(!employeeView) return;
    initialized=true;
    const panel=document.createElement("div");
    panel.id="transaction-corrections";
    panel.className="panel tx-panel";
    panel.innerHTML=`<div class="row"><div><h2 style="margin:0">Transaction Time Corrections</h2><div class="tx-note">Supervisor/Manager/Admin only. Every correction requires a reason and is written to the correction audit log.</div></div></div>
      <div class="tx-toolbar">
        <div class="field"><label>Employee</label><select id="tx-employee"></select></div>
        <div class="field"><label>Start Date</label><input id="tx-start" type="date"></div>
        <div class="field"><label>End Date</label><input id="tx-end" type="date"></div>
        <button id="tx-load" class="primary" type="button">Load Transactions</button>
      </div>
      <div class="tx-note">Closed sessions can have Start/Stop corrected. An accidentally open session can be Force Stopped at the intended Eastern time.</div>
      <div id="tx-results" class="table-wrap"><div class="empty">Load transactions to review session times.</div></div>`;
    employeeView.appendChild(panel);
    const opts=setup.employee_options||[];
    document.getElementById("tx-employee").innerHTML=opts.map(e=>`<option value="${esc(e.employee_id)}">${esc([e.employee_name,e.department].filter(Boolean).join(" · "))}</option>`).join("");
    const current=document.getElementById("employee-filter")?.value;
    if(current && opts.some(e=>e.employee_id===current)) document.getElementById("tx-employee").value=current;
    document.getElementById("tx-start").value=document.getElementById("employee-start")?.value||"";
    document.getElementById("tx-end").value=document.getElementById("employee-end")?.value||"";
    document.getElementById("tx-load").addEventListener("click",loadTransactions);
  }

  async function loadTransactions(){
    const host=document.getElementById("tx-results");
    host.innerHTML='<div class="empty">Loading transactions...</div>';
    try{
      const data=await rpc("get_history_session_corrections",{p_session_token:token(),p_employee_id:document.getElementById("tx-employee").value,p_start_date:document.getElementById("tx-start").value,p_end_date:document.getElementById("tx-end").value});
      records=data?.records||[];
      const rows=records.map((r,i)=>`<tr><td>${esc(r.start_local||"—")}</td><td>${r.is_open?'<span class="tx-open">OPEN</span>':esc(r.end_local||"—")}</td><td>${esc(r.task_type||"—")}</td><td><strong>${esc(r.item_name||"—")}</strong><div class="subtle">${r.work_order_number?`WO ${esc(r.work_order_number)}`:""}</div></td><td>${r.duration_minutes==null?"—":esc(r.duration_minutes)}</td><td>${esc(r.stop_reason||"—")}</td><td><button class="ghost" data-tx-index="${i}" type="button">${r.is_open?"Force Stop":"Edit Times"}</button></td></tr>`).join("");
      host.innerHTML=`<table class="tx-table"><thead><tr><th>Start</th><th>Stop</th><th>Task Type</th><th>Item / WO</th><th>Minutes</th><th>Stop Reason</th><th>Action</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">No transactions found.</td></tr>'}</tbody></table>`;
      host.querySelectorAll("[data-tx-index]").forEach(b=>b.addEventListener("click",()=>openEditor(records[Number(b.dataset.txIndex)])));
    }catch(e){host.innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}
  }

  function openEditor(r){
    const bg=document.createElement("div");
    bg.className="tx-modal-bg";
    if(r.is_open){
      bg.innerHTML=`<div class="tx-modal"><h2 style="margin-top:0">Force Stop Transaction</h2><div class="tx-note">Started ${esc(r.start_local)} · ${esc(r.item_name||r.task_type||"Task")}</div><label>Correct Stop Time (Eastern)</label><input id="tx-force-end" type="datetime-local" required><label>Correction Reason</label><textarea id="tx-reason" rows="3" required placeholder="Why is this time being corrected?"></textarea><label>Comments (optional)</label><textarea id="tx-comments" rows="2"></textarea><div id="tx-modal-msg" class="tx-note"></div><div class="tx-actions"><button class="ghost" id="tx-cancel" type="button">Cancel</button><button class="primary" id="tx-save" type="button">Force Stop</button></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector("#tx-cancel").onclick=()=>bg.remove();
      bg.querySelector("#tx-save").onclick=async()=>{try{await rpc("force_stop_history_session_local",{p_session_token:token(),p_job_id:r.job_id,p_forced_ended_local:bg.querySelector("#tx-force-end").value,p_correction_reason:bg.querySelector("#tx-reason").value,p_comments:bg.querySelector("#tx-comments").value||null});bg.remove();await loadTransactions();}catch(e){bg.querySelector("#tx-modal-msg").textContent=e.message;}};
    }else{
      bg.innerHTML=`<div class="tx-modal"><h2 style="margin-top:0">Edit Transaction Times</h2><div class="tx-note">${esc(r.item_name||r.task_type||"Task")} · ${esc(r.work_order_number||"")}</div><label>Start Time (Eastern)</label><input id="tx-edit-start" type="datetime-local" value="${esc(localInput(r.start_local))}" required><label>Stop Time (Eastern)</label><input id="tx-edit-end" type="datetime-local" value="${esc(localInput(r.end_local))}" required><label>Correction Reason</label><textarea id="tx-reason" rows="3" required placeholder="Why are these times being corrected?"></textarea><div id="tx-modal-msg" class="tx-note"></div><div class="tx-actions"><button class="ghost" id="tx-cancel" type="button">Cancel</button><button class="primary" id="tx-save" type="button">Save Correction</button></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector("#tx-cancel").onclick=()=>bg.remove();
      bg.querySelector("#tx-save").onclick=async()=>{try{await rpc("correct_history_session_time_local",{p_session_token:token(),p_job_session_id:r.job_session_id,p_new_started_local:bg.querySelector("#tx-edit-start").value,p_new_ended_local:bg.querySelector("#tx-edit-end").value,p_correction_reason:bg.querySelector("#tx-reason").value});bg.remove();await loadTransactions();}catch(e){bg.querySelector("#tx-modal-msg").textContent=e.message;}};
    }
  }

  async function init(){
    if(initialized||!token()) return;
    try{setup=await rpc("get_history_workspace_options",{p_session_token:token()});buildPanel();}catch{}
  }
  window.addEventListener("pageshow",()=>setTimeout(init,350));
  document.getElementById("login-form")?.addEventListener("submit",()=>setTimeout(init,700));
  const app=document.getElementById("app");
  if(app) new MutationObserver(()=>{if(!app.hidden)setTimeout(init,50);}).observe(app,{attributes:true,attributeFilter:["hidden"]});
  setTimeout(init,800);
})();

(() => {
  if (document.querySelector('script[data-pilot-helper="history-admin-edit"]')) return;
  const script = document.createElement("script");
  script.src = "js/history-admin-job-edit.js";
  script.dataset.pilotHelper = "history-admin-edit";
  document.body.appendChild(script);
})();

(() => {
  if (document.querySelector('script[data-pilot-helper="history-job-reopen"]')) return;
  const script = document.createElement("script");
  script.src = "js/history-job-reopen.js";
  script.dataset.pilotHelper = "history-job-reopen";
  document.body.appendChild(script);
})();
