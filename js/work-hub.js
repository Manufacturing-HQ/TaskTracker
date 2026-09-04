"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Work Hub configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let sessionToken = sessionStorage.getItem(sessionKey);
  let bootstrap = null;
  let currentView = "routines";
  let routineMode = "DAILY";
  let routineTasks = [];
  let quickTasks = [];
  let projects = [];
  let activeProject = null;
  let activeProjectDetail = null;
  let queuedMentionIds = new Set();
  let projectCommentSort = "NEWEST";

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const todayLocal = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const statusLabel = (value) => ({ OPEN: "Open", ONGOING: "Ongoing", ON_HOLD: "On Hold", COMPLETE: "Complete" }[value] || value || "");

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(text, type = "info", login = false) {
    const el = login ? $("message") : $("app-message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function showError(error) {
    setMessage(error?.message || String(error), "error");
  }

  async function listEmployees() {
    const rows = await rpc("list_login_employees");
    $("employee").innerHTML = '<option value="">Select employee</option>' + (rows || [])
      .map((row) => `<option value="${esc(row.employee_id)}">${esc(row.employee_name)}</option>`).join("");
  }

  async function loadBootstrap() {
    if (!sessionToken) return false;
    bootstrap = await rpc("get_work_hub_bootstrap", { p_session_token: sessionToken });
    return true;
  }

  async function login(event) {
    event.preventDefault();
    setMessage("Signing in...", "info", true);
    try {
      const rows = await rpc("login_with_employee_pin", {
        p_employee_id: $("employee").value,
        p_pin: $("pin").value
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result?.login_successful || !result.session_token) throw new Error(result?.login_message || "Login failed.");
      sessionToken = result.session_token;
      sessionStorage.setItem(sessionKey, sessionToken);
      $("pin").value = "";
      try {
        await loadBootstrap();
      } catch (error) {
        try { await rpc("logout_employee_session", { p_session_token: sessionToken }); } catch {}
        sessionStorage.removeItem(sessionKey);
        sessionToken = null;
        throw error;
      }
      await enterApp();
    } catch (error) {
      setMessage(error.message || String(error), "error", true);
    }
  }

  async function signOut() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    bootstrap = null;
    if (token) {
      try { await rpc("logout_employee_session", { p_session_token: token }); } catch {}
    }
    window.location.replace("index.html");
  }

  function optionHtml(rows, selected = "", includeAll = false, allLabel = "All") {
    return `${includeAll ? `<option value="">${esc(allLabel)}</option>` : ""}${(rows || []).map((p) => `<option value="${esc(p.employee_id)}" ${String(p.employee_id) === String(selected) ? "selected" : ""}>${esc(p.employee_name)}${p.role ? ` · ${esc(p.role)}` : ""}</option>`).join("")}`;
  }

  function checkListHtml(rows, name, selected = []) {
    const set = new Set((selected || []).map(String));
    return (rows || []).map((p) => `<label><input type="checkbox" name="${esc(name)}" value="${esc(p.employee_id)}" ${set.has(String(p.employee_id)) ? "checked" : ""}> ${esc(p.employee_name)} <span class="muted">${esc(p.role || "")}</span></label>`).join("");
  }

  function hydratePeopleControls() {
    const viewerId = bootstrap.viewer.employee_id;
    $("routine-employee").innerHTML = optionHtml(bootstrap.people, viewerId);
    $("quick-employee").innerHTML = optionHtml(bootstrap.people, viewerId);
    $("project-owner").innerHTML = optionHtml(bootstrap.people, "", true, "All Owners");
    $("project-modal-owner").innerHTML = optionHtml(bootstrap.people, viewerId);
    $("project-task-assignee").innerHTML = optionHtml(bootstrap.people, viewerId);
    $("routine-assignees").innerHTML = checkListHtml(bootstrap.people, "routine-assignee", [viewerId]);
    $("quick-assignees").innerHTML = checkListHtml(bootstrap.people, "quick-assignee", [viewerId]);
    $("project-participants").innerHTML = checkListHtml(bootstrap.project_participants, "project-participant", []);
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("side-name").textContent = bootstrap.viewer.employee_name || "";
    $("side-meta").textContent = [bootstrap.viewer.role, bootstrap.viewer.department].filter(Boolean).join(" · ");
    hydratePeopleControls();
    $("routine-date").value = todayLocal();
    await Promise.all([loadNotifications(), loadRoutines()]);
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll("button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    ["routines", "projects", "queue"].forEach((v) => { $("view-" + v).hidden = v !== view; });
    const labels = {
      routines: ["Daily & Weekly", "Recurring operational responsibilities."],
      projects: ["Projects", "Projects, conversation, project tasks, and quick reminders."],
      queue: ["Task Queue", "Existing Supervisor Operations queue, surfaced here without changing its backend flow."]
    };
    $("page-title").textContent = labels[view][0];
    $("page-subtitle").textContent = labels[view][1];
    setMessage("");
    if (view === "routines") loadRoutines().catch(showError);
    if (view === "projects") Promise.all([loadQuickTasks(), loadProjects()]).catch(showError);
    if (view === "queue") loadQueue().catch(showError);
  }

  async function loadNotifications() {
    if (!sessionToken) return;
    const data = await rpc("get_my_notifications", { p_session_token: sessionToken, p_unread_only: false, p_limit: 40 });
    const count = Number(data?.unread_count || 0);
    $("notification-badge").textContent = count;
    $("notification-badge").hidden = count === 0;
    const rows = data?.notifications || [];
    $("notification-panel").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px 10px"><strong>Notifications</strong><button id="mark-all-notifications" class="ghost small" type="button">Mark all read</button></div>${rows.map((n) => `<div class="notification-item ${n.is_read ? "" : "unread"}" data-notification-id="${esc(n.notification_id)}"><strong>${esc(n.title)}</strong><div style="font-size:13px;margin-top:3px">${esc(n.body || "")}</div><div class="muted" style="font-size:11px;margin-top:5px">${esc(n.actor_name || "Work Hub")} · ${esc(new Date(n.created_at).toLocaleString())}</div></div>`).join("") || '<div class="empty">No notifications yet.</div>'}`;
    $("mark-all-notifications")?.addEventListener("click", async () => {
      await rpc("mark_notification_read", { p_session_token: sessionToken, p_notification_id: null, p_mark_all: true });
      await loadNotifications();
    });
    $("notification-panel").querySelectorAll("[data-notification-id]").forEach((el) => el.addEventListener("click", async () => {
      if (!el.classList.contains("unread")) return;
      await rpc("mark_notification_read", { p_session_token: sessionToken, p_notification_id: el.dataset.notificationId, p_mark_all: false });
      await loadNotifications();
    }));
  }

  async function loadRoutines() {
    if (!sessionToken || !bootstrap) return;
    const data = await rpc("get_work_hub_routines", {
      p_session_token: sessionToken,
      p_recurrence: routineMode,
      p_target_employee_id: $("routine-employee").value || bootstrap.viewer.employee_id,
      p_view_date: $("routine-date").value || todayLocal()
    });
    routineTasks = (data?.tasks || []).slice().reverse();
    renderRoutines();
  }

  function renderRoutines() {
    const host = $("routine-list");
    if (!routineTasks.length) {
      host.innerHTML = '<div class="empty">No routine tasks are scheduled for this employee and date.</div>';
      return;
    }
    host.innerHTML = routineTasks.map((task) => `<div class="routine-card ${task.is_complete ? "done" : ""}">
      <div class="routine-main">
        <input class="routine-check" type="checkbox" data-id="${esc(task.routine_id)}" ${task.is_complete ? "checked" : ""}>
        <div style="flex:1"><div class="card-title">${esc(task.title)}</div>${task.description ? `<div class="muted" style="margin-top:4px">${esc(task.description)}</div>` : ""}<div class="links">${(task.links || []).map((l) => `<a href="${esc(l.link_url)}" target="_blank" rel="noopener noreferrer">${esc(l.link_text || `Link ${l.position}`)}</a>`).join("")}</div><div class="muted" style="font-size:11px;margin-top:7px">Assigned: ${(task.assigned_employees || []).map((x) => esc(x.employee_name)).join(", ")}</div></div>
        <button class="ghost small routine-edit" type="button" data-id="${esc(task.routine_id)}">Edit</button>
      </div>
    </div>`).join("");
    host.querySelectorAll(".routine-check").forEach((el) => el.addEventListener("change", async () => {
      el.disabled = true;
      try {
        await rpc("toggle_work_hub_routine_completion", {
          p_session_token: sessionToken,
          p_routine_id: el.dataset.id,
          p_employee_id: $("routine-employee").value || bootstrap.viewer.employee_id,
          p_view_date: $("routine-date").value || todayLocal(),
          p_is_complete: el.checked
        });
        await loadRoutines();
      } catch (error) { el.disabled = false; showError(error); }
    }));
    host.querySelectorAll(".routine-edit").forEach((el) => el.addEventListener("click", () => openRoutineModal(routineTasks.find((x) => x.routine_id === el.dataset.id))));
  }

  function clearRoutineLinks() {
    for (let i = 1; i <= 4; i++) { $("routine-link-text-" + i).value = ""; $("routine-link-url-" + i).value = ""; }
  }

  function syncWeekdayVisibility() {
    $("weekday-wrap").hidden = $("routine-type").value !== "DAILY";
  }

  function openRoutineModal(task = null) {
    $("routine-modal").hidden = false;
    $("routine-id").value = task?.routine_id || "";
    $("routine-modal-title").textContent = task ? "Edit Routine Task" : "Add Routine Task";
    $("routine-type").value = task?.recurrence || routineMode;
    $("routine-title").value = task?.title || "";
    $("routine-description").value = task?.description || "";
    const selectedDays = new Set((task?.weekdays || [1,2,3,4,5]).map(Number));
    document.querySelectorAll(".weekday").forEach((el) => { el.checked = selectedDays.has(Number(el.value)); });
    $("routine-assignees").innerHTML = checkListHtml(bootstrap.people, "routine-assignee", task?.assigned_employee_ids || [bootstrap.viewer.employee_id]);
    clearRoutineLinks();
    (task?.links || []).forEach((link) => {
      if (link.position >= 1 && link.position <= 4) { $("routine-link-text-" + link.position).value = link.link_text || ""; $("routine-link-url-" + link.position).value = link.link_url || ""; }
    });
    syncWeekdayVisibility();
  }

  async function saveRoutine(event) {
    event.preventDefault();
    const weekdays = [...document.querySelectorAll(".weekday:checked")].map((x) => Number(x.value));
    const assigned = [...document.querySelectorAll('#routine-assignees input[name="routine-assignee"]:checked')].map((x) => x.value);
    const links = [];
    for (let i = 1; i <= 4; i++) {
      const url = $("routine-link-url-" + i).value.trim();
      if (url) links.push({ position: i, link_text: $("routine-link-text-" + i).value.trim() || null, link_url: url });
    }
    await rpc("save_work_hub_routine", {
      p_session_token: sessionToken,
      p_routine_id: $("routine-id").value || null,
      p_recurrence: $("routine-type").value,
      p_title: $("routine-title").value.trim(),
      p_description: $("routine-description").value.trim() || null,
      p_weekdays: weekdays,
      p_assigned_employee_ids: assigned,
      p_links: links,
      p_is_active: true
    });
    $("routine-modal").hidden = true;
    routineMode = $("routine-type").value;
    $("routine-daily").classList.toggle("active", routineMode === "DAILY");
    $("routine-weekly").classList.toggle("active", routineMode === "WEEKLY");
    await Promise.all([loadRoutines(), loadNotifications()]);
    setMessage("Routine task saved.", "success");
  }

  async function loadQuickTasks() {
    quickTasks = await rpc("get_work_hub_quick_tasks", {
      p_session_token: sessionToken,
      p_target_employee_id: $("quick-employee").value || bootstrap.viewer.employee_id,
      p_include_completed: false
    });
    renderQuickTasks();
  }

  function renderQuickTasks() {
    const host = $("quick-list");
    if (!quickTasks.length) { host.innerHTML = '<div class="empty" style="padding:12px">No active quick tasks.</div>'; return; }
    host.innerHTML = quickTasks.map((task) => `<div class="quick-card"><div style="display:flex;gap:9px;align-items:flex-start"><input class="quick-check" data-id="${esc(task.quick_task_id)}" type="checkbox" style="width:18px;height:18px;margin-top:2px"><div class="quick-open" data-id="${esc(task.quick_task_id)}" style="flex:1;cursor:pointer"><div style="font-size:13px;font-weight:750">${esc(task.description)}</div>${task.link_url ? `<a href="${esc(task.link_url)}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--blue);font-weight:700" onclick="event.stopPropagation()">${esc(task.link_text || "Task Link")}</a>` : ""}<div class="muted" style="font-size:10px;margin-top:5px">Assigned by ${esc(task.assigned_by_name || "")}</div></div></div></div>`).join("");
    host.querySelectorAll(".quick-check").forEach((el) => el.addEventListener("change", async () => {
      el.disabled = true;
      try { await rpc("toggle_work_hub_quick_task", { p_session_token: sessionToken, p_quick_task_id: el.dataset.id, p_is_complete: true }); await Promise.all([loadQuickTasks(), loadNotifications()]); } catch (error) { el.disabled = false; showError(error); }
    }));
    host.querySelectorAll(".quick-open").forEach((el) => el.addEventListener("click", () => openQuickModal(quickTasks.find((x) => x.quick_task_id === el.dataset.id))));
  }

  function openQuickModal(task = null) {
    $("quick-modal").hidden = false;
    $("quick-id").value = task?.quick_task_id || "";
    $("quick-modal-title").textContent = task ? "Edit Quick Task" : "Add Quick Task";
    $("quick-description").value = task?.description || "";
    $("quick-link-text").value = task?.link_text || "";
    $("quick-link-url").value = task?.link_url || "";
    $("quick-assignee-wrap").hidden = !!task;
    if (!task) $("quick-assignees").innerHTML = checkListHtml(bootstrap.people, "quick-assignee", [bootstrap.viewer.employee_id]);
  }

  async function saveQuickTask(event) {
    event.preventDefault();
    const id = $("quick-id").value || null;
    const assigned = id ? null : [...document.querySelectorAll('#quick-assignees input[name="quick-assignee"]:checked')].map((x) => x.value);
    await rpc("save_work_hub_quick_task", {
      p_session_token: sessionToken,
      p_quick_task_id: id,
      p_assigned_employee_ids: assigned,
      p_description: $("quick-description").value.trim(),
      p_link_text: $("quick-link-text").value.trim() || null,
      p_link_url: $("quick-link-url").value.trim() || null
    });
    $("quick-modal").hidden = true;
    await Promise.all([loadQuickTasks(), loadNotifications()]);
    setMessage("Quick task saved.", "success");
  }

  async function loadProjects() {
    const filter = $("project-status").value;
    const backendStatus = ["OPEN","ONGOING","ON_HOLD","COMPLETE"].includes(filter) ? filter : null;
    const data = await rpc("get_work_hub_projects", {
      p_session_token: sessionToken,
      p_status: backendStatus,
      p_owner_employee_id: $("project-owner").value || null,
      p_search: $("project-search").value.trim() || null
    });
    projects = Array.isArray(data) ? data : [];
    if (filter === "ACTIVE") projects = projects.filter((p) => p.status !== "COMPLETE");
    renderProjects();
  }

  function renderProjects() {
    const host = $("project-list");
    if (!projects.length) { host.innerHTML = '<div class="empty">No projects match these filters.</div>'; return; }
    host.innerHTML = projects.map((p) => `<article class="project-card" data-id="${esc(p.project_id)}" style="border-left-color:${esc(p.theme_color || "#2563eb")}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="min-width:0"><div class="card-title" style="font-size:17px">${esc(p.title)}</div><div class="muted" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.description)}</div></div><span class="pill">${esc(statusLabel(p.status))}</span></div>
      <div class="project-meta"><span>Owner: ${esc(p.owner_name)}</span><span>Due: ${esc(p.due_date || "None")}</span><span>${Number(p.open_task_count || 0)} open task${Number(p.open_task_count || 0) === 1 ? "" : "s"}</span><span>${(p.participants || []).length} participant${(p.participants || []).length === 1 ? "" : "s"}</span>${Number(p.pinned_update_count || 0) ? `<span>📌 ${Number(p.pinned_update_count)} pinned</span>` : ""}</div>
      <div class="project-actions"><button class="ghost small edit-project" type="button" data-id="${esc(p.project_id)}">Settings</button>${p.status !== "COMPLETE" ? `<button class="success small complete-project" type="button" data-id="${esc(p.project_id)}">Complete</button>` : ""}</div>
    </article>`).join("");
    host.querySelectorAll(".project-card").forEach((el) => el.addEventListener("click", (event) => {
      if (event.target.closest("button,a")) return;
      openProjectDrawer(el.dataset.id).catch(showError);
    }));
    host.querySelectorAll(".edit-project").forEach((el) => el.addEventListener("click", (event) => { event.stopPropagation(); openProjectModal(projects.find((p) => p.project_id === el.dataset.id)); }));
    host.querySelectorAll(".complete-project").forEach((el) => el.addEventListener("click", async (event) => {
      event.stopPropagation();
      const p = projects.find((x) => x.project_id === el.dataset.id);
      if (!p || !confirm(`Mark ${p.title} complete?`)) return;
      try {
        await saveProjectRecord(p, "COMPLETE");
        await Promise.all([loadProjects(), loadNotifications()]);
      } catch (error) { showError(error); }
    }));
  }

  function openProjectModal(project = null) {
    $("project-modal").hidden = false;
    $("project-id").value = project?.project_id || "";
    $("project-modal-title").textContent = project ? "Edit Project" : "New Project";
    $("project-title").value = project?.title || "";
    $("project-description").value = project?.description || "";
    $("project-modal-status").value = project?.status || "OPEN";
    $("project-modal-owner").innerHTML = optionHtml(bootstrap.people, project?.owner_employee_id || bootstrap.viewer.employee_id);
    $("project-due").value = project?.due_date || "";
    $("project-color").value = project?.theme_color || "#2563eb";
    $("project-participants").innerHTML = checkListHtml(bootstrap.project_participants, "project-participant", (project?.participants || []).map((x) => x.employee_id));
  }

  async function saveProjectRecord(project, overrideStatus = null) {
    return rpc("save_work_hub_project", {
      p_session_token: sessionToken,
      p_project_id: project?.project_id || null,
      p_title: project?.title || $("project-title").value.trim(),
      p_description: project?.description || $("project-description").value.trim(),
      p_status: overrideStatus || project?.status || $("project-modal-status").value,
      p_owner_employee_id: project?.owner_employee_id || $("project-modal-owner").value,
      p_due_date: project?.due_date || $("project-due").value || null,
      p_theme_color: project?.theme_color || $("project-color").value,
      p_participant_employee_ids: project ? (project.participants || []).map((x) => x.employee_id) : [...document.querySelectorAll('#project-participants input[name="project-participant"]:checked')].map((x) => x.value)
    });
  }

  async function saveProject(event) {
    event.preventDefault();
    const existing = projects.find((p) => p.project_id === $("project-id").value);
    const payload = {
      project_id: existing?.project_id || null,
      title: $("project-title").value.trim(),
      description: $("project-description").value.trim(),
      status: $("project-modal-status").value,
      owner_employee_id: $("project-modal-owner").value,
      due_date: $("project-due").value || null,
      theme_color: $("project-color").value,
      participants: [...document.querySelectorAll('#project-participants input[name="project-participant"]:checked')].map((el) => ({ employee_id: el.value }))
    };
    await rpc("save_work_hub_project", {
      p_session_token: sessionToken,
      p_project_id: payload.project_id,
      p_title: payload.title,
      p_description: payload.description,
      p_status: payload.status,
      p_owner_employee_id: payload.owner_employee_id,
      p_due_date: payload.due_date,
      p_theme_color: payload.theme_color,
      p_participant_employee_ids: payload.participants.map((x) => x.employee_id)
    });
    $("project-modal").hidden = true;
    await Promise.all([loadProjects(), loadNotifications()]);
    if (activeProject?.project_id === payload.project_id) await openProjectDrawer(payload.project_id);
    setMessage("Project saved.", "success");
  }

  async function openProjectDrawer(projectId) {
    activeProjectDetail = await rpc("get_work_hub_project_detail", { p_session_token: sessionToken, p_project_id: projectId });
    activeProject = activeProjectDetail.project;
    $("drawer-title").textContent = activeProject.title;
    $("drawer-meta").textContent = [statusLabel(activeProject.status), `Owner: ${activeProject.owner_name}`, activeProject.due_date ? `Due: ${activeProject.due_date}` : null].filter(Boolean).join(" · ");
    renderProjectDrawer();
    $("drawer-overlay").classList.add("open");
    $("project-drawer").classList.add("open");
  }

  function closeProjectDrawer() {
    $("drawer-overlay").classList.remove("open");
    $("project-drawer").classList.remove("open");
    $("mention-menu").hidden = true;
  }

  function renderProjectDrawer() {
    const p = activeProjectDetail.project;
    const tasks = activeProjectDetail.tasks || [];
    const updates = activeProjectDetail.updates || [];
    const sortedUpdates = [...updates].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime() || 0;
      const bTime = new Date(b.created_at).getTime() || 0;
      return projectCommentSort === "OLDEST" ? aTime - bTime : bTime - aTime;
    });

    $("drawer-content").innerHTML = `
      <section class="project-section project-summary-section">
        <div class="section-title"><h2>Project Description</h2><button id="drawer-edit-project" class="ghost small" type="button">Project Settings</button></div>
        <div class="project-description">${esc(p.description)}</div>
        <div class="project-meta"><span><strong>Participants:</strong> ${(p.participants || []).map((x) => esc(x.employee_name)).join(", ") || "None"}</span></div>
      </section>

      <section class="project-section project-comments-section">
        <div class="project-comments-toolbar">
          <div><h2>Comments</h2><div class="muted">Project conversation and activity.</div></div>
          <div class="field"><label>Sort Comments</label><select id="comment-sort"><option value="NEWEST" ${projectCommentSort === "NEWEST" ? "selected" : ""}>Newest to Oldest</option><option value="OLDEST" ${projectCommentSort === "OLDEST" ? "selected" : ""}>Oldest to Newest</option></select></div>
        </div>
        <div id="project-feed">${sortedUpdates.map(renderUpdate).join("") || '<div class="empty">No comments yet.</div>'}</div>
      </section>

      <section class="project-section project-tasks-section">
        <div class="section-title"><h2>Project Tasks</h2><button id="drawer-add-task" class="success small" type="button">+ Add Task</button></div>
        <div id="drawer-task-list" class="project-task-list">${tasks.map((t) => `<div class="task-item ${t.status === "COMPLETE" ? "done" : ""}"><div class="card-title">${esc(t.description)}</div><div class="muted" style="font-size:12px;margin-top:5px">${esc(t.assigned_employee_name)}${t.due_date ? ` · Due ${esc(t.due_date)}` : ""}</div>${t.link_url ? `<div class="links"><a href="${esc(t.link_url)}" target="_blank" rel="noopener noreferrer">${esc(t.link_text || "Task Link")}</a></div>` : ""}<div class="project-actions"><button class="ghost small edit-project-task" data-id="${esc(t.project_task_id)}" type="button">Edit</button>${t.status === "OPEN" ? `<button class="success small complete-project-task" data-id="${esc(t.project_task_id)}" type="button">Complete</button>` : `<button class="ghost small reopen-project-task" data-id="${esc(t.project_task_id)}" type="button">Reopen</button>`}</div></div>`).join("") || '<div class="empty">No project tasks yet.</div>'}</div>
      </section>

      <section class="project-section project-update-section">
        <div class="section-title"><div><h2>Add Update</h2><div class="muted">General updates are the default. Choose a task only when the update is specifically about that task.</div></div></div>
        <div class="composer">
          <div class="field" style="margin:0 0 10px"><label>Update Type</label><select id="comment-task"><option value="">General Update</option>${tasks.map((t) => `<option value="${esc(t.project_task_id)}">Task: ${esc(t.description)}</option>`).join("")}</select></div>
          <div style="position:relative"><textarea id="project-comment" placeholder="Post an update. Type @ to mention someone."></textarea></div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px"><span class="muted" style="font-size:11px">Screenshot/file paste is next after the core pilot is validated.</span><button id="post-project-comment" class="primary small" type="button">Post Update</button></div>
        </div>
      </section>`;

    $("drawer-edit-project")?.addEventListener("click", () => openProjectModal(projects.find((x) => x.project_id === p.project_id) || p));
    $("drawer-add-task")?.addEventListener("click", () => openProjectTaskModal());
    $("drawer-content").querySelectorAll(".edit-project-task").forEach((el) => el.addEventListener("click", () => openProjectTaskModal(tasks.find((t) => t.project_task_id === el.dataset.id))));
    $("drawer-content").querySelectorAll(".complete-project-task").forEach((el) => el.addEventListener("click", () => toggleProjectTask(el.dataset.id, true)));
    $("drawer-content").querySelectorAll(".reopen-project-task").forEach((el) => el.addEventListener("click", () => toggleProjectTask(el.dataset.id, false)));
    $("drawer-content").querySelectorAll(".pin-update").forEach((el) => el.addEventListener("click", () => togglePin(el.dataset.id, el.dataset.pinned !== "true")));
    $("comment-sort")?.addEventListener("change", (event) => {
      projectCommentSort = event.target.value === "OLDEST" ? "OLDEST" : "NEWEST";
      renderProjectDrawer();
    });
    $("post-project-comment")?.addEventListener("click", postProjectUpdate);
    $("project-comment")?.addEventListener("input", handleMentionInput);
    queuedMentionIds = new Set();
  }

  function renderUpdate(update) {
    const taskLabel = update.project_task_description ? `Task: ${update.project_task_description}` : "General Update";
    const pin = update.is_pinned ? " 📌" : "";
    const attachments = (update.attachments || []).length ? `<div class="links">${update.attachments.map((a) => `<span>📎 ${esc(a.file_name)}</span>`).join("")}</div>` : "";
    return `<article class="feed-item ${update.update_type === "SYSTEM" ? "system" : ""} ${update.is_pinned ? "pinned" : ""}"><div class="feed-meta"><strong>${esc(update.update_type === "SYSTEM" ? "System" : update.author_name || "Unknown")}</strong> · ${esc(taskLabel)} · ${esc(new Date(update.created_at).toLocaleString())}${pin}</div><div style="white-space:pre-wrap">${esc(update.body)}</div>${attachments}${update.update_type === "COMMENT" ? `<div style="margin-top:8px"><button class="ghost small pin-update" type="button" data-id="${esc(update.update_id)}" data-pinned="${update.is_pinned ? "true" : "false"}">${update.is_pinned ? "Unpin" : "Pin Update"}</button></div>` : ""}</article>`;
  }

  function openProjectTaskModal(task = null) {
    $("project-task-modal").hidden = false;
    $("project-task-id").value = task?.project_task_id || "";
    $("project-task-modal-title").textContent = task ? "Edit Project Task" : "Add Project Task";
    $("project-task-description").value = task?.description || "";
    $("project-task-assignee").innerHTML = optionHtml(bootstrap.people, task?.assigned_employee_id || bootstrap.viewer.employee_id);
    $("project-task-due").value = task?.due_date || "";
    $("project-task-link-text").value = task?.link_text || "";
    $("project-task-link-url").value = task?.link_url || "";
  }

  async function saveProjectTask(event) {
    event.preventDefault();
    await rpc("save_work_hub_project_task", {
      p_session_token: sessionToken,
      p_project_task_id: $("project-task-id").value || null,
      p_project_id: activeProject.project_id,
      p_description: $("project-task-description").value.trim(),
      p_assigned_employee_id: $("project-task-assignee").value,
      p_due_date: $("project-task-due").value || null,
      p_link_text: $("project-task-link-text").value.trim() || null,
      p_link_url: $("project-task-link-url").value.trim() || null
    });
    $("project-task-modal").hidden = true;
    await Promise.all([openProjectDrawer(activeProject.project_id), loadProjects(), loadNotifications()]);
  }

  async function toggleProjectTask(taskId, complete) {
    try {
      await rpc("toggle_work_hub_project_task", { p_session_token: sessionToken, p_project_task_id: taskId, p_is_complete: complete });
      await Promise.all([openProjectDrawer(activeProject.project_id), loadProjects(), loadNotifications()]);
    } catch (error) { showError(error); }
  }

  function peopleForMentions() {
    return bootstrap.people || [];
  }

  function handleMentionInput(event) {
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    const left = value.slice(0, cursor);
    const match = left.match(/@([^@\n]{0,40})$/);
    const menu = $("mention-menu");
    if (!match) { menu.hidden = true; return; }
    const query = match[1].trim().toLowerCase();
    const matches = peopleForMentions().filter((p) => !query || p.employee_name.toLowerCase().includes(query)).slice(0, 7);
    if (!matches.length) { menu.hidden = true; return; }
    const rect = event.target.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left + 12, window.innerWidth - 300)}px`;
    menu.style.top = `${Math.min(rect.bottom - 20, window.innerHeight - 220)}px`;
    menu.style.width = "280px";
    menu.innerHTML = matches.map((p) => `<button type="button" data-id="${esc(p.employee_id)}" data-name="${esc(p.employee_name)}">${esc(p.employee_name)} <span class="muted">${esc(p.role || "")}</span></button>`).join("");
    menu.hidden = false;
    menu.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      const start = cursor - match[0].length;
      const insert = `@${button.dataset.name} `;
      event.target.value = value.slice(0, start) + insert + value.slice(cursor);
      const pos = start + insert.length;
      event.target.focus();
      event.target.setSelectionRange(pos, pos);
      queuedMentionIds.add(button.dataset.id);
      menu.hidden = true;
    }));
  }

  function detectedMentionIds(text) {
    const lower = text.toLowerCase();
    const ids = new Set([...queuedMentionIds]);
    peopleForMentions().forEach((p) => { if (lower.includes(`@${p.employee_name.toLowerCase()}`)) ids.add(p.employee_id); });
    return [...ids];
  }

  async function postProjectUpdate() {
    const body = $("project-comment").value.trim();
    if (!body) return;
    try {
      await rpc("add_work_hub_project_update", {
        p_session_token: sessionToken,
        p_project_id: activeProject.project_id,
        p_project_task_id: $("comment-task").value || null,
        p_body: body,
        p_mention_employee_ids: detectedMentionIds(body)
      });
      $("project-comment").value = "";
      queuedMentionIds = new Set();
      await Promise.all([openProjectDrawer(activeProject.project_id), loadProjects(), loadNotifications()]);
    } catch (error) { showError(error); }
  }

  async function togglePin(updateId, pinned) {
    try {
      await rpc("toggle_work_hub_update_pin", { p_session_token: sessionToken, p_update_id: updateId, p_is_pinned: pinned });
      await openProjectDrawer(activeProject.project_id);
    } catch (error) { showError(error); }
  }

  async function loadQueue() {
    const data = await rpc("get_my_supervisor_tasks", {
      p_session_token: sessionToken,
      p_include_completed: $("queue-completed").checked
    });
    const rows = Array.isArray(data) ? data : [];
    const host = $("queue-list");
    if (!rows.length) { host.innerHTML = '<div class="empty">No operational tasks match this view.</div>'; return; }
    host.innerHTML = rows.map((t) => `<div class="queue-card"><h3>${esc(t.title || t.task_type_name)}</h3><div class="muted" style="font-size:12px">${esc([t.task_type_name,t.assigned_supervisor_name ? `Assigned to ${t.assigned_supervisor_name}` : null,t.employee_name,t.business_date ? `Business ${t.business_date}` : null,t.due_date ? `Due ${t.due_date}` : null,t.status].filter(Boolean).join(" · "))}</div>${t.details ? `<div style="margin-top:8px">${esc(t.details)}</div>` : ""}${["Pending","In Progress"].includes(t.status) ? `<div style="margin-top:10px"><button class="primary small queue-complete" data-id="${esc(t.supervisor_task_id)}" type="button">Complete</button></div>` : ""}</div>`).join("");
    host.querySelectorAll(".queue-complete").forEach((el) => el.addEventListener("click", async () => {
      el.disabled = true;
      try { await rpc("complete_supervisor_task", { p_session_token: sessionToken, p_supervisor_task_id: el.dataset.id, p_completion_notes: null }); await loadQueue(); } catch (error) { el.disabled = false; showError(error); }
    }));
  }

  function bindEvents() {
    $("login-form").addEventListener("submit", login);
    $("sign-out").addEventListener("click", () => signOut().catch(showError));
    document.querySelectorAll("button[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
    $("notification-button").addEventListener("click", () => { $("notification-panel").hidden = !$("notification-panel").hidden; if (!$("notification-panel").hidden) loadNotifications().catch(showError); });
    $("routine-daily").addEventListener("click", () => { routineMode = "DAILY"; $("routine-daily").classList.add("active"); $("routine-weekly").classList.remove("active"); loadRoutines().catch(showError); });
    $("routine-weekly").addEventListener("click", () => { routineMode = "WEEKLY"; $("routine-weekly").classList.add("active"); $("routine-daily").classList.remove("active"); loadRoutines().catch(showError); });
    $("routine-employee").addEventListener("change", () => loadRoutines().catch(showError));
    $("routine-date").addEventListener("change", () => loadRoutines().catch(showError));
    $("add-routine").addEventListener("click", () => openRoutineModal());
    $("routine-type").addEventListener("change", syncWeekdayVisibility);
    $("routine-form").addEventListener("submit", (e) => saveRoutine(e).catch(showError));
    $("quick-employee").addEventListener("change", () => loadQuickTasks().catch(showError));
    $("add-quick").addEventListener("click", () => openQuickModal());
    $("quick-form").addEventListener("submit", (e) => saveQuickTask(e).catch(showError));
    $("toggle-quick-rail").addEventListener("click", () => $("projects-layout").classList.toggle("quick-collapsed"));
    $("new-project").addEventListener("click", () => openProjectModal());
    $("project-form").addEventListener("submit", (e) => saveProject(e).catch(showError));
    $("project-status").addEventListener("change", () => loadProjects().catch(showError));
    $("project-owner").addEventListener("change", () => loadProjects().catch(showError));
    let searchTimer = null;
    $("project-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProjects().catch(showError), 250); });
    $("refresh-projects").addEventListener("click", () => loadProjects().catch(showError));
    $("close-drawer").addEventListener("click", closeProjectDrawer);
    $("drawer-overlay").addEventListener("click", closeProjectDrawer);
    $("project-task-form").addEventListener("submit", (e) => saveProjectTask(e).catch(showError));
    $("queue-completed").addEventListener("change", () => loadQueue().catch(showError));
    document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { $(button.dataset.close).hidden = true; }));
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".notification-wrap")) $("notification-panel").hidden = true;
      if (!event.target.closest("#mention-menu") && event.target !== $("project-comment")) $("mention-menu").hidden = true;
    });
  }

  async function init() {
    bindEvents();
    await listEmployees();
    if (!sessionToken) return;
    try {
      await loadBootstrap();
      await enterApp();
    } catch (error) {
      setMessage(error.message || "Work Hub is currently limited to Administrators during pilot testing.", "error", true);
    }
  }

  init().catch((error) => setMessage(error.message || String(error), "error", true));
})();