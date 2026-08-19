"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib||!document.getElementById("view-overview")) return;

  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const token=()=>sessionStorage.getItem(config.sessionStorageKey);
  let pendingEmployeeId=null;
  let employeeCache=[];
  let departments=[];

  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message||`${name} failed.`);return data;}

  document.addEventListener("click",(e)=>{
    const edit=e.target.closest?.("[data-edit-employee]");
    if(edit) pendingEmployeeId=edit.dataset.editEmployee||null;
    if(e.target.closest?.("#ops-employee-new")) pendingEmployeeId=null;
  },true);

  async function loadReferenceData(){
    if(!token()) return;
    const [setup,result]=await Promise.all([
      rpc("get_operations_master_options",{p_session_token:token()}),
      rpc("search_operations_employees",{p_session_token:token(),p_search_text:null,p_include_inactive:true,p_result_limit:500,p_result_offset:0})
    ]);
    departments=[...new Set([...(setup?.departments||[]),"CKE","Receiving"])];
    employeeCache=result?.records||[];
  }

  function replaceDepartmentInput(form,current){
    const old=form.querySelector("#oe-dept");
    if(!old) return;
    const values=[...new Set([...departments,"CKE","Receiving"])];
    if(current&&!values.includes(current)) values.push(current);
    if(old.tagName==="SELECT"){
      const existing=new Set([...old.options].map(o=>o.value));
      values.forEach(value=>{
        if(!existing.has(value)){
          const option=document.createElement("option");
          option.value=value;
          option.textContent=value;
          old.appendChild(option);
        }
      });
      old.value=current||"";
      return;
    }
    const select=document.createElement("select"); select.id="oe-dept";
    select.innerHTML='<option value="">Select department</option>'+values.map(x=>`<option value="${String(x).replaceAll('"','&quot;')}">${x}</option>`).join("");
    select.value=current||""; old.replaceWith(select);
  }

  function syncPinRequirement(form,isNew){
    const exempt=form.querySelector("#oe-exempt")?.checked;
    const pin=form.querySelector("#oe-pin"); if(!pin) return;
    pin.required=!!(isNew&&!exempt);
    const label=pin.closest("label");
    if(label){
      const text=isNew?(exempt?"PIN (not required for exempt employees)":"PIN"):(exempt?"PIN (not used while exempt)":"PIN (leave blank to keep existing)");
      label.childNodes[0].nodeValue=text;
    }
  }

  function ensureExemptControl(form){
    let exempt=form.querySelector("#oe-exempt");
    if(exempt) return exempt;
    const active=form.querySelector("#oe-active")?.closest("label");
    const label=document.createElement("label"); label.className="full";
    label.innerHTML='<input id="oe-exempt" type="checkbox"> Task Tracker Exempt <span style="display:block;color:#64748b;font-weight:500;margin-top:4px">Use for active employees who may appear in QA/manual work orders but are not expected to track tasks.</span>';
    (active||form.querySelector(".ops-actions"))?.insertAdjacentElement("afterend",label);
    exempt=form.querySelector("#oe-exempt");
    exempt?.addEventListener("change",()=>syncPinRequirement(form,!pendingEmployeeId));
    return exempt;
  }

  async function enhanceForm(form){
    if(form.dataset.exemptEnhanced) return;
    form.dataset.exemptEnhanced="1";

    // Render the control immediately so Edit Employee never waits on reference-data RPCs.
    const exempt=ensureExemptControl(form);
    syncPinRequirement(form,!pendingEmployeeId);

    try{await loadReferenceData();}catch(e){console.error(e);departments=["CKE","Receiving"];}
    const row=employeeCache.find(x=>x.id===pendingEmployeeId)||null;
    replaceDepartmentInput(form,row?.department||form.querySelector("#oe-dept")?.value||"");
    if(exempt){
      exempt.checked=!!row?.task_tracker_exempt;
      syncPinRequirement(form,!pendingEmployeeId);
    }

    form.addEventListener("submit",async(e)=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const submit=form.querySelector('button[type="submit"]'); if(submit) submit.disabled=true;
      try{
        await rpc("save_operations_employee_v2",{
          p_session_token:token(),p_employee_id:pendingEmployeeId||null,p_employee_name:form.querySelector("#oe-name").value,
          p_department:form.querySelector("#oe-dept").value||null,p_supervisor_id:form.querySelector("#oe-supervisor").value||null,
          p_employee_role:form.querySelector("#oe-role").value,p_is_active:form.querySelector("#oe-active").checked,
          p_display_order:Number(form.querySelector("#oe-order").value||0),p_hire_date:form.querySelector("#oe-hire").value||null,
          p_probation_end_date:form.querySelector("#oe-probation").value||null,p_task_tracker_exempt:!!form.querySelector("#oe-exempt")?.checked,
          p_new_pin:form.querySelector("#oe-pin").value||null
        });
        form.closest(".ops-modal-backdrop")?.remove();
        document.getElementById("ops-employee-refresh")?.click();
        pendingEmployeeId=null;
      }catch(err){alert(err.message); if(submit) submit.disabled=false;}
    },true);
  }

  const observer=new MutationObserver(()=>{
    const form=document.getElementById("ops-employee-form"); if(form&&!form.dataset.exemptEnhanced) enhanceForm(form);
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
