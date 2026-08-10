"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const employeeSelect = document.getElementById("audit-employee");
  const dateInput = document.getElementById("audit-date");
  const loadButton = document.getElementById("audit-load");
  const auditExisting = document.getElementById("audit-existing");
  if (!config || !supabaseLib || !employeeSelect || !dateInput || !loadButton || !auditExisting) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const wrap = document.createElement("div");
  wrap.id = "audit-transactions";
  wrap.style.marginTop = "14px";
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px">
      <div>
        <strong>Transactions to Audit</strong>
        <div id="audit-transactions-summary" style="color:#64748b;font-size:12px;margin-top:3px">Select an employee and date.</div>
      </div>
    </div>
    <div id="audit-transactions-message" class="msg" hidden></div>
    <div class="table-wrap">
      <table style="min-width:1180px">
        <thead><tr>
          <th>Time</th><th>Job</th><th>Task Type</th><th>Work Order</th><th>Task / Item</th><th>Job Type</th><th>Qty</th><th>Expected Min</th><th>Session Min</th><th>Stop Reason</th><th>Status</th>
        </tr></thead>
        <tbody id="audit-transactions-body"><tr><td colspan="11">Select an employee and date to load transactions.</td></tr></tbody>
      </table>
    </div>`;
  auditExisting.insertAdjacentElement("afterend", wrap);

  const body = document.getElementById("audit-transactions-body");
  const summary = document.getElementById("audit-transactions-summary");
  const message = document.getElementById("audit-transactions-message");

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function setMessage(text, type = "info") {
    message.textContent = text || "";
    message.dataset.type = type;
    message.hidden = !text;
  }

  function taskLabel(row) {
    return row.item_name || row.non_productive_task || "—";
  }

  function qtyLabel(row) {
    const assigned = row.assigned_quantity;
    const completed = row.completed_quantity;
    if (assigned == null && completed == null) return "—";
    if (completed == null) return esc(assigned);
    if (assigned == null) return esc(completed);
    return `${esc(completed)} / ${esc(assigned)}`;
  }

  function minutes(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : esc(value);
  }

  async function loadTransactions() {
    const employeeId = employeeSelect.value;
    const businessDate = dateInput.value;
    setMessage("");

    if (!employeeId || !businessDate) {
      summary.textContent = "Select an employee and date.";
      body.innerHTML = '<tr><td colspan="11">Select an employee and date to load transactions.</td></tr>';
      return;
    }

    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) {
      setMessage("Your session is no longer available. Return Home and sign in again.", "error");
      return;
    }

    summary.textContent = "Loading transactions...";
    body.innerHTML = '<tr><td colspan="11">Loading...</td></tr>';

    const { data, error } = await client.rpc("get_task_tracker_audit_transactions", {
      p_session_token: token,
      p_employee_id: employeeId,
      p_business_date: businessDate
    });

    if (error) {
      summary.textContent = "Unable to load transactions.";
      body.innerHTML = '<tr><td colspan="11">Transactions could not be loaded.</td></tr>';
      setMessage(error.message || "Unable to load Task Tracker transactions.", "error");
      return;
    }

    const rows = data?.transactions || [];
    const employeeName = employeeSelect.options[employeeSelect.selectedIndex]?.textContent || "Selected employee";
    summary.textContent = `${employeeName} · ${businessDate} · ${rows.length} transaction${rows.length === 1 ? "" : "s"}`;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="11">No Task Tracker transactions were recorded for this employee on the selected date.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row) => {
      const time = [row.start_time, row.end_time].filter(Boolean).join(" – ") || "—";
      return `<tr>
        <td>${esc(time)}</td>
        <td>${esc(row.job_number ?? "—")}</td>
        <td>${esc(row.task_type || "—")}</td>
        <td>${esc(row.work_order_number || "—")}</td>
        <td>${esc(taskLabel(row))}</td>
        <td>${esc(row.job_type || "—")}</td>
        <td>${qtyLabel(row)}</td>
        <td>${minutes(row.expected_minutes)}</td>
        <td>${minutes(row.session_minutes)}</td>
        <td>${esc(row.stop_reason || "—")}</td>
        <td>${esc(row.job_status || "—")}</td>
      </tr>`;
    }).join("");
  }

  employeeSelect.addEventListener("change", () => loadTransactions());
  dateInput.addEventListener("change", () => loadTransactions());
  loadButton.addEventListener("click", () => loadTransactions());
})();
