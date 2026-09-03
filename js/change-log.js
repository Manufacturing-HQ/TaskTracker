"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const REPORTING_TIME_ZONE = "America/New_York";
  const PAGE_SIZE = 100;
  const TIME_FIELDS = new Set([
    "started_at","session_started_at","ended_at","session_ended_at","resume_at",
    "scheduled_end_at","completed_at","voided_at"
  ]);

  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let setup = null;
  let pageOffset = 0;
  let totalCount = 0;
  let loading = false;

  function setMessage(message, type="info") {
    const el = $("message");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function easternDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: REPORTING_TIME_ZONE,
      year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type,part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function shiftDate(dateText, days) {
    const d = new Date(`${dateText}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  }

  function setDefaultDates() {
    const today = easternDateString();
    $("end-date").value = today;
    $("start-date").value = shiftDate(today,-6);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: REPORTING_TIME_ZONE,
      month:"short",day:"numeric",year:"numeric",
      hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true
    }).format(d) + " ET";
  }

  function formatFieldValue(fieldKey,value) {
    if (value === null || value === undefined || value === "") return "—";
    if (TIME_FIELDS.has(fieldKey)) return formatDateTime(value);
    return String(value);
  }

  function fillSelect(id, rows, valueKey, labelBuilder, firstLabel) {
    const select = $(id);
    select.innerHTML = `<option value="">${esc(firstLabel)}</option>`;
    (rows || []).forEach((row) => {
      const value = typeof row === "string" ? row : row?.[valueKey];
      if (value === null || value === undefined || value === "") return;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = typeof labelBuilder === "function" ? labelBuilder(row) : String(value);
      select.appendChild(option);
    });
  }

  async function listLoginEmployees() {
    const rows = await rpc("list_login_employees");
    const select = $("employee");
    select.innerHTML = '<option value="">Select employee</option>';
    (rows || []).forEach((row) => {
      const option = document.createElement("option");
      option.value = row.employee_id;
      option.textContent = row.employee_name;
      select.appendChild(option);
    });
  }

  async function restoreSession() {
    if (!sessionToken) return false;
    try {
      const rows = await rpc("get_employee_session_context", {p_session_token:sessionToken});
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return false;
      sessionEmployee = row;
      return true;
    } catch {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      return false;
    }
  }

  async function login(event) {
    event.preventDefault();
    setMessage("Signing in...");
    const rows = await rpc("login_with_employee_pin", {
      p_employee_id:$("employee").value,
      p_pin:$("pin").value
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.login_successful || !row.session_token) {
      setMessage(row?.login_message || "Login failed.","error");
      return;
    }
    sessionToken = row.session_token;
    sessionStorage.setItem(sessionKey,sessionToken);
    sessionEmployee = row;
    $("pin").value = "";
    await enterApp();
  }

  async function loadOptions() {
    setup = await rpc("get_task_change_log_options", {p_session_token:sessionToken});
    $("viewer-meta").textContent = [setup?.viewer?.role,setup?.viewer?.department].filter(Boolean).join(" · ");

    fillSelect("affected-employee",setup?.employees,"employee_id",
      (r) => [r.employee_name,r.department].filter(Boolean).join(" · "),"All employees");
    fillSelect("changed-by",setup?.actors,"employee_id",
      (r) => r.employee_name,"All editors");
    fillSelect("department",setup?.departments,"department_id",
      (r) => r.department,"All departments");
    fillSelect("change-type",setup?.change_types,null,
      (r) => String(r),"All change types");
    fillSelect("field-changed",setup?.fields,"field_key",
      (r) => r.field_label,"All changed fields");
    fillSelect("module",setup?.modules,"module_code",
      (r) => r.module_name,"All modules");
  }

  function contextText(row) {
    const parts = [];
    if (row.work_order_number) parts.push(`WO ${row.work_order_number}`);
    if (row.item_name) parts.push(row.item_name);
    else if (row.non_productive_task) parts.push(row.non_productive_task);
    if (row.task_type) parts.push(row.task_type);
    if (row.job_type) parts.push(row.job_type);
    return parts.join(" · ") || "—";
  }

  function renderRows(rows) {
    const table = $("table");
    $("row-count").textContent = `${totalCount.toLocaleString()} field change${totalCount===1?"":"s"}`;

    if (!rows.length) {
      table.innerHTML = '<div class="empty">No captured task changes matched these filters.</div>';
      renderPager(rows.length);
      return;
    }

    const body = rows.map((row) => `
      <tr>
        <td>${esc(formatDateTime(row.changed_at))}</td>
        <td><strong>${esc(row.affected_employee_name || "—")}</strong></td>
        <td>${esc(row.department || "—")}</td>
        <td>${esc(row.changed_by_name || "—")}</td>
        <td><span class="pill">${esc(row.change_type || "Change")}</span></td>
        <td class="record-cell"><strong>${esc(row.record_display || row.record_type || "—")}</strong>${row.job_number ? `<div class="muted">Job #${esc(row.job_number)}</div>` : ""}</td>
        <td class="context-cell">${esc(contextText(row))}</td>
        <td><strong>${esc(row.field_label || row.field_key || "—")}</strong></td>
        <td class="value-cell">${esc(formatFieldValue(row.field_key,row.previous_value))}</td>
        <td class="value-cell">${esc(formatFieldValue(row.field_key,row.new_value))}</td>
        <td class="reason-cell">${esc(row.reason || "—")}</td>
      </tr>`).join("");

    table.innerHTML = `<table><thead><tr>
      <th>Changed At</th><th>Employee Affected</th><th>Department</th><th>Changed By</th><th>Type</th>
      <th>Record</th><th>Task Context</th><th>Field Changed</th><th>Previous Value</th><th>New Value</th><th>Reason</th>
    </tr></thead><tbody>${body}</tbody></table>`;
    renderPager(rows.length);
  }

  function renderPager(rowsOnPage) {
    const start = totalCount ? pageOffset+1 : 0;
    const end = totalCount ? Math.min(pageOffset+rowsOnPage,totalCount) : 0;
    $("page-info").textContent = totalCount ? `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${totalCount.toLocaleString()}` : "0 results";
    $("previous-page").disabled = loading || pageOffset<=0;
    $("next-page").disabled = loading || pageOffset+PAGE_SIZE>=totalCount;
  }

  function reportArgs() {
    return {
      p_session_token:sessionToken,
      p_start_date:$("start-date").value,
      p_end_date:$("end-date").value,
      p_affected_employee_id:$("affected-employee").value || null,
      p_actor_employee_id:$("changed-by").value || null,
      p_department_id:$("department").value || null,
      p_change_type:$("change-type").value || null,
      p_field_key:$("field-changed").value || null,
      p_module_code:$("module").value || null,
      p_search_text:$("search-text").value.trim() || null,
      p_page_size:PAGE_SIZE,
      p_page_offset:pageOffset
    };
  }

  async function loadReport(resetPage=false) {
    if (loading) return;
    if (resetPage) pageOffset = 0;

    const start = $("start-date").value;
    const end = $("end-date").value;
    if (!start || !end || start>end) {
      setMessage("Select a valid Change Log date range.","error");
      return;
    }

    loading = true;
    $("run-report").disabled = true;
    $("run-report").textContent = "Loading...";
    renderPager(0);
    setMessage("Loading captured task changes...");

    try {
      const result = await rpc("get_task_change_log",reportArgs());
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      totalCount = Number(result?.total_count || 0);
      renderRows(rows);
      setMessage(totalCount ? "Change Log loaded." : "No captured task changes matched these filters.",totalCount ? "success" : "info");
    } catch (error) {
      totalCount = 0;
      $("table").innerHTML = '<div class="empty">Unable to load Change Log reporting.</div>';
      renderPager(0);
      setMessage(error.message || "Unable to load Change Log reporting.","error");
    } finally {
      loading = false;
      $("run-report").disabled = false;
      $("run-report").textContent = "Run Report";
      renderPager(Math.min(PAGE_SIZE,Math.max(0,totalCount-pageOffset)));
    }
  }

  async function resetFilters() {
    setDefaultDates();
    ["affected-employee","changed-by","department","change-type","field-changed","module"].forEach((id) => { $(id).value=""; });
    $("search-text").value = "";
    pageOffset = 0;
    await loadReport(false);
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || sessionEmployee?.name || "Employee";
    setMessage("");
    if (!$("start-date").value || !$("end-date").value) setDefaultDates();
    await loadOptions();
    await loadReport(true);
  }

  async function init() {
    try {
      await listLoginEmployees();
      if (await restoreSession()) await enterApp();
    } catch (error) {
      setMessage(error.message || "Unable to initialize Change Log reporting.","error");
    }
  }

  $("login-form").addEventListener("submit",(event) => login(event).catch((error) => setMessage(error.message,"error")));
  $("run-report").addEventListener("click",() => loadReport(true));
  $("reset-filters").addEventListener("click",() => resetFilters());
  $("previous-page").addEventListener("click",() => {
    if (pageOffset<=0 || loading) return;
    pageOffset = Math.max(0,pageOffset-PAGE_SIZE);
    loadReport(false);
  });
  $("next-page").addEventListener("click",() => {
    if (pageOffset+PAGE_SIZE>=totalCount || loading) return;
    pageOffset += PAGE_SIZE;
    loadReport(false);
  });
  $("search-text").addEventListener("keydown",(event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadReport(true);
    }
  });

  init();
})();
