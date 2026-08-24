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
  const inheritedQaRoles = new Set(["Supervisor","Manager","Administrator"]);
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
    if (!input || input.tagName === "SELECT") return;
    const selected = input.value || "";
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

    let qa = {qa_view:false,qa_review:false,qa_access_inherited:false};
    if (pendingEmployeeId) {
      try { qa = await rpc("get_employee_qa_access", {p_session_token:token(),p_employee_id:pendingEmployeeId}); }
      catch (e) { console.warn("Unable to load QA access", e); }
    }

    const explicitView = qa.qa_access_inherited ? false : !!qa.qa_view;
    const explicitReview = qa.qa_access_inherited ? false : !!qa.qa_review;
    const activeLabel = modal.querySelector("#oe-active")?.closest("label");
    const block = document.createElement("div");
    block.className = "full";
    block.style.cssText = "border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc";
    block.innerHTML = `<div style="font-weight:900;margin-bottom:4px">QA Access</div>
      <div id="oe-qa-note" style="font-size:11px;color:#64748b;margin-bottom:8px"></div>
      <label style="display:flex;gap:8px;align-items:center;margin:7px 0"><input id="oe-qa-view" type="checkbox" style="width:auto;min-height:auto" ${explicitView?"checked":""}> QA View</label>
      <label style="display:flex;gap:8px;align-items:center;margin:7px 0"><input id="oe-qa-review" type="checkbox" style="width:auto;min-height:auto" ${explicitReview?"checked":""}> QA Review</label>`;
    activeLabel?.insertAdjacentElement("afterend", block);

    const view = modal.querySelector("#oe-qa-view");
    const review = modal.querySelector("#oe-qa-review");
    const role = modal.querySelector("#oe-role");
    const note = modal.querySelector("#oe-qa-note");

    function syncRoleAccess() {
      const inherited = inheritedQaRoles.has(role?.value);
      if (inherited) {
        view.checked = true;
        review.checked = true;
        view.disabled = true;
        review.disabled = true;
        note.textContent = "Supervisors, Managers, and Administrators automatically have full QA access, including QA review.";
      } else {
        view.disabled = false;
        review.disabled = false;
        view.checked = explicitView;
        review.checked = explicitReview;
        note.textContent = "QA access for Employees is assigned explicitly and is not based on department.";
      }
    }

    review.addEventListener("change", () => { if (review.checked) view.checked = true; });
    view.addEventListener("change", () => { if (!view.checked) review.checked = false; });
    role?.addEventListener("change", syncRoleAccess);
    syncRoleAccess();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const save = form.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        const employee = await rpc("save_operations_employee", {
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