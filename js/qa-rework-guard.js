"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const queueEl = document.getElementById("queue");
  if (!config || !supabaseLib || !queueEl) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  let pendingJobNumbers = new Map();
  let syncing = false;

  async function refreshPendingMap() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    const { data, error } = await client.rpc("get_qa_queue", { p_session_token: token });
    if (error) return;
    pendingJobNumbers = new Map(
      (data || [])
        .filter((job) => job.open_rework_request)
        .map((job) => [String(job.job_number), job.open_rework_request])
    );
    applyGuard();
  }

  function applyGuard() {
    if (syncing) return;
    syncing = true;
    try {
      queueEl.querySelectorAll("article.job").forEach((card) => {
        const heading = card.querySelector("h3")?.textContent || "";
        const match = heading.match(/Job\s+#(\d+)/i);
        if (!match) return;
        const request = pendingJobNumbers.get(match[1]);
        const button = card.querySelector("button");
        let notice = card.querySelector("[data-qa-rework-notice]");
        if (request) {
          if (!notice) {
            notice = document.createElement("div");
            notice.dataset.qaReworkNotice = "true";
            notice.className = "message";
            notice.style.marginTop = "10px";
            notice.style.marginBottom = "0";
            card.insertBefore(notice, button || null);
          }
          notice.textContent = request.status === "Linked"
            ? "Rework Pending: linked rework is in progress. Complete the rework before another QA review."
            : "Rework Pending: waiting for the builder to start the returned rework.";
          if (button) {
            button.disabled = true;
            button.textContent = "Rework Pending";
          }
        } else {
          notice?.remove();
        }
      });
    } finally {
      syncing = false;
    }
  }

  new MutationObserver(() => applyGuard()).observe(queueEl, { childList: true, subtree: true });
  document.getElementById("refresh")?.addEventListener("click", () => setTimeout(refreshPendingMap, 0));
  window.addEventListener("pageshow", () => setTimeout(refreshPendingMap, 0));
  setTimeout(refreshPendingMap, 250);
})();
