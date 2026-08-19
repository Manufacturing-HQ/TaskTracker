"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib || !document.getElementById("app") || !document.getElementById("refresh")) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  let itemTimer = null;
  let selectedItem = null;

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }

  function showMessage(text,type="info") {
    const el=document.getElementById("message");
    if(!el) return;
    el.textContent=text||""; el.dataset.type=type; el.hidden=!text;
  }

  function addStyles() {
    if(document.getElementById("qa-manual-entry-style")) return;
    const s=document.createElement("style"); s.id="qa-manual-entry-style";
    s.textContent=`
      .qa-manual-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:18px;z-index:100}
      .qa-manual-modal{width:min(820px,96vw);max-height:92vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}
      .qa-manual-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.qa-manual-grid .full{grid-column:1/-1}
      .qa-manual-grid label{font-size:12px;font-weight:800}.qa-manual-grid input,.qa-manual-grid select{width:100%;margin-top:5px;min-height:42px;border:1px solid #94a3b8;border-radius:9px;padding:8px 10px;background:#fff}
      .qa-manual-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.qa-manual-results{border:1px solid #cbd5e1;border-radius:9px;max-height:210px;overflow:auto;margin-top:6px}
      .qa-manual-result{display:block;width:100%;border:0;border-bottom:1px solid #e2e8f0;background:#fff;padding:9px;text-align:left}.qa-manual-result:hover{background:#f8fafc}
      .qa-manual-note{font-size:12px;color:#64748b;margin:0 0 14px}.qa-manual-badge{display:inline-block;background:#e0f2fe;color:#075985;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900}
      @media(max-width:720px){.qa-manual-grid{grid-template-columns:1fr}.qa-manual-grid .full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  async function searchItems(modal) {
    const q=modal.querySelector("#qm-item-search").value.trim();
    const box=modal.querySelector("#qm-item-results");
    if(!q){box.hidden=true; box.innerHTML=""; return;}
    try{
      const rows=await rpc("search_qa_items",{p_session_token:token(),p_search_text:q,p_result_limit:30});
      box.hidden=false;
      box.innerHTML=(rows||[]).map(r=>`<button class="qa-manual-result" type="button" data-id="${esc(r.item_id)}" data-name="${esc(r.item_name)}"><strong>${esc(r.item_name)}</strong><div class="muted">${esc(r.internal_id||"")}${r.make?` · ${esc(r.make)}`:""}</div></button>`).join("")||'<div class="muted" style="padding:9px">No items found.</div>';
      box.querySelectorAll("button").forEach(b=>b.onclick=()=>{
        selectedItem={item_id:b.dataset.id,item_name:b.dataset.name};
        modal.querySelector("#qm-item-search").value=selectedItem.item_name;
        modal.querySelector("#qm-item-selected").textContent=`Selected: ${selectedItem.item_name}`;
        box.hidden=true;
      });
    }catch(e){showMessage(e.message,"error");}
  }

  async function openManualEntry() {
    if(!token()){showMessage("Sign in before creating a manual QA entry.","error");return;}
    let options;
    try{options=await rpc("get_qa_manual_entry_options",{p_session_token:token()});}
    catch(e){showMessage(e.message,"error");return;}

    selectedItem=null;
    const d=document.createElement("div"); d.className="qa-manual-backdrop";
    d.innerHTML=`<div class="qa-manual-modal"><h2 style="margin-top:0">Manual Work Order</h2>
      <p class="qa-manual-note">For work completed outside Task Tracker. These entries go to QA normally but are excluded from productivity and efficiency.</p>
      <form id="qa-manual-form" class="qa-manual-grid">
        <label>Employee<select id="qm-employee" required><option value="">Select employee</option>${(options.employees||[]).map(e=>`<option value="${esc(e.employee_id)}">${esc(e.employee_name)}${e.department?` · ${esc(e.department)}`:""}${e.task_tracker_exempt?" · Task Tracker Exempt":""}</option>`).join("")}</select></label>
        <label>Task Type<select id="qm-task-type" required>${(options.task_types||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
        <label>Work Order Number<input id="qm-wo" required autocomplete="off"></label>
        <label>Work Order Type<select id="qm-wo-type" required>${(options.work_order_types||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
        <label>Job Type<select id="qm-job-type" required><option value="">Select job type</option>${(options.job_types||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>
        <label>Quantity<input id="qm-qty" type="number" min="0.01" step="0.01" required></label>
        <label class="full">Item<input id="qm-item-search" autocomplete="off" placeholder="Search item or Internal ID" required><div id="qm-item-selected" class="muted" style="margin-top:5px">No item selected.</div><div id="qm-item-results" class="qa-manual-results" hidden></div></label>
        <div class="full qa-manual-actions"><button type="button" class="secondary" id="qm-cancel">Cancel</button><button type="submit" class="primary">Create for QA</button></div>
      </form></div>`;
    document.body.appendChild(d);
    d.querySelector("#qm-cancel").onclick=()=>d.remove();
    d.querySelector("#qm-item-search").oninput=()=>{selectedItem=null;d.querySelector("#qm-item-selected").textContent="No item selected.";clearTimeout(itemTimer);itemTimer=setTimeout(()=>searchItems(d),250);};
    d.querySelector("#qa-manual-form").onsubmit=async(e)=>{
      e.preventDefault();
      if(!selectedItem){showMessage("Select an Item from the search results.","error");return;}
      const submit=e.submitter; if(submit) submit.disabled=true;
      try{
        const result=await rpc("create_qa_manual_job",{
          p_session_token:token(),p_employee_id:d.querySelector("#qm-employee").value,p_task_type:d.querySelector("#qm-task-type").value,
          p_item_id:selectedItem.item_id,p_work_order_number:d.querySelector("#qm-wo").value,p_work_order_type:d.querySelector("#qm-wo-type").value,
          p_job_type:d.querySelector("#qm-job-type").value,p_quantity:Number(d.querySelector("#qm-qty").value)
        });
        d.remove();
        showMessage(`Manual work order created as Job #${result?.job_number||""} and added to the QA queue.`,"success");
        document.getElementById("refresh")?.click();
      }catch(err){showMessage(err.message,"error"); if(submit) submit.disabled=false;}
    };
  }

  function init() {
    addStyles();
    const refresh=document.getElementById("refresh");
    if(!refresh || document.getElementById("qa-manual-entry")) return;
    const b=document.createElement("button"); b.id="qa-manual-entry"; b.type="button"; b.className="primary"; b.textContent="Manual Work Order";
    b.addEventListener("click",openManualEntry);
    refresh.insertAdjacentElement("beforebegin",b);
  }

  init();
})();
