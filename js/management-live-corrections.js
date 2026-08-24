"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const button = document.getElementById("correct-prior-day-task");
  if (!config || !supabaseLib || !button) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  const REPORTING_TIME_ZONE = "America/New_York";

  const style = document.createElement("style");
  style.textContent = `
    .live-correction-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:20px;z-index:1200}
    .live-correction-modal{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px;color:#172033}
    .live-correction-modal h2{margin:0 0 6px}.live-correction-note{font-size:12px;color:#64748b;margin-bottom:14px}
    .live-correction-task{border:1px solid #cbd5e1;border-radius:10px;padding:12px;background:#f8fafc;margin-bottom:14px}
    .live-correction-task strong{display:block}.live-correction-task span{display:block;font-size:12px;color:#64748b;margin-top:4px}
    .live-correction-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.live-correction-grid .full{grid-column:1/-1}
    .live-correction-grid label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.live-correction-grid input,.live-correction-grid select,.live-correction-grid textarea{width:100%;min-height:42px;border:1px solid #94a3b8;border-radius:9px;padding:8px 10px;background:#fff}
    .live-correction-grid textarea{min-height:90px;resize:vertical}.live-correction-warning{margin-top:14px;padding:10px;border-radius:9px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:700}
    .live-correction-message{margin-top:12px;padding:10px;border-radius:8px;background:#e2e8f0}.live-correction-message[data-type="error"]{background:#fee2e2;color:#991b1b}
    .live-correction-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    @media(max-width:700px){.live-correction-grid{grid-template-columns:1fr}.live-correction-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

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

  function reportingParts(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: REPORTING_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
      date: `${map.year}-${map.month}-${map.day}`,
      time: `${map.hour === "24" ? "00" : map.hour}:${map.minute}`
    };
  }

  function displayReportingTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: REPORTING_TIME_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(d) + " ET";
  }

  function taskLabel(e) {
    return [e.task_type, e.work_order_number, e.item_name || e.non_productive_task, e.job_type]
      .filter(Boolean)
      .join(" · ") || `Job #${e.job_number || ""}`;
  }

  async function loadPriorDayTasks() {
    const t = token();
    if (!t) throw new Error("Your Management session is no longer available. Sign in again.");
    const period = document.getElementById("performance-period")?.value || "WEEK";
    const supervisorFilter = document.getElementById("req-live-supervisor");
    let data;
    if (supervisorFilter) {
      data = await rpc("get_live_status_dashboard_filtered", {
        p_session_token: t,
        p_period: period,
        p_supervisor_id: supervisorFilter.value || null
      });
    } else {
      data = await rpc("get_supervisor_live_status_dashboard", {
        p_session_token: t,
        p_period: period
      });
    }
    return (data?.employees || []).filter((e) => e.active_from_prior_day && e.has_active_task && e.job_id);
  }

  function openCorrectionModal(tasks) {
    const backdrop = document.createElement("div");
    backdrop.className = "live-correction-backdrop";
    backdrop.innerHTML = `<div class="live-correction-modal">
      <h2>Correct / Stop Prior-Day Task</h2>
      <div class="live-correction-note">This closes the active session at the actual historical stop time and moves the Job to Paused. It does not mark the Job complete or send it to QA.</div>
      <div class="live-correction-grid">
        <div class="full"><label>Employee / Task</label><select id="live-correction-task"></select></div>
        <div class="full" id="live-correction-task-summary"></div>
        <div><label>Actual Stop Date</label><input id="live-correction-date" type="date" required></div>
        <div><label>Actual Stop Time</label><input id="live-correction-time" type="time" required></div>
        <div class="full"><label>Correction Reason</label><input id="live-correction-reason" value="Employee forgot to stop task" required></div>
        <div class="full"><label>Comments <span style="font-weight:400;color:#64748b">(optional)</span></label><textarea id="live-correction-comments" placeholder="Optional details about the correction"></textarea></div>
      </div>
      <div class="live-correction-warning">Reporting will use the corrected stop time. Confirm the employee's actual stop time before saving.</div>
      <div id="live-correction-message" class="live-correction-message" hidden></div>
      <div class="live-correction-actions"><button id="live-correction-cancel" class="ghost" type="button">Cancel</button><button id="live-correction-save" class="primary" type="button">Stop & Save Correction</button></div>
    </div>`;
    document.body.appendChild(backdrop);

    const modal = backdrop.querySelector(".live-correction-modal");
    const select = modal.querySelector("#live-correction-task");
    const summary = modal.querySelector("#live-correction-task-summary");
    const dateInput = modal.querySelector("#live-correction-date");
    const timeInput = modal.querySelector("#live-correction-time");
    const reasonInput = modal.querySelector("#live-correction-reason");
    const commentsInput = modal.querySelector("#live-correction-comments");
    const message = modal.querySelector("#live-correction-message");
    const save = modal.querySelector("#live-correction-save");

    select.innerHTML = tasks.map((e, i) => `<option value="${i}">${esc(e.employee_name)} — ${esc(taskLabel(e))}</option>`).join("");

    function selectedTask() {
      return tasks[Number(select.value || 0)] || tasks[0];
    }

    function renderSelected() {
      const e = selectedTask();
      const parts = reportingParts(e.started_at);
      summary.innerHTML = `<div class="live-correction-task"><strong>${esc(e.employee_name)}</strong><span>${esc(taskLabel(e))}</span><span>Job #${esc(e.job_number || "—")} · Session started ${esc(displayReportingTime(e.started_at))}</span></div>`;
      dateInput.value = parts?.date || "";
      timeInput.value = "";
      message.hidden = true;
    }

    select.addEventListener("change", renderSelected);
    modal.querySelector("#live-correction-cancel").addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });

    save.addEventListener("click", async () => {
      const e = selectedTask();
      const date = dateInput.value;
      const time = timeInput.value;
      const reason = reasonInput.value.trim();
      const comments = commentsInput.value.trim();
      message.hidden = true;
      if (!date || !time || !reason) {
        message.textContent = "Actual Stop Date, Actual Stop Time, and Correction Reason are required.";
        message.dataset.type = "error";
        message.hidden = false;
        return;
      }

      save.disabled = true;
      save.textContent = "Saving...";
      try {
        await rpc("force_stop_history_session_local", {
          p_session_token: token(),
          p_job_id: e.job_id,
          p_forced_ended_local: `${date}T${time}:00`,
          p_correction_reason: reason,
          p_comments: comments || null
        });
        backdrop.remove();
        document.getElementById("refresh-status")?.click();
        window.alert(`${e.employee_name}'s task was stopped at the corrected time and moved to Paused.`);
      } catch (err) {
        message.textContent = err.message || String(err);
        message.dataset.type = "error";
        message.hidden = false;
        save.disabled = false;
        save.textContent = "Stop & Save Correction";
      }
    });

    renderSelected();
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Checking...";
    try {
      const tasks = await loadPriorDayTasks();
      if (!tasks.length) {
        window.alert("No active tasks from a prior day are currently available in your access scope.");
        return;
      }
      openCorrectionModal(tasks);
    } catch (err) {
      window.alert(err.message || String(err));
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
})();
