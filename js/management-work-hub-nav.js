"use strict";

(() => {
  const link = document.getElementById("work-hub-link");
  const queueButton = document.querySelector('button[data-view="queue"]');
  const overviewCopy = document.getElementById("overview-copy");
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!link || !config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  function applyActiveNavigation(hasAccess) {
    link.hidden = !hasAccess;
    if (queueButton) queueButton.hidden = hasAccess;
    if (hasAccess && overviewCopy) {
      const role = document.getElementById("side-meta")?.textContent || "";
      overviewCopy.textContent = role.startsWith("Supervisor")
        ? "Use the navigation for Attendance Audit, Task Tracker Audit, Work Hub, Attendance / Employee Summary, Training, and Reporting."
        : "Use the navigation for Attendance Audit, Task Tracker Audit, Work Hub, Attendance / Employee Summary, QA, Training, and Reporting.";
    }
  }

  async function refresh() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) {
      applyActiveNavigation(false);
      return;
    }
    const { error } = await client.rpc("get_work_hub_bootstrap", { p_session_token: token });
    applyActiveNavigation(!error);
  }

  setTimeout(refresh, 500);
  window.addEventListener("focus", refresh);
})();
