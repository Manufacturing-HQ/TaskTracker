"use strict";

(() => {
  const link = document.getElementById("work-hub-link");
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!link || !config || !supabaseLib) return;
  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  async function refresh() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) { link.hidden = true; return; }
    const { error } = await client.rpc("get_work_hub_bootstrap", { p_session_token: token });
    link.hidden = !!error;
  }
  setTimeout(refresh, 500);
  window.addEventListener("focus", refresh);
})();
