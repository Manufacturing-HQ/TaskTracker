"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const overview = document.getElementById("view-overview");
  if (!config || !supabaseLib || !overview) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const style = document.createElement("style");
  style.textContent = `
    .ops-audit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:14px}
    .ops-audit-card{border:2px solid #94a3b8;border-radius:14px;background:#fff;padding:16px}
    .ops-audit-card h3{margin:0;font-size:17px}.ops-audit-count{font-size:34px;font-weight:900;margin-top:8px}
    .ops-audit-card button{margin-top:12px}.ops-audit-list{margin-top:12px;border-top:1px solid #cbd5e1;padding-top:8px}
    .ops-audit-person{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
    .ops-audit-person:last-child{border-bottom:0}.ops-audit-person button{margin:0;padding:6px 9px}
    @media(max-width:800px){.ops-audit-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const panel = overview.querySelector(".panel");
  if (!panel) return;
  const copy = document.getElementById("overview-copy");
  if (copy) copy.textContent = "Audit completion status for the previous business day. Expand a card to see unfinished employees.";

  const host = document.createElement("div");
  host.id = "ops-audit-status";
  host.className = "ops-audit-grid";
  panel.appendChild(host);

  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));

  async function rpc(name, args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function navigate(kind, item) {
    if (kind === "attendance") {
      const date = document.getElementById("attendance-date");
      if (date) date.value = item.business_date;
      document.querySelector('button[data-view="attendance"]')?.click();
    } else {
      const date = document.getElementById("audit-date");
      if (date) date.value = item.business_date;
      document.querySelector('button[data-view="audit"]')?.click();
      setTimeout(() => {
        const employee = document.getElementById("audit-employee");
        if (employee && [...employee.options].some((o) => o.value === item.employee_id)) {
          employee.value = item.employee_id;
          employee.dispatchEvent(new Event("change", {bubbles:true}));
        }
      }, 250);
    }
  }

  function card(kind, title, section, businessDate) {
    const count = Number(section?.incomplete_count || 0);
    const items = section?.incomplete || [];
    const el = document.createElement("div");
    el.className = "ops-audit-card";
    el.innerHTML = `<h3>${esc(title)}</h3><div class="muted">Business date ${esc(businessDate || "")}</div><div class="ops-audit-count">${count}</div><div class="muted">incomplete</div><button class="ghost" type="button">${count ? "Show unfinished" : "Complete"}</button><div class="ops-audit-list" hidden></div>`;
    const toggle = el.querySelector("button");
    const list = el.querySelector(".ops-audit-list");
    if (!count) toggle.disabled = true;
    toggle.addEventListener("click", () => {
      list.hidden = !list.hidden;
      toggle.textContent = list.hidden ? "Show unfinished" : "Hide unfinished";
    });
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "ops-audit-person";
      row.innerHTML = `<div><strong>${esc(item.employee_name)}</strong><div class="muted">${esc(item.department || "")} · ${esc(item.business_date)}</div></div><button class="ghost" type="button">Open</button>`;
      row.querySelector("button").addEventListener("click", () => navigate(kind,item));
      list.appendChild(row);
    });
    return el;
  }

  async function load() {
    const token = sessionStorage.getItem(config.sessionStorageKey);
    if (!token) return;
    try {
      const data = await rpc("get_supervisor_audit_status", {p_session_token:token,p_business_date:null});
      host.innerHTML = "";
      host.appendChild(card("attendance","Attendance Audit",data.attendance,data.business_date));
      host.appendChild(card("tracker","Task Tracker Audit",data.task_tracker,data.business_date));
    } catch (error) {
      host.innerHTML = `<div class="msg" data-type="error">${esc(error.message)}</div>`;
    }
  }

  document.getElementById("overview-nav")?.addEventListener("click", () => setTimeout(load,0));
  window.addEventListener("pageshow", () => setTimeout(load,300));
  setTimeout(load,500);
})();
