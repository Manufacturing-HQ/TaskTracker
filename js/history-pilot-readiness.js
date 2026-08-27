"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib) return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const REPORTING_TIME_ZONE="America/New_York";
  let setup=null;
  let records=[];
  let pauseReasons=[];
  let initialized=false;
  let historyDecorateTimer=null;
  let historyDecorating=false;

  document.querySelectorAll("aside .nav a").forEach(a=>{
    const text=(a.textContent||"").trim();
    if(!["Home","History"].includes(text)) a.remove();
  });

  const style=document.createElement("style");
  style.textContent=`
    .tx-panel{margin-top:18px}.tx-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.tx-toolbar .field{margin:0}.tx-note{font-size:12px;color:#64748b;margin:8px 0 12px}.tx-table{width:100%;border-collapse:collapse;min-width:1120px}.tx-table th,.tx-table td{padding:9px 10px;border-bottom:1px solid #dbe3ef;text-align:left;font-size:12px}.tx-open{display:inline-block;border-radius:999px;padding:3px 7px;background:#fee2e2;color:#991b1b;font-size:10px;font-weight:900}.tx-modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;padding:20px;z-index:1200}.tx-modal{width:min(700px,96vw);max-height:94vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}.tx-modal label{display:block;font-size:12px;font-weight:800;margin:10px 0 5px}.tx-modal input,.tx-modal textarea,.tx-modal select{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px;background:#fff}.tx-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap}.tx-action-group{display:flex;gap:6px;flex-wrap:wrap}.tx-time-block{display:grid;grid-template-columns:minmax(150px,1fr) minmax(220px,1.35fr);gap:10px;align-items:end}.tx-time-row{display:grid;grid-template-columns:80px 20px 90px 82px;gap:6px;align-items:center}.tx-time-row input,.tx-time-row select{min-height:40px}.tx-time-colon{text-align:center;font-weight:900}.tx-time-caption{font-size:11px;color:#64748b;margin-top:4px}.tx-split-cell,.tx-split-head{white-space:nowrap}.tx-split-btn{font-size:11px;padding:6px 9px}
    @media(max-width:700px){.tx-time-block{grid-template-columns:1fr}.tx-time-row{grid-template-columns:78px 18px 88px 78px}}
  `;
  document.head.appendChild(style);

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  function zonedParts(iso){
    if(!iso) return null;
    const d=new Date(iso);if(Number.isNaN(d.getTime())) return null;
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:REPORTING_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"numeric",minute:"2-digit",hour12:true}).formatToParts(d);
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return {date:`${map.year}-${map.month}-${map.day}`,hour:String(Number(map.hour)),minute:map.minute,period:(map.dayPeriod||"AM").toUpperCase()};
  }

  function hourOptions(selected){return '<option value="">Hour</option>'+Array.from({length:12},(_,i)=>i+1).map(h=>`<option value="${h}" ${String(h)===String(selected)?"selected":""}>${h}</option>`).join("");}
  function periodOptions(selected){return `<option value="">AM/PM</option><option value="AM" ${selected==="AM"?"selected":""}>AM</option><option value="PM" ${selected==="PM"?"selected":""}>PM</option>`;}
  function dateTimeFields(prefix,label,parts){
    return `<div class="tx-time-block"><div><label>${esc(label)} Date</label><input id="${prefix}-date" type="date" value="${esc(parts?.date||"")}" required></div><div><label>${esc(label)} Time</label><div class="tx-time-row"><select id="${prefix}-hour">${hourOptions(parts?.hour)}</select><div class="tx-time-colon">:</div><input id="${prefix}-minute" type="number" inputmode="numeric" min="0" max="59" step="1" placeholder="00" value="${esc(parts?.minute||"")}"><select id="${prefix}-period">${periodOptions(parts?.period)}</select></div></div></div>`;
  }
  function localFromFields(root,prefix){
    const date=root.querySelector(`#${prefix}-date`)?.value;
    const hour=Number(root.querySelector(`#${prefix}-hour`)?.value);
    const minute=Number(root.querySelector(`#${prefix}-minute`)?.value);
    const period=root.querySelector(`#${prefix}-period`)?.value;
    if(!date||!hour||hour<1||hour>12||!Number.isInteger(minute)||minute<0||minute>59||!["AM","PM"].includes(period)) return null;
    const h24=(hour%12)+(period==="PM"?12:0);
    return `${date}T${String(h24).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`;
  }

  function modalMessage(bg,text){const el=bg.querySelector("#tx-modal-msg");if(el)el.textContent=text||"";}

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
      <div class="tx-note">Closed sessions can have Start/Stop corrected or a Break/Lunch inserted. Open sessions can be Force Stopped at the intended Eastern time.</div>
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
    if(!host) return;
    host.innerHTML='<div class="empty">Loading transactions...</div>';
    try{
      const data=await rpc("get_history_session_corrections",{p_session_token:token(),p_employee_id:document.getElementById("tx-employee").value,p_start_date:document.getElementById("tx-start").value,p_end_date:document.getElementById("tx-end").value});
      records=data?.records||[];
      const rows=records.map((r,i)=>`<tr><td>${esc(r.start_local||"—")}</td><td>${r.is_open?'<span class="tx-open">OPEN</span>':esc(r.end_local||"—")}</td><td>${esc(r.task_type||"—")}</td><td><strong>${esc(r.item_name||"—")}</strong><div class="subtle">${r.work_order_number?`WO ${esc(r.work_order_number)}`:""}</div></td><td>${r.duration_minutes==null?"—":esc(r.duration_minutes)}</td><td>${esc(r.stop_reason||"—")}</td><td><div class="tx-action-group"><button class="ghost" data-tx-index="${i}" data-tx-action="${r.is_open?"force":"edit"}" type="button">${r.is_open?"Force Stop":"Edit Times"}</button>${r.is_open?"":`<button class="ghost" data-tx-index="${i}" data-tx-action="split" type="button">Insert Stop / Resume</button>`}</div></td></tr>`).join("");
      host.innerHTML=`<table class="tx-table"><thead><tr><th>Start</th><th>Stop</th><th>Task Type</th><th>Item / WO</th><th>Minutes</th><th>Stop Reason</th><th>Action</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">No transactions found.</td></tr>'}</tbody></table>`;
      host.querySelectorAll("[data-tx-index]").forEach(b=>b.addEventListener("click",()=>{
        const r=records[Number(b.dataset.txIndex)];
        if(b.dataset.txAction==="split") openSplitEditor(r);
        else openEditor(r);
      }));
    }catch(e){host.innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}
  }

  function openEditor(r){
    const bg=document.createElement("div");
    bg.className="tx-modal-bg";
    if(r.is_open){
      const start=zonedParts(r.started_at);
      bg.innerHTML=`<div class="tx-modal"><h2 style="margin-top:0">Force Stop Transaction</h2><div class="tx-note">Started ${esc(r.start_local)} · ${esc(r.item_name||r.task_type||"Task")}</div>${dateTimeFields("tx-force-end","Correct Stop",{date:start?.date})}<label>Correction Reason</label><textarea id="tx-reason" rows="3" required placeholder="Why is this time being corrected?"></textarea><label>Comments (optional)</label><textarea id="tx-comments" rows="2"></textarea><div id="tx-modal-msg" class="tx-note"></div><div class="tx-actions"><button class="ghost" id="tx-cancel" type="button">Cancel</button><button class="primary" id="tx-save" type="button">Force Stop</button></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector("#tx-cancel").onclick=()=>bg.remove();
      bg.querySelector("#tx-save").onclick=async()=>{
        const ended=localFromFields(bg,"tx-force-end");
        const reason=bg.querySelector("#tx-reason").value.trim();
        if(!ended||!reason){modalMessage(bg,"Correct Stop Date/Time and Correction Reason are required.");return;}
        try{await rpc("force_stop_history_session_local",{p_session_token:token(),p_job_id:r.job_id,p_forced_ended_local:ended,p_correction_reason:reason,p_comments:bg.querySelector("#tx-comments").value||null});bg.remove();await loadTransactions();document.getElementById("employee-load")?.click();}catch(e){modalMessage(bg,e.message);}
      };
    }else{
      bg.innerHTML=`<div class="tx-modal"><h2 style="margin-top:0">Edit Transaction Times</h2><div class="tx-note">${esc(r.item_name||r.task_type||"Task")} · ${esc(r.work_order_number||"")}</div><div class="tx-note">Unchanged displayed minutes keep their original hidden seconds, so touching task boundaries remain valid.</div>${dateTimeFields("tx-edit-start","Start",zonedParts(r.started_at))}${dateTimeFields("tx-edit-end","Stop",zonedParts(r.ended_at))}<label>Correction Reason</label><textarea id="tx-reason" rows="3" required placeholder="Why are these times being corrected?"></textarea><div id="tx-modal-msg" class="tx-note"></div><div class="tx-actions"><button class="ghost" id="tx-cancel" type="button">Cancel</button><button class="primary" id="tx-save" type="button">Save Correction</button></div></div>`;
      document.body.appendChild(bg);
      bg.querySelector("#tx-cancel").onclick=()=>bg.remove();
      bg.querySelector("#tx-save").onclick=async()=>{
        const started=localFromFields(bg,"tx-edit-start"),ended=localFromFields(bg,"tx-edit-end"),reason=bg.querySelector("#tx-reason").value.trim();
        if(!started||!ended||!reason){modalMessage(bg,"Start Date/Time, Stop Date/Time, and Correction Reason are required.");return;}
        try{await rpc("correct_history_session_time_local",{p_session_token:token(),p_job_session_id:r.job_session_id,p_new_started_local:started,p_new_ended_local:ended,p_correction_reason:reason});bg.remove();await loadTransactions();document.getElementById("employee-load")?.click();}catch(e){modalMessage(bg,e.message);}
      };
    }
  }

  async function ensurePauseReasons(){
    if(pauseReasons.length) return pauseReasons;
    const data=await rpc("get_task_action_options",{p_session_token:token()});
    pauseReasons=(data?.pause_reasons||[]).filter(r=>r.stop_reason_id);
    return pauseReasons;
  }

  async function openSplitEditor(r){
    try{await ensurePauseReasons();}catch(e){window.alert(e.message);return;}
    if(!r?.job_session_id||!r?.ended_at){window.alert("Only a closed session can be split.");return;}
    const start=zonedParts(r.started_at),end=zonedParts(r.ended_at);
    const bg=document.createElement("div");
    bg.className="tx-modal-bg";
    bg.innerHTML=`<div class="tx-modal"><h2 style="margin-top:0">Insert Stop / Resume</h2><div class="tx-note">${esc(r.item_name||r.task_type||"Task")} ${r.work_order_number?`· WO ${esc(r.work_order_number)}`:""}</div><div class="tx-note">Original session: ${esc(start?.date||"")} ${esc(start?.hour||"")}:${esc(start?.minute||"")} ${esc(start?.period||"")} through ${esc(end?.date||"")} ${esc(end?.hour||"")}:${esc(end?.minute||"")} ${esc(end?.period||"")}. This keeps the same Job and inserts a gap without changing the Job status.</div>${dateTimeFields("tx-split-stop","Stop",{date:start?.date})}${dateTimeFields("tx-split-resume","Resume",{date:start?.date})}<label>Stop Reason</label><select id="tx-split-reason"><option value="">Select stop reason</option>${pauseReasons.map(x=>`<option value="${esc(x.stop_reason_id)}">${esc(x.reason_name)}</option>`).join("")}</select><label>Correction Reason</label><textarea id="tx-reason" rows="3" required placeholder="Example: Employee forgot to stop for lunch"></textarea><div id="tx-modal-msg" class="tx-note"></div><div class="tx-actions"><button class="ghost" id="tx-cancel" type="button">Cancel</button><button class="primary" id="tx-save" type="button">Insert Stop / Resume</button></div></div>`;
    document.body.appendChild(bg);
    bg.querySelector("#tx-cancel").onclick=()=>bg.remove();
    bg.querySelector("#tx-save").onclick=async()=>{
      const stop=localFromFields(bg,"tx-split-stop"),resume=localFromFields(bg,"tx-split-resume"),stopReason=bg.querySelector("#tx-split-reason").value,reason=bg.querySelector("#tx-reason").value.trim();
      if(!stop||!resume||!stopReason||!reason){modalMessage(bg,"Stop Date/Time, Resume Date/Time, Stop Reason, and Correction Reason are required.");return;}
      if(resume<=stop){modalMessage(bg,"Resume time must be later than Stop time.");return;}
      try{
        await rpc("split_history_session_local",{p_session_token:token(),p_job_session_id:r.job_session_id,p_stop_local:stop,p_resume_local:resume,p_stop_reason_id:stopReason,p_correction_reason:reason});
        bg.remove();
        document.getElementById("employee-load")?.click();
        if(document.getElementById("tx-results")) await loadTransactions();
      }catch(e){modalMessage(bg,e.message);}
    };
  }

  function pageOffset(){const text=document.getElementById("employee-page-info")?.textContent||"",m=text.match(/Showing\s+(\d+)/i);return m?Math.max(0,Number(m[1])-1):0;}
  async function currentHistoryJobs(){
    const employeeId=document.getElementById("employee-filter")?.value,start=document.getElementById("employee-start")?.value,end=document.getElementById("employee-end")?.value;
    if(!employeeId||!start||!end) return [];
    const data=await rpc("get_employee_history_timeline_page",{p_session_token:token(),p_employee_id:employeeId,p_start_date:start,p_end_date:end,p_page_size:50,p_page_offset:pageOffset()});
    return data?.jobs||[];
  }

  async function decorateHistorySessions(){
    if(!setup?.viewer?.is_management||historyDecorating) return;
    const cards=[...document.querySelectorAll("#employee-list details.history-card")];
    if(!cards.length) return;
    historyDecorating=true;
    try{
      const jobs=await currentHistoryJobs();
      cards.forEach((card,jobIndex)=>{
        const job=jobs[jobIndex];
        const table=card.querySelector(".history-detail table");
        if(!job||!table) return;
        const head=table.querySelector("thead tr");
        if(head&&!head.querySelector(".tx-split-head")){
          const th=document.createElement("th");th.className="tx-split-head";th.textContent="Correction";head.appendChild(th);
        }
        const rows=[...table.querySelectorAll("tbody tr")];
        rows.forEach((row,sessionIndex)=>{
          if(row.querySelector(".tx-split-cell")) return;
          const session=job.sessions?.[sessionIndex];
          const td=document.createElement("td");td.className="tx-split-cell";
          if(session?.session_id&&session?.ended_at){
            const button=document.createElement("button");
            button.type="button";button.className="ghost tx-split-btn";button.textContent="Split";button.title="Insert a Break, Lunch, or other stop/resume gap";
            button.onclick=(event)=>{event.preventDefault();event.stopPropagation();openSplitEditor({job_session_id:session.session_id,job_id:job.job_id,started_at:session.started_at,ended_at:session.ended_at,item_name:job.item_name,task_type:job.task_type,work_order_number:job.work_order_number});};
            td.appendChild(button);
          }else td.textContent="—";
          row.appendChild(td);
        });
      });
    }catch{}finally{historyDecorating=false;}
  }

  function scheduleHistoryDecoration(){clearTimeout(historyDecorateTimer);historyDecorateTimer=setTimeout(decorateHistorySessions,180);}

  async function init(){
    if(!token()) return;
    try{
      if(!setup) setup=await rpc("get_history_workspace_options",{p_session_token:token()});
      if(setup?.viewer?.is_management){
        buildPanel();
        ensurePauseReasons().catch(()=>{});
        scheduleHistoryDecoration();
      }
    }catch{}
  }
  window.addEventListener("pageshow",()=>setTimeout(init,350));
  document.getElementById("login-form")?.addEventListener("submit",()=>setTimeout(init,700));
  document.getElementById("employee-load")?.addEventListener("click",()=>setTimeout(scheduleHistoryDecoration,250));
  const app=document.getElementById("app");
  if(app) new MutationObserver(()=>{if(!app.hidden)setTimeout(init,50);}).observe(app,{attributes:true,attributeFilter:["hidden"]});
  const historyList=document.getElementById("employee-list");
  if(historyList) new MutationObserver(scheduleHistoryDecoration).observe(historyList,{childList:true,subtree:true});
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
