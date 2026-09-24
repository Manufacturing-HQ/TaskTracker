"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionToken = sessionStorage.getItem(config.sessionStorageKey);
  let bootstrap = null;
  let permissionFlags = {};
  let editingBatchId = null;
  let qaReview = null;
  let lastQaRenewAt = 0;
  let cosmeticRows = [];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function showError(error) {
    setMessage(error?.message || String(error), "error");
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(`${value}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function offsetDate(dateString, days) {
    const d = new Date(`${dateString}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0,10);
  }

  const can = (code) => permissionFlags?.[code] === true;
  const tabPermission = {
    pick:"pps.pick_batch.create",
    qa:"pps.qa.process",
    cosmetic:"pps.cosmetic.manage",
    reporting:"pps.reporting.view"
  };
  const canTab = (tab) => !!tabPermission[tab] && can(tabPermission[tab]);

  function firstAllowedTab() {
    return ["pick","qa","cosmetic","reporting"].find(canTab) || null;
  }

  function configurePermissionUi() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.hidden = !canTab(button.dataset.tab);
    });
    ["pick","qa","cosmetic","reporting"].forEach((name) => {
      const section = $("tab-" + name);
      if (section) section.hidden = true;
    });
  }

  async function loadAllowedData() {
    const jobs = [];
    if (canTab("pick")) jobs.push(loadBatches());
    if (canTab("qa")) jobs.push(loadQaQueue());
    if (canTab("cosmetic")) jobs.push(loadCosmetics());
    if (canTab("reporting")) jobs.push(loadReporting());
    await Promise.all(jobs);
  }

  function statusLabel(status) {
    const value = String(status || "");
    if (value === "SUBMITTED") return '<span class="status submitted">Submitted</span>';
    if (value === "QA_IN_REVIEW") return '<span class="status review">QA In Review</span>';
    if (value === "QA_COMPLETED") return '<span class="status complete">QA Completed</span>';
    if (value === "PENDING") return '<span class="status pending">Pending</span>';
    if (value === "UPDATED") return '<span class="status complete">Updated</span>';
    return `<span class="status">${esc(value.replaceAll("_"," "))}</span>`;
  }

  function setTab(tab) {
    if (!canTab(tab)) tab = firstAllowedTab();
    if (!tab) return;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    ["pick","qa","cosmetic","reporting"].forEach((name) => {
      $("tab-" + name).hidden = name !== tab;
    });
    if (tab === "qa") loadQaQueue().catch(showError);
    if (tab === "cosmetic") loadCosmetics().catch(showError);
    if (tab === "reporting") loadReporting().catch(showError);
  }

  function renumberPickRows() {
    $("pick-rows").querySelectorAll("tr").forEach((tr, index) => {
      const n = tr.querySelector("[data-row-number]");
      if (n) n.textContent = String(index + 1);
    });
  }

  function addPickRow(data = {}, focus = false) {
    const tbody = $("pick-rows");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="scan-num" data-row-number></td>
      <td><input data-role="sales-order" type="text" autocomplete="off" placeholder="Scan sales order" value="${esc(data.sales_order_number || "")}"></td>
      <td><select data-role="pick-result"><option value="PICKED">Picked</option><option value="INVENTORY_DISCREPANCY">Inventory Discrepancy - Fulfillment Deleted</option></select></td>
      <td><button class="secondary" data-role="remove-row" type="button">Remove</button></td>`;
    tr.querySelector('[data-role="pick-result"]').value = data.pick_result || "PICKED";
    tr.querySelector('[data-role="remove-row"]').addEventListener("click", () => {
      const rows = tbody.querySelectorAll("tr");
      if (rows.length === 1) {
        tr.querySelector('[data-role="sales-order"]').value = "";
        tr.querySelector('[data-role="pick-result"]').value = "PICKED";
        tr.querySelector('[data-role="sales-order"]').focus();
        return;
      }
      tr.remove();
      renumberPickRows();
    });

    const input = tr.querySelector('[data-role="sales-order"]');
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!input.value.trim()) return;
      const rows = [...tbody.querySelectorAll("tr")];
      const index = rows.indexOf(tr);
      if (index === rows.length - 1) addPickRow({}, true);
      else rows[index + 1].querySelector('[data-role="sales-order"]')?.focus();
    });

    tbody.appendChild(tr);
    renumberPickRows();
    if (focus) input.focus();
    return tr;
  }

  function collectPickOrders() {
    return [...$("pick-rows").querySelectorAll("tr")]
      .map((tr) => ({
        sales_order_number: tr.querySelector('[data-role="sales-order"]').value.trim(),
        pick_result: tr.querySelector('[data-role="pick-result"]').value
      }))
      .filter((row) => row.sales_order_number);
  }

  function resetPickForm() {
    editingBatchId = null;
    $("pick-form-title").textContent = "Create Pick Batch";
    $("edit-banner").hidden = true;
    $("edit-banner").textContent = "";
    $("cancel-edit").hidden = true;
    $("pick-bin").value = "";
    $("pick-comments").value = "";
    $("pick-rows").innerHTML = "";
    addPickRow();
    $("submit-pick-batch").textContent = "Submit Pick Batch";
  }

  function confirmDiscrepancies(orders) {
    const discrepancies = orders.filter((x) => x.pick_result === "INVENTORY_DISCREPANCY");
    if (!discrepancies.length) return Promise.resolve(true);
    const modal = $("confirm-modal");
    $("confirm-discrepancy-list").innerHTML = `<ul>${discrepancies.map((x) => `<li><strong>${esc(x.sales_order_number)}</strong></li>`).join("")}</ul>`;
    modal.hidden = false;
    return new Promise((resolve) => {
      const finish = (result) => {
        modal.hidden = true;
        $("confirm-cancel").onclick = null;
        $("confirm-submit").onclick = null;
        resolve(result);
      };
      $("confirm-cancel").onclick = () => finish(false);
      $("confirm-submit").onclick = () => finish(true);
    });
  }

  async function savePickBatch() {
    const button = $("submit-pick-batch");
    const orders = collectPickOrders();
    if (!$("pick-bin").value) throw new Error("Select a Pick Bin.");
    if (!orders.length) throw new Error("Scan at least one Sales Order before submitting.");
    if (!(await confirmDiscrepancies(orders))) return;

    button.disabled = true;
    button.textContent = editingBatchId ? "Saving..." : "Submitting...";
    try {
      const result = await rpc("save_pps_pick_batch", {
        p_session_token: sessionToken,
        p_batch_id: editingBatchId,
        p_pick_bin: $("pick-bin").value,
        p_comments: $("pick-comments").value.trim() || null,
        p_orders: orders
      });
      const batchNumber = result?.batch?.batch_number || "Pick Batch";
      setMessage(`${batchNumber} saved successfully.`, "success");
      resetPickForm();
      await loadAllowedData();
    } finally {
      button.disabled = false;
      button.textContent = editingBatchId ? "Save Pick Batch" : "Submit Pick Batch";
    }
  }

  async function loadBatches() {
    const result = await rpc("get_pps_pick_batches", {
      p_session_token: sessionToken,
      p_start_date: $("batch-start").value || null,
      p_end_date: $("batch-end").value || null
    });
    if (!$("batch-start").value) $("batch-start").value = result.start_date;
    if (!$("batch-end").value) $("batch-end").value = result.end_date;
    const rows = result.rows || [];
    $("batch-history").innerHTML = `<table><thead><tr><th>Batch</th><th>Date</th><th>Picker</th><th>Bin</th><th>Orders</th><th>Discrepancies</th><th>Status</th><th>QA</th><th>Actions</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td><strong>${esc(r.batch_number)}</strong></td><td>${formatDate(r.business_date)}</td><td>${esc(r.picker_name)}</td><td>${esc(r.pick_bin)}</td>
      <td>${esc(r.order_count)}</td><td>${esc(r.discrepancy_count)}</td><td>${statusLabel(r.status)}</td><td>${esc(r.qa_employee_name || r.qa_lock_employee_name || "—")}</td>
      <td>${r.editable ? `<button class="secondary" data-edit-batch="${esc(r.batch_id)}" type="button">Edit</button>` : "—"}</td></tr>`).join("") || '<tr><td colspan="9">No Pick Batches match this date range.</td></tr>'}</tbody></table>`;
    $("batch-history").querySelectorAll("[data-edit-batch]").forEach((b) => b.addEventListener("click", () => editBatch(b.dataset.editBatch).catch(showError)));
  }

  async function editBatch(batchId) {
    const detail = await rpc("get_pps_pick_batch_detail", { p_session_token:sessionToken, p_batch_id:batchId });
    if (!detail?.batch?.editable) throw new Error("This Pick Batch is no longer editable because QA has started or completed review.");
    editingBatchId = batchId;
    $("pick-form-title").textContent = "Edit Pick Batch";
    $("edit-banner").textContent = `Editing ${detail.batch.batch_number}. Picker edits will lock as soon as QA starts review.`;
    $("edit-banner").hidden = false;
    $("cancel-edit").hidden = false;
    $("pick-bin").value = detail.batch.pick_bin;
    $("pick-comments").value = detail.batch.comments || "";
    $("pick-rows").innerHTML = "";
    (detail.orders || []).forEach((row) => addPickRow(row));
    if (!(detail.orders || []).length) addPickRow();
    $("submit-pick-batch").textContent = "Save Pick Batch";
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  async function loadQaQueue() {
    const rows = await rpc("get_pps_qa_queue", { p_session_token:sessionToken });
    const wrap = $("qa-queue");
    wrap.innerHTML = (rows || []).map((r) => {
      const lockedByOther = r.status === "QA_IN_REVIEW" && r.qa_lock_employee_id !== bootstrap.viewer.employee_id;
      const buttonText = r.status === "QA_IN_REVIEW" ? "Resume Review" : "Start QA Review";
      return `<div class="qa-card"><div class="qa-order-header"><div><h3>${esc(r.batch_number)}</h3><div class="muted">${esc(r.picker_name)} · ${esc(r.pick_bin)} · ${esc(r.order_count)} orders · ${esc(r.discrepancy_count)} discrepancies</div></div>${statusLabel(r.status)}</div>
        ${lockedByOther ? `<div class="warning-box">Currently being reviewed by ${esc(r.qa_lock_employee_name || "another Administrator")}.</div>` : ""}
        ${r.comments ? `<div style="margin:8px 0">${esc(r.comments)}</div>` : ""}
        <button class="primary" data-start-qa="${esc(r.batch_id)}" type="button" ${lockedByOther ? "disabled" : ""}>${buttonText}</button></div>`;
    }).join("") || '<div class="muted">No Pick Batches are waiting for QA.</div>';
    wrap.querySelectorAll("[data-start-qa]").forEach((b) => b.addEventListener("click", () => startQaReview(b.dataset.startQa).catch(showError)));
  }

  function addCosmeticItemRow(host, value = "") {
    const row = document.createElement("div");
    row.className = "cosmetic-item-row";
    row.innerHTML = `<input type="text" data-role="cosmetic-item" placeholder="Cosmetic Rejection Item" value="${esc(value)}"><button class="secondary" type="button">Remove</button>`;
    row.querySelector("button").addEventListener("click", () => {
      const rows = host.querySelectorAll(".cosmetic-item-row");
      if (rows.length === 1) row.querySelector("input").value = "";
      else row.remove();
      noteQaActivity();
    });
    host.appendChild(row);
    return row;
  }

  function renderQaReview(detail) {
    qaReview = detail;
    lastQaRenewAt = Date.now();
    const batch = detail.batch;
    $("qa-review-summary").textContent = `${batch.batch_number} · Picker ${batch.picker_name} · ${batch.pick_bin} Bin · ${detail.orders.length} orders`;
    const host = $("qa-review-orders");
    host.innerHTML = "";

    (detail.orders || []).forEach((order) => {
      const card = document.createElement("div");
      card.className = `qa-order ${order.pick_result === "INVENTORY_DISCREPANCY" ? "discrepancy" : ""}`;
      card.dataset.orderId = order.batch_order_id;
      card.dataset.pickResult = order.pick_result;
      if (order.pick_result === "INVENTORY_DISCREPANCY") {
        card.innerHTML = `<div class="qa-order-header"><div><strong>${esc(order.sales_order_number)}</strong><div class="muted">Picker marked Inventory Discrepancy - Fulfillment Deleted</div></div><span class="status review">Inventory Discrepancy</span></div>
          <label class="checkline"><input type="checkbox" data-role="absent"> Confirmed this Sales Order is NOT in the bin</label>`;
      } else {
        card.innerHTML = `<div class="qa-order-header"><div><strong>${esc(order.sales_order_number)}</strong><div class="muted">Picker Result: Picked</div></div></div>
          <div class="qa-controls">
            <label class="checkline"><input type="checkbox" data-role="good"> Order Good</label>
            <div class="field"><label>Pick Error</label><select data-role="pick-error"><option value="NO">No</option><option value="YES">Yes</option></select></div>
            <div class="field"><label>Cosmetic Rejection</label><select data-role="cosmetic"><option value="NO">No</option><option value="YES">Yes</option></select></div>
          </div>
          <div class="field" data-role="pick-error-comment-wrap" hidden style="margin-top:10px"><label>Pick Error Comment</label><textarea data-role="pick-error-comment" placeholder="Required when Pick Error is selected"></textarea></div>
          <div data-role="cosmetic-wrap" hidden style="margin-top:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>Cosmetic Rejection Items</strong><button class="secondary" data-role="add-cosmetic-item" type="button">Add Item</button></div><div class="cosmetic-items" data-role="cosmetic-items"></div></div>`;
        const good = card.querySelector('[data-role="good"]');
        const errorSelect = card.querySelector('[data-role="pick-error"]');
        const errorWrap = card.querySelector('[data-role="pick-error-comment-wrap"]');
        const cosmeticSelect = card.querySelector('[data-role="cosmetic"]');
        const cosmeticWrap = card.querySelector('[data-role="cosmetic-wrap"]');
        const cosmeticHost = card.querySelector('[data-role="cosmetic-items"]');

        errorSelect.addEventListener("change", () => {
          const yes = errorSelect.value === "YES";
          errorWrap.hidden = !yes;
          if (yes) good.checked = false;
          noteQaActivity();
        });
        good.addEventListener("change", () => {
          if (good.checked) {
            errorSelect.value = "NO";
            errorWrap.hidden = true;
            card.querySelector('[data-role="pick-error-comment"]').value = "";
          }
          noteQaActivity();
        });
        cosmeticSelect.addEventListener("change", () => {
          const yes = cosmeticSelect.value === "YES";
          cosmeticWrap.hidden = !yes;
          if (yes && !cosmeticHost.querySelector(".cosmetic-item-row")) addCosmeticItemRow(cosmeticHost);
          noteQaActivity();
        });
        card.querySelector('[data-role="add-cosmetic-item"]').addEventListener("click", () => {
          const row = addCosmeticItemRow(cosmeticHost);
          row.querySelector("input")?.focus();
          noteQaActivity();
        });
      }
      host.appendChild(card);
    });

    $("qa-review-card").hidden = false;
    $("qa-review-card").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function startQaReview(batchId) {
    if (qaReview?.batch?.batch_id && qaReview.batch.batch_id !== batchId) {
      throw new Error("Exit the current QA review before opening another Pick Batch.");
    }
    const detail = await rpc("start_pps_qa_review", { p_session_token:sessionToken, p_batch_id:batchId });
    renderQaReview(detail);
    await loadQaQueue();
  }

  async function renewQaLock() {
    if (!qaReview?.batch?.batch_id) return;
    const result = await rpc("renew_pps_qa_lock", { p_session_token:sessionToken, p_batch_id:qaReview.batch.batch_id });
    lastQaRenewAt = Date.now();
    if (result?.qa_lock_expires_at) qaReview.batch.qa_lock_expires_at = result.qa_lock_expires_at;
  }

  function noteQaActivity() {
    if (!qaReview?.batch?.batch_id) return;
    if (Date.now() - lastQaRenewAt < 4 * 60 * 1000) return;
    renewQaLock().catch((error) => {
      qaReview = null;
      $("qa-review-card").hidden = true;
      showError(error);
      loadQaQueue().catch(() => {});
    });
  }

  function collectQaReviews() {
    return [...$("qa-review-orders").querySelectorAll(".qa-order")].map((card) => {
      const pickResult = card.dataset.pickResult;
      if (pickResult === "INVENTORY_DISCREPANCY") {
        return {
          batch_order_id: card.dataset.orderId,
          good_confirmed: false,
          inventory_discrepancy_absence_confirmed: card.querySelector('[data-role="absent"]').checked,
          pick_error: false,
          pick_error_comment: null,
          cosmetic_items: []
        };
      }
      const cosmetic = card.querySelector('[data-role="cosmetic"]').value === "YES";
      const items = cosmetic ? [...card.querySelectorAll('[data-role="cosmetic-item"]')].map((x) => x.value.trim()).filter(Boolean) : [];
      return {
        batch_order_id: card.dataset.orderId,
        good_confirmed: card.querySelector('[data-role="good"]').checked,
        inventory_discrepancy_absence_confirmed: false,
        pick_error: card.querySelector('[data-role="pick-error"]').value === "YES",
        pick_error_comment: card.querySelector('[data-role="pick-error-comment"]').value.trim() || null,
        cosmetic_items: items
      };
    });
  }

  async function submitQaReview() {
    if (!qaReview?.batch?.batch_id) throw new Error("Open a Pick Batch before submitting QA Review.");
    const button = $("submit-qa-review");
    button.disabled = true;
    button.textContent = "Submitting...";
    try {
      const result = await rpc("submit_pps_qa_review", {
        p_session_token: sessionToken,
        p_batch_id: qaReview.batch.batch_id,
        p_reviews: collectQaReviews()
      });
      setMessage(`${result.batch_number} QA review completed.`, "success");
      qaReview = null;
      $("qa-review-card").hidden = true;
      await loadAllowedData();
      window.scrollTo({ top:0, behavior:"smooth" });
    } finally {
      button.disabled = false;
      button.textContent = "Submit QA Review";
    }
  }

  async function exitQaReview() {
    if (!qaReview?.batch?.batch_id) return;
    const batchId = qaReview.batch.batch_id;
    await rpc("release_pps_qa_lock", { p_session_token:sessionToken, p_batch_id:batchId });
    qaReview = null;
    $("qa-review-card").hidden = true;
    setMessage("QA review exited. The Pick Batch is unlocked for picker edits.", "success");
    await loadQaQueue();
  }

  async function loadCosmetics() {
    cosmeticRows = await rpc("get_pps_cosmetic_rejections", {
      p_session_token: sessionToken,
      p_status: $("cosmetic-status").value
    });
    const host = $("cosmetic-table");
    host.innerHTML = `<table><thead><tr><th>Status</th><th>Date</th><th>QA Employee</th><th>Sales Order</th><th>Rejection Item</th><th>Batch</th><th>Exported</th><th>NetSuite Updated</th><th>Action</th></tr></thead><tbody>${(cosmeticRows || []).map((r) => `<tr>
      <td>${statusLabel(r.status)}</td><td>${formatDate(r.business_date)}</td><td>${esc(r.qa_employee_name)}</td><td><strong>${esc(r.sales_order_number)}</strong></td><td>${esc(r.rejection_item)}</td><td>${esc(r.batch_number)}</td>
      <td>${r.exported_at ? `${formatDateTime(r.exported_at)}<div class="muted">${esc(r.exported_by || "")}</div>` : "—"}</td>
      <td>${r.netsuite_updated_at ? `${formatDateTime(r.netsuite_updated_at)}<div class="muted">${esc(r.netsuite_updated_by || "")}</div>` : "—"}</td>
      <td>${r.netsuite_updated_at ? "—" : `<button class="primary" data-mark-updated="${esc(r.rejection_id)}" type="button">Mark Updated</button>`}</td></tr>`).join("") || '<tr><td colspan="9">No Cosmetic Rejections match this view.</td></tr>'}</tbody></table>`;
    host.querySelectorAll("[data-mark-updated]").forEach((b) => b.addEventListener("click", () => markCosmeticUpdated(b.dataset.markUpdated).catch(showError)));
  }

  async function markCosmeticUpdated(rejectionId) {
    await rpc("mark_pps_cosmetic_rejection_updated", { p_session_token:sessionToken, p_rejection_id:rejectionId });
    setMessage("Cosmetic Rejection marked as updated in NetSuite.", "success");
    await loadAllowedData();
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
  }

  function downloadCsv(filename, rows) {
    const text = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([text], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPendingCosmetics() {
    const rows = await rpc("get_pps_cosmetic_rejections", { p_session_token:sessionToken, p_status:"PENDING" });
    if (!(rows || []).length) throw new Error("There are no pending Cosmetic Rejections to export.");
    await rpc("mark_pps_cosmetic_rejections_exported", {
      p_session_token: sessionToken,
      p_rejection_ids: rows.map((r) => r.rejection_id)
    });
    downloadCsv(`pps-cosmetic-rejections-${bootstrap.business_date}.csv`, [
      ["Sales Order","Item"],
      ...rows.map((r) => [r.sales_order_number,r.rejection_item])
    ]);
    setMessage(`${rows.length} pending Cosmetic Rejection${rows.length === 1 ? "" : "s"} exported.`, "success");
    await loadCosmetics();
  }

  async function loadReporting() {
    const report = await rpc("get_pps_reporting", {
      p_session_token: sessionToken,
      p_start_date: $("report-start").value || null,
      p_end_date: $("report-end").value || null
    });
    if (!$("report-start").value) $("report-start").value = report.start_date;
    if (!$("report-end").value) $("report-end").value = report.end_date;
    const s = report.summary || {};
    $("metric-batches").textContent = s.pick_batches ?? 0;
    $("metric-orders").textContent = s.order_entries ?? 0;
    $("metric-discrepancies").textContent = s.inventory_discrepancies ?? 0;
    $("metric-qa-batches").textContent = s.qa_completed_batches ?? 0;
    $("metric-reviewed").textContent = s.picked_orders_reviewed ?? 0;
    $("metric-errors").textContent = s.pick_errors ?? 0;
    $("metric-error-pct").textContent = `${Number(s.pick_error_percent || 0).toFixed(2)}%`;
    $("metric-cosmetics").textContent = s.cosmetic_rejections ?? 0;

    $("report-history").innerHTML = `<table><thead><tr><th>Date</th><th>Batch</th><th>Picker</th><th>Bin</th><th>Orders</th><th>Discrepancies</th><th>Pick Errors</th><th>Cosmetic Rejections</th><th>QA Employee</th><th>Status</th></tr></thead><tbody>${(report.history || []).map((r) => `<tr>
      <td>${formatDate(r.business_date)}</td><td><strong>${esc(r.batch_number)}</strong></td><td>${esc(r.picker_name)}</td><td>${esc(r.pick_bin)}</td><td>${esc(r.order_count)}</td><td>${esc(r.discrepancy_count)}</td><td>${esc(r.pick_error_count)}</td><td>${esc(r.cosmetic_rejection_count)}</td><td>${esc(r.qa_employee_name || "—")}</td><td>${statusLabel(r.status)}</td></tr>`).join("") || '<tr><td colspan="10">No PPS data exists in this date range.</td></tr>'}</tbody></table>`;
  }

  function wireEvents() {
    document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $("add-pick-row").addEventListener("click", () => addPickRow({}, true));
    $("submit-pick-batch").addEventListener("click", () => savePickBatch().catch(showError));
    $("cancel-edit").addEventListener("click", resetPickForm);
    $("refresh-batches").addEventListener("click", () => loadBatches().catch(showError));
    $("refresh-qa").addEventListener("click", () => loadQaQueue().catch(showError));
    $("submit-qa-review").addEventListener("click", () => submitQaReview().catch(showError));
    $("exit-qa-review").addEventListener("click", () => exitQaReview().catch(showError));
    $("cosmetic-status").addEventListener("change", () => loadCosmetics().catch(showError));
    $("refresh-cosmetic").addEventListener("click", () => loadCosmetics().catch(showError));
    $("export-cosmetic").addEventListener("click", () => exportPendingCosmetics().catch(showError));
    $("load-report").addEventListener("click", () => loadReporting().catch(showError));

    const reviewCard = $("qa-review-card");
    ["pointerdown","keydown","change"].forEach((eventName) => reviewCard.addEventListener(eventName, noteQaActivity, { passive:true }));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && qaReview?.batch?.batch_id) {
        lastQaRenewAt = 0;
        noteQaActivity();
      }
    });
  }

  async function init() {
    if (!sessionToken) {
      $("access-denied").hidden = false;
      setMessage("Sign in through Task Tracker before opening PPS Operations.", "error");
      return;
    }

    try {
      const [bootstrapData,flags] = await Promise.all([
        rpc("get_pps_operations_bootstrap", { p_session_token:sessionToken }),
        rpc("get_current_permission_flags", {
          p_session_token:sessionToken,
          p_permission_codes:[
            "pps.pick_batch.create",
            "pps.qa.process",
            "pps.reporting.view",
            "pps.cosmetic.manage"
          ]
        })
      ]);
      bootstrap = bootstrapData || {};
      permissionFlags = flags || {};

      const firstTab = firstAllowedTab();
      if (!firstTab) throw new Error("You do not have permission to access PPS Operations.");

      $("viewer-name").textContent = bootstrap.viewer.employee_name;
      $("viewer-meta").textContent = `${bootstrap.viewer.role} · Business Date ${formatDate(bootstrap.business_date)} · QA lock ${bootstrap.qa_lock_minutes} minutes`;
      $("picker-name").value = bootstrap.viewer.employee_name;
      $("pick-bin").innerHTML = '<option value="">Select bin</option>' + (bootstrap.pick_bins || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");

      const defaultStart = offsetDate(bootstrap.business_date,-30);
      $("batch-start").value = defaultStart;
      $("batch-end").value = bootstrap.business_date;
      $("report-start").value = defaultStart;
      $("report-end").value = bootstrap.business_date;

      configurePermissionUi();
      wireEvents();
      if (canTab("pick")) resetPickForm();
      $("app").hidden = false;
      await loadAllowedData();

      const requested = String(location.hash || "").replace(/^#/,"").toLowerCase();
      setTab(canTab(requested) ? requested : firstTab);
    } catch (error) {
      $("app").hidden = true;
      $("access-denied").hidden = false;
      showError(error);
    }
  }
  init();
})();
