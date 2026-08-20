"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let sessionEmployee = null;
  let setupOptions = null;
  let currentPlanId = null;

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function escapeHtml(value) {
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
    await enterApp();
  }

  function fillSelect(id, items, valueKey, labelFn, placeholder) {
    const select = $(id);
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    (items || []).forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = labelFn(item);
      select.appendChild(option);
    });
  }

  async function loadSetupOptions() {
    try {
      setupOptions = await rpc("get_training_setup_options", { p_session_token: sessionToken });
      $("setup-card").hidden = !setupOptions?.can_create_plan;
      fillSelect("trainee", setupOptions.trainees || [], "employee_id", (x) => [x.employee_name, x.department].filter(Boolean).join(" · "), "Select trainee");
      fillSelect("trainer", setupOptions.trainers || [], "employee_id", (x) => [x.employee_name, x.role].filter(Boolean).join(" · "), "Select trainer");
      fillSelect("template", setupOptions.templates || [], "template_id", (x) => `${x.template_name} v${x.version_number}`, "Select template");
    } catch {
      $("setup-card").hidden = true;
    }
  }

  async function createPlan(event) {
    event.preventDefault();
    const trainee = $("trainee").value;
    const trainer = $("trainer").value;
    const template = $("template").value;
    if (!trainee || !trainer || !template) {
      setMessage("Select a trainee, trainer, and template.", "error");
      return;
    }
    const result = await rpc("create_training_plan", {
      p_session_token: sessionToken,
      p_employee_id: trainee,
      p_trainer_employee_id: trainer,
      p_template_id: template
    });
    setMessage(`Training plan created for ${result.employee_name}.`, "success");
    await loadPlans();
    await openPlan(result.training_plan_id);
  }

  async function loadPlans() {
    const data = await rpc("get_my_training_plans", { p_session_token: sessionToken });
    const plans = Array.isArray(data) ? data : (data?.plans || []);
    const wrap = $("plans");
    wrap.innerHTML = "";
    if (!plans.length) {
      wrap.innerHTML = '<div class="muted">No training plans are available.</div>';
      return;
    }
    plans.forEach((plan) => {
      const card = document.createElement("div");
      card.className = "mini";
      card.innerHTML = `<div class="row"><div><strong>${escapeHtml(plan.template_name || "Training Plan")}</strong><div class="muted">${escapeHtml([plan.employee_name, plan.trainer_name, plan.status].filter(Boolean).join(" · "))}</div></div><button class="secondary" type="button">Open</button></div>`;
      card.querySelector("button").addEventListener("click", () => openPlan(plan.training_plan_id));
      wrap.appendChild(card);
    });
  }

  async function openPlan(planId) {
    const plan = await rpc("get_training_plan", {
      p_session_token: sessionToken,
      p_training_plan_id: planId
    });
    currentPlanId = planId;
    $("detail-card").hidden = false;
    $("detail-title").textContent = `${plan.template?.template_name || "Training Plan"}`;
    $("detail-meta").textContent = [plan.employee?.employee_name, plan.trainer?.employee_name ? `Trainer: ${plan.trainer.employee_name}` : null].filter(Boolean).join(" · ");
    $("detail-status").textContent = plan.status || "";

    const itemsWrap = $("items");
    itemsWrap.innerHTML = "";
    let lastSection = null;
    (plan.items || []).forEach((item) => {
      if (item.section_name !== lastSection) {
        const section = document.createElement("div");
        section.className = "section-title";
        section.textContent = item.section_name || "Checklist";
        itemsWrap.appendChild(section);
        lastSection = item.section_name;
      }
      const row = document.createElement("div");
      row.className = "mini item-row";
      const checked = Boolean(item.completed_at);
      row.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} ${plan.can_edit_items ? "" : "disabled"}><div><strong>${escapeHtml(item.item_text)}</strong><div class="muted">${checked ? `Completed${item.completed_by_name ? ` by ${escapeHtml(item.completed_by_name)}` : ""}` : "Not completed"}${item.completion_notes ? ` · ${escapeHtml(item.completion_notes)}` : ""}</div></div>`;
      if (plan.can_edit_items) {
        row.querySelector("input").addEventListener("change", async (event) => {
          try {
            await rpc("set_training_item_completion", {
              p_session_token: sessionToken,
              p_training_item_id: item.training_item_id,
              p_is_complete: event.target.checked,
              p_notes: null
            });
            await openPlan(planId);
          } catch (error) {
            setMessage(error.message, "error");
            event.target.checked = checked;
          }
        });
      }
      itemsWrap.appendChild(row);
    });

    const commentsWrap = $("comments");
    commentsWrap.innerHTML = "";
    (plan.comments || []).forEach((comment) => {
      const row = document.createElement("div");
      row.className = "mini";
      row.innerHTML = `<strong>${escapeHtml(comment.created_by_name || "Employee")}</strong><div>${escapeHtml(comment.comment_text)}</div><div class="muted">${escapeHtml(comment.created_at || "")}</div>`;
      commentsWrap.appendChild(row);
    });
    if (!(plan.comments || []).length) commentsWrap.innerHTML = '<div class="muted">No comments yet.</div>';

    $("comment-editor").hidden = !plan.can_add_comment;
    $("complete-plan-wrap").hidden = !plan.can_complete_plan || plan.status !== "Active";
  }

  async function addComment() {
    const text = $("new-comment").value.trim();
    if (!text || !currentPlanId) return;
    await rpc("add_training_comment", {
      p_session_token: sessionToken,
      p_training_plan_id: currentPlanId,
      p_comment_text: text
    });
    $("new-comment").value = "";
    await openPlan(currentPlanId);
  }

  async function completePlan() {
    if (!currentPlanId) return;
    try {
      await rpc("complete_training_plan", {
        p_session_token: sessionToken,
        p_training_plan_id: currentPlanId
      });
      setMessage("Training plan completed.", "success");
      await loadPlans();
      await openPlan(currentPlanId);
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function refreshAll() {
    await loadSetupOptions();
    await loadPlans();
    if (currentPlanId) {
      try { await openPlan(currentPlanId); } catch { currentPlanId = null; $("detail-card").hidden = true; }
    }
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("user-name").textContent = sessionEmployee?.employee_name || "Employee";
    setMessage("");
    await refreshAll();
  }

  async function init() {
    await listEmployees();
    if (await restoreSession()) await enterApp();
  }

  $("login-form").addEventListener("submit", (e) => login(e).catch((err) => setMessage(err.message, "error")));
  $("setup-form").addEventListener("submit", (e) => createPlan(e).catch((err) => setMessage(err.message, "error")));
  $("refresh").addEventListener("click", () => refreshAll().catch((err) => setMessage(err.message, "error")));
  $("add-comment").addEventListener("click", () => addComment().catch((err) => setMessage(err.message, "error")));
  $("complete-plan").addEventListener("click", completePlan);

  init().catch((err) => setMessage(err.message, "error"));
})();
