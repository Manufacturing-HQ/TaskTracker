"use strict";

(() => {
  const config=window.TaskTrackerConfig,supabaseLib=window.supabase,list=document.getElementById("employee-list");
  if(!config||!supabaseLib||!list)return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  let management=false,timer=null;
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}
  const style=document.createElement("style");
  style.textContent=`
    details.history-card.req-productive>summary{background:#ecfdf3!important}details.history-card.req-nonproductive>summary{background:#fff7e6!important}
    details.history-card[open]{border:3px solid #475569!important;box-shadow:0 5px 16px rgba(15,23,42,.14)}
    .history-main-grid.req-history-grid{grid-template-columns:100px 120px minmax(210px,1.6fr) 130px minmax(180px,1.4fr) 85px minmax(200px,1.5fr) 110px 110px minmax(180px,1.4fr) minmax(180px,1.4fr) 115px 115px 115px!important;min-width:1760px!important}
    .req-date-stack{display:grid;gap:3px}.req-date-stack .req-time{font-size:11px;font-weight:700}.req-date-stack .req-status{margin-top:3px;font-size:10px;font-weight:900;text-transform:uppercase;color:#475569}
    .req-good{background:#dcfce7!important;color:#111827!important;font-weight:900!important}.req-bad{background:#fee2e2!important;color:#111827!important;font-weight:900!important}.req-neutral{background:#f8fafc!important}
    #req-history-task-type{min-height:42px;border:1px solid #94a3b8;border-radius:9px;padding:0 9px;background:#fff}
  `;
  document.head.appendChild(style);
  function pageOffset(){const t=document.getElementById("employee-page-info")?.textContent||"",m=t.match(/Showing\s+(\d+)/i);return m?Math.max(0,Number(m[1])-1):0;}
  async function jobs(){const employee=document.getElementById("employee-filter")?.value,start=document.getElementById("employee-start")?.value,end=document.getElementById("employee-end")?.value;if(!employee||!start||!end)return[];const d=await rpc("get_employee_history_timeline_page",{p_session_token:token(),p_employee_id:employee,p_start_date:start,p_end_date:end,p_page_size:50,p_page_offset:pageOffset()});return d?.jobs||[];}
  function installFilter(){if(!management||document.getElementById("req-history-task-type"))return;const toolbar=document.querySelector("#employee-history-view .toolbar");if(!toolbar)return;const d=document.createElement("div");d.className="field";d.innerHTML='<label>Task Type</label><select id="req-history-task-type"><option value="">All</option><option value="Productive">Productive</option><option value="Non-Productive">Non-Productive</option></select>';toolbar.insertBefore(d,document.getElementById("employee-load"));d.querySelector("select").addEventListener("change",applyTaskFilter);}
  function applyTaskFilter(){const f=document.getElementById("req-history-task-type")?.value||"";document.querySelectorAll("#employee-list details.history-card").forEach(c=>{const type=c.dataset.reqTaskType||"";c.hidden=!!f&&type!==f;});}
  function classifyCell(cell,value,bad){cell.classList.remove("req-good","req-bad","req-neutral");if(value===null){cell.classList.add("req-neutral");return;}cell.classList.add(bad(value)?"req-bad":"req-good");}
  async function decorate(){
    const cards=[...list.querySelectorAll("details.history-card")];if(!cards.length)return;
    let rows=[];try{rows=await jobs();}catch{return;}
    cards.forEach((card,i)=>{
      const job=rows[i];if(!job)return;card.dataset.reqTaskType=job.task_type||"";card.classList.toggle("req-productive",job.task_type==="Productive");card.classList.toggle("req-nonproductive",job.task_type!=="Productive");
      const grid=card.querySelector(".history-main-grid");if(!grid)return;grid.classList.add("req-history-grid");const cells=[...grid.querySelectorAll(".history-cell")];
      const variable=cells.find(c=>c.querySelector(".hlabel")?.textContent.trim()==="Variable Field");if(variable)variable.querySelector(".hlabel").textContent="Item / Activity";
      const separateItem=cells.find(c=>c.querySelector(".hlabel")?.textContent.trim()==="Item");if(separateItem)separateItem.remove();
      const dateCell=[...grid.querySelectorAll(".history-cell")].find(c=>c.querySelector(".hlabel")?.textContent.trim()==="Date");if(dateCell){const v=dateCell.querySelector(".hvalue"),first=job.sessions?.[0],last=job.sessions?.[job.sessions.length-1];if(v)v.innerHTML=`<div class="req-date-stack"><strong>${v.textContent}</strong><span class="req-time">Start: ${first?.start_time||"—"}</span><span class="req-time">Last stop: ${last?.stop_time||"Active"}</span><span class="req-status">${job.job_status||"—"}</span></div>`;}
      const prod=[...grid.querySelectorAll(".history-cell")].find(c=>c.querySelector(".hlabel")?.textContent.trim()==="Productivity %");if(prod&&job.task_type==="Productive"){const txt=prod.querySelector(".hvalue")?.textContent||"",n=parseFloat(txt);classifyCell(prod,Number.isFinite(n)?n:null,v=>v<85);}
      const err=[...grid.querySelectorAll(".history-cell")].find(c=>c.querySelector(".hlabel")?.textContent.trim()==="Error Rate %");if(err&&job.task_type==="Productive"){const txt=err.querySelector(".hvalue")?.textContent||"";if(/pending/i.test(txt))classifyCell(err,null,()=>false);else{const n=parseFloat(txt);classifyCell(err,Number.isFinite(n)?n:null,v=>v>=1);}}
    });
    applyTaskFilter();
  }
  async function init(){if(!token())return;try{const s=await rpc("get_history_workspace_options",{p_session_token:token()});management=!!s?.viewer?.is_management;installFilter();decorate();}catch{}}
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(decorate,120);}).observe(list,{childList:true,subtree:true});
  window.addEventListener("pageshow",()=>setTimeout(init,450));document.getElementById("login-form")?.addEventListener("submit",()=>setTimeout(init,800));document.getElementById("employee-load")?.addEventListener("click",()=>setTimeout(decorate,250));setTimeout(init,950);
})();
