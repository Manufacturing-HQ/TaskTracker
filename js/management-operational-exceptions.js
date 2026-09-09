"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const attendanceBody = document.getElementById("attendance-body");
  const attendanceDate = document.getElementById("attendance-date");
  const attendanceMessage = document.getElementById("attendance-message");
  if (!config || !supabaseLib || !attendanceBody || !attendanceDate) return;

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

  const style = document.createElement("style");
  style.textContent = `
    .attendance-context{margin-top:7px}.attendance-context button{padding:4px 8px;font-size:11px}.attendance-context textarea{display:block;width:100%;min-width:220px;margin-top:6px;border:1px solid #94a3b8;border-radius:7px;padding:7px 8px;resize:vertical;font:inherit;font-size:12px;background:#fff}.attendance-context .required-note{font-size:11px;font-weight:800;color:#991b1b;margin-top:4px}
    .reconcile-cell{white-space:nowrap}.eff-badge{display:inline-block;margin-left:5px;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:900}.eff-high{background:#fee2e2;color:#991b1b}.eff-low{background:#fef3c7;color:#92400e}
  `;
  document.head.appendChild(style);

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
        rpc("get_attendance_reconciliation_daily", {
          p_session_token: token(),
          p_business_date: date
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
      await refreshAttendanceContext();
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
