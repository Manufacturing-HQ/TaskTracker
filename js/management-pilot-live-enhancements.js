"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const period = document.getElementById("performance-period");
  if (period) period.value = "WEEK";

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const token = () => sessionStorage.getItem(config.sessionStorageKey);
  let memoOptions = null;
  let weeklyDefaultApplied = false;

  const style = document.createElement("style");
  style.textContent = `
    .pilot-memo-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.65);display:grid;place-items:center;padding:20px;z-index:1000}
    .pilot-memo-modal{width:min(720px,96vw);max-height:90vh;overflow:auto;background:#fff;border:2px solid #64748b;border-radius:16px;padding:20px}
    .pilot-memo-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pilot-memo-grid .full{grid-column:1/-1}
    .pilot-memo-grid label{display:block;font-size:12px;font-weight:800;margin-bottom:5px}.pilot-memo-grid input,.pilot-memo-grid select,.pilot-memo-grid textarea{width:100%;border:1px solid #94a3b8;border-radius:9px;padding:9px 10px;background:#fff}.pilot-memo-grid textarea{min-height:150px;resize:vertical}.pilot-memo-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    @media(max-width:700px){.pilot-memo-grid{grid-template-columns:1fr}.pilot-memo-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function message(text, type = "info") {
    const el = document.getElementById("message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function enforceWeeklyDefault() {
    const app = document.getElementById("app");
    const select = document.getElementById("performance-period");
    if (weeklyDefaultApplied || !app || app.hidden || !select || !token()) return;
    weeklyDefaultApplied = true;
    select.value = "WEEK";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function openMemoModal() {
    memoOptions = await rpc("get_memo_creation_options", { p_session_token: token() });
    const backdrop = document.createElement("div");
    backdrop.className = "pilot-memo-backdrop";
    const categories = (memoOptions?.memo_categories || []).map((c) => `<option value="${esc(c.id)}">${esc(c.category_name)}</option>`).join("");
    const employees = (memoOptions?.employees || []).map((e) => `<option value="${esc(e.id)}">${esc(e.employee_name)}${e.department ? ` · ${esc(e.department)}` : ""}</option>`).join("");
    backdrop.innerHTML = `<div class="pilot-memo-modal"><h2 style="margin-top:0">Submit Memo</h2><div class="pilot-memo-grid">
      <div><label>Category</label><select id="pilot-memo-category"><option value="">Select category</option>${categories}</select></div>
      <div><label>Assign To</label><select id="pilot-memo-employees" multiple size="8">${employees}</select><div style="font-size:11px;color:#64748b;margin-top:4px">Ctrl/Cmd-click to select multiple employees.</div></div>
      <div class="full"><label>Memo Title</label><input id="pilot-memo-title" type="text"></div>
      <div class="full"><label>Memo</label><textarea id="pilot-memo-body"></textarea></div>
    </div><div id="pilot-memo-message" class="msg" hidden></div><div class="pilot-memo-actions"><button id="pilot-memo-cancel" class="ghost" type="button">Cancel</button><button id="pilot-memo-submit" class="primary" type="button">Submit Memo</button></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#pilot-memo-cancel").onclick = () => backdrop.remove();
    backdrop.querySelector("#pilot-memo-submit").onclick = async () => {
      const button = backdrop.querySelector("#pilot-memo-submit");
      const category = backdrop.querySelector("#pilot-memo-category").value;
      const title = backdrop.querySelector("#pilot-memo-title").value.trim();
      const body = backdrop.querySelector("#pilot-memo-body").value.trim();
      const assigned = [...backdrop.querySelector("#pilot-memo-employees").selectedOptions].map((o) => o.value);
      const msg = backdrop.querySelector("#pilot-memo-message");
      if (!category || !title || !body || !assigned.length) {
        msg.textContent = "Select a category and at least one employee, then enter a title and memo text.";
        msg.dataset.type = "error";
        msg.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Submitting...";
      try {
        const result = await rpc("create_and_assign_memo", {
          p_session_token: token(),
          p_memo_category_id: category,
          p_memo_title: title,
          p_memo_body: body,
          p_assigned_employee_ids: assigned
        });
        backdrop.remove();
        message(`Memo submitted to ${result?.assignment_count || assigned.length} employee${(result?.assignment_count || assigned.length) === 1 ? "" : "s"}.`, "success");
      } catch (e) {
        msg.textContent = e.message;
        msg.dataset.type = "error";
        msg.hidden = false;
        button.disabled = false;
        button.textContent = "Submit Memo";
      }
    };
  }

  async function installMemoButton() {
    const t = token();
    if (!t || document.getElementById("pilot-submit-memo")) return;
    try {
      const rows = await rpc("get_employee_session_context", { p_session_token: t });
      const ctx = Array.isArray(rows) ? rows[0] : rows;
      if ((ctx?.employee_role || ctx?.role) !== "Administrator") return;
      const top = document.querySelector(".top");
      if (!top) return;
      const actions = top.lastElementChild;
      const button = document.createElement("button");
      button.id = "pilot-submit-memo";
      button.className = "primary";
      button.type = "button";
      button.textContent = "Submit Memo";
      button.style.marginRight = "8px";
      button.onclick = () => openMemoModal().catch((e) => message(e.message, "error"));
      actions?.insertAdjacentElement("beforebegin", button);
    } catch {}
  }

  const app = document.getElementById("app");
  if (app) {
    new MutationObserver(() => {
      if (!app.hidden) setTimeout(enforceWeeklyDefault, 40);
    }).observe(app, { attributes: true, attributeFilter: ["hidden"] });
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    enforceWeeklyDefault();
    installMemoButton();
    if ((document.getElementById("pilot-submit-memo") && weeklyDefaultApplied) || tries > 30) clearInterval(timer);
  }, 300);
})();