"use strict";

(() => {
  const links = [...document.querySelectorAll("[data-item-changes-link]")];
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;

  // Management already loads this shared navigation helper. Load the separate
  // PPS pilot navigation helper only there so no new link appears in employee
  // or QA workspaces. The PPS helper independently verifies Administrator role.
  if (document.querySelector(".nav") && !document.querySelector('script[data-pps-pilot-nav]')) {
    const script = document.createElement("script");
    script.src = "js/management-pps-nav.js?v=admin-pilot-20260917-1";
    script.dataset.ppsPilotNav = "1";
    document.head.appendChild(script);
  }

  if (!links.length || !config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  function setVisible(visible) {
    links.forEach((link) => { link.hidden = !visible; });
  }

  async function refresh() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) {
      setVisible(false);
      return false;
    }
    const { error } = await client.rpc("get_item_change_bootstrap", { p_session_token: token });
    setVisible(!error);
    return !error;
  }

  let attempts = 0;
  const retry = window.setInterval(async () => {
    attempts += 1;
    const ready = await refresh();
    if (ready || attempts >= 15) window.clearInterval(retry);
  }, 1000);

  setTimeout(refresh, 250);
  window.addEventListener("focus", refresh);
})();
