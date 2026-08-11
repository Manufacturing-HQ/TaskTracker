"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const queueView = document.getElementById("view-queue");
  const queueList = document.getElementById("queue-list");
  if (!config || !supabaseLib || !queueView || !queueList) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  let setup=null;

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  const style=document.createElement("style");
  style.textContent=`
    .sup-assign{border:2px solid #94a3b8;border-radius:14px;background:#fff;padding:16px;margin-bottom:16px}.sup-assign h3{margin:0 0 4px}.sup-assign-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sup-assign-grid .full{grid-column:1/-1}.sup-assign-grid label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.sup-assign-grid input,.sup-assign-grid select,.sup-assign-grid textarea{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px;background:#fff}.sup-assign-grid textarea{min-height:90px;resize:vertical}.sup-assign-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.sup-assign-msg{margin-top:10px;padding:9px 10px;border-radius:9px;background:#e2e8f0}.sup-assign-msg.ok{background:#dcfce7;color:#166534}.sup-assign-msg.err{background:#fee2e2;color:#991b1b}@media(max-width:800px){.sup-assign-grid{grid-template-columns:1fr}.sup-assign-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const panel=document.createElement("div");
  panel.id="supervisor-task-assignment";
  panel.className="sup-assign";
  panel.hidden=true;
  panel.innerHTML=`
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><div><h3>Assign Supervisor Task</h3><div style="font-size:12px;color:#64748b">Manager/Admin manual assignments only.</div></div></div>
    <form id="sup-assign-form">
      <div class="sup-assign-grid">
        <div><label>Supervisor</label><select id="sat-supervisor" required></select></div>
        <div><label>Task Type</label><select id="sat-type" required></select></div>
        <div><label>Related Employee (optional)</label><select id="sat-employee"></select></div>
        <div><label>Priority</label><select id="sat-priority"></select></div>
        <div><label>Due Date (optional)</label><input id="sat-due" type="date"></div>
        <div class="full"><label>Title</label><input id="sat-title" maxlength="180" required></div>
        <div class="full"><label>Details</label><textarea id="sat-details" placeholder="Instructions or context"></textarea></div>
      </div>
      <div class="sup-assign-actions"><button type="submit" class="primary">Assign Task</button></div>
      <div id="sat-message" class="sup-assign-msg" hidden></div>
    </form>`;
  queueList.parentElement.insertBefore(panel,queueList);

  function setMsg(text,type=""){
    const el=document.getElementById("sat-message");el.textContent=text||"";el.className=`sup-assign-msg ${type}`;el.hidden=!text;
  }

  async function loadSetup(){
    try{
      setup=await rpc("get_supervisor_task_assignment_options",{p_session_token:token()});
      panel.hidden=false;
      document.getElementById("sat-supervisor").innerHTML='<option value="">Select supervisor</option>'+ (setup.supervisors||[]).map(x=>`<option value="${esc(x.employee_id)}">${esc([x.employee_name,x.department].filter(Boolean).join(" · "))}</option>`).join("");
      document.getElementById("sat-type").innerHTML='<option value="">Select task type</option>'+ (setup.task_types||[]).map(x=>`<option value="${esc(x.task_type_code)}">${esc(x.task_type_name)}</option>`).join("");
      document.getElementById("sat-employee").innerHTML='<option value="">No related employee</option>'+ (setup.employees||[]).map(x=>`<option value="${esc(x.employee_id)}">${esc([x.employee_name,x.department].filter(Boolean).join(" · "))}</option>`).join("");
      document.getElementById("sat-priority").innerHTML=(setup.priorities||["Low","Normal","High","Urgent"]).map(x=>`<option ${x==="Normal"?"selected":""}>${esc(x)}</option>`).join("");
    }catch{
      panel.hidden=true;
    }
  }

  async function submit(e){
    e.preventDefault();setMsg("Assigning task...");
    try{
      const result=await rpc("create_supervisor_task",{
        p_session_token:token(),
        p_assigned_supervisor_id:document.getElementById("sat-supervisor").value,
        p_task_type_code:document.getElementById("sat-type").value,
        p_title:document.getElementById("sat-title").value.trim(),
        p_details:document.getElementById("sat-details").value.trim()||null,
        p_employee_id:document.getElementById("sat-employee").value||null,
        p_business_date:null,
        p_due_date:document.getElementById("sat-due").value||null,
        p_priority:document.getElementById("sat-priority").value
      });
      setMsg(`Assigned to ${result.assigned_supervisor_name}.`,`ok`);
      document.getElementById("sat-title").value="";
      document.getElementById("sat-details").value="";
      document.getElementById("sat-employee").value="";
      document.getElementById("sat-due").value="";
      document.getElementById("sat-priority").value="Normal";
      document.getElementById("include-completed")?.dispatchEvent(new Event("change"));
      document.querySelector('button[data-view="queue"]')?.click();
    }catch(err){setMsg(err.message,"err");}
  }

  document.getElementById("sup-assign-form").addEventListener("submit",submit);
  document.querySelector('button[data-view="queue"]')?.addEventListener("click",()=>setTimeout(loadSetup,0));
  setTimeout(loadSetup,700);
})();
