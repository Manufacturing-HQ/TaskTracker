"use strict";

/**
 * Authoritative Phase 1 Employee Master editor.
 *
 * This module owns Employee create/edit actions in Management Operations.
 * Tables may render [data-edit-employee] buttons, but no other module should
 * create or save an Employee modal.
 */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const esc = (v) => String(v ?? "").replace(/[&<>'\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  let editorOpening = false;

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

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
      "change_log.view":"View Change Log",
      "project_management.admin":"Administer Project Management"
    };
    return labels[code] || code;
  }

  const boolLabel = (value) => value ? "Allowed" : "Denied";

  function buildModal(title,body) {
    document.querySelector(".ops-modal-backdrop[data-phase1-employee-editor='1']")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "ops-modal-backdrop";
    backdrop.dataset.phase1EmployeeEditor = "1";
    backdrop.innerHTML = `<div class="ops-modal"><h2 style="margin-top:0">${esc(title)}</h2>${body}</div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function supervisorOptions(rows,selected) {
    return '<option value="">None</option>' + (rows || []).map((r) =>
      `<option value="${esc(r.id)}" ${String(r.id)===String(selected || "") ? "selected" : ""}>${esc(r.employee_name)} · ${esc(r.role)}</option>`
    ).join("");
  }

  function roleOptions(rows,selected) {
    return (rows || []).map((role) =>
      `<option value="${esc(role)}" ${String(role)===String(selected || "Employee") ? "selected" : ""}>${esc(role)}</option>`
    ).join("");
  }

  async function openEmployeeEditor(employeeId) {
    if (editorOpening) return;
    const sessionToken = token();
    if (!sessionToken) return;
    editorOpening = true;

    try {
      const [editor,setup] = await Promise.all([
        rpc("get_employee_master_editor", {
          p_session_token:sessionToken,
          p_employee_id:employeeId || null
        }),
        rpc("get_operations_master_options", {
          p_session_token:sessionToken
        })
      ]);

      if (!setup?.viewer?.can_edit_employees) {
        throw new Error("You do not have permission to edit employees.");
      }

      const employee = editor?.employee || null;
      const departments = editor?.departments || [];
      const teams = editor?.teams || [];
      const permissions = editor?.permissions || [];
      const roles = setup?.roles || ["Employee","Supervisor","Manager","Administrator"];
      const supervisors = setup?.supervisors || [];

      const modal = buildModal(employee ? "Edit Employee" : "New Employee", `
        <form id="ops-employee-form" class="ops-form-grid" data-phase1-master-editor="1">
          <label>Employee Name<input id="oe-name" required value="${esc(employee?.employee_name || "")}"></label>
          <label>Department<select id="oe-dept" required><option value="">Select Department</option>${departments.map((d) => `<option value="${esc(d.id)}" ${String(d.id)===String(employee?.department_id || "") ? "selected" : ""}>${esc(d.department_name)}</option>`).join("")}</select></label>
          <label>Team<select id="oe-team"><option value="">No Team Assigned</option></select></label>
          <label>Classification<input id="oe-classification" readonly value=""></label>
          <label>Role<select id="oe-role">${roleOptions(roles,employee?.role || "Employee")}</select></label>
          <label>Supervisor<select id="oe-supervisor">${supervisorOptions(supervisors,employee?.supervisor_id)}</select></label>
          <label>Hire Date<input id="oe-hire" type="date" value="${esc(employee?.hire_date || "")}"></label>
          <label>Probation End Date<input id="oe-probation" type="date" value="${esc(employee?.probation_end_date || "")}"></label>
          <label>Display Order<input id="oe-order" type="number" min="0" value="${esc(employee?.display_order ?? 0)}"></label>
          <label>PIN ${employee ? "(leave blank to keep existing)" : ""}<input id="oe-pin" type="password" inputmode="numeric" ${employee ? "" : "required"}></label>
          <label class="full"><input id="oe-active" type="checkbox" ${employee?.is_active === false ? "" : "checked"}> Active</label>
          <label class="full"><input id="oe-exempt" type="checkbox" style="width:auto;min-height:auto" ${employee?.task_tracker_exempt ? "checked" : ""}> Task Tracker Exempt <span style="display:block;color:#64748b;font-weight:500;margin-top:4px">Use for active employees who may appear in QA/manual work orders but are not expected to track tasks.</span></label>
          <div class="full" id="oe-permission-block" style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc">
            <div style="font-weight:900;margin-bottom:4px">Platform Permissions</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:10px">Role and Department provide defaults. Choose Allow or Deny only when this employee needs an exception.</div>
            <div id="oe-permissions" style="display:grid;gap:8px"></div>
          </div>
          <div class="full ops-actions"><button type="button" class="ghost" id="oe-cancel">Cancel</button><button type="submit" class="primary">Save</button></div>
        </form>`);

      const form = modal.querySelector("#ops-employee-form");
      const department = modal.querySelector("#oe-dept");
      const team = modal.querySelector("#oe-team");
      const classification = modal.querySelector("#oe-classification");
      const exempt = modal.querySelector("#oe-exempt");
      const pin = modal.querySelector("#oe-pin");
      const permissionHost = modal.querySelector("#oe-permissions");

      permissions.forEach((p) => {
        const row = document.createElement("div");
        row.style.cssText = "display:grid;grid-template-columns:minmax(180px,1fr) minmax(170px,.75fr) minmax(150px,.65fr);gap:8px;align-items:center";
        const overrideValue = p.override === true ? "true" : p.override === false ? "false" : "";
        const effective = p.effective === null || p.effective === undefined ? "After save" : boolLabel(!!p.effective);
        const source = p.source && p.source !== "NONE" ? p.source : "Default";
        row.innerHTML = `<div><strong>${esc(permissionLabel(p.permission_code))}</strong><div style="font-size:10px;color:#64748b">${esc(p.permission_code)}</div></div>
          <select data-permission-code="${esc(p.permission_code)}">
            <option value="" ${overrideValue === "" ? "selected" : ""}>Use Default</option>
            <option value="true" ${overrideValue === "true" ? "selected" : ""}>Allow</option>
            <option value="false" ${overrideValue === "false" ? "selected" : ""}>Deny</option>
          </select>
          <div style="font-size:11px;color:#475569">${esc(effective)} · ${esc(source)}</div>`;
        permissionHost.appendChild(row);
      });

      function syncDepartment() {
        const departmentId = department.value;
        const selectedDepartment = departments.find((d) => String(d.id) === String(departmentId));
        const previousTeam = team.value || employee?.team_id || "";
        const availableTeams = teams.filter((t) => String(t.department_id) === String(departmentId));
        team.innerHTML = '<option value="">No Team Assigned</option>' + availableTeams.map((t) =>
          `<option value="${esc(t.id)}" ${String(t.id)===String(previousTeam) ? "selected" : ""}>${esc(t.team_name)}</option>`
        ).join("");
        classification.value = selectedDepartment?.classification_code || "";
      }

      function syncPinRequirement() {
        if (!employee) pin.required = !exempt.checked;
      }

      department.addEventListener("change",syncDepartment);
      exempt.addEventListener("change",syncPinRequirement);
      syncDepartment();
      syncPinRequirement();

      modal.querySelector("#oe-cancel").addEventListener("click", () => modal.remove());

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const save = form.querySelector('button[type="submit"]');
        save.disabled = true;
        try {
          const overrides = [...permissionHost.querySelectorAll("select[data-permission-code]")].map((select) => {
            const item = {permission_code:select.dataset.permissionCode};
            if (select.value === "true") item.is_granted = true;
            if (select.value === "false") item.is_granted = false;
            return item;
          });

          await rpc("save_operations_employee_v3", {
            p_session_token:token(),
            p_employee_id:employee?.id || null,
            p_employee_name:modal.querySelector("#oe-name").value.trim(),
            p_department_id:department.value,
            p_team_id:team.value || null,
            p_supervisor_id:modal.querySelector("#oe-supervisor").value || null,
            p_employee_role:modal.querySelector("#oe-role").value,
            p_is_active:modal.querySelector("#oe-active").checked,
            p_display_order:Number(modal.querySelector("#oe-order").value || 0),
            p_hire_date:modal.querySelector("#oe-hire").value || null,
            p_probation_end_date:modal.querySelector("#oe-probation").value || null,
            p_task_tracker_exempt:exempt.checked,
            p_new_pin:pin.value || null,
            p_permission_overrides:overrides
          });

          modal.remove();
          document.getElementById("ops-employee-refresh")?.click();
        } catch (error) {
          alert(error.message || "Unable to save Employee Master changes.");
          save.disabled = false;
        }
      });
    } catch (error) {
      alert(error.message || "Unable to open Employee Master editor.");
    } finally {
      editorOpening = false;
    }
  }

  document.addEventListener("click", (event) => {
    const edit = event.target.closest?.("[data-edit-employee]");
    if (edit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEmployeeEditor(edit.dataset.editEmployee || null);
      return;
    }

    const create = event.target.closest?.("#ops-employee-new");
    if (create) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEmployeeEditor(null);
    }
  }, true);

  window.TaskTrackerEmployeeMaster = Object.assign(window.TaskTrackerEmployeeMaster || {}, {
    openEditor:openEmployeeEditor
  });
})();
