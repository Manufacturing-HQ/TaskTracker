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
  let queueAssignmentSetup = null;

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

  const statusLabel = (value) => ({
    OPEN: "Open",
    ONGOING: "Ongoing",
    ON_HOLD: "On Hold",
    COMPLETE: "Complete"
  }[value] || value || "");

  const canManage = () => !!bootstrap?.viewer?.can_manage;
  const assignmentPeople = () => bootstrap?.assignment_people || bootstrap?.people || [];
  const mentionPeople = () => bootstrap?.mention_people || bootstrap?.people || [];

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

  function applyProductLabels() {
    const pilotCopy = document.querySelector("#login .muted");
    if (pilotCopy) pilotCopy.textContent = "Daily routines, projects, quick tasks, and your operational task queue.";
    const brandCopy = document.querySelector(".brand > div:last-child > div");
    if (brandCopy) brandCopy.textContent = "Operations Workspace";
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
      if (!result?.login_successful || !result.session_token) {
        throw new Error(result?.login_message || "Login failed.");
      }
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
    return `${includeAll ? `<option value="">${esc(allLabel)}</option>` : ""}${(rows || []).map((p) =>
      `<option value="${esc(p.employee_id)}" ${String(p.employee_id) === String(selected) ? "selected" : ""}>${esc(p.employee_name)}${p.role ? ` · ${esc(p.role)}` : ""}</option>`
    ).join("")}`;
  }

  function checkListHtml(rows, name, selected = []) {
    const selectedSet = new Set((selected || []).map(String));
    return (rows || []).map((p) =>
      `<label><input type="checkbox" name="${esc(name)}" value="${esc(p.employee_id)}" ${selectedSet.has(String(p.employee_id)) ? "checked" : ""}> ${esc(p.employee_name)} <span class="muted">${esc(p.role || "")}</span></label>`
    ).join("");
  }

  function hydratePeopleControls() {
    const viewerId = bootstrap.viewer.employee_id;
    const assignments = assignmentPeople();
    const allPeople = bootstrap.people || assignments;

    $("routine-employee").innerHTML = optionHtml(assignments, viewerId);
    $("quick-employee").innerHTML = optionHtml(assignments, viewerId);
    $("routine-employee").disabled = !canManage();
    $("quick-employee").disabled = !canManage();

    $("project-owner").innerHTML = optionHtml(allPeople, "", true, "All Owners");
    $("project-modal-owner").innerHTML = optionHtml(canManage() ? allPeople : assignments, viewerId);
    $("routine-assignees").innerHTML = checkListHtml(assignments, "routine-assignee", [viewerId]);
    $("quick-assignees").innerHTML = checkListHtml(assignments, "quick-assignee", [viewerId]);
    $("project-participants").innerHTML = checkListHtml(bootstrap.project_participants || [], "project-participant", []);
  }

  function viewFromHash() {
    const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
    return ["routines", "projects", "queue"].includes(hash) ? hash : "routines";
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("side-name").textContent = bootstrap.viewer.employee_name || "";
    $("side-meta").textContent = [bootstrap.viewer.role, bootstrap.viewer.department].filter(Boolean).join(" · ");
    hydratePeopleControls();
    ensureQueueAssignmentUi();
    $("routine-date").value = todayLocal();
    await loadNotifications();
    switchView(viewFromHash(), false);
  }

  function switchView(view, updateHash = true) {
    if (!["routines", "projects", "queue"].includes(view)) view = "routines";
    currentView = view;
    document.querySelectorAll("button[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    ["routines", "projects", "queue"].forEach((name) => {
      $("view-" + name).hidden = name !== view;
    });

    const labels = {
      routines: ["Daily & Weekly", "Recurring operational responsibilities."],
      projects: ["Projects", "Projects, conversation, project tasks, and quick reminders."],
      queue: ["Task Queue", "Your existing Supervisor Operations queue, now organized inside Work Hub."]
    };
    $("page-title").textContent = labels[view][0];
    $("page-subtitle").textContent = labels[view][1];
    setMessage("");

    if (updateHash && window.location.hash !== `#${view}`) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
    }

    if (view === "routines") loadRoutines().catch(showError);
    if (view === "projects") Promise.all([loadQuickTasks(), loadProjects()]).catch(showError);
    if (view === "queue") loadQueue().catch(showError);
  }

  async function navigateNotification(notification) {
    const type = notification.record_type || "";
    let view = "projects";
    if (type === "ROUTINE") view = "routines";
    else if (type === "QUICK_TASK" || type === "PROJECT" || type === "PROJECT_TASK") view = "projects";
    else if (notification.link_path?.includes("#queue")) view = "queue";

    switchView(view);
    if (view === "projects" && type === "PROJECT" && notification.record_id) {
      await Promise.all([loadQuickTasks(), loadProjects()]);
      const card = Array.from(document.querySelectorAll(".project-card[data-id]")).find((el) => el.dataset.id === notification.record_id);
      if (card) card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }

  async function loadNotifications() {
    if (!sessionToken) return;
    const data = await rpc("get_my_notifications", {
      p_session_token: sessionToken,
      p_unread_only: false,
      p_limit: 40
    });
    const count = Number(data?.unread_count || 0);
    $("notification-badge").textContent = String(count);
    $("notification-badge").hidden = count === 0;
    const rows = data?.notifications || [];

    $("notification-panel").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px 10px">
        <strong>Notifications</strong>
        <button id="mark-all-notifications" class="ghost small" type="button">Mark all read</button>
      </div>
      ${rows.map((n, index) => `<button type="button" class="notification-item ${n.is_read ? "" : "unread"}" data-notification-index="${index}" style="display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #e2e8f0;cursor:pointer">
        <strong>${esc(n.title)}</strong>
        <div style="font-size:13px;margin-top:3px">${esc(n.body || "")}</div>
        <div class="muted" style="font-size:11px;margin-top:5px">${esc(n.actor_name || "Work Hub")} · ${esc(new Date(n.created_at).toLocaleString())}</div>
      </button>`).join("") || '<div class="empty">No notifications yet.</div>'}`;

    $("mark-all-notifications")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await rpc("mark_notification_read", {
        p_session_token: sessionToken,
        p_notification_id: null,
        p_mark_all: true
      });
      await loadNotifications();
    });

    $("notification-panel").querySelectorAll("[data-notification-index]").forEach((el) => {
      el.addEventListener("click", async () => {
        const notification = rows[Number(el.dataset.notificationIndex)];
        if (!notification) return;
        try {
          if (!notification.is_read) {
            await rpc("mark_notification_read", {
              p_session_token: sessionToken,
              p_notification_id: notification.notification_id,
              p_mark_all: false
            });
          }
          $("notification-panel").hidden = true;
          await navigateNotification(notification);
          await loadNotifications();
        } catch (error) {
          showError(error);
        }
      });
    });
  }

  async function loadRoutines() {
    if (!sessionToken || !bootstrap) return;
    const data = await rpc("get_work_hub_routines", {
      p_session_token: sessionToken,
      p_recurrence: routineMode,
      p_target_employee_id: $("routine-employee").value || bootstrap.viewer.employee_id,
      p_view_date: $("routine-date").value || todayLocal()
    });
    routineTasks = data?.tasks || [];
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
        <div style="flex:1">
          <div class="card-title">${esc(task.title)}</div>
          ${task.description ? `<div class="muted" style="margin-top:4px">${esc(task.description)}</div>` : ""}
          <div class="links">${(task.links || []).map((link) => `<a href="${esc(link.link_url)}" target="_blank" rel="noopener noreferrer">${esc(link.link_text || `Link ${link.position}`)}</a>`).join("")}</div>
          <div class="muted" style="font-size:11px;margin-top:7px">Assigned: ${(task.assigned_employees || []).map((x) => esc(x.employee_name)).join(", ")}</div>
        </div>
        ${task.can_edit ? `<button class="ghost small routine-edit" type="button" data-id="${esc(task.routine_id)}">Edit</button>` : ""}
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
      } catch (error) {
        el.disabled = false;
        showError(error);
      }
    }));

    host.querySelectorAll(".routine-edit").forEach((el) => {
      el.addEventListener("click", () => openRoutineModal(routineTasks.find((x) => x.routine_id === el.dataset.id)));
    });
  }

  function clearRoutineLinks() {
    for (let i = 1; i <= 4; i += 1) {
      $("routine-link-text-" + i).value = "";
      $("routine-link-url-" + i).value = "";
    }
  }

  function syncWeekdayVisibility() {
    $("weekday-wrap").hidden = $("routine-type").value !== "DAILY";
  }

  function openRoutineModal(task = null) {
    if (task && !task.can_edit) return;
    $("routine-modal").hidden = false;
    $("routine-id").value = task?.routine_id || "";
    $("routine-modal-title").textContent = task ? "Edit Routine Task" : "Add Routine Task";
    $("routine-type").value = task?.recurrence || routineMode;
    $("routine-title").value = task?.title || "";
    $("routine-description").value = task?.description || "";
    const selectedDays = new Set((task?.weekdays || [1, 2, 3, 4, 5]).map(Number));
    document.querySelectorAll(".weekday").forEach((el) => { el.checked = selectedDays.has(Number(el.value)); });
    $("routine-assignees").innerHTML = checkListHtml(assignmentPeople(), "routine-assignee", task?.assigned_employee_ids || [bootstrap.viewer.employee_id]);
    clearRoutineLinks();
    (task?.links || []).forEach((link) => {
      if (link.position >= 1 && link.position <= 4) {
        $("routine-link-text-" + link.position).value = link.link_text || "";
        $("routine-link-url-" + link.position).value = link.link_url || "";
      }
    });
    syncWeekdayVisibility();
  }

  async function saveRoutine(event) {
    event.preventDefault();
    const weekdays = [...document.querySelectorAll(".weekday:checked")].map((x) => Number(x.value));
    const assigned = [...document.querySelectorAll('#routine-assignees input[name="routine-assignee"]:checked')].map((x) => x.value);
    const links = [];
    for (let i = 1; i <= 4; i += 1) {
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
    if (!quickTasks.length) {
      host.innerHTML = '<div class="empty" style="padding:12px">No active quick tasks.</div>';
      return;
    }

    host.innerHTML = quickTasks.map((task) => `<div class="quick-card">
      <div style="display:flex;gap:9px;align-items:flex-start">
        <input class="quick-check" data-id="${esc(task.quick_task_id)}" type="checkbox" style="width:18px;height:18px;margin-top:2px">
        <div class="${task.can_edit ? "quick-open" : ""}" data-id="${esc(task.quick_task_id)}" style="flex:1;${task.can_edit ? "cursor:pointer" : ""}">
          <div style="font-size:13px;font-weight:750">${esc(task.description)}</div>
          ${task.link_url ? `<a href="${esc(task.link_url)}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--blue);font-weight:700" onclick="event.stopPropagation()">${esc(task.link_text || "Task Link")}</a>` : ""}
          <div class="muted" style="font-size:10px;margin-top:5px">Assigned by ${esc(task.assigned_by_name || "")}</div>
        </div>
      </div>
    </div>`).join("");

    host.querySelectorAll(".quick-check").forEach((el) => el.addEventListener("change", async () => {
      el.disabled = true;
      try {
        await rpc("toggle_work_hub_quick_task", {
          p_session_token: sessionToken,
          p_quick_task_id: el.dataset.id,
          p_is_complete: true
        });
        await Promise.all([loadQuickTasks(), loadNotifications()]);
      } catch (error) {
        el.disabled = false;
        showError(error);
      }
    }));

    host.querySelectorAll(".quick-open").forEach((el) => {
      el.addEventListener("click", () => openQuickModal(quickTasks.find((x) => x.quick_task_id === el.dataset.id)));
    });
  }

  function openQuickModal(task = null) {
    if (task && !task.can_edit) return;
    $("quick-modal").hidden = false;
    $("quick-id").value = task?.quick_task_id || "";
    $("quick-modal-title").textContent = task ? "Edit Quick Task" : "Add Quick Task";
    $("quick-description").value = task?.description || "";
    $("quick-link-text").value = task?.link_text || "";
    $("quick-link-url").value = task?.link_url || "";
    $("quick-assignee-wrap").hidden = !!task;
    if (!task) {
      $("quick-assignees").innerHTML = checkListHtml(assignmentPeople(), "quick-assignee", [bootstrap.viewer.employee_id]);
    }
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
    const backendStatus = ["OPEN", "ONGOING", "ON_HOLD", "COMPLETE"].includes(filter) ? filter : null;
    const data = await rpc("get_work_hub_projects", {
      p_session_token: sessionToken,
      p_status: backendStatus,
      p_owner_employee_id: $("project-owner").value || null,
      p_search: $("project-search").value.trim() || null
    });
    projects = Array.isArray(data) ? data : [];
    if (filter === "ACTIVE") projects = projects.filter((project) => project.status !== "COMPLETE");
    renderProjects();
  }

  function renderProjects() {
    const host = $("project-list");
    if (!projects.length) {
      host.innerHTML = '<div class="empty">No projects match these filters.</div>';
      return;
    }

    host.innerHTML = projects.map((project) => `<article class="project-card" data-id="${esc(project.project_id)}" style="border-left-color:${esc(project.theme_color || "#2563eb")}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="min-width:0"><div class="card-title" style="font-size:17px">${esc(project.title)}</div><div class="muted" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(project.description)}</div></div>
        <span class="pill">${esc(statusLabel(project.status))}</span>
      </div>
      <div class="project-meta">
        <span>Owner: ${esc(project.owner_name)}</span>
        <span>Due: ${esc(project.due_date || "None")}</span>
        <span>${Number(project.open_task_count || 0)} open task${Number(project.open_task_count || 0) === 1 ? "" : "s"}</span>
        <span>${(project.participants || []).length} participant${(project.participants || []).length === 1 ? "" : "s"}</span>
        ${Number(project.pinned_update_count || 0) ? `<span>📌 ${Number(project.pinned_update_count)} pinned</span>` : ""}
      </div>
      ${project.can_edit_project ? `<div class="project-actions"><button class="ghost small edit-project" type="button" data-id="${esc(project.project_id)}">Settings</button>${project.status !== "COMPLETE" ? `<button class="success small complete-project" type="button" data-id="${esc(project.project_id)}">Complete</button>` : ""}</div>` : ""}
    </article>`).join("");

    host.querySelectorAll(".project-card").forEach((el) => el.addEventListener("click", (event) => {
      if (event.target.closest("button,a")) return;
      openProjectDrawer(el.dataset.id).catch(showError);
    }));

    host.querySelectorAll(".edit-project").forEach((el) => el.addEventListener("click", (event) => {
      event.stopPropagation();
      openProjectModal(projects.find((project) => project.project_id === el.dataset.id));
    }));

    host.querySelectorAll(".complete-project").forEach((el) => el.addEventListener("click", async (event) => {
      event.stopPropagation();
      const project = projects.find((item) => item.project_id === el.dataset.id);
      if (!project || !confirm(`Mark ${project.title} complete?`)) return;
      try {
        await saveProjectRecord(project, "COMPLETE");
        await Promise.all([loadProjects(), loadNotifications()]);
      } catch (error) {
        showError(error);
      }
    }));
  }

  function openProjectModal(project = null) {
    if (project && !project.can_edit_project) return;
    $("project-modal").hidden = false;
    $("project-id").value = project?.project_id || "";
    $("project-modal-title").textContent = project ? "Edit Project" : "New Project";
    $("project-title").value = project?.title || "";
    $("project-description").value = project?.description || "";
    $("project-modal-status").value = project?.status || "OPEN";
    const ownerRows = canManage() ? (bootstrap.people || []) : assignmentPeople();
    $("project-modal-owner").innerHTML = optionHtml(ownerRows, project?.owner_employee_id || bootstrap.viewer.employee_id);
    $("project-modal-owner").disabled = !canManage() && !!project;
    $("project-due").value = project?.due_date || "";
    $("project-color").value = project?.theme_color || "#2563eb";
    $("project-participants").innerHTML = checkListHtml(
      bootstrap.project_participants || [],
      "project-participant",
      (project?.participants || []).map((x) => x.employee_id)
    );
  }

  async function saveProjectRecord(project, overrideStatus = null) {
    return rpc("save_work_hub_project", {
      p_session_token: sessionToken,
      p_project_id: project?.project_id || null,
      p_title: project ? project.title : $("project-title").value.trim(),
      p_description: project ? project.description : $("project-description").value.trim(),
      p_status: overrideStatus || (project ? project.status : $("project-modal-status").value),
      p_owner_employee_id: project ? project.owner_employee_id : $("project-modal-owner").value,
      p_due_date: project ? (project.due_date || null) : ($("project-due").value || null),
      p_theme_color: project ? project.theme_color : $("project-color").value,
      p_participant_employee_ids: project ? (project.participants || []).map((x) => x.employee_id) : [...document.querySelectorAll('#project-participants input[name="project-participant"]:checked')].map((x) => x.value)
    });
  }

  async function saveProject(event) {
    event.preventDefault();
    const existing = projects.find((project) => project.project_id === $("project-id").value);
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
    activeProjectDetail = await rpc("get_work_hub_project_detail", {
      p_session_token: sessionToken,
      p_project_id: projectId
    });
    activeProject = activeProjectDetail.project;
    $("drawer-title").textContent = activeProject.title;
    $("drawer-meta").textContent = [
      statusLabel(activeProject.status),
      `Owner: ${activeProject.owner_name}`,
      activeProject.due_date ? `Due: ${activeProject.due_date}` : null
    ].filter(Boolean).join(" · ");
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
    const project = activeProjectDetail.project;
    const access = activeProjectDetail.viewer_access || {};
    const tasks = activeProjectDetail.tasks || [];
    const updates = activeProjectDetail.updates || [];
    const sortedUpdates = [...updates].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime() || 0;
      const bTime = new Date(b.created_at).getTime() || 0;
      return projectCommentSort === "OLDEST" ? aTime - bTime : bTime - aTime;
    });

    $("drawer-content").innerHTML = `
      <section class="project-section project-summary-section">
        <div class="section-title"><h2>Project Description</h2>${access.can_edit_project ? '<button id="drawer-edit-project" class="ghost small" type="button">Project Settings</button>' : ""}</div>
        <div class="project-description">${esc(project.description)}</div>
        <div class="project-meta"><span><strong>Participants:</strong> ${(project.participants || []).map((x) => esc(x.employee_name)).join(", ") || "None"}</span></div>
      </section>

      <section class="project-section project-comments-section">
        <div class="project-comments-toolbar">
          <div><h2>Comments</h2><div class="muted">Project conversation and activity.</div></div>
          <div class="field"><label>Sort Comments</label><select id="comment-sort"><option value="NEWEST" ${projectCommentSort === "NEWEST" ? "selected" : ""}>Newest to Oldest</option><option value="OLDEST" ${projectCommentSort === "OLDEST" ? "selected" : ""}>Oldest to Newest</option></select></div>
        </div>
        <div id="project-feed">${sortedUpdates.map((update) => renderUpdate(update, !!access.can_pin_updates)).join("") || '<div class="empty">No comments yet.</div>'}</div>
      </section>

      <section class="project-section project-tasks-section">
        <div class="section-title"><h2>Project Tasks</h2>${access.can_add_task ? '<button id="drawer-add-task" class="success small" type="button">+ Add Task</button>' : ""}</div>
        <div id="drawer-task-list" class="project-task-list">${tasks.map((task) => `<div class="task-item ${task.status === "COMPLETE" ? "done" : ""}">
          <div class="card-title">${esc(task.description)}</div>
          <div class="muted" style="font-size:12px;margin-top:5px">${esc(task.assigned_employee_name)}${task.due_date ? ` · Due ${esc(task.due_date)}` : ""}</div>
          ${task.link_url ? `<div class="links"><a href="${esc(task.link_url)}" target="_blank" rel="noopener noreferrer">${esc(task.link_text || "Task Link")}</a></div>` : ""}
          ${(task.can_edit || task.can_toggle) ? `<div class="project-actions">${task.can_edit ? `<button class="ghost small edit-project-task" data-id="${esc(task.project_task_id)}" type="button">Edit</button>` : ""}${task.can_toggle ? (task.status === "OPEN" ? `<button class="success small complete-project-task" data-id="${esc(task.project_task_id)}" type="button">Complete</button>` : `<button class="ghost small reopen-project-task" data-id="${esc(task.project_task_id)}" type="button">Reopen</button>`) : ""}</div>` : ""}
        </div>`).join("") || '<div class="empty">No project tasks yet.</div>'}</div>
      </section>

      <section class="project-section project-update-section">
        <div class="section-title"><div><h2>Add Update</h2><div class="muted">General updates are the default. Choose a task only when the update is specifically about that task.</div></div></div>
        <div class="composer">
          <div class="field" style="margin:0 0 10px"><label>Update Type</label><select id="comment-task"><option value="">General Update</option>${tasks.map((task) => `<option value="${esc(task.project_task_id)}">Task: ${esc(task.description)}</option>`).join("")}</select></div>
          <div style="position:relative"><textarea id="project-comment" placeholder="Post an update. Type @ to mention someone."></textarea></div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px"><span class="muted" style="font-size:11px">Paste screenshots directly into this update, or attach a file.</span><button id="post-project-comment" class="primary small" type="button">Post Update</button></div>
        </div>
      </section>`;

    $("drawer-edit-project")?.addEventListener("click", () => {
      openProjectModal(projects.find((x) => x.project_id === project.project_id) || { ...project, can_edit_project: true });
    });
    $("drawer-add-task")?.addEventListener("click", () => openProjectTaskModal());
    $("drawer-content").querySelectorAll(".edit-project-task").forEach((el) => {
      el.addEventListener("click", () => openProjectTaskModal(tasks.find((task) => task.project_task_id === el.dataset.id)));
    });
    $("drawer-content").querySelectorAll(".complete-project-task").forEach((el) => {
      el.addEventListener("click", () => toggleProjectTask(el.dataset.id, true));
    });
    $("drawer-content").querySelectorAll(".reopen-project-task").forEach((el) => {
      el.addEventListener("click", () => toggleProjectTask(el.dataset.id, false));
    });
    $("drawer-content").querySelectorAll(".pin-update").forEach((el) => {
      el.addEventListener("click", () => togglePin(el.dataset.id, el.dataset.pinned !== "true"));
    });
    $("comment-sort")?.addEventListener("change", (event) => {
      projectCommentSort = event.target.value === "OLDEST" ? "OLDEST" : "NEWEST";
      renderProjectDrawer();
    });
    $("post-project-comment")?.addEventListener("click", postProjectUpdate);
    $("project-comment")?.addEventListener("input", handleMentionInput);
    queuedMentionIds = new Set();
  }

  function renderUpdate(update, canPin) {
    const taskLabel = update.project_task_description ? `Task: ${update.project_task_description}` : "General Update";
    const pin = update.is_pinned ? " 📌" : "";
    const attachments = (update.attachments || []).length
      ? `<div class="links">${update.attachments.map((attachment) => `<span>📎 ${esc(attachment.file_name)}</span>`).join("")}</div>`
      : "";
    return `<article class="feed-item ${update.update_type === "SYSTEM" ? "system" : ""} ${update.is_pinned ? "pinned" : ""}">
      <div class="feed-meta"><strong>${esc(update.update_type === "SYSTEM" ? "System" : update.author_name || "Unknown")}</strong> · ${esc(taskLabel)} · ${esc(new Date(update.created_at).toLocaleString())}${pin}</div>
      <div style="white-space:pre-wrap">${esc(update.body)}</div>
      ${attachments}
      ${canPin && update.update_type === "COMMENT" ? `<div style="margin-top:8px"><button class="ghost small pin-update" type="button" data-id="${esc(update.update_id)}" data-pinned="${update.is_pinned ? "true" : "false"}">${update.is_pinned ? "Unpin" : "Pin Update"}</button></div>` : ""}
    </article>`;
  }

  function projectTaskAssignees(task = null) {
    if (canManage()) return bootstrap.people || [];
    const ids = new Set([
      bootstrap.viewer.employee_id,
      activeProjectDetail?.project?.owner_employee_id,
      ...(activeProjectDetail?.project?.participants || []).map((person) => person.employee_id),
      task?.assigned_employee_id
    ].filter(Boolean).map(String));
    return (bootstrap.people || []).filter((person) => ids.has(String(person.employee_id)));
  }

  function openProjectTaskModal(task = null) {
    if (task && !task.can_edit) return;
    $("project-task-modal").hidden = false;
    $("project-task-id").value = task?.project_task_id || "";
    $("project-task-modal-title").textContent = task ? "Edit Project Task" : "Add Project Task";
    $("project-task-description").value = task?.description || "";
    $("project-task-assignee").innerHTML = optionHtml(projectTaskAssignees(task), task?.assigned_employee_id || bootstrap.viewer.employee_id);
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
      await rpc("toggle_work_hub_project_task", {
        p_session_token: sessionToken,
        p_project_task_id: taskId,
        p_is_complete: complete
      });
      await Promise.all([openProjectDrawer(activeProject.project_id), loadProjects(), loadNotifications()]);
    } catch (error) {
      showError(error);
    }
  }

  function handleMentionInput(event) {
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    const left = value.slice(0, cursor);
    const match = left.match(/@([^@\n]{0,40})$/);
    const menu = $("mention-menu");
    if (!match) {
      menu.hidden = true;
      return;
    }

    const query = match[1].trim().toLowerCase();
    const matches = mentionPeople().filter((person) => !query || person.employee_name.toLowerCase().includes(query)).slice(0, 7);
    if (!matches.length) {
      menu.hidden = true;
      return;
    }

    const rect = event.target.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left + 12, window.innerWidth - 300)}px`;
    menu.style.top = `${Math.min(rect.bottom - 20, window.innerHeight - 220)}px`;
    menu.style.width = "280px";
    menu.innerHTML = matches.map((person) => `<button type="button" data-id="${esc(person.employee_id)}" data-name="${esc(person.employee_name)}">${esc(person.employee_name)} <span class="muted">${esc(person.role || "")}</span></button>`).join("");
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
    mentionPeople().forEach((person) => {
      if (lower.includes(`@${person.employee_name.toLowerCase()}`)) ids.add(person.employee_id);
    });
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
    } catch (error) {
      showError(error);
    }
  }

  async function togglePin(updateId, pinned) {
    try {
      await rpc("toggle_work_hub_update_pin", {
        p_session_token: sessionToken,
        p_update_id: updateId,
        p_is_pinned: pinned
      });
      await openProjectDrawer(activeProject.project_id);
    } catch (error) {
      showError(error);
    }
  }

  async function loadQueue() {
    const data = await rpc("get_my_supervisor_tasks", {
      p_session_token: sessionToken,
      p_include_completed: $("queue-completed").checked
    });
    const rows = Array.isArray(data) ? data : [];
    const host = $("queue-list");
    if (!rows.length) {
      host.innerHTML = '<div class="empty">No operational tasks match this view.</div>';
      return;
    }

    host.innerHTML = rows.map((task) => `<div class="queue-card">
      <h3>${esc(task.title || task.task_type_name)}</h3>
      <div class="muted" style="font-size:12px">${esc([
        task.task_type_name,
        task.assigned_supervisor_name ? `Assigned to ${task.assigned_supervisor_name}` : null,
        task.employee_name,
        task.business_date ? `Business ${task.business_date}` : null,
        task.due_date ? `Due ${task.due_date}` : null,
        task.priority,
        task.status
      ].filter(Boolean).join(" · "))}</div>
      ${task.details ? `<div style="margin-top:8px">${esc(task.details)}</div>` : ""}
      ${["Pending", "In Progress"].includes(task.status) ? `<div style="margin-top:10px"><button class="primary small queue-complete" data-id="${esc(task.supervisor_task_id)}" type="button">Complete</button></div>` : ""}
    </div>`).join("");

    host.querySelectorAll(".queue-complete").forEach((el) => el.addEventListener("click", async () => {
      el.disabled = true;
      try {
        await rpc("complete_supervisor_task", {
          p_session_token: sessionToken,
          p_supervisor_task_id: el.dataset.id,
          p_completion_notes: null
        });
        await loadQueue();
      } catch (error) {
        el.disabled = false;
        showError(error);
      }
    }));
  }

  function ensureQueueAssignmentUi() {
    if ($("workhub-queue-assign")) {
      $("workhub-queue-assign").hidden = !canManage();
      return;
    }

    const header = $("view-queue")?.querySelector(".section-title");
    const includeCompleted = header?.querySelector("label");
    if (!header) return;

    const button = document.createElement("button");
    button.id = "workhub-queue-assign";
    button.type = "button";
    button.className = "primary";
    button.textContent = "+ Assign Task";
    button.hidden = !canManage();
    if (includeCompleted) includeCompleted.insertAdjacentElement("beforebegin", button);
    else header.appendChild(button);
    button.addEventListener("click", () => openQueueAssignmentModal().catch(showError));

    const overlay = document.createElement("div");
    overlay.id = "queue-assignment-modal";
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="modal">
      <h3>Assign Supervisor Task</h3>
      <form id="queue-assignment-form">
        <div class="form-grid">
          <div><label>Supervisor *</label><select id="queue-assign-supervisor" required></select></div>
          <div><label>Task Type *</label><select id="queue-assign-type" required></select></div>
          <div><label>Related Employee</label><select id="queue-assign-employee"></select></div>
          <div><label>Priority</label><select id="queue-assign-priority"></select></div>
          <div><label>Due Date</label><input id="queue-assign-due" type="date"></div>
          <div class="full"><label>Title *</label><input id="queue-assign-title" maxlength="180" required></div>
          <div class="full"><label>Details</label><textarea id="queue-assign-details" rows="4" placeholder="Instructions or context"></textarea></div>
        </div>
        <div id="queue-assign-message" class="msg" hidden></div>
        <div class="modal-actions"><button id="queue-assign-cancel" class="ghost" type="button">Cancel</button><button class="primary" type="submit">Assign Task</button></div>
      </form>
    </div>`;
    document.body.appendChild(overlay);

    $("queue-assign-cancel").addEventListener("click", () => { overlay.hidden = true; });
    $("queue-assignment-form").addEventListener("submit", (event) => saveQueueAssignment(event).catch((error) => setQueueAssignmentMessage(error.message || String(error), "error")));
  }

  function setQueueAssignmentMessage(text, type = "info") {
    const el = $("queue-assign-message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  async function openQueueAssignmentModal() {
    if (!canManage()) return;
    if (!queueAssignmentSetup) {
      queueAssignmentSetup = await rpc("get_supervisor_task_assignment_options", { p_session_token: sessionToken });
    }
    $("queue-assign-supervisor").innerHTML = '<option value="">Select supervisor</option>' + (queueAssignmentSetup.supervisors || []).map((person) => `<option value="${esc(person.employee_id)}">${esc([person.employee_name, person.department].filter(Boolean).join(" · "))}</option>`).join("");
    $("queue-assign-type").innerHTML = '<option value="">Select task type</option>' + (queueAssignmentSetup.task_types || []).map((type) => `<option value="${esc(type.task_type_code)}">${esc(type.task_type_name)}</option>`).join("");
    $("queue-assign-employee").innerHTML = '<option value="">No related employee</option>' + (queueAssignmentSetup.employees || []).map((person) => `<option value="${esc(person.employee_id)}">${esc([person.employee_name, person.department].filter(Boolean).join(" · "))}</option>`).join("");
    $("queue-assign-priority").innerHTML = (queueAssignmentSetup.priorities || ["Low", "Normal", "High", "Urgent"]).map((priority) => `<option value="${esc(priority)}" ${priority === "Normal" ? "selected" : ""}>${esc(priority)}</option>`).join("");
    $("queue-assign-due").value = "";
    $("queue-assign-title").value = "";
    $("queue-assign-details").value = "";
    setQueueAssignmentMessage("");
    $("queue-assignment-modal").hidden = false;
  }

  async function saveQueueAssignment(event) {
    event.preventDefault();
    setQueueAssignmentMessage("Assigning task...");
    const result = await rpc("create_supervisor_task", {
      p_session_token: sessionToken,
      p_assigned_supervisor_id: $("queue-assign-supervisor").value,
      p_task_type_code: $("queue-assign-type").value,
      p_title: $("queue-assign-title").value.trim(),
      p_details: $("queue-assign-details").value.trim() || null,
      p_employee_id: $("queue-assign-employee").value || null,
      p_business_date: null,
      p_due_date: $("queue-assign-due").value || null,
      p_priority: $("queue-assign-priority").value
    });
    $("queue-assignment-modal").hidden = true;
    await loadQueue();
    setMessage(`Task assigned to ${result.assigned_supervisor_name}.`, "success");
  }

  function bindEvents() {
    $("login-form").addEventListener("submit", login);
    $("sign-out").addEventListener("click", () => signOut().catch(showError));
    document.querySelectorAll("button[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    $("notification-button").addEventListener("click", () => {
      $("notification-panel").hidden = !$("notification-panel").hidden;
      if (!$("notification-panel").hidden) loadNotifications().catch(showError);
    });
    $("routine-daily").addEventListener("click", () => {
      routineMode = "DAILY";
      $("routine-daily").classList.add("active");
      $("routine-weekly").classList.remove("active");
      loadRoutines().catch(showError);
    });
    $("routine-weekly").addEventListener("click", () => {
      routineMode = "WEEKLY";
      $("routine-weekly").classList.add("active");
      $("routine-daily").classList.remove("active");
      loadRoutines().catch(showError);
    });
    $("routine-employee").addEventListener("change", () => loadRoutines().catch(showError));
    $("routine-date").addEventListener("change", () => loadRoutines().catch(showError));
    $("add-routine").addEventListener("click", () => openRoutineModal());
    $("routine-type").addEventListener("change", syncWeekdayVisibility);
    $("routine-form").addEventListener("submit", (event) => saveRoutine(event).catch(showError));
    $("quick-employee").addEventListener("change", () => loadQuickTasks().catch(showError));
    $("add-quick").addEventListener("click", () => openQuickModal());
    $("quick-form").addEventListener("submit", (event) => saveQuickTask(event).catch(showError));
    $("toggle-quick-rail").addEventListener("click", () => $("projects-layout").classList.toggle("quick-collapsed"));
    $("new-project").addEventListener("click", () => openProjectModal());
    $("project-form").addEventListener("submit", (event) => saveProject(event).catch(showError));
    $("project-status").addEventListener("change", () => loadProjects().catch(showError));
    $("project-owner").addEventListener("change", () => loadProjects().catch(showError));
    let searchTimer = null;
    $("project-search").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadProjects().catch(showError), 250);
    });
    $("refresh-projects").addEventListener("click", () => loadProjects().catch(showError));
    $("close-drawer").addEventListener("click", closeProjectDrawer);
    $("drawer-overlay").addEventListener("click", closeProjectDrawer);
    $("project-task-form").addEventListener("submit", (event) => saveProjectTask(event).catch(showError));
    $("queue-completed").addEventListener("change", () => loadQueue().catch(showError));
    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => { $(button.dataset.close).hidden = true; });
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".notification-wrap")) $("notification-panel").hidden = true;
      if (!event.target.closest("#mention-menu") && event.target !== $("project-comment")) $("mention-menu").hidden = true;
    });
    window.addEventListener("hashchange", () => {
      if (bootstrap) switchView(viewFromHash(), false);
    });
  }

  async function init() {
    applyProductLabels();
    bindEvents();
    await listEmployees();
    if (!sessionToken) return;
    try {
      await loadBootstrap();
      await enterApp();
    } catch (error) {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      setMessage(error.message || "You do not have access to Work Hub.", "error", true);
    }
  }

  init().catch((error) => setMessage(error.message || String(error), "error", true));
})();