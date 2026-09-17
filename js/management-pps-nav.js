"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });

  function addLink(nav, id, href, label, afterElement = null) {
    if (document.getElementById(id)) return document.getElementById(id);
    const link = document.createElement("a");
    link.id = id;
    link.href = href;
    link.textContent = label;
    if (afterElement?.nextSibling) nav.insertBefore(link, afterElement.nextSibling);
    else nav.appendChild(link);
    return link;
  }

  async function init() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    try {
      const { data, error } = await client.rpc("get_employee_session_context", { p_session_token:token });
      if (error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if ((row?.employee_role || row?.role) !== "Administrator") return;
      const nav = document.querySelector(".nav");
      if (!nav) return;

      const qaReporting = [...nav.querySelectorAll("a")].find((a) => a.getAttribute("href")?.startsWith("qa-reporting.html"));
      const pps = addLink(nav,"pps-operations-link","pps-operations.html","PPS Operations (Pilot)",qaReporting || null);
      const netsuite = addLink(nav,"netsuite-data-link","netsuite-data.html","NetSuite Data (Pilot)",pps);
      addLink(nav,"demand-planning-link","demand-planning.html","Demand Planning (Pilot)",netsuite);
    } catch {
      // Admin pilot navigation is intentionally absent unless Administrator access is confirmed.
    }
  }

  init();
})();
