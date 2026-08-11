"use strict";

(() => {
  const body = document.getElementById("attendance-body");
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!body || !config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const style = document.createElement("style");
  style.textContent = `
    #view-attendance tr.probationary-row td{background:#fff9db!important}
    #view-attendance .probationary-label{display:inline-block;margin-left:6px;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:900;background:#fff3bf;color:#7c5c00;border:1px solid #e6c74f}
  `;
  document.head.appendChild(style);

  async function decorate() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    const date = document.getElementById("attendance-date")?.value || null;
    if (!token) return;
    const { data, error } = await client.rpc("get_attendance_audit", { p_session_token: token, p_business_date: date });
    if (error || !data?.employees) return;
    const rows = Array.from(body.querySelectorAll("tr"));
    rows.forEach((row, index) => {
      row.classList.remove("probationary-row");
      row.querySelector(".probationary-label")?.remove();
      const emp = data.employees[index];
      if (!emp?.is_probationary) return;
      row.classList.add("probationary-row");
      const strong = row.querySelector("td:first-child strong");
      if (strong) strong.insertAdjacentHTML("afterend", '<span class="probationary-label">Probationary</span>');
    });
  }

  new MutationObserver(() => setTimeout(decorate, 20)).observe(body, { childList: true });
  document.getElementById("attendance-date")?.addEventListener("change", () => setTimeout(decorate, 150));
  document.querySelector('button[data-view="attendance"]')?.addEventListener("click", () => setTimeout(decorate, 300));
})();
