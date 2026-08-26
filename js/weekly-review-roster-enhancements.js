"use strict";
(() => {
  const mgmtFilterRoles = new Set(["Manager", "Administrator"]);
  const $ = (id) => document.getElementById(id);
  let observer = null;
  let lastRosterSignature = "";

  function roleFromPage() {
    const meta = $("viewer-meta")?.textContent || "";
    return meta.split("·")[0].trim();
  }

  function ensureStyles() {
    if (document.getElementById("weekly-review-roster-enhancement-styles")) return;
    const style = document.createElement("style");
    style.id = "weekly-review-roster-enhancement-styles";
    style.textContent = `
      #weekly-review-supervisor-wrap{min-width:220px}
      #weekly-review-supervisor{min-width:220px}
      #roster-body .review-btn{background:#2563eb;color:#fff;border-color:#2563eb;padding:8px 14px;box-shadow:0 1px 2px rgba(15,23,42,.12)}
      #roster-body .review-btn:hover{background:#1d4ed8;border-color:#1d4ed8}
      #roster-body .review-btn:focus-visible{outline:3px solid rgba(37,99,235,.3);outline-offset:2px}
      #weekly-review-filter-summary{margin-top:8px;font-size:13px;color:#64748b;font-weight:700}
    `;
    document.head.appendChild(style);
  }

  function ensureSupervisorFilter() {
    const role = roleFromPage();
    const toolbar = document.querySelector("#management-view .section-title .toolbar");
    if (!toolbar) return null;

    let wrap = $("weekly-review-supervisor-wrap");
    if (!mgmtFilterRoles.has(role)) {
      if (wrap) wrap.remove();
      $("weekly-review-filter-summary")?.remove();
      return null;
    }

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "field";
      wrap.id = "weekly-review-supervisor-wrap";
      wrap.innerHTML = `<label for="weekly-review-supervisor">Supervisor</label><select id="weekly-review-supervisor"><option value="">All Supervisors</option></select>`;
      const loadButton = $("load-week");
      toolbar.insertBefore(wrap, loadButton || null);
      $("weekly-review-supervisor").addEventListener("change", applyFilter);

      const summary = document.createElement("div");
      summary.id = "weekly-review-filter-summary";
      const progress = $("progress");
      progress?.insertAdjacentElement("afterend", summary);
    }
    return $("weekly-review-supervisor");
  }

  function rosterRows() {
    return Array.from(document.querySelectorAll("#roster-body tr[data-id]"));
  }

  function supervisorName(row) {
    const cell = row?.children?.[1];
    return (cell?.textContent || "").trim() || "—";
  }

  function refreshOptions() {
    const select = ensureSupervisorFilter();
    if (!select) return;
    const rows = rosterRows();
    const signature = rows.map(r => `${r.dataset.id}:${supervisorName(r)}`).join("|");
    if (signature === lastRosterSignature) {
      applyFilter();
      return;
    }
    lastRosterSignature = signature;

    const previous = select.value;
    const names = [...new Set(rows.map(supervisorName).filter(name => name && name !== "—"))]
      .sort((a,b) => a.localeCompare(b));
    select.innerHTML = `<option value="">All Supervisors</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (previous && names.includes(previous)) select.value = previous;
    else select.value = "";
    applyFilter();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function applyFilter() {
    const select = $("weekly-review-supervisor");
    const selected = select?.value || "";
    const rows = rosterRows();
    let visible = 0;
    for (const row of rows) {
      const show = !selected || supervisorName(row) === selected;
      row.hidden = !show;
      if (show) visible += 1;
    }
    const summary = $("weekly-review-filter-summary");
    if (summary) {
      summary.textContent = selected
        ? `Showing ${visible} employee${visible === 1 ? "" : "s"} for ${selected}.`
        : `Showing all ${visible} accessible employees.`;
    }
  }

  function makeReviewButtonsExplicit() {
    for (const btn of document.querySelectorAll("#roster-body .review-btn")) {
      btn.type = "button";
      btn.setAttribute("aria-label", `Review ${btn.closest("tr")?.querySelector("td strong")?.textContent || "employee"}`);
      btn.title = "Open weekly employee review";
    }
  }

  function enhance() {
    ensureStyles();
    ensureSupervisorFilter();
    makeReviewButtonsExplicit();
    refreshOptions();
  }

  function start() {
    enhance();
    const roster = $("roster-body");
    if (roster && !observer) {
      observer = new MutationObserver(() => enhance());
      observer.observe(roster, { childList: true });
    }
    setTimeout(enhance, 300);
    setTimeout(enhance, 1000);
  }

  window.addEventListener("pageshow", start);
  document.addEventListener("DOMContentLoaded", start);
  start();
})();

(() => {
  if (document.querySelector('script[data-weekly-review-transactions]')) return;
  const script = document.createElement("script");
  script.src = "js/weekly-review-transactions.js?v=weekly-transactions-20260826";
  script.dataset.weeklyReviewTransactions = "1";
  document.body.appendChild(script);
})();
