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

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

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
      const wrap = document.createElement("section");
      wrap.className = "error-category";
      wrap.innerHTML = `<h4>${esc(category.category_name)}</h4>`;
      (category.error_types || []).forEach((errorType) => {
        const row = document.createElement("div");
        row.className = "error-row";
        row.innerHTML = `
          <label style="margin:0">${esc(errorType.error_name)}</label>
          <input type="number" min="0" step="1" data-error-type-id="${esc(errorType.error_type_id)}" placeholder="Qty">
        `;
        wrap.appendChild(row);
      });
      errors.appendChild(wrap);
    });
  }

  function renderQueue() {
    const search = $("search").value.trim().toLowerCase();
    const filtered = queue.filter((job) => {
      const haystack = [job.job_number, job.employee_name, job.work_order_number, job.item_name, job.internal_id]
        .filter(Boolean).join(" ").toLowerCase();
      return !search || haystack.includes(search);
    });

    $("queue-count").textContent = String(filtered.length);
    const container = $("queue");
    container.innerHTML = "";

    if (!filtered.length) {
      container.innerHTML = '<div class="muted">No Ready for QA jobs match this view.</div>';
      return;
    }

    filtered.forEach((job) => {
      const card = document.createElement("article");
      card.className = "job";
      card.innerHTML = `
        <h3>Job #${esc(job.job_number)} · ${esc(job.item_name || "Item")}</h3>
        <div class="meta">Builder: ${esc(job.employee_name || "")} · WO: ${esc(job.work_order_number || "")} · Qty: ${esc(job.assigned_quantity ?? "")}</div>
        <div class="meta">Job Type: ${esc(job.job_type || "")} · Work Order Type: ${esc(job.work_order_type || "")}</div>
        ${job.comments ? `<div class="meta" style="margin-top:6px">Builder Comments: ${esc(job.comments)}</div>` : ""}
        <button class="primary" type="button">Review</button>
      `;
      card.querySelector("button").addEventListener("click", () => openReview(job));
      container.appendChild(card);
    });
  }

  async function loadQueue() {
    setMessage("Loading QA queue...");
    queue = await rpc("get_qa_queue", { p_session_token: sessionToken }) || [];
    renderQueue();
    setMessage("");
  }

  function openReview(job) {
    selectedJob = job;
    $("review-card").hidden = false;
    $("review-summary").innerHTML = `
      <strong>Job #${esc(job.job_number)}</strong><br>
      ${esc(job.employee_name || "")} · ${esc(job.item_name || "")} · WO ${esc(job.work_order_number || "")} · Qty ${esc(job.assigned_quantity ?? "")}
    `;
    $("review-form").reset();
    document.querySelectorAll("#errors input[data-error-type-id]").forEach((input) => input.value = "");
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
      .map((input) => ({
        error_type_id: input.dataset.errorTypeId,
        quantity: Number(input.value)
      }))
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
