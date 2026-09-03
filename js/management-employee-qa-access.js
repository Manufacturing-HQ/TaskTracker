"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
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

  function permissionLabel(code) {
    const labels = {
      "task_tracker.use":"Use Task Tracker",
      "qa.view":"View QA",
      "qa.review":"Perform QA Reviews",
      "qa.correct_job_fields":"Correct Job Fields in QA",
      "qa.manage_training":"Manage QA Training",
      "live_dashboard.view":"View Live Dashboard",
      "employees.edit":"Edit Employees",
      "master_data.edit":"Edit Master Data",
      "time.correct":"Correct Time",
      "reporting.view":"View Reporting",
      "project_management.admin":"Administer Project Management"
    };
    return labels[code] || code;
  }

  function boolLabel(value) { return value ? "Allowed" : "Denied"; }

  async function enhanceModal(modal) {
    const form = modal.querySelector("#ops-employee-form");
    if (!form || form.dataset.phase1MasterEnhanced === "true") return;
    form.dataset.phase1MasterEnhanced = "true";

    let editor;
    try {
      editor = await rpc("get_employee_master_editor", {
        p_session_token:token(),
        p_employee_id:pendingEmployeeId||null
      });
    } catch (error) {
      alert(error.message || "Unable to load Employee Master settings.");
      modal.remove();
      return;
    }

    const employee = editor?.employee || null;
    const departments = editor?.departments || [];
    const teams = editor?.teams || [];
    const permissions = editor?.permissions || [];

    const department = modal.querySelector("#oe-dept");
    if (!department) return;
    department.innerHTML = '<option value="">Select Department</option>' + departments.map((d) =>
      `<option value="${esc(d.id)}" ${String(d.id)===String(employee?.department_id||"")?"selected":""}>${esc(d.department_name)}</option>`
    ).join("");

    const teamLabel = document.createElement("label");
    teamLabel.innerHTML = 'Team<select id="oe-team"><option value="">No Team Assigned</option></select>';
    department.closest("label")?.insertAdjacentElement("afterend",teamLabel);

    const classificationLabel = document.createElement("label");
    classificationLabel.innerHTML = 'Classification<input id="oe-classification" readonly value="">';
    teamLabel.insertAdjacentElement("afterend",classificationLabel);

    const activeLabel = modal.querySelector("#oe-active")?.closest("label");
    const exemptLabel = document.createElement("label");
    exemptLabel.className = "full";
    exemptLabel.innerHTML = `<input id="oe-exempt" type="checkbox" ${employee?.task_tracker_exempt?"checked":""}> Task Tracker Exempt`;
    activeLabel?.insertAdjacentElement("afterend",exemptLabel);

    const permissionBlock = document.createElement("div");
    permissionBlock.className = "full";
    permissionBlock.style.cssText = "border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc";
    permissionBlock.innerHTML = `<div style="font-weight:900;margin-bottom:4px">Platform Permissions</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:10px">Role and Department provide defaults. Choose Allow or Deny only when this employee needs an exception.</div>
      <div id="oe-permissions" style="display:grid;gap:8px"></div>`;
    exemptLabel.insertAdjacentElement("afterend",permissionBlock);

    const permissionHost = permissionBlock.querySelector("#oe-permissions");
    permissions.forEach((p) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:minmax(180px,1fr) minmax(170px,.75fr) minmax(150px,.65fr);gap:8px;align-items:center";
      const overrideValue = p.override === true ? "true" : p.override === false ? "false" : "";
      const effective = p.effective === null || p.effective === undefined ? "After save" : boolLabel(!!p.effective);
      const source = p.source && p.source !== "NONE" ? p.source : "Default";
      row.innerHTML = `<div><strong>${esc(permissionLabel(p.permission_code))}</strong><div style="font-size:10px;color:#64748b">${esc(p.permission_code)}</div></div>
        <select data-permission-code="${esc(p.permission_code)}">
          <option value="" ${overrideValue===""?"selected":""}>Use Default</option>
          <option value="true" ${overrideValue==="true"?"selected":""}>Allow</option>
          <option value="false" ${overrideValue==="false"?"selected":""}>Deny</option>
        </select>
        <div style="font-size:11px;color:#475569">${esc(effective)} · ${esc(source)}</div>`;
      permissionHost.appendChild(row);
    });

    function syncDepartment() {
      const departmentId = department.value;
      const selectedDepartment = departments.find((d) => String(d.id) === String(departmentId));
      const team = modal.querySelector("#oe-team");
      const previous = team.value || employee?.team_id || "";
      const available = teams.filter((t) => String(t.department_id) === String(departmentId));
      team.innerHTML = '<option value="">No Team Assigned</option>' + available.map((t) =>
        `<option value="${esc(t.id)}" ${String(t.id)===String(previous)?"selected":""}>${esc(t.team_name)}</option>`
      ).join("");
      modal.querySelector("#oe-classification").value = selectedDepartment?.classification_code || "";
    }
    department.addEventListener("change", syncDepartment);
    syncDepartment();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const save = form.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        const overrides = [...permissionHost.querySelectorAll("select[data-permission-code]")].map((select) => {
          const item = { permission_code:select.dataset.permissionCode };
          if (select.value === "true") item.is_granted = true;
          if (select.value === "false") item.is_granted = false;
          return item;
        });

        await rpc("save_operations_employee_v3", {
          p_session_token:token(),
          p_employee_id:pendingEmployeeId||null,
          p_employee_name:modal.querySelector("#oe-name").value,
          p_department_id:department.value,
          p_team_id:modal.querySelector("#oe-team").value||null,
          p_supervisor_id:modal.querySelector("#oe-supervisor").value||null,
          p_employee_role:modal.querySelector("#oe-role").value,
          p_is_active:modal.querySelector("#oe-active").checked,
          p_display_order:Number(modal.querySelector("#oe-order").value||0),
          p_hire_date:modal.querySelector("#oe-hire").value||null,
          p_probation_end_date:modal.querySelector("#oe-probation").value||null,
          p_task_tracker_exempt:modal.querySelector("#oe-exempt").checked,
          p_new_pin:modal.querySelector("#oe-pin").value||null,
          p_permission_overrides:overrides
        });
        modal.remove();
        document.getElementById("ops-employee-refresh")?.click();
      } catch (err) {
        alert(err.message || "Unable to save Employee Master changes.");
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