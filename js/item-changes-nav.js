"use strict";

(() => {
  const links = [...document.querySelectorAll("[data-item-changes-link]")];
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
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
