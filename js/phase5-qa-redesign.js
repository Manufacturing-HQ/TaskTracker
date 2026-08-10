"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let queue = [];
  let options = null;
  let selectedJob = null;

  const style = document.createElement("style");
  style.textContent = `
    .qa-status-group{border:1px solid #dbe3ef;border-radius:12px;background:#fff;overflow:hidden;margin-bottom:12px}
    .qa-status-group>summary{list-style:none;cursor:pointer;padding:12px 14px;font-weight:900;display:flex;justify-content:space-between;align-items:center;background:#f8fafc}
    .qa-status-group>summary::-webkit-details-marker{display:none}
    .qa-status-group[data-status="PENDING"]{border-left:5px solid #2563eb}
    .qa-status-group[data-status="REWORK"]{border-left:5px solid #dc2626}
    .qa-status-group[data-status="HOLD"]{border-left:5px solid #d97706}
    .qa-rows{border-top:1px solid #e2e8f0}
    .qa-row{display:grid;grid-template-columns:minmax(130px,1.1fr) minmax(180px,1.5fr) 80px minmax(110px,.9fr) minmax(220px,2fr) auto;gap:12px;align-items:center;padding:9px 12px;border-bottom:1px solid #eef2f7;background:#fff}
    .qa-row:last-child{border-bottom:0}.qa-row:hover{background:#f8fafc}
    .qa-cell-label{display:none;font-size:10px;text-transform:uppercase;color:#64748b;font-weight:800}
    .qa-comments{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#475569;font-size:12px}
    .qa-review-btn{margin:0!important;padding:7px 11px!important;white-space:nowrap}
    .qa-context{margin:12px 0 16px;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc}
    .qa-context h3{margin:0 0 10px;font-size:15px}.qa-context-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .qa-context-item span{display:block;font-size:10px;color:#64748b;text-transform:uppercase;font-weight:800}.qa-context-item strong{font-size:13px}
    .qa-context-errors{margin-top:10px;font-size:12px;color:#475569}.qa-current-heading{margin:12px 0 4px;font-size:14px;color:#334155}
    .qa-rework-note{font-size:11px;color:#991b1b;margin-top:3px;font-weight:700}
    @media(max-width:900px){.qa-row{grid-template-columns:1fr 1fr}.qa-cell-label{display:block}.qa-context-grid{grid-template-columns:1fr 1fr}.qa-row .qa-comments{white-space:normal}.qa-review-btn{width:100%}}
  `;
  document.head.appendChild(style);

  const $esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  async function listEmployees() {
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
      const rows = await rpc("get_employee_session_context", { p_session_token: sessionToken });
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
      p_employee_id: $("employee").value,
      p_pin: $("pin").value
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.login_successful || !row.session_token) {
      setMessage(row?.login_message || "Login failed.", "error");
      return;
    }
    sessionToken = row.session_token;
    sessionStorage.setItem(sessionKey, sessionToken);
    sessionEmployee = row;
    $("pin").value = "";
    await enterApp();
  }

  async function loadOptions() {
    options = await rpc("get_qa_review_options", { p_session_token: sessionToken });
    const select = $("disposition");
    select.innerHTML = '<option value="">Select disposition</option>';
    (options?.dispositions || []).forEach((d) => {
      const option = document.createElement("option");
      option.value = d.disposition_code;
      option.textContent = d.disposition_name;
      select.appendChild(option);
    });

    const errors = $("errors");
    errors.innerHTML = "";
    (options?.error_categories || []).forEach((category) => {
      const details = document.createElement("details");
      details.className = "error-category";
      const summary = document.createElement("summary");
      summary.textContent = category.category_name;
      summary.style.cursor = "pointer";
      summary.style.fontWeight = "800";
      details.appendChild(summary);
      (category.error_types || []).forEach((errorType) => {
        const row = document.createElement("div");
        row.className = "error-row";
        row.innerHTML = `<label style="margin:0">${$esc(errorType.error_name)}</label><input type="number" min="0" step="1" data-error-type-id="${$esc(errorType.error_type_id)}" placeholder="Qty">`;
        details.appendChild(row);
      });
      errors.appendChild(details);
    });
  }

  function matchesSearch(job, search) {
    if (!search) return true;
    return [job.employee_name, job.item_name, job.job_type, job.comments, job.work_order_number]
      .filter(Boolean).join(" ").toLowerCase().includes(search);
  }

  function compactRow(job) {
    const row = document.createElement("div");
    row.className = "qa-row";
    const pendingRework = job.queue_status === "REWORK";
    const reworkStatus = job.latest_rework_request?.status || "";
    row.innerHTML = `
      <div><span class="qa-cell-label">Builder</span><strong>${$esc(job.employee_name || "—")}</strong></div>
      <div><span class="qa-cell-label">Item</span><strong>${$esc(job.item_name || "—")}</strong></div>
      <div><span class="qa-cell-label">Qty</span>${$esc(job.assigned_quantity ?? "—")}</div>
      <div><span class="qa-cell-label">Job Type</span>${$esc(job.job_type || "—")}</div>
      <div><span class="qa-cell-label">Builder Comments</span><div class="qa-comments" title="${$esc(job.comments || "")}">${$esc(job.comments || "—")}</div>${pendingRework ? `<div class="qa-rework-note">${reworkStatus === "Linked" ? "Rework in progress" : "Waiting for builder rework"}</div>` : ""}</div>
      <div><button class="primary qa-review-btn" type="button" ${pendingRework ? "disabled" : ""}>${pendingRework ? "Rework Pending" : "Review"}</button></div>`;
    if (!pendingRework) row.querySelector("button").addEventListener("click", () => openReview(job));
    return row;
  }

  function renderQueue() {
    const search = $("search").value.trim().toLowerCase();
    const filtered = queue.filter((job) => matchesSearch(job, search));
    $("queue-count").textContent = String(filtered.length);
    const container = $("queue");
    container.innerHTML = "";

    const groups = [
      { code: "PENDING", label: "Pending QA", open: true },
      { code: "REWORK", label: "Rework Returned to Builder", open: false },
      { code: "HOLD", label: "Job on Hold", open: false }
    ];

    groups.forEach((group) => {
      const jobs = filtered.filter((job) => (job.queue_status || "PENDING") === group.code);
      const details = document.createElement("details");
      details.className = "qa-status-group";
      details.dataset.status = group.code;
      details.open = group.open;
      details.innerHTML = `<summary><span>${group.label}</span><span class="pill">${jobs.length}</span></summary><div class="qa-rows"></div>`;
      const rows = details.querySelector(".qa-rows");
      if (!jobs.length) {
        rows.innerHTML = '<div class="muted" style="padding:12px">No jobs in this section.</div>';
      } else {
        jobs.forEach((job) => rows.appendChild(compactRow(job)));
      }
      container.appendChild(details);
    });
  }

  async function loadQueue() {
    setMessage("Loading QA queue...");
    queue = await rpc("get_qa_queue", { p_session_token: sessionToken }) || [];
    renderQueue();
    setMessage("");
  }

  function ensureContextBox() {
    let box = $("qa-prior-review");
    if (box) return box;
    box = document.createElement("div");
    box.id = "qa-prior-review";
    box.className = "qa-context";
    box.hidden = true;
    $("review-summary").insertAdjacentElement("afterend", box);
    const heading = document.createElement("div");
    heading.className = "qa-current-heading";
    heading.textContent = "Current QA Inspection";
    box.insertAdjacentElement("afterend", heading);
    return box;
  }

  function renderPriorReview(job) {
    const box = ensureContextBox();
    const r = job.latest_review;
    if (!r) {
      box.hidden = true;
      return;
    }
    const errors = (r.errors || []).map((e) => `${e.error_name}: ${e.quantity}`).join(" · ");
    box.hidden = false;
    box.innerHTML = `
      <h3>Previous QA Review</h3>
      <div class="qa-context-grid">
        <div class="qa-context-item"><span>Disposition</span><strong>${$esc(r.disposition_name || r.disposition_code || "—")}</strong></div>
        <div class="qa-context-item"><span>Passed / Rejected</span><strong>${$esc(r.quantity_passed ?? "—")} / ${$esc(r.quantity_rejected ?? "—")}</strong></div>
        <div class="qa-context-item"><span>Scrap</span><strong>${$esc(r.scrap_quantity ?? "—")}</strong></div>
        <div class="qa-context-item"><span>Rework Returned</span><strong>${$esc(r.rework_quantity_returned ?? "—")}</strong></div>
      </div>
      ${r.qa_comments ? `<div class="qa-context-errors"><strong>QA Comments:</strong> ${$esc(r.qa_comments)}</div>` : ""}
      ${errors ? `<div class="qa-context-errors"><strong>Errors:</strong> ${$esc(errors)}</div>` : ""}
      <div class="qa-context-errors"><em>Previous values are shown for context only. Enter the results of the current inspection below.</em></div>`;
  }

  function openReview(job) {
    selectedJob = job;
    $("review-card").hidden = false;
    $("review-summary").innerHTML = `
      <strong>${$esc(job.employee_name || "")}</strong> · ${$esc(job.item_name || "")} · Qty ${$esc(job.assigned_quantity ?? "")}
      <div class="muted" style="margin-top:4px">WO ${$esc(job.work_order_number || "—")} · ${$esc(job.job_type || "—")}${job.comments ? ` · Builder: ${$esc(job.comments)}` : ""}</div>`;
    $("review-form").reset();
    document.querySelectorAll("#errors input[data-error-type-id]").forEach((input) => input.value = "");
    renderPriorReview(job);
    $("review-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeReview() {
    selectedJob = null;
    $("review-card").hidden = true;
    $("review-form").reset();
  }

  function numberOrNull(id) {
    const value = $(id).value.trim();
    return value === "" ? null : Number(value);
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!selectedJob) return;
    const disposition = $("disposition").value;
    if (!disposition) {
      setMessage("Select a QA disposition.", "error");
      return;
    }

    const errorEntries = Array.from(document.querySelectorAll("#errors input[data-error-type-id]"))
      .map((input) => ({ error_type_id: input.dataset.errorTypeId, quantity: Number(input.value) }))
      .filter((entry) => entry.quantity > 0);

    $("submit-review").disabled = true;
    setMessage("Submitting QA review...");
    try {
      const result = await rpc("submit_qa_review", {
        p_session_token: sessionToken,
        p_job_id: selectedJob.job_id,
        p_disposition_code: disposition,
        p_quantity_passed: numberOrNull("qty-pass"),
        p_quantity_rejected: numberOrNull("qty-reject"),
        p_scrap_quantity: numberOrNull("qty-scrap"),
        p_rework_quantity_returned: numberOrNull("qty-rework"),
        p_rework_quantity_completed_by_qa: numberOrNull("qty-qa-rework"),
        p_builder_in_training: $("training").checked,
        p_error_entries: errorEntries,
        p_comments: $("qa-comments").value.trim() || null
      });
      setMessage(`QA review saved: ${result?.disposition_code || disposition}.`, "success");
      closeReview();
      await loadQueue();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("submit-review").disabled = false;
    }
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || "Employee";
    await loadOptions();
    await loadQueue();
  }

  async function init() {
    try {
      await listEmployees();
      if (await restoreSession()) {
        try {
          await enterApp();
        } catch (error) {
          $("app").hidden = true;
          $("login").hidden = false;
          setMessage(error.message, "error");
        }
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  $("login-form").addEventListener("submit", (event) => login(event).catch((e) => setMessage(e.message, "error")));
  $("refresh").addEventListener("click", () => loadQueue().catch((e) => setMessage(e.message, "error")));
  $("search").addEventListener("input", renderQueue);
  $("review-form").addEventListener("submit", submitReview);
  $("cancel-review").addEventListener("click", closeReview);

  init();
})();
