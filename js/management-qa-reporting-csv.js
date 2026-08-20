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

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  async function currentData() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    const start = $("qa-report-start")?.value;
    const end = $("qa-report-end")?.value;
    if (!token || !start || !end) throw new Error("Select a valid QA Reporting date range before exporting.");
    return {
      start,
      end,
      qaLabel: $("qa-report-rep")?.selectedOptions?.[0]?.textContent?.trim() || "all-qa-employees",
      data: await rpc("get_qa_reporting", {
        p_session_token: token,
        p_start_date: start,
        p_end_date: end,
        p_qa_employee_id: $("qa-report-rep")?.value || null
      })
    };
  }

  async function exportByEmployee(button) {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      const { start, end, qaLabel, data } = await currentData();
      const headers = ["QA Employee","Jobs","Pieces Reviewed","Errors","Error Rate %","Scrap","Rework Returned"];
      const rows = (data?.by_employee || []).map((r) => [r.qa_rep,r.total_jobs,r.total_pieces_reviewed,r.total_errors,r.error_rate_percent,r.scrap_pieces,r.rework_returned]);
      csv.download(`qa-report-by-employee-${start}-to-${end}-${csv.slug(qaLabel)}.csv`, headers, rows);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function exportByDate(button) {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Exporting...";
    try {
      const { start, end, qaLabel, data } = await currentData();
      const headers = ["Date","Jobs","Pieces Reviewed","Errors","Error Rate %"];
      const rows = (data?.by_date || []).map((r) => [r.review_date,r.total_jobs,r.total_pieces_reviewed,r.total_errors,r.error_rate_percent]);
      csv.download(`qa-report-by-date-${start}-to-${end}-${csv.slug(qaLabel)}.csv`, headers, rows);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function makeButton(id, label, handler) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "secondary";
    button.textContent = label;
    button.addEventListener("click", () => handler(button).catch((error) => alert(error.message)));
    return button;
  }

  async function install() {
    if (installed || !$("qa-report-load") || !$("app") || $("app").hidden) return;
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    try {
      const options = await rpc("get_qa_reporting_options", { p_session_token: token });
      if (!options?.viewer?.can_export) return;
      const toolbar = $("qa-report-load").closest(".qa-report-toolbar");
      const emp = makeButton("qa-report-export-employee", "Export By QA Employee CSV", exportByEmployee);
      const date = makeButton("qa-report-export-date", "Export By Date CSV", exportByDate);
      if (toolbar) toolbar.append(emp, date);
      else {
        $("qa-report-load").insertAdjacentElement("afterend", emp);
        emp.insertAdjacentElement("afterend", date);
      }
      installed = true;
    } catch {}
  }

  new MutationObserver(() => install()).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  setTimeout(install, 900);
})();
