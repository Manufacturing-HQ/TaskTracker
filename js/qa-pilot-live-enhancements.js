"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  let queueBusy = false;
  let queueTimer = null;

  const style = document.createElement("style");
  style.textContent = `
    .qa-row{grid-template-columns:minmax(120px,1fr) minmax(145px,1.15fr) minmax(145px,1.2fr) 75px minmax(105px,.85fr) minmax(180px,1.55fr) auto!important}
    .qa-wo{font-size:12px;color:#334155}.qa-wo strong{display:block;font-size:10px;text-transform:uppercase;color:#64748b;margin-bottom:2px}
    .qa-error-rate-box{margin:12px 0;padding:12px 14px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;display:flex;justify-content:space-between;gap:12px;align-items:center}
    .qa-error-rate-box strong{font-size:20px;color:#1d4ed8}.qa-error-rate-box small{display:block;color:#64748b;margin-top:2px}
    #qa-error-section{margin:12px 0 16px;padding:14px;border:2px solid #cbd5e1;border-radius:12px;background:#fff}
    #qa-error-section>h3{margin:0 0 10px}
    @media(max-width:900px){.qa-row{grid-template-columns:1fr 1fr!important}}
  `;
  document.head.appendChild(style);

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const token = () => sessionStorage.getItem(config.sessionStorageKey);

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function ensureErrorSection() {
    const errors = $("errors");
    const editBox = $("qa-job-edit");
    if (!errors || !editBox || $("qa-error-section")) return;
    const oldHeading = errors.previousElementSibling;
    const section = document.createElement("section");
    section.id = "qa-error-section";
    section.innerHTML = "<h3>Error Details</h3>";
    section.appendChild(errors);
    editBox.insertAdjacentElement("afterend", section);
    if (oldHeading && oldHeading.tagName === "H3" && oldHeading.textContent.trim() === "Error Details") oldHeading.remove();

    const rate = document.createElement("div");
    rate.id = "qa-error-rate";
    rate.className = "qa-error-rate-box";
    rate.innerHTML = '<div><b>Error Rate</b><small>Errors ÷ (Passed + Rejected), capped at 100%</small></div><strong>0.00%</strong>';
    section.appendChild(rate);
    updateErrorRate();
  }

  function updateErrorRate() {
    const box = $("qa-error-rate");
    if (!box) return;
    const errorInputs = [...document.querySelectorAll('#errors input[data-error-type-id]')];
    if (errorInputs.length && errorInputs.every((el) => el.disabled)) {
      box.querySelector("strong").textContent = "Locked";
      box.querySelector("small").textContent = "Original error findings are locked after the first QA pass.";
      return;
    }
    const errors = errorInputs.reduce((sum, el) => sum + Math.max(0, Number(el.value) || 0), 0);
    const passed = Math.max(0, Number($("qty-pass")?.value) || 0);
    const rejected = Math.max(0, Number($("qty-reject")?.value) || 0);
    const reviewed = passed + rejected;
    const rate = reviewed > 0 ? Math.min(100, (errors / reviewed) * 100) : 0;
    box.querySelector("strong").textContent = `${rate.toFixed(2)}%`;
    const small = box.querySelector("small");
    small.textContent = reviewed > 0 ? `${errors} error${errors === 1 ? "" : "s"} across ${reviewed} reviewed piece${reviewed === 1 ? "" : "s"}.` : "Enter Passed / Rejected quantities to calculate.";
  }

  function matches(j, s) {
    return !s || [j.employee_name, j.item_name, j.job_type, j.comments, j.work_order_number].filter(Boolean).join(" ").toLowerCase().includes(s);
  }

  async function decorateQueue() {
    if (queueBusy || !token() || !$("queue")) return;
    queueBusy = true;
    try {
      const all = await rpc("get_qa_queue", { p_session_token: token() }) || [];
      const search = ($("search")?.value || "").trim().toLowerCase();
      const filtered = all.filter((j) => matches(j, search));
      document.querySelectorAll(".qa-status-group").forEach((group) => {
        const code = group.dataset.status || "PENDING";
        const jobs = filtered.filter((j) => (j.queue_status || "PENDING") === code);
        [...group.querySelectorAll(".qa-row")].forEach((row, index) => {
          if (row.dataset.woDecorated === "1") return;
          const job = jobs[index];
          if (!job) return;
          const cell = document.createElement("div");
          cell.className = "qa-wo";
          cell.innerHTML = `<strong>Work Order</strong>${esc(job.work_order_number || "—")}`;
          const qtyCell = row.children[2];
          row.insertBefore(cell, qtyCell || null);
          row.dataset.woDecorated = "1";
        });
      });
    } catch {
      // Core QA controller owns user-visible errors. This helper stays non-blocking.
    } finally {
      queueBusy = false;
    }
  }

  function scheduleQueueDecoration() {
    clearTimeout(queueTimer);
    queueTimer = setTimeout(decorateQueue, 120);
  }

  document.addEventListener("input", (e) => {
    if (e.target?.matches('#errors input[data-error-type-id], #qty-pass, #qty-reject')) updateErrorRate();
    if (e.target?.id === "search") scheduleQueueDecoration();
  });
  document.addEventListener("change", (e) => {
    if (e.target?.matches('#errors input[data-error-type-id], #qty-pass, #qty-reject')) updateErrorRate();
  });

  const reviewCard = $("review-card");
  if (reviewCard) {
    const reviewObserver = new MutationObserver(() => {
      ensureErrorSection();
      updateErrorRate();
    });
    reviewObserver.observe(reviewCard, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  }

  const queueObserver = new MutationObserver(scheduleQueueDecoration);
  if ($("queue")) queueObserver.observe($("queue"), { childList: true, subtree: true });

  setTimeout(() => { ensureErrorSection(); scheduleQueueDecoration(); }, 500);
})();