"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const csv = window.TaskTrackerCsv;
  if (!config || !supabaseLib || !csv) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  let installed = false;
  let setup = null;

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function joinErrors(errors) {
    return (errors || []).map((e) => `${e.error_name || "Error"} x ${e.quantity ?? 0}`).join("; ");
  }

  async function fetchAllPages(name, baseArgs, recordKey) {
    const rows = [];
    let offset = 0;
    let total = null;
    while (total === null || offset < total) {
      const page = await rpc(name, { ...baseArgs, p_page_size: 100, p_page_offset: offset });
      const batch = page?.[recordKey] || [];
      total = Number(page?.total_count ?? batch.length);
      rows.push(...batch);
      if (!batch.length) break;
      offset += batch.length;
      if (rows.length >= 50000) throw new Error("The export exceeds 50,000 rows. Narrow the filters and try again.");
    }
    return rows;
  }

  async function exportEmployee(button) {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    const employeeId = $("employee-filter")?.value;
    const start = $("employee-start")?.value;
    const end = $("employee-end")?.value;
    if (!token || !employeeId || !start || !end) throw new Error("Select an employee and date range before exporting.");
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      const jobs = await fetchAllPages("get_employee_history_timeline_page", {
        p_session_token: token,
        p_employee_id: employeeId,
        p_start_date: start,
        p_end_date: end
      }, "jobs");
      const employeeLabel = $("employee-filter")?.selectedOptions?.[0]?.textContent?.trim() || "employee";
      const employeeName = employeeLabel.split(" · ")[0] || employeeLabel;
      const headers = ["Date","Employee","Task Type","Variable Field","Job Type","Work Order Number","Item","Quantity","Comments","Productivity %","Error Rate %","Errors","QA Comments","Tracked Duration Min","Within Job Gap Min","Next Task Gap Min"];
      const rows = jobs.map((job) => {
        const productive = job.task_type === "Productive";
        const actual = Number(job.actual_minutes);
        const expected = Number(job.expected_minutes);
        const productivity = productive && Number.isFinite(actual) && actual > 0 && Number.isFinite(expected) ? (expected / actual * 100).toFixed(2) : "";
        const errorRate = productive && job.qa?.reviewed_at ? job.qa.error_rate_percent : "";
        return [job.first_date,employeeName,job.task_type,productive ? job.item_name : job.non_productive_task,productive ? job.job_type : "",productive ? job.work_order_number : "",productive ? job.item_name : "",productive ? job.assigned_quantity : "",job.comments,productivity,errorRate,joinErrors(job.qa?.errors),job.qa?.qa_comments,job.actual_minutes,job.within_job_gap_minutes,job.between_job_gap_minutes];
      });
      csv.download(`employee-history-${start}-to-${end}-${csv.slug(employeeName)}.csv`, headers, rows);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function exportQa(button) {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    const start = $("qa-start")?.value;
    const end = $("qa-end")?.value;
    if (!token || !start || !end) throw new Error("Select a date range before exporting.");
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      const builderId = $("builder-filter")?.value || null;
      const qaId = $("qa-filter")?.value || null;
      const records = await fetchAllPages("get_qa_history_page", {
        p_session_token: token,
        p_start_date: start,
        p_end_date: end,
        p_builder_employee_id: builderId,
        p_qa_employee_id: qaId
      }, "records");
      const headers = ["Date","QA Employee","Builder","Job Type","Work Order Number","Item","Quantity","Passed","Rejected","Scrap","Quality Status","Error Qty","Errors","QA Comments","Builder In Training"];
      const rows = records.map((r) => [r.review_date,r.qa_rep,r.builder_name,r.job_type,r.work_order_number,r.item_name,r.assigned_quantity ?? r.quantity_reviewed,r.quantity_passed,r.quantity_rejected,r.scrap_quantity,r.quality_status,r.error_quantity,joinErrors(r.errors),r.qa_comments,r.builder_in_training ? "Yes" : "No"]);
      const builder = $("builder-filter")?.selectedOptions?.[0]?.textContent?.trim() || "all-builders";
      const qa = $("qa-filter")?.selectedOptions?.[0]?.textContent?.trim() || "all-qa";
      csv.download(`qa-history-${start}-to-${end}-${csv.slug(builder)}-${csv.slug(qa)}.csv`, headers, rows);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function addButton(afterId, id, label, handler) {
    const anchor = $(afterId);
    if (!anchor || $(id)) return;
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "ghost";
    button.textContent = label;
    button.addEventListener("click", () => handler(button).catch((error) => alert(error.message)));
    anchor.insertAdjacentElement("afterend", button);
  }

  async function install() {
    if (installed || !$("app") || $("app").hidden) return;
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    try {
      setup = await rpc("get_history_workspace_options", { p_session_token: token });
      if (!["Supervisor","Manager","Administrator"].includes(setup?.viewer?.role)) return;
      addButton("employee-load", "employee-export-csv", "Export CSV", exportEmployee);
      addButton("qa-load", "qa-history-export-csv", "Export CSV", exportQa);
      installed = true;
    } catch {}
  }

  new MutationObserver(() => install()).observe($("app"), { attributes: true, attributeFilter: ["hidden"] });
  setTimeout(install, 700);
})();
