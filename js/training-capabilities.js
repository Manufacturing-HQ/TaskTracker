"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const setupCard = document.getElementById("setup-card");
  const plansCard = document.querySelector("#plans")?.closest("section.card");
  if (!config || !supabaseLib || !setupCard) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  async function syncCapabilities() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;

    const { data, error } = await client.rpc("get_training_setup_options", {
      p_session_token: token
    });

    if (error || !data) {
      setupCard.hidden = true;
      return;
    }

    setupCard.hidden = !data.can_create_plan;

    const subtitle = plansCard?.querySelector(".muted");
    if (subtitle) {
      subtitle.textContent = data.can_manage_training
        ? "Your training plans and plans you are authorized to manage"
        : "Your training plans";
    }
  }

  new MutationObserver(() => {
    if (!setupCard.hidden) syncCapabilities();
  }).observe(setupCard, { attributes: true, attributeFilter: ["hidden"] });

  document.getElementById("refresh")?.addEventListener("click", () => {
    setTimeout(syncCapabilities, 0);
  });

  window.addEventListener("pageshow", () => setTimeout(syncCapabilities, 0));
  setTimeout(syncCapabilities, 250);
})();
