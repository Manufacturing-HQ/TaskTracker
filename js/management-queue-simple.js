"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const queueList = document.getElementById("queue-list");
  if (!config || !supabaseLib || !queueList) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  async function completeTask(taskId, button) {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    button.disabled = true;
    button.textContent = "Completing...";
    try {
      await rpc("complete_supervisor_task", {
        p_session_token: token,
        p_supervisor_task_id: taskId,
        p_completion_notes: null
      });
      document.querySelector('button[data-view="queue"]')?.click();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Complete";
      alert(error.message);
    }
  }

  function simplify() {
    queueList.querySelectorAll(".task-card").forEach((card) => {
      const actions = card.querySelector(".actions");
      if (!actions) return;
      const startButton = [...actions.querySelectorAll("button")].find((b) => /start/i.test(b.textContent || ""));
      const completeButton = [...actions.querySelectorAll("button")].find((b) => /complete/i.test(b.textContent || ""));
      const taskId = card.dataset.supervisorTaskId;
      startButton?.remove();
      if (completeButton) completeButton.textContent = "Complete";
      if (!completeButton && taskId) {
        const b = document.createElement("button");
        b.className = "primary";
        b.type = "button";
        b.textContent = "Complete";
        b.addEventListener("click", () => completeTask(taskId,b));
        actions.prepend(b);
      }
    });
  }

  new MutationObserver(simplify).observe(queueList,{childList:true,subtree:true});
  simplify();
})();
