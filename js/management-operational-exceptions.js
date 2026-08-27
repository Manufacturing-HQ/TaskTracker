"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const attendanceBody = document.getElementById("attendance-body");
  const attendanceDate = document.getElementById("attendance-date");
  const attendanceMessage = document.getElementById("attendance-message");
  const queueList = document.getElementById("queue-list");
  const queueView = document.getElementById("view-queue");
  const queueNav = document.querySelector('button[data-view="queue"]');
  const includeCompleted = document.getElementById("include-completed");
  if (!config || !supabaseLib || !attendanceBody || !attendanceDate || !queueList || !queueNav) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const sessionKey = config.sessionStorageKey;
  const token = () => sessionStorage.getItem(sessionKey);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const state = {
    eventTypes: new Map(),
    attendanceNotes: new Map(),
    reporting: new Map(),
    tasks: [],
    taskMap: new Map(),
    taskRefreshTimer: null,
    attendanceRefreshTimer: null
  };

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setAttendanceMessage(text, type = "info") {
    if (!attendanceMessage) return;
    attendanceMessage.textContent = text || "";
    attendanceMessage.dataset.type = type;
    attendanceMessage.hidden = !text;
  }

  function formatMinutes(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n)} min` : "-";
  }

  function formatPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "-";
  }

  function formatDateTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, {
      month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    .queue-alert-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:7px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;vertical-align:middle}
    .attendance-context{margin-top:7px}.attendance-context button{padding:4px 8px;font-size:11px}.attendance-context textarea{display:block;width:100%;min-width:220px;margin-top:6px;border:1px solid #94a3b8;border-radius:7px;padding:7px 8px;resize:vertical;font:inherit;font-size:12px;background:#fff}.attendance-context .required-note{font-size:11px;font-weight:800;color:#991b1b;margin-top:4px}
    .reconcile-cell{white-space:nowrap}.eff-badge{display:inline-block;margin-left:5px;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:900}.eff-high{background:#fee2e2;color:#991b1b}.eff-low{background:#fef3c7;color:#92400e}
    .task-note-preview{margin-top:8px;padding:7px 9px;border-left:3px solid #94a3b8;background:#f1f5f9;border-radius:6px;font-size:12px;color:#475569}.task-note-panel{margin-top:10px;border-top:1px solid #cbd5e1;padding-top:10px}.task-note-history{display:grid;gap:7px;margin-bottom:8px}.task-note-entry{font-size:12px;background:#fff;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px}.task-note-entry small{display:block;margin-bottom:3px;color:#64748b}.task-note-add{display:flex;gap:7px;align-items:flex-end}.task-note-add textarea{flex:1;min-height:54px;border:1px solid #94a3b8;border-radius:7px;padding:7px 8px;resize:vertical;font:inherit;font-size:12px}.task-note-add button{white-space:nowrap}
  `;
  document.head.appendChild(style);

  const badge = document.createElement("span");
  badge.className = "queue-alert-badge";
  badge.hidden = true;
  queueNav.appendChild(badge);

  function updateBadge(tasks) {
    const count = Array.isArray(tasks) ? tasks.length : 0;
    badge.textContent = String(count);
    badge.hidden = count === 0;
    queueNav.setAttribute("aria-label", count ? `Task Queue, ${count} pending` : "Task Queue");
  }

  function taskTitle(task) {
    return String(task?.title || task?.task_type_name || "").trim();
  }

  function renderTaskNotes(card, task, forceOpen = false) {
    let panel = card.querySelector(".task-note-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "task-note-panel";
      panel.hidden = true;
      card.appendChild(panel);
    }
    if (!forceOpen && panel.dataset.rendered === "1") return panel;

    const comments = Array.isArray(task.comments) ? task.comments : [];
    const history = comments.length
      ? comments.map((comment) => `<div class="task-note-entry"><small>${esc(comment.created_by_name || "Supervisor")} &middot; ${esc(formatDateTime(comment.created_at))}</small>${esc(comment.comment_text || "")}</div>`).join("")
      : '<div style="font-size:12px;color:#64748b">No notes yet.</div>';
    const canAdd = ["Pending", "In Progress"].includes(task.status);
    panel.innerHTML = `<div class="task-note-history">${history}</div>${canAdd ? `<div class="task-note-add"><textarea maxlength="1500" placeholder="Add a reminder or follow-up note"></textarea><button type="button" class="ghost" data-add-task-note="1">Add Note</button></div>` : ""}`;
    panel.dataset.rendered = "1";
    return panel;
  }

  let queueObserver;

  function decorateQueue(tasks) {
    const cards = [...queueList.querySelectorAll(".task-card")];
    if (!cards.length) return;
    queueObserver?.disconnect();
    state.tasks = Array.isArray(tasks) ? tasks : [];
    state.taskMap = new Map(state.tasks.map((task) => [task.supervisor_task_id, task]));

    const unused = [...state.tasks];
    cards.forEach((card, index) => {
      const heading = card.querySelector("h3")?.textContent?.trim() || "";
      let taskIndex = unused.findIndex((task) => taskTitle(task) === heading);
      if (taskIndex < 0 && index < unused.length) taskIndex = index;
      const task = taskIndex >= 0 ? unused.splice(taskIndex, 1)[0] : null;
      if (!task) return;
      card.dataset.taskId = task.supervisor_task_id;

      const oldPreview = card.querySelector(".task-note-preview");
      oldPreview?.remove();
      const comments = Array.isArray(task.comments) ? task.comments : [];
      if (comments.length) {
        const latest = comments[comments.length - 1];
        const preview = document.createElement("div");
        preview.className = "task-note-preview";
        preview.innerHTML = `<strong>Latest note:</strong> ${esc(latest.comment_text || "")}`;
        const actions = card.querySelector(".actions");
        card.insertBefore(preview, actions || null);
      }

      const actions = card.querySelector(".actions");
      if (actions) {
        let toggle = actions.querySelector("[data-task-notes-toggle]");
        if (!toggle) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "ghost";
          toggle.dataset.taskNotesToggle = "1";
          actions.appendChild(toggle);
        }
        toggle.textContent = comments.length ? `Notes (${comments.length})` : "Notes";
      }

      const existingPanel = card.querySelector(".task-note-panel");
      if (existingPanel && !existingPanel.hidden) {
        existingPanel.dataset.rendered = "";
        renderTaskNotes(card, task, true).hidden = false;
      }
    });
    queueObserver?.observe(queueList, { childList: true, subtree: true });
  }

  async function refreshTaskData() {
    if (!token()) return;
    try {
      const pending = await rpc("get_my_supervisor_tasks", {
        p_session_token: token(),
        p_include_completed: false
      });
      updateBadge(Array.isArray(pending) ? pending : []);

      if (!queueView?.hidden) {
        let visibleTasks = Array.isArray(pending) ? pending : [];
        if (includeCompleted?.checked) {
          const all = await rpc("get_my_supervisor_tasks", {
            p_session_token: token(),
            p_include_completed: true
          });
          visibleTasks = Array.isArray(all) ? all : [];
        }
        decorateQueue(visibleTasks);
      }
    } catch {
      // Keep the base Management page usable if the helper cannot refresh.
    }
  }

  function scheduleTaskRefresh(delay = 120) {
    clearTimeout(state.taskRefreshTimer);
    state.taskRefreshTimer = setTimeout(refreshTaskData, delay);
  }

  queueList.addEventListener("click", async (event) => {
    const toggle = event.target.closest("[data-task-notes-toggle]");
    if (toggle) {
      const card = toggle.closest(".task-card");
      const task = state.taskMap.get(card?.dataset.taskId);
      if (!card || !task) return;
      const panel = renderTaskNotes(card, task, true);
      panel.hidden = !panel.hidden;
      return;
    }

    const addButton = event.target.closest("[data-add-task-note]");
    if (!addButton) return;
    const card = addButton.closest(".task-card");
    const task = state.taskMap.get(card?.dataset.taskId);
    const textarea = card?.querySelector(".task-note-panel textarea");
    const comment = textarea?.value.trim();
    if (!task || !comment) return;
    addButton.disabled = true;
    try {
      const created = await rpc("add_supervisor_task_comment", {
        p_session_token: token(),
        p_supervisor_task_id: task.supervisor_task_id,
        p_comment: comment
      });
      task.comments = Array.isArray(task.comments) ? task.comments : [];
      task.comments.push(created);
      const panel = renderTaskNotes(card, task, true);
      panel.hidden = false;
      const preview = card.querySelector(".task-note-preview");
      preview?.remove();
      const newPreview = document.createElement("div");
      newPreview.className = "task-note-preview";
      newPreview.innerHTML = `<strong>Latest note:</strong> ${esc(created.comment_text || "")}`;
      card.insertBefore(newPreview, card.querySelector(".actions") || null);
      const toggleButton = card.querySelector("[data-task-notes-toggle]");
      if (toggleButton) toggleButton.textContent = `Notes (${task.comments.length})`;
    } catch (error) {
      window.alert(error.message || "Unable to save task note.");
    } finally {
      addButton.disabled = false;
    }
  });

  queueObserver = new MutationObserver(() => scheduleTaskRefresh());
  queueObserver.observe(queueList, { childList: true, subtree: true });
  queueNav.addEventListener("click", () => scheduleTaskRefresh(250));
  includeCompleted?.addEventListener("change", () => scheduleTaskRefresh(250));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleTaskRefresh(200);
  });
  window.addEventListener("focus", () => scheduleTaskRefresh(200));
  setInterval(refreshTaskData, 10 * 60 * 1000);
  setTimeout(refreshTaskData, 1000);

  let attendanceObserver;

  function isClockChange(eventTypeId, select) {
    const row = state.eventTypes.get(eventTypeId);
    if (row) return Boolean(row.creates_clock_change_task);
    return /requires time clock change/i.test(select?.selectedOptions?.[0]?.textContent || "");
  }

  function ensureAttendanceHeader() {
    const headerRow = document.querySelector("#view-attendance thead tr");
    if (!headerRow || headerRow.querySelector("[data-reconcile-header]")) return;
    const th = document.createElement("th");
    th.dataset.reconcileHeader = "1";
    th.textContent = "Tracker / Efficiency";
    headerRow.appendChild(th);
  }

  function decorateAttendance() {
    ensureAttendanceHeader();
    attendanceObserver?.disconnect();
    [...attendanceBody.querySelectorAll("tr")].forEach((tr) => {
      const select = tr.querySelector('select[data-kind="event"]');
      const hours = tr.querySelector('input[data-kind="hours"]');
      const employeeId = select?.dataset.employee || hours?.dataset.employee;
      if (!employeeId) return;

      let context = tr.querySelector(".attendance-context");
      if (!context && select) {
        context = document.createElement("div");
        context.className = "attendance-context";
        select.insertAdjacentElement("afterend", context);
      }
      if (context) {
        const note = state.attendanceNotes.get(employeeId) || "";
        const requires = isClockChange(select?.value, select);
        if (requires || note) {
          context.hidden = false;
          context.innerHTML = `<textarea rows="2" data-attendance-note="${esc(employeeId)}" placeholder="Why is a time clock change needed?">${esc(note)}</textarea>${requires ? '<div class="required-note">Comment required for a time clock change.</div>' : ""}`;
        } else {
          context.hidden = true;
          context.innerHTML = "";
        }
      }

      let metricCell = tr.querySelector("[data-reconcile-cell]");
      if (!metricCell) {
        metricCell = document.createElement("td");
        metricCell.dataset.reconcileCell = "1";
        metricCell.className = "reconcile-cell";
        tr.appendChild(metricCell);
      }
      const report = state.reporting.get(employeeId);
      if (!report) {
        metricCell.textContent = "-";
      } else {
        const eff = Number(report.tracker_coverage_percent);
        const hasEff = Number.isFinite(eff);
        const flag = hasEff && eff > 95
          ? `<span class="eff-badge eff-high">${esc(formatPercent(eff))}</span>`
          : hasEff && eff < 70
            ? `<span class="eff-badge eff-low">${esc(formatPercent(eff))}</span>`
            : hasEff ? `<span>${esc(formatPercent(eff))}</span>` : "-";
        metricCell.innerHTML = `${esc(formatMinutes(report.tracker_minutes))} &middot; ${flag}`;
      }
    });
    attendanceObserver?.observe(attendanceBody, { childList: true, subtree: true });
  }

  async function refreshAttendanceContext() {
    if (!token() || !attendanceDate.value || !attendanceBody.querySelector("tr")) return;
    try {
      const date = attendanceDate.value;
      const [audit, reporting] = await Promise.all([
        rpc("get_attendance_audit", { p_session_token: token(), p_business_date: date }),
        rpc("get_reporting_daily", {
          p_session_token: token(),
          p_start_date: date,
          p_end_date: date,
          p_employee_id: null
        })
      ]);
      state.eventTypes = new Map((audit?.event_types || []).map((row) => [row.event_type_id, row]));
      state.attendanceNotes = new Map((audit?.employees || []).map((row) => [row.employee_id, row.notes || ""]));
      state.reporting = new Map((Array.isArray(reporting) ? reporting : []).map((row) => [row.employee_id, row]));
      decorateAttendance();
    } catch {
      // The base Attendance Audit remains usable if reconciliation data cannot load.
    }
  }

  function scheduleAttendanceRefresh(delay = 120) {
    clearTimeout(state.attendanceRefreshTimer);
    state.attendanceRefreshTimer = setTimeout(refreshAttendanceContext, delay);
  }

  async function saveAttendanceEnhanced(employeeId) {
    const select = attendanceBody.querySelector(`select[data-kind="event"][data-employee="${CSS.escape(employeeId)}"]`);
    const hours = attendanceBody.querySelector(`input[data-kind="hours"][data-employee="${CSS.escape(employeeId)}"]`);
    const noteEl = attendanceBody.querySelector(`textarea[data-attendance-note="${CSS.escape(employeeId)}"]`);
    if (!select?.value) return;
    const note = noteEl?.value.trim() || state.attendanceNotes.get(employeeId) || "";
    const saved = attendanceBody.querySelector(`[data-saved="${CSS.escape(employeeId)}"]`);
    if (isClockChange(select.value, select) && !note) {
      if (saved) saved.textContent = "Comment required";
      noteEl?.focus();
      setAttendanceMessage("Add a comment explaining the required time clock change before saving this row.", "error");
      return;
    }

    if (saved) saved.textContent = "Saving...";
    try {
      const result = await rpc("save_attendance_audit_entry", {
        p_session_token: token(),
        p_employee_id: employeeId,
        p_business_date: attendanceDate.value,
        p_event_type_id: select.value,
        p_entered_hours: hours?.value === "" ? null : Number(hours?.value),
        p_notes: note || null
      });
      state.attendanceNotes.set(employeeId, note);
      const minutes = attendanceBody.querySelector(`[data-minutes="${CSS.escape(employeeId)}"]`);
      if (minutes) minutes.textContent = result.minutes_worked ?? "-";
      if (saved) saved.textContent = "Saved";
      setAttendanceMessage("", "info");
      await Promise.all([refreshAttendanceContext(), refreshTaskData()]);
    } catch (error) {
      if (saved) saved.textContent = "Error";
      setAttendanceMessage(error.message || "Unable to save attendance row.", "error");
    }
  }

  attendanceBody.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('select[data-kind="event"], input[data-kind="hours"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const employeeId = target.dataset.employee;
      if (target.matches('select[data-kind="event"]')) {
        decorateAttendance();
      }
      if (employeeId) saveAttendanceEnhanced(employeeId);
      return;
    }
    if (target.matches("textarea[data-attendance-note]")) {
      const employeeId = target.dataset.attendanceNote;
      if (employeeId) saveAttendanceEnhanced(employeeId);
    }
  }, true);

  attendanceObserver = new MutationObserver(() => scheduleAttendanceRefresh());
  attendanceObserver.observe(attendanceBody, { childList: true, subtree: true });
  attendanceDate.addEventListener("change", () => scheduleAttendanceRefresh(250));
  document.querySelector('button[data-view="attendance"]')?.addEventListener("click", () => scheduleAttendanceRefresh(300));
})();
