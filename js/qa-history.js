"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const app = document.getElementById("app");
  if (!config || !supabaseLib || !app) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const today=()=>new Date().toISOString().slice(0,10);
  let setup=null;

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  const style=document.createElement("style");
  style.textContent=`
    .qa-history-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}.qa-history-toolbar label{font-size:12px;font-weight:800}.qa-history-toolbar input,.qa-history-toolbar select{min-height:40px}.qa-history-table-wrap{overflow:auto;border:1px solid #cbd5e1;border-radius:12px}.qa-history-table{width:100%;border-collapse:collapse;min-width:1100px}.qa-history-table th,.qa-history-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;vertical-align:top}.qa-history-table th{background:#1e293b;color:#fff}.qa-history-errors{display:flex;gap:5px;flex-wrap:wrap}.qa-history-error{padding:3px 7px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:800;font-size:10px}.qa-history-status{font-weight:800}.qa-history-empty{text-align:center;color:#64748b;padding:16px}
  `;
  document.head.appendChild(style);

  const section=document.createElement("section");
  section.className="card";
  section.id="qa-history-section";
  section.innerHTML=`
    <div class="row"><div><h2 style="margin:0 0 6px">QA History</h2><div class="muted">Completed QA reviews by QA review date.</div></div></div>
    <div class="qa-history-toolbar">
      <label>Start Date<input id="qa-history-start" type="date"></label>
      <label>End Date<input id="qa-history-end" type="date"></label>
      <label id="qa-history-builder-wrap">Builder<select id="qa-history-builder"><option value="">All Builders</option></select></label>
      <label id="qa-history-rep-wrap">QA Rep<select id="qa-history-rep"><option value="">All QA Reps</option></select></label>
      <button id="qa-history-load" class="primary" type="button">Load History</button>
    </div>
    <div id="qa-history-table" class="qa-history-table-wrap"></div>`;
  app.appendChild(section);

  async function loadSetup(){
    setup=await rpc("get_qa_history_options",{p_session_token:token()});
    const isManager=!!setup?.viewer?.is_manager;
    document.getElementById("qa-history-builder-wrap").hidden=!isManager;
    document.getElementById("qa-history-rep-wrap").hidden=!isManager;
    if(isManager){
      document.getElementById("qa-history-builder").innerHTML='<option value="">All Builders</option>'+ (setup.builders||[]).map(x=>`<option value="${esc(x.employee_id)}">${esc(x.employee_name)}</option>`).join("");
      document.getElementById("qa-history-rep").innerHTML='<option value="">All QA Reps</option>'+ (setup.qa_reps||[]).map(x=>`<option value="${esc(x.employee_id)}">${esc(x.employee_name)}</option>`).join("");
    }
  }

  async function loadHistory(){
    const result=await rpc("get_qa_history",{
      p_session_token:token(),
      p_start_date:document.getElementById("qa-history-start").value,
      p_end_date:document.getElementById("qa-history-end").value,
      p_builder_employee_id:setup?.viewer?.is_manager?(document.getElementById("qa-history-builder").value||null):null,
      p_qa_employee_id:setup?.viewer?.is_manager?(document.getElementById("qa-history-rep").value||null):null
    });
    const rows=result?.records||[];
    const body=rows.map(r=>`<tr>
      <td>${esc(r.review_date)}</td>
      <td>${esc(r.builder_name||"—")}</td>
      <td><strong>${esc(r.item_name||"—")}</strong><div class="muted">WO ${esc(r.work_order_number||"—")}</div></td>
      <td>${esc(r.job_type||"—")}</td>
      <td>${esc(r.quantity_reviewed??0)}</td>
      <td>${esc(r.qa_rep||"—")}</td>
      <td class="qa-history-status">${esc(r.quality_status||"—")}</td>
      <td><div class="qa-history-errors">${(r.errors||[]).map(e=>`<span class="qa-history-error">${esc(e.error_name)} × ${esc(e.quantity)}</span>`).join("")||"—"}</div></td>
      <td>${esc(r.qa_comments||"—")}</td>
    </tr>`).join("");
    document.getElementById("qa-history-table").innerHTML=`<table class="qa-history-table"><thead><tr><th>Date</th><th>Builder</th><th>Item / WO</th><th>Job Type</th><th>Quantity</th><th>QA Rep</th><th>Quality Status</th><th>Errors</th><th>QA Comments</th></tr></thead><tbody>${body||'<tr><td colspan="9" class="qa-history-empty">No QA reviews found for this date range.</td></tr>'}</tbody></table>`;
  }

  async function init(){
    if(!token()) return;
    const end=today(); const start=new Date(); start.setDate(start.getDate()-30);
    document.getElementById("qa-history-start").value=start.toISOString().slice(0,10);
    document.getElementById("qa-history-end").value=end;
    try{await loadSetup();await loadHistory();}catch(e){document.getElementById("qa-history-table").innerHTML=`<div class="message" data-type="error">${esc(e.message)}</div>`;}
  }
  document.getElementById("qa-history-load").addEventListener("click",()=>loadHistory().catch(e=>alert(e.message)));
  window.addEventListener("pageshow",()=>setTimeout(init,300));
  setTimeout(init,600);
})();
