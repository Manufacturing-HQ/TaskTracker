"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const button = document.getElementById("sign-out");

  if (!config || !supabaseLib || !button) return;

  const client = supabaseLib.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );

  function neutralLogin() {
    window.top.location.replace("index.html");
  }

  button.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      button.disabled = true;
      button.textContent = "Signing Out...";

      const token = sessionStorage.getItem(config.sessionStorageKey);
      sessionStorage.removeItem(config.sessionStorageKey);

      const frame = document.getElementById("task-frame");
      if (frame) frame.removeAttribute("src");

      if (token) {
        try {
          await Promise.race([
            client.rpc("logout_employee_session", {
              p_session_token: token
            }),
            new Promise((resolve) => window.setTimeout(resolve, 2000))
          ]);
        } catch (error) {
          console.warn(
            "The server logout request did not complete:",
            error?.message || error
          );
        }
      }

      neutralLogin();
    },
    true
  );
})();
