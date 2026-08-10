"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const button = document.getElementById("sign-out");
  if (!config || !supabaseLib || !button) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const token = sessionStorage.getItem(config.sessionStorageKey);
    sessionStorage.removeItem(config.sessionStorageKey);

    const frame = document.getElementById("task-frame");
    if (frame) frame.removeAttribute("src");

    if (token) {
      try {
        await client.rpc("logout_employee_session", { p_session_token: token });
      } catch {}
    }

    window.location.replace("index.html");
  }, true);
})();
