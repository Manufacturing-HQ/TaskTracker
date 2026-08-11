"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const app = document.getElementById("app");
  const nav = document.querySelector(".nav");
  const main = document.querySelector("main.main");
  if (!config || !supabaseLib || !app || !nav || !main) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const pct=(v)=>v===null||v===undefined?"—":`${Number(v).toFixed(2)}%`;
  let setup=null;

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  const style=document.createElement("style");
  style.textContent=`
    .qa-report-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:16px}.qa-report-toolbar label{font-size:12px;font-weight:800}.qa-report-toolbar input,.qa-report-toolbar select{min-height:40px}.qa-report-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.qa-report-metric{border:1px solid #94a3b8;border-radius:12px;padding:16px;background:#f8fafc}.qa-report-metric .label{font-size:11px;text-transform:uppercase;color:#64748b;font-weight:800}.qa-report-metric .value{font-size:28px;font-weight:900;margin-top:6px}.qa-report-table-wrap{overflow:auto;border:1px solid #94a3b8;border-radius:12px}.qa-report-table{width:100%;border-collapse:collapse;min-width:850px}.qa-report-table th,.qa-report-table td{padding:9px 10px;border-bottom:1px solid #dbe3ef;text-align:left;font-size:12px}.qa-report-table th{background:#1e293b;color:#fff}@media(max-width:900px){.qa-report-metrics{grid-template-columns:1fr 1fr}};
  `;
  document.head.appendChild(style);

  const button=document.createElement("button");
  button.type="button";
  button.dataset.view="qa-reporting";
  button.textContent="QA Reporting";
  button.hidden=true;
  const reportingLink=[...nav.querySelectorAll("a")].find(a=>/Reporting/i.test(a.textContent||""));
  if(reportingLink) reportingLink.insertAdjacentElement("beforebegin",button); else nav.appendChild(button);

  const section=document.createElement("section");
  section.id="view-qa-reporting";
  section.hidden=true;
  section.innerHTML=`<div class="panel"><div class="section-title"><div><h2>QA Reporting</h2><div style="color:#64748b;font-size:12px">QA review activity by QA review completion date.</div></div></div>
    <div class="qa-report-toolbar"><label>Start Date<input id="qa-report-start" type="date"></label><label>End Date<input id="qa-report-end" type="date"></label><label>QA Employee<select id="qa-report-rep"><option value="">All QA Employees</option></select></label><button id="qa-report-load" class="primary" type="button">Load Report</button></div>
    <div class="qa-report-metrics"><div class="qa-report-metric"><div class="label">Total Jobs</div><div id="qa-report-jobs" class="value">—</div></div><div class="qa-report-metric"><div class="label">Total Pieces Reviewed</div><div id="qa-report-pieces" class="value">—</div></div><div class="qa-report-metric"><div class="label">Total Errors</div><div id="qa-report-errors" class="value">—</div></div><div class="qa-report-metric"><div class="label">Error Rate</div><div id="qa-report-rate" class="value">—</div></div></div>
    <div class="section-title"><h2>By QA Employee</h2></div><div id="qa-report-by-employee" class="qa-report-table-wrap"></div>
    <div class="section-title" style="margin-top:18px"><h2>By Date</h2></div><div id="qa-report-by-date" class="qa-report-table-wrap"></div>
  </div>`;
  main.appendChild(section);

  function hideAll(){document.querySelectorAll('main.main > section[id^="view-"]').forEach(s=>s.hidden=true);document.querySelectorAll('.nav button[data-view]').forEach(b=>b.classList.remove('active'));}
  function show(){hideAll();section.hidden=false;button.classList.add("active");document.getElementById("page-title").textContent="QA Reporting";document.getElementById("page-subtitle").textContent="QA volume and error metrics by completed QA review.";loadReport().catch(e=>alert(e.message));}

  async function loadSetup(){
    if(!token()) return;
    try{
      setup=await rpc("get_qa_reporting_options",{p_session_token:token()});
      button.hidden=false;
      document.getElementById("qa-report-rep").innerHTML='<option value="">All QA Employees</option>'+ (setup.qa_reps||[]).map(r=>`<option value="${esc(r.employee_id)}">${esc(r.employee_name)}</option>`).join("");
    }catch{setup=null;button.hidden=true;}
  }

  function renderEmployee(rows){const body=(rows||[]).map(r=>`<tr><td>${esc(r.qa_rep)}</td><td>${esc(r.total_jobs)}</td><td>${esc(r.total_pieces_reviewed)}</td><td>${esc(r.total_errors)}</td><td>${pct(r.error_rate_percent)}</td><td>${esc(r.scrap_pieces)}</td><td>${esc(r.rework_returned)}</td></tr>`).join("");document.getElementById("qa-report-by-employee").innerHTML=`<table class="qa-report-table"><thead><tr><th>QA Employee</th><th>Jobs</th><th>Pieces Reviewed</th><th>Errors</th><th>Error Rate</th><th>Scrap</th><th>Rework Returned</th></tr></thead><tbody>${body||'<tr><td colspan="7">No QA reviews found.</td></tr>'}</tbody></table>`;}
  function renderDate(rows){const body=(rows||[]).map(r=>`<tr><td>${esc(r.review_date)}</td><td>${esc(r.total_jobs)}</td><td>${esc(r.total_pieces_reviewed)}</td><td>${esc(r.total_errors)}</td><td>${pct(r.error_rate_percent)}</td></tr>`).join("");document.getElementById("qa-report-by-date").innerHTML=`<table class="qa-report-table"><thead><tr><th>Date</th><th>Jobs</th><th>Pieces Reviewed</th><th>Errors</th><th>Error Rate</th></tr></thead><tbody>${body||'<tr><td colspan="5">No QA reviews found.</td></tr>'}</tbody></table>`;}

  async function loadReport(){if(!setup)return;const d=await rpc("get_qa_reporting",{p_session_token:token(),p_start_date:document.getElementById("qa-report-start").value,p_end_date:document.getElementById("qa-report-end").value,p_qa_employee_id:document.getElementById("qa-report-rep").value||null});const s=d.summary||{};document.getElementById("qa-report-jobs").textContent=s.total_jobs??0;document.getElementById("qa-report-pieces").textContent=s.total_pieces_reviewed??0;document.getElementById("qa-report-errors").textContent=s.total_errors??0;document.getElementById("qa-report-rate").textContent=pct(s.error_rate_percent);renderEmployee(d.by_employee||[]);renderDate(d.by_date||[]);}

  button.addEventListener("click",show);
  document.getElementById("qa-report-load").addEventListener("click",()=>loadReport().catch(e=>alert(e.message)));
  const end=new Date();const start=new Date();start.setDate(start.getDate()-30);document.getElementById("qa-report-start").value=start.toISOString().slice(0,10);document.getElementById("qa-report-end").value=end.toISOString().slice(0,10);
  new MutationObserver(()=>{if(!app.hidden)setTimeout(loadSetup,0);}).observe(app,{attributes:true,attributeFilter:["hidden"]});
  setTimeout(loadSetup,700);
})();
