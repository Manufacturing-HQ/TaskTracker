"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const departments = ["Shipping","Build Line","Solid Keys","Quality Assurance","Inventory","System Testing","Director","CKE","Receiving"];
  let pendingEmployeeId = null;

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||`${name} failed.`);
    return data;
  }

  document.addEventListener("click", (e) => {
    const edit = e.target.closest?.("[data-edit-employee]");
    if (edit) pendingEmployeeId = edit.dataset.editEmployee || null;
    if (e.target.closest?.("#ops-employee-new")) pendingEmployeeId = null;
  }, true);

  function replaceDepartmentInput(modal) {
    const input = modal.querySelector("#oe-dept");
    if (!input) return;
    const selected = input.value || "";
    if (input.tagName === "SELECT") {
      const existing = new Set([...input.options].map(o => o.value));
      departments.forEach(d => {
        if (!existing.has(d)) {
          const option = document.createElement("option");
          option.value = d;
          option.textContent = d;
          input.appendChild(option);
        }
      });
      input.value = selected;
      input.required = true;
      return;
    }
    const select = document.createElement("select");
    select.id = "oe-dept";
    select.required = true;
    select.innerHTML = '<option value="">Select Department</option>' + departments.map(d => `<option value="${d}" ${d===selected?"selected":""}>${d}</option>`).join("");
    input.replaceWith(select);
  }

  async function enhanceModal(modal) {
    const form = modal.querySelector("#ops-employee-form");
    if (!form || form.dataset.qaEnhanced === "true") return;
    form.dataset.qaEnhanced = "true";
    replaceDepartmentInput(modal);

    let qa = {qa_view:false,qa_review:false};
    if (pendingEmployeeId) {
      try { qa = await rpc("get_employee_qa_access", {p_session_token:token(),p_employee_id:pendingEmployeeId}); }
      catch (e) { console.warn("Unable to load QA access", e); }
    }

    const activeLabel = modal.querySelector("#oe-active")?.closest("label");
    const block = document.createElement("div");
    block.className = "full";
    block.style.cssText = "border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc";
    block.innerHTML = `<div style="font-weight:900;margin-bottom:4px">QA Access</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">Department does not grant QA access. Permissions must be assigned explicitly.</div>
      <label style="display:flex;gap:8px;align-items:center;margin:7px 0"><input id="oe-qa-view" type="checkbox" style="width:auto;min-height:auto" ${qa.qa_view?"checked":""}> QA View</label>
      <label style="display:flex;gap:8px;align-items:center;margin:7px 0"><input id="oe-qa-review" type="checkbox" style="width:auto;min-height:auto" ${qa.qa_review?"checked":""}> QA Review</label>`;
    activeLabel?.insertAdjacentElement("afterend", block);

    const view = modal.querySelector("#oe-qa-view");
    const review = modal.querySelector("#oe-qa-review");
    review.addEventListener("change", () => { if (review.checked) view.checked = true; });
    view.addEventListener("change", () => { if (!view.checked) review.checked = false; });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const save = form.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        const employee = await rpc("save_operations_employee_v2", {
          p_session_token:token(),
          p_employee_id:pendingEmployeeId||null,
          p_employee_name:modal.querySelector("#oe-name").value,
          p_department:modal.querySelector("#oe-dept").value,
          p_supervisor_id:modal.querySelector("#oe-supervisor").value||null,
          p_employee_role:modal.querySelector("#oe-role").value,
          p_is_active:modal.querySelector("#oe-active").checked,
          p_display_order:Number(modal.querySelector("#oe-order").value||0),
          p_hire_date:modal.querySelector("#oe-hire").value||null,
          p_probation_end_date:modal.querySelector("#oe-probation").value||null,
          p_task_tracker_exempt:!!modal.querySelector("#oe-exempt")?.checked,
          p_new_pin:modal.querySelector("#oe-pin").value||null
        });
        await rpc("save_employee_qa_access", {
          p_session_token:token(),
          p_employee_id:employee.id,
          p_qa_view:view.checked,
          p_qa_review:review.checked
        });
        modal.remove();
        document.getElementById("ops-employee-refresh")?.click();
      } catch (err) {
        alert(err.message);
        save.disabled = false;
      }
    };
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const modal = node.matches?.(".ops-modal-backdrop") ? node : node.querySelector?.(".ops-modal-backdrop");
        if (modal?.querySelector("#ops-employee-form")) enhanceModal(modal).catch(console.error);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
