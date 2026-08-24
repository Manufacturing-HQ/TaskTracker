"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const stateBox = document.getElementById("state");
  const messageBox = document.getElementById("message");
  if (!config || !supabaseLib || !stateBox) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  let busy = false;
  let refreshTimer = null;
  let observer = null;
  let activeTimerInterval = null;
  let activeTimerBaseSeconds = 0;
  let activeTimerRenderedAt = 0;
  let toastTimer = null;
  let lastToastSignature = "";
  let lastAction = null;

  const style = document.createElement("style");
  style.textContent = `
    .scheduled-stop-confirmation{margin-top:10px;padding:9px 11px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-weight:800;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .scheduled-stop-confirmation small{font-weight:600;color:#9a3412}
    .active-task-timing{margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .active-task-timing[hidden]{display:none!important}
    .active-task-metric{border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;background:#f8fafc}
    .active-task-metric span{display:block;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
    .active-task-metric strong{display:block;margin-top:4px;font-size:18px;font-variant-numeric:tabular-nums;color:#172033}
    .task-success-toast{position:fixed;top:22px;left:50%;transform:translate(-50%,-10px);z-index:5000;min-width:min(440px,calc(100vw - 32px));max-width:720px;padding:15px 18px;border-radius:12px;background:#166534;color:#fff;box-shadow:0 16px 40px rgba(15,23,42,.28);font-weight:900;font-size:17px;text-align:center;opacity:0;pointer-events:none;transition:opacity .16s ease,transform .16s ease}
    .task-success-toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:720px){.active-task-timing{grid-template-columns:1fr}.task-success-toast{font-size:15px}}
  `;
  document.head.appendChild(style);

  const timingPanel = document.createElement("div");
  timingPanel.className = "active-task-timing";
  timingPanel.hidden = true;
  stateBox.insertAdjacentElement("afterend", timingPanel);

  const successToast = document.createElement("div");
  successToast.className = "task-success-toast";
  successToast.setAttribute("role", "status");
  successToast.setAttribute("aria-live", "polite");
  document.body.appendChild(successToast);

  const actionSuccessMessages = {
    pause: "Task paused successfully.",
    block: "Task blocked successfully.",
    return: "Task returned successfully.",
    complete: "Task completed successfully."
  };

  function observeState() {
    observer?.observe(stateBox, { childList: true, subtree: true, characterData: true });
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function formatNumber(value, decimals = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  }

  function formatMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return "—";
    if (minutes < 60) return `${formatNumber(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = Math.round(minutes % 60);
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  function clearActiveTimer() {
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }

  function updateActiveTimer() {
    const display = document.getElementById("active-task-elapsed");
    if (!display) return;
    const additionalSeconds = Math.max(0, Math.floor((Date.now() - activeTimerRenderedAt) / 1000));
    display.textContent = formatClock(activeTimerBaseSeconds + additionalSeconds);
  }

  function hideTiming() {
    clearActiveTimer();
    timingPanel.hidden = true;
    timingPanel.innerHTML = "";
  }

  function renderTiming(active) {
    if (!active) {
      hideTiming();
      return;
    }

    clearActiveTimer();
    activeTimerBaseSeconds = Number(active.total_elapsed_seconds ?? active.elapsed_seconds ?? 0);
    activeTimerRenderedAt = Date.now();

    const metrics = [
      `<div class="active-task-metric"><span>Time Worked</span><strong id="active-task-elapsed">${formatClock(activeTimerBaseSeconds)}</strong></div>`
    ];

    if (active.task_type_name === "Productive") {
      metrics.push(`<div class="active-task-metric"><span>Cycle Time</span><strong>${formatNumber(active.cycle_time_snapshot)} min / unit</strong></div>`);
      metrics.push(`<div class="active-task-metric"><span>Expected Duration</span><strong>${formatMinutes(active.expected_minutes)}</strong></div>`);
    } else if (Number(active.scheduled_duration_minutes || 0) > 0) {
      metrics.push(`<div class="active-task-metric"><span>Scheduled Duration</span><strong>${formatMinutes(active.scheduled_duration_minutes)}</strong></div>`);
    }

    timingPanel.innerHTML = metrics.join("");
    timingPanel.hidden = false;
    updateActiveTimer();
    activeTimerInterval = setInterval(updateActiveTimer, 1000);
  }

  function showSuccessToast(message) {
    if (!message) return;
    clearTimeout(toastTimer);
    successToast.textContent = `✓ ${message}`;
    successToast.classList.add("show");
    toastTimer = setTimeout(() => successToast.classList.remove("show"), 1900);
  }

  function friendlyToastMessage(message) {
    if (/^Job #.* started successfully\.$/.test(message)) return "Task started successfully.";
    if (message === "QA rework started as Non-Productive work.") return "QA rework started successfully.";
    return message;
  }

  function handleMessageChange() {
    if (!messageBox || messageBox.hidden || messageBox.dataset.type !== "success") return;

    let message = messageBox.textContent.trim();
    if (!message) return;

    if (message === "Task nulld successfully." && lastAction && actionSuccessMessages[lastAction]) {
      message = actionSuccessMessages[lastAction];
      messageBox.textContent = message;
    } else if (message === "Task blockd successfully.") {
      message = actionSuccessMessages.block;
      messageBox.textContent = message;
    } else if (message === "Task returnd successfully.") {
      message = actionSuccessMessages.return;
      messageBox.textContent = message;
    }

    const toastMessage = friendlyToastMessage(message);
    const signature = `${messageBox.dataset.type}|${toastMessage}`;
    if (signature !== lastToastSignature) {
      lastToastSignature = signature;
      showSuccessToast(toastMessage);
    }

    if (message.startsWith("Task ") && message.endsWith(" successfully.")) lastAction = null;
  }

  async function refreshIndicator() {
    if (busy) return;
    const token = sessionStorage.getItem(config.sessionStorageKey);

    if (!token || stateBox.textContent.includes("No active task")) {
      observer?.disconnect();
      stateBox.querySelector(".scheduled-stop-confirmation")?.remove();
      hideTiming();
      observeState();
      return;
    }

    busy = true;
    try {
      const { data, error } = await client.rpc("get_my_task_state_v2", { p_session_token: token });
      if (error) return;

      const active = data?.active_job;
      observer?.disconnect();
      stateBox.querySelector(".scheduled-stop-confirmation")?.remove();
      renderTiming(active);

      if (active?.scheduled_end_at) {
        const end = new Date(active.scheduled_end_at);
        const minutes = Number(active.scheduled_duration_minutes || 0);
        const badge = document.createElement("div");
        badge.className = "scheduled-stop-confirmation";
        badge.innerHTML = `<span>⏱ Stop Timer Saved</span><small>Scheduled to stop at ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${minutes > 0 ? ` · ${minutes.toFixed(0)} min duration` : ""}</small>`;
        stateBox.appendChild(badge);
      }

      observeState();
    } finally {
      busy = false;
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      lastAction = button.dataset.action || null;
    });
  });
  document.getElementById("cancel-action")?.addEventListener("click", () => {
    lastAction = null;
  });

  if (messageBox) {
    new MutationObserver(handleMessageChange).observe(messageBox, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-type", "hidden"]
    });
  }

  observer = new MutationObserver(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshIndicator, 120);
  });
  observeState();
  handleMessageChange();
  setTimeout(refreshIndicator, 500);
})();