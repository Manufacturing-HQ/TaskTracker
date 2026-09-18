"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });

  let checking = false;
  let finished = false;
  let attempts = 0;

  function addLink() {
    if (document.getElementById("inventory-team-link")) return;
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const link = document.createElement("a");
    link.id = "inventory-team-link";
    link.href = "inventory-team.html";
    link.textContent = "Inventory Team";

    const memos = nav.querySelector('button[data-view="memos"]');
    if (memos) nav.insertBefore(link,memos);
    else nav.appendChild(link);
  }

  async function checkAccess() {
    if (finished || checking) return finished;
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return false;

    checking = true;
    try {
      const {data,error} = await client.rpc("get_inventory_team_access",{p_session_token:token});
      if (error) return false;
      if (data?.can_view) {
        addLink();
        finished = true;
        return true;
      }
      finished = true;
      return true;
    } catch {
      return false;
    } finally {
      checking = false;
    }
  }

  checkAccess();

  const timer = setInterval(async () => {
    attempts += 1;
    const done = await checkAccess();
    if (done || attempts >= 120) clearInterval(timer);
  },1000);
})();
