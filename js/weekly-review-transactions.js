"use strict";

/* Weekly review transaction activity. */
(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

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

  let lastManagementEmployeeId = null;
  let lastEmployeeWeek = null;
  let ownEmployeeId = null;
  let managementRequestKey = "";
  let employeeRequestKey = "";

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

  function groupActive(group, metrics) {
    if (group.rate) return numberValue(metrics?.daily_picked) > 0;
    if (group.key) return numberValue(metrics?.[group.key]) !== 0;
    return numberValue(metrics?.[group.countKey]) !== 0 || numberValue(metrics?.[group.qtyKey]) !== 0;
  }

  function groupCard(group, metrics) {
    if (group.rate) {
      const rate = metrics?.pick_error_rate_percent;
      return `<div class="metric"><div class="muted">${esc(group.label)}</div><div class="value">${esc(formatPercent(rate))}</div><div class="muted">${formatNumber(metrics?.daily_pick_errors,0)} errors / ${formatNumber(metrics?.daily_picked,0)} picked</div></div>`;
    }
    if (group.key) {
      return `<div class="metric"><div class="muted">${esc(group.label)}</div><div class="value">${esc(formatNumber(metrics?.[group.key],2))}</div></div>`;
    }
    return `<div class="metric"><div class="muted">${esc(group.label)}</div><div class="value">${esc(formatNumber(metrics?.[group.countKey],0))}</div><div class="muted">Quantity ${esc(formatNumber(metrics?.[group.qtyKey],2))}</div></div>`;
  }

  function renderSection(metrics, anchor, id) {
    document.getElementById(id)?.remove();
    if (!anchor || !metrics) return;
    const active = groups.filter((group) => groupActive(group, metrics));
    if (!active.length || !baseKeys.some((key) => numberValue(metrics[key]) !== 0)) return;
    const section = document.createElement("div");
    section.id = id;
    section.style.margin = "18px 0 6px";
    section.innerHTML = `<h3 style="margin:0 0 6px">Transaction Activity</h3><div class="muted" style="margin-bottom:10px">Only transaction metrics with activity during this review week are shown.</div><div class="metrics">${active.map((group) => groupCard(group, metrics)).join("")}</div>`;
    anchor.insertAdjacentElement("afterend", section);
  }

  async function loadOwnEmployeeId() {
    if (ownEmployeeId) return ownEmployeeId;
    const token = sessionStorage.getItem(sessionKey);
    if (!token) return null;
    const rows = await rpc("get_employee_session_context", { p_session_token: token });
    const row = Array.isArray(rows) ? rows[0] : rows;
    ownEmployeeId = row?.employee_id || null;
    return ownEmployeeId;
  }

  async function refreshManagement(force = false) {
    const token = sessionStorage.getItem(sessionKey);
    const employeeId = lastManagementEmployeeId || document.querySelector("#roster-body tr.selected-row")?.dataset.id;
    const week = $("week-ending")?.value;
    if (!token || !employeeId || !week || $("detail-card")?.hidden) return;
    const key = `${employeeId}|${week}`;
    if (!force && key === managementRequestKey) return;
    managementRequestKey = key;
    try {
      const detail = await rpc("get_weekly_review_detail", {
        p_session_token: token,
        p_employee_id: employeeId,
        p_week_ending_date: week
      });
      renderSection(detail?.assessment?.metrics || {}, $("metric-cards"), "weekly-review-transaction-activity");
    } catch {
      managementRequestKey = "";
    }
  }

  async function refreshEmployee(force = false) {
    const token = sessionStorage.getItem(sessionKey);
    const week = lastEmployeeWeek;
    if (!token || !week || $("employee-detail")?.hidden) return;
    const employeeId = await loadOwnEmployeeId();
    if (!employeeId) return;
    const key = `${employeeId}|${week}`;
    if (!force && key === employeeRequestKey) return;
    employeeRequestKey = key;
    try {
      const detail = await rpc("get_weekly_review_detail", {
        p_session_token: token,
        p_employee_id: employeeId,
        p_week_ending_date: week
      });
      renderSection(detail?.assessment?.metrics || {}, $("employee-metrics"), "employee-weekly-transaction-activity");
    } catch {
      employeeRequestKey = "";
    }
  }

  document.addEventListener("click", (event) => {
    const reviewButton = event.target.closest?.("#roster-body .review-btn");
    if (reviewButton) {
      lastManagementEmployeeId = reviewButton.dataset.id || null;
      managementRequestKey = "";
      setTimeout(() => refreshManagement(true), 350);
      setTimeout(() => refreshManagement(true), 850);
      return;
    }
    const publishedButton = event.target.closest?.(".published-btn");
    if (publishedButton) {
      lastEmployeeWeek = publishedButton.dataset.week || null;
      employeeRequestKey = "";
      setTimeout(() => refreshEmployee(true), 350);
      setTimeout(() => refreshEmployee(true), 850);
    }
  }, true);

  $("load-week")?.addEventListener("click", () => {
    managementRequestKey = "";
    setTimeout(() => refreshManagement(true), 800);
  });

  const managementAnchor = $("metric-cards");
  if (managementAnchor) new MutationObserver(() => setTimeout(() => refreshManagement(true), 80)).observe(managementAnchor, { childList: true });
  const employeeAnchor = $("employee-metrics");
  if (employeeAnchor) new MutationObserver(() => setTimeout(() => refreshEmployee(true), 80)).observe(employeeAnchor, { childList: true });
})();
