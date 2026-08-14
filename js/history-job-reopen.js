"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const list = document.getElementById("employee-list");
  if (!config || !supabaseLib || !list) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let management = false;
  let busy = false;
  let timer = null;

  const style = document.createElement("style");
  style.textContent = `
    .history-reopen-row{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}.history-reopen-btn{font-size:12px}
    .history-reopen-bg{position:fixed;inset:0;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:20px;z-index:1300}
    .history-reopen-modal{width:min(650px,96vw);background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px;max-height:92vh;overflow:auto}
    .history-reopen-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}
    .history-reopen-summary div{font-size:12px}.history-reopen-summary strong{display:block;font-size:10px;text-transform:uppercase;color:#64748b;margin-bottom:3px}
    .history-reopen-modal label{display:block;font-size:12px;font-weight:800;margin:12px 0 5px}.history-reopen-modal input,.history-reopen-modal textarea{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px}
    .history-reopen-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.history-reopen-warning{padding:10px 12px;border-radius:9px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:700}
    @media(max-width:650px){.history-reopen-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }

  function showPageMessage(text,type="info"){
    const el=document.getElementById("message"); if(!el) return;
    el.textContent=text||""; el.dataset.type=type; el.hidden=!text;
  }

  function pageOffset(){
    const text=document.getElementById("employee-page-info")?.textContent||"";
    const m=text.match(/Showing\s+(\d+)/i);
    return m?Math.max(0,Number(m[1])-1):0;
  }

  async function currentPageJobs(){
    const employeeId=document.getElementById("employee-filter")?.value;
    const start=document.getElementById("employee-start")?.value;
    const end=document.getElementById("employee-end")?.value;
    if(!employeeId||!start||!end) return [];
    const data=await rpc("get_employee_history_timeline_page",{
      p_session_token:token(), p_employee_id:employeeId,
      p_start_date:start, p_end_date:end, p_page_size:50, p_page_offset:pageOffset()
    });
    return data?.jobs||[];
  }

  function eligible(job){
    if(!job) return false;
    if(!["Ready for QA","Completed"].includes(job.job_status)) return false;
    if(job.qa?.reviewed_at) return false;
    return true;
  }

  async function decorate(){
    if(!management||busy||!token()) return;
    const cards=[...list.querySelectorAll("details.history-card")];
    if(!cards.length) return;
    busy=true;
    try{
      const jobs=await currentPageJobs();
      cards.forEach((card,index)=>{
        if(card.dataset.reopenDecorated==="1") return;
        const job=jobs[index];
        card.dataset.reopenDecorated="1";
        if(!eligible(job)) return;
        const detail=card.querySelector(".history-detail"); if(!detail) return;
        let row=detail.querySelector(".history-admin-edit-row");
        if(!row){row=document.createElement("div");row.className="history-reopen-row";detail.insertAdjacentElement("afterbegin",row);}
        const button=document.createElement("button");
        button.type="button"; button.className="ghost history-reopen-btn"; button.textContent="Reopen Job";
        button.onclick=()=>openReopen(job);
        row.appendChild(button);
      });
    }catch(e){console.warn("History reopen decoration skipped:",e.message);}finally{busy=false;}
  }

  function openReopen(job){
    const bg=document.createElement("div"); bg.className="history-reopen-bg";
    bg.innerHTML=`<div class="history-reopen-modal">
      <h2 style="margin-top:0">Reopen Job #${esc(job.job_number)}</h2>
      <div class="history-reopen-warning">This administrative correction reopens the same assigned Job and starts a new tracking session. The original completion remains in the audit history.</div>
      <div class="history-reopen-summary">
        <div><strong>Status</strong>${esc(job.job_status||"—")}</div>
        <div><strong>Work Order</strong>${esc(job.work_order_number||"N/A")}</div>
        <div><strong>Item / Activity</strong>${esc(job.item_name||job.non_productive_task||"—")}</div>
        <div><strong>Quantity</strong>${esc(job.assigned_quantity??"N/A")}</div>
      </div>
      <label>Correction Reason</label><input id="history-reopen-reason" placeholder="Required — e.g. Accidental completion" autocomplete="off">
      <label>Comments (optional)</label><textarea id="history-reopen-comments" rows="3" placeholder="Additional context for the audit record"></textarea>
      <div id="history-reopen-msg" class="msg" hidden></div>
      <div class="history-reopen-actions"><button type="button" id="history-reopen-cancel" class="ghost">Cancel</button><button type="button" id="history-reopen-confirm" class="primary">Reopen Job and Resume Tracking</button></div>
    </div>`;
    document.body.appendChild(bg);
    bg.querySelector("#history-reopen-cancel").onclick=()=>bg.remove();
    bg.querySelector("#history-reopen-confirm").onclick=async()=>{
      const reason=bg.querySelector("#history-reopen-reason").value.trim();
      const comments=bg.querySelector("#history-reopen-comments").value.trim();
      const msg=bg.querySelector("#history-reopen-msg");
      if(!reason){msg.textContent="A correction reason is required.";msg.dataset.type="error";msg.hidden=false;return;}
      const btn=bg.querySelector("#history-reopen-confirm"); btn.disabled=true; btn.textContent="Reopening...";
      try{
        await rpc("reopen_permitted_job",{p_session_token:token(),p_job_id:job.job_id,p_correction_reason:reason,p_comments:comments||null});
        bg.remove(); showPageMessage(`Job #${job.job_number} reopened. The employee can resume tracking the same Job.`,"success");
        document.getElementById("employee-load")?.click();
      }catch(e){
        msg.textContent=e.message;msg.dataset.type="error";msg.hidden=false;btn.disabled=false;btn.textContent="Reopen Job and Resume Tracking";
      }
    };
  }

  async function init(){
    if(!token()) return;
    try{
      const setup=await rpc("get_history_workspace_options",{p_session_token:token()});
      management=!!setup?.viewer?.is_management;
      if(management) decorate();
    }catch{}
  }

  const observer=new MutationObserver(()=>{
    clearTimeout(timer); timer=setTimeout(()=>management?decorate():init(),160);
  });
  observer.observe(list,{childList:true,subtree:true});
  window.addEventListener("pageshow",()=>setTimeout(init,400));
  document.getElementById("login-form")?.addEventListener("submit",()=>setTimeout(init,750));
  setTimeout(init,900);
})();
