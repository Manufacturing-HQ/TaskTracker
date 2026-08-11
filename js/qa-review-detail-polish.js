"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const summary = document.getElementById("review-summary");
  if (!config || !supabaseLib || !summary) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  let busy=false;

  const style=document.createElement("style");
  style.textContent=`
    .qa-job-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.qa-job-detail{border:1px solid #bfdbfe;border-radius:10px;background:#fff;padding:10px 11px}.qa-job-detail .label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:900;margin-bottom:4px}.qa-job-detail .value{font-weight:800;color:#172033;overflow-wrap:anywhere}.qa-job-detail.comments{grid-column:1/-1}@media(max-width:720px){.qa-job-detail-grid{grid-template-columns:1fr 1fr}.qa-job-detail.comments{grid-column:1/-1}}
  `;
  document.head.appendChild(style);

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  async function polish(){
    if(busy || summary.querySelector(".qa-job-detail-grid")) return;
    const match=(summary.textContent||"").match(/Job\s*#\s*(\d+)/i);
    if(!match) return;
    busy=true;
    try{
      const token=sessionStorage.getItem(config.sessionStorageKey);
      if(!token) return;
      const queue=await rpc("get_qa_queue",{p_session_token:token})||[];
      const job=queue.find(j=>String(j.job_number)===match[1]);
      if(!job) return;
      summary.innerHTML=`<div class="qa-job-detail-grid">
        <div class="qa-job-detail"><span class="label">Builder</span><span class="value">${esc(job.employee_name||"—")}</span></div>
        <div class="qa-job-detail"><span class="label">Item</span><span class="value">${esc(job.item_name||"—")}</span></div>
        <div class="qa-job-detail"><span class="label">Quantity</span><span class="value">${esc(job.assigned_quantity??"—")}</span></div>
        <div class="qa-job-detail"><span class="label">Work Order</span><span class="value">${esc(job.work_order_number||"—")}</span></div>
        <div class="qa-job-detail"><span class="label">Job Type</span><span class="value">${esc(job.job_type||"—")}</span></div>
        <div class="qa-job-detail comments"><span class="label">Builder Comments</span><span class="value">${esc(job.comments||"—")}</span></div>
      </div>`;
    } catch {} finally { busy=false; }
  }

  new MutationObserver(()=>{polish();}).observe(summary,{childList:true,subtree:true,characterData:true});
  setTimeout(polish,500);
})();
