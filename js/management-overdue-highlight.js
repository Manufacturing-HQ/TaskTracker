"use strict";

(() => {
  const config=window.TaskTrackerConfig,supabaseLib=window.supabase,body=document.getElementById("status-body");
  if(!config||!supabaseLib||!body)return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  let busy=false,timer=null;
  async function apply(){if(busy||!token())return;busy=true;try{const {data,error}=await client.rpc("get_live_status_dashboard_filtered",{p_session_token:token(),p_period:document.getElementById("performance-period")?.value||"WEEK",p_supervisor_id:document.getElementById("req-live-supervisor")?.value||null});if(error)throw error;const overdue=new Set((data?.employees||[]).filter(e=>e.has_active_task&&e.task_type==="Productive"&&Number(e.expected_minutes)>0&&Number(e.minutes_on_task)>Number(e.expected_minutes)).map(e=>e.employee_name));body.querySelectorAll("tr").forEach(tr=>{const name=tr.querySelector("td strong")?.textContent?.trim();tr.classList.toggle("req-overdue",!!name&&overdue.has(name));});}catch{}finally{busy=false;}}
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,180);};
  new MutationObserver(schedule).observe(body,{childList:true});
  document.getElementById("refresh-status")?.addEventListener("click",()=>setTimeout(apply,350));
  document.getElementById("performance-period")?.addEventListener("change",()=>setTimeout(apply,350));
  window.addEventListener("pageshow",()=>setTimeout(apply,900));
  setInterval(apply,60000);
})();
