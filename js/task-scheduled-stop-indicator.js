"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const stateBox = document.getElementById("state");
  if (!config || !supabaseLib || !stateBox) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  let busy = false;
  let timer = null;
  let observer = null;

  const style = document.createElement("style");
  style.textContent = `
    .scheduled-stop-confirmation{margin-top:10px;padding:9px 11px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-weight:800;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .scheduled-stop-confirmation small{font-weight:600;color:#9a3412}
  `;
  document.head.appendChild(style);

  function observeState() {
    observer?.observe(stateBox, { childList: true, subtree: true, characterData: true });
  }

  async function refreshIndicator() {
    if (busy) return;
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token || stateBox.textContent.includes("No active task")) {
      observer?.disconnect();
      stateBox.querySelector(".scheduled-stop-confirmation")?.remove();
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

  observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refreshIndicator, 120);
  });
  observeState();
  setTimeout(refreshIndicator, 500);
})();