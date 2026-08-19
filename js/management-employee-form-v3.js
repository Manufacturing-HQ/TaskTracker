"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib || !document.getElementById("view-overview")) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  let pendingEmployeeId = null;
  let employeeCache = [];
  let departments = ["Shipping","Build Line","Solid Keys","Quality Assurance","Inventory","System Testing","Director","CKE","Receiving"];

  async function rpc(name,args={}) {
    const { data, error } = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  document.addEventListener("click", (e) => {
    const edit = e.target.closest?.("[data-edit-employee]");
    if (edit) pendingEmployeeId = edit.dataset.editEmployee || null;
    if (e.target.closest?.("#ops-employee-new")) pendingEmployeeId = null;
  }, true);

  async function loadReferenceData() {
    const [setup,result] = await Promise.all([
      rpc("get_operations_master_options", { p_session_token:token() }),
      rpc("search_operations_employees", { p_session_token:token(), p_search_text:null, p_include_inactive:true, p_result_limit:500, p_result_offset:0 })
    ]);
    departments = [...new Set([...(setup?.departments || []), "CKE", "Receiving"])];
    employeeCache = result?.records || [];
  }

  function ensureDepartmentSelect(form,row) {
    const current = row?.department || form.querySelector("#oe-dept")?.value || "";
    let field = form.querySelector("#oe-dept");
    if (!field) return;
    const values = [...new Set([...departments, "CKE", "Receiving", ...(current ? [current] : [])])];
    if (field.tagName !== "SELECT") {
      const select = document.createElement("select");
      select.id = "oe-dept";
      select.required = true;
      field.replaceWith(select);
      field = select;
    }
    field.innerHTML = '<option value="">Select Department</option>' + values.map(v => `<option value="${String(v).replaceAll('"','&quot;')}">${v}</option>`).join("");
    field.value = current;
  }

  function ensureExempt(form,row) {
    let exempt = form.querySelector("#oe-exempt");
    if (!exempt) {
      const label = document.createElement("label");
      label.className = "full";
      label.innerHTML = '<input id="oe-exempt" type="checkbox" style="width:auto;min-height:auto"> Task Tracker Exempt <span style="display:block;color:#64748b;font-weight:500;margin-top:4px">Use for active employees who may appear in QA/manual work orders but are not expected to track tasks.</span>';
      const active = form.querySelector("#oe-active")?.closest("label");
      const actions = form.querySelector(".ops-actions");
      if (active) active.insertAdjacentElement("afterend", label);
      else actions?.insertAdjacentElement("beforebegin", label);
      exempt = form.querySelector("#oe-exempt");
    }
    if (exempt) exempt.checked = !!row?.task_tracker_exempt;
    return exempt;
  }

  function syncPin(form) {
    const pin = form.querySelector("#oe-pin");
    const exempt = !!form.querySelector("#oe-exempt")?.checked;
    if (!pin) return;
    pin.required = !pendingEmployeeId && !exempt;
  }

  async function enhance(form) {
    if (form.dataset.employeeFormV3 === "1") return;
    form.dataset.employeeFormV3 = "1";

    let row = null;
    try {
      await loadReferenceData();
      row = employeeCache.find(x => x.id === pendingEmployeeId) || null;
    } catch (err) {
      console.error("Employee form reference load failed", err);
    }

    ensureDepartmentSelect(form,row);
    const exempt = ensureExempt(form,row);
    exempt?.addEventListener("change", () => syncPin(form));
    syncPin(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const save = form.querySelector('button[type="submit"]');
      if (save) save.disabled = true;
      try {
        const employee = await rpc("save_operations_employee_v2", {
          p_session_token:token(),
          p_employee_id:pendingEmployeeId || null,
          p_employee_name:form.querySelector("#oe-name").value,
          p_department:form.querySelector("#oe-dept").value || null,
          p_supervisor_id:form.querySelector("#oe-supervisor").value || null,
          p_employee_role:form.querySelector("#oe-role").value,
          p_is_active:form.querySelector("#oe-active").checked,
          p_display_order:Number(form.querySelector("#oe-order").value || 0),
          p_hire_date:form.querySelector("#oe-hire").value || null,
          p_probation_end_date:form.querySelector("#oe-probation").value || null,
          p_task_tracker_exempt:!!form.querySelector("#oe-exempt")?.checked,
          p_new_pin:form.querySelector("#oe-pin").value || null
        });

        const qaView = form.querySelector("#oe-qa-view");
        const qaReview = form.querySelector("#oe-qa-review");
        if (qaView && qaReview && employee?.id) {
          await rpc("save_employee_qa_access", {
            p_session_token:token(),
            p_employee_id:employee.id,
            p_qa_view:qaView.checked,
            p_qa_review:qaReview.checked
          });
        }

        form.closest(".ops-modal-backdrop")?.remove();
        document.getElementById("ops-employee-refresh")?.click();
        pendingEmployeeId = null;
      } catch (err) {
        alert(err.message);
        if (save) save.disabled = false;
      }
    }, true);
  }

  const observer = new MutationObserver(() => {
    const form = document.getElementById("ops-employee-form");
    if (form && form.dataset.employeeFormV3 !== "1") enhance(form).catch(console.error);
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
