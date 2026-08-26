"use strict";

/* Transaction reporting + daily detail transaction activity. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const runButton = document.getElementById("run-report");
  const tableWrap = document.getElementById("table");
  if (!config || !supabaseLib || !runButton || !tableWrap) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const baseKeys = [
    "daily_picked","daily_pick_errors","cancellations","deleted_fulfillments","key_cuts",
    "printed_totals","shipped_totals","work_orders_printed","fgi_put_away_count","fgi_put_away_quantity",
    "material_pull_count","material_pull_quantity","work_orders_staged","inventory_adjustments_out_count",
    "inventory_adjustments_out_quantity","inventory_adjustments_in_count","inventory_adjustments_in_quantity",
    "bin_transfers_count","bin_transfers_quantity","inventory_transfers_count","inventory_transfers_quantity"
  ];
  const groups = [
    { label: "Picked", key: "daily_picked" },
    { label: "Pick Errors", key: "daily_pick_errors" },
    { label: "Pick Error Rate", rate: true },
    { label: "Cancellations", key: "cancellations" },
    { label: "Deleted Fulfillments", key: "deleted_fulfillments" },
    { label: "Key Cuts", key: "key_cuts" },
    { label: "Printed", key: "printed_totals" },
    { label: "Shipped", key: "shipped_totals" },
    { label: "Work Orders Printed", key: "work_orders_printed" },
    { label: "FGI Put Away", countKey: "fgi_put_away_count", qtyKey: "fgi_put_away_quantity" },
    { label: "Material Pull", countKey: "material_pull_count", qtyKey: "material_pull_quantity" },
    { label: "Work Orders Staged", key: "work_orders_staged" },
    { label: "Adjustments Out", countKey: "inventory_adjustments_out_count", qtyKey: "inventory_adjustments_out_quantity" },
    { label: "Adjustments In", countKey: "inventory_adjustments_in_count", qtyKey: "inventory_adjustments_in_quantity" },
    { label: "Bin Transfers", countKey: "bin_transfers_count", qtyKey: "bin_transfers_quantity" },
    { label: "Inventory Transfers", countKey: "inventory_transfers_count", qtyKey: "inventory_transfers_quantity" }
  ];
  let dailyDecorateTimer = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(text, type = "info") {
    const el = $("message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function formatPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
  }

  function hasTransactions(row) {
    return baseKeys.some((key) => numberValue(row?.[key]) !== 0);
  }

  function groupIsActive(group, rows) {
    if (group.rate) return rows.some((row) => numberValue(row.daily_picked) > 0);
    if (group.key) return rows.some((row) => numberValue(row[group.key]) !== 0);
    return rows.some((row) => numberValue(row[group.countKey]) !== 0 || numberValue(row[group.qtyKey]) !== 0);
  }

  function aggregateRows(rows) {
    const map = new Map();
    for (const row of rows) {
      if (!hasTransactions(row)) continue;
      const id = row.employee_id;
      if (!map.has(id)) {
        const aggregate = {
          employee_id: id,
          employee_name: row.employee_name,
          department: row.department,
          supervisor_name: row.supervisor_name
        };
        baseKeys.forEach((key) => { aggregate[key] = 0; });
        map.set(id, aggregate);
      }
      const aggregate = map.get(id);
      baseKeys.forEach((key) => { aggregate[key] += numberValue(row[key]); });
    }
    return [...map.values()].sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
  }

  function pickErrorRate(row) {
    const picked = numberValue(row.daily_picked);
    return picked > 0 ? (numberValue(row.daily_pick_errors) / picked) * 100 : null;
  }

  function displayGroupValue(row, group) {
    if (group.rate) return pickErrorRate(row) == null ? "—" : formatPercent(pickErrorRate(row));
    if (group.key) {
      const value = numberValue(row[group.key]);
      return value === 0 ? "—" : formatNumber(value, 2);
    }
    const count = numberValue(row[group.countKey]);
    const qty = numberValue(row[group.qtyKey]);
    if (count === 0 && qty === 0) return "—";
    return `${formatNumber(count, 0)} / ${formatNumber(qty, 2)} qty`;
  }

  function renderTransactionSummary(rows, activeGroups) {
    const summary = $("summary");
    if (!summary) return;
    const totalPicked = rows.reduce((sum, row) => sum + numberValue(row.daily_picked), 0);
    const totalErrors = rows.reduce((sum, row) => sum + numberValue(row.daily_pick_errors), 0);
    const rate = totalPicked > 0 ? (totalErrors / totalPicked) * 100 : null;
    const cards = [
      `<div class="metric"><div class="muted">Employees With Activity</div><strong>${formatNumber(rows.length, 0)}</strong></div>`,
      `<div class="metric"><div class="muted">Active Transaction Types</div><strong>${formatNumber(activeGroups.length, 0)}</strong></div>`
    ];
    if (totalPicked > 0) {
      cards.push(`<div class="metric"><div class="muted">Total Picked</div><strong>${formatNumber(totalPicked, 0)}</strong></div>`);
      cards.push(`<div class="metric"><div class="muted">Pick Errors</div><strong>${formatNumber(totalErrors, 0)}</strong></div>`);
      cards.push(`<div class="metric"><div class="muted">Pick Error Rate</div><strong>${formatPercent(rate)}</strong></div>`);
    }
    summary.innerHTML = cards.join("");
  }

  function renderTransactions(rows) {
    const activeGroups = groups.filter((group) => groupIsActive(group, rows));
    $("row-count").textContent = `${rows.length} employee${rows.length === 1 ? "" : "s"}`;
    renderTransactionSummary(rows, activeGroups);
    if (!rows.length) {
      tableWrap.innerHTML = '<div class="muted" style="padding:16px">No transaction activity matched this range.</div>';
      return;
    }
    const headers = ["Employee", "Department", "Supervisor", ...activeGroups.map((group) => group.label)];
    const body = rows.map((row) => {
      const cells = [row.employee_name, row.department || "—", row.supervisor_name || "—", ...activeGroups.map((group) => displayGroupValue(row, group))];
      return `<tr>${cells.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`;
    }).join("");
    tableWrap.innerHTML = `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function fetchTransactionRows() {
    const token = sessionStorage.getItem(sessionKey);
    const start = $("start-date")?.value;
    const end = $("end-date")?.value;
    if (!token || !start || !end) throw new Error("Select a valid date range.");
    const rows = await rpc("get_reporting_daily", {
      p_session_token: token,
      p_start_date: start,
      p_end_date: end,
      p_employee_id: $("report-employee")?.value || null
    });
    return aggregateRows(Array.isArray(rows) ? rows : []);
  }

  async function runTransactions() {
    setMessage("Loading transaction reporting...");
    try {
      const rows = await fetchTransactionRows();
      renderTransactions(rows);
      setMessage("Transaction reporting loaded.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function isTransactionMode() {
    return $("transactions-tab")?.classList.contains("active");
  }

  function ensureTransactionTab() {
    if ($("transactions-tab")) return;
    const weekly = $("weekly-tab");
    const tabs = weekly?.parentElement;
    if (!tabs) return;
    const button = document.createElement("button");
    button.id = "transactions-tab";
    button.className = "tab";
    button.type = "button";
    button.textContent = "Transactions";
    tabs.appendChild(button);
    button.addEventListener("click", () => {
      $("daily-tab")?.classList.remove("active");
      $("weekly-tab")?.classList.remove("active");
      button.classList.add("active");
      $("report-title").textContent = "Transaction Reporting";
      $("report-note").textContent = "Only employees with transaction activity in the selected date range are shown. Columns appear only when that transaction type has activity.";
      runTransactions();
    });
    $("daily-tab")?.addEventListener("click", () => button.classList.remove("active"));
    $("weekly-tab")?.addEventListener("click", () => button.classList.remove("active"));
  }

  runButton.addEventListener("click", (event) => {
    if (!isTransactionMode()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runTransactions();
  }, true);

  async function exportTransactions() {
    const csv = window.TaskTrackerCsv;
    if (!csv) throw new Error("CSV export is unavailable.");
    const rows = await fetchTransactionRows();
    const activeGroups = groups.filter((group) => groupIsActive(group, rows));
    const headers = ["Employee", "Department", "Supervisor"];
    for (const group of activeGroups) {
      if (group.rate) headers.push(group.label);
      else if (group.key) headers.push(group.label);
      else headers.push(`${group.label} Count`, `${group.label} Quantity`);
    }
    const output = rows.map((row) => {
      const values = [row.employee_name, row.department || "", row.supervisor_name || ""];
      for (const group of activeGroups) {
        if (group.rate) values.push(pickErrorRate(row));
        else if (group.key) values.push(numberValue(row[group.key]));
        else values.push(numberValue(row[group.countKey]), numberValue(row[group.qtyKey]));
      }
      return values;
    });
    const employee = csv.slug($("report-employee")?.selectedOptions?.[0]?.textContent?.trim() || "all-employees");
    csv.download(`task-tracker-transactions-report-${$("start-date").value}-to-${$("end-date").value}-${employee}.csv`, headers, output);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("#report-export-csv");
    if (!button || !isTransactionMode()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exportTransactions().catch((error) => alert(error.message));
  }, true);

  function renderDailyDetailTransactions(row) {
    if (!row || !hasTransactions(row)) return;
    const detail = document.getElementById("reporting-daily-detail");
    if (!detail || detail.hidden) return;
    detail.querySelector("#daily-detail-transaction-activity")?.remove();
    const activeGroups = groups.filter((group) => groupIsActive(group, [row]));
    const section = document.createElement("div");
    section.id = "daily-detail-transaction-activity";
    section.style.marginTop = "18px";
    section.innerHTML = `<h3 style="margin:0 0 10px">Transaction Activity</h3><div class="muted" style="margin-bottom:10px">Only transaction metrics with activity on this date are shown.</div><div class="summary">${activeGroups.map((group) => `<div class="metric"><div class="muted">${esc(group.label)}</div><strong>${esc(displayGroupValue(row, group))}</strong></div>`).join("")}</div>`;
    const summary = detail.querySelector(".summary");
    if (summary) summary.insertAdjacentElement("afterend", section);
    else detail.appendChild(section);
  }

  async function decorateDailyRows() {
    if (isTransactionMode() || !$("daily-tab")?.classList.contains("active")) return;
    const token = sessionStorage.getItem(sessionKey);
    const start = $("start-date")?.value;
    const end = $("end-date")?.value;
    if (!token || !start || !end) return;
    try {
      const rows = await rpc("get_reporting_daily", {
        p_session_token: token,
        p_start_date: start,
        p_end_date: end,
        p_employee_id: $("report-employee")?.value || null
      });
      const data = Array.isArray(rows) ? rows : [];
      const renderedRows = Array.from(tableWrap.querySelectorAll("tbody tr"));
      renderedRows.forEach((tr, index) => {
        const row = data[index];
        if (!row || tr.dataset.transactionDetailBound === "1") return;
        tr.dataset.transactionDetailBound = "1";
        tr.addEventListener("click", () => {
          setTimeout(() => renderDailyDetailTransactions(row), 250);
          setTimeout(() => renderDailyDetailTransactions(row), 700);
        });
      });
    } catch {}
  }

  function scheduleDailyDecoration() {
    clearTimeout(dailyDecorateTimer);
    dailyDecorateTimer = setTimeout(decorateDailyRows, 180);
  }

  new MutationObserver(scheduleDailyDecoration).observe(tableWrap, { childList: true, subtree: true });
  $("daily-tab")?.addEventListener("click", () => setTimeout(decorateDailyRows, 300));
  runButton.addEventListener("click", () => { if (!isTransactionMode()) setTimeout(decorateDailyRows, 450); });

  ensureTransactionTab();
  setTimeout(ensureTransactionTab, 500);
  setTimeout(decorateDailyRows, 900);
})();
