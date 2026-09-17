"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });

  async function init() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token || document.getElementById("pps-operations-link")) return;
    try {
      const { data, error } = await client.rpc("get_employee_session_context", { p_session_token:token });
      if (error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if ((row?.employee_role || row?.role) !== "Administrator") return;
      const nav = document.querySelector(".nav");
      if (!nav) return;
      const link = document.createElement("a");
      link.id = "pps-operations-link";
      link.href = "pps-operations.html";
      link.textContent = "PPS Operations (Pilot)";
      const qaReporting = [...nav.querySelectorAll("a")].find((a) => a.getAttribute("href")?.startsWith("qa-reporting.html"));
      if (qaReporting?.nextSibling) nav.insertBefore(link, qaReporting.nextSibling);
      else nav.appendChild(link);
    } catch {
      // Pilot navigation is intentionally absent unless Administrator access is confirmed.
    }
  }

  init();
})();
