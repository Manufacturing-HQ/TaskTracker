"use strict";

(() => {
  if (window.__taskTrackerReportUiEnhancements) return;
  window.__taskTrackerReportUiEnhancements = true;

  const weeklyPage = !!document.getElementById("week-ending") && !!document.getElementById("roster-body");
  const reportingPage = /Reporting/i.test(document.title || "");
  if (!weeklyPage && !reportingPage) return;

  const style = document.createElement("style");
  style.id = "report-ui-enhancement-styles";
  style.textContent = `
    th[data-sortable="true"]{cursor:pointer;user-select:none;white-space:nowrap}
    th[data-sortable="true"]:hover{filter:brightness(.94)}
    .report-sort-mark{display:inline-block;min-width:12px;margin-left:5px;font-size:10px;opacity:.65}
    th[aria-sort="ascending"] .report-sort-mark,th[aria-sort="descending"] .report-sort-mark{opacity:1}
    .report-data-warning{background:#fee2e2!important;color:#991b1b!important;font-weight:900!important}
    .weekly-score-good{background:#dcfce7!important;color:#166534!important;font-weight:900!important}
    .weekly-score-bad{background:#fee2e2!important;color:#991b1b!important;font-weight:900!important}
    .weekly-score-neutral{background:#f8fafc!important}
    #week-ending{min-width:190px}
  `;
  document.head.appendChild(style);

  const noSortHeaders = new Set(["review", "action", "actions", "admin", "correction"]);
  let observerTimer = null;

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function valueForSort(cell) {
    const text = cleanText(cell?.textContent);
    if (!text || text === "—" || /^not enough data$/i.test(text) || /^pending/i.test(text)) return { blank: true, value: "" };

    if (/^\d{4}-\d{2}-\d{2}(?:\s|$|T)/.test(text)) {
      const time = Date.parse(text.replace(" ", "T"));
      if (Number.isFinite(time)) return { blank: false, value: time, type: "number" };
    }

    const duration = text.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/i);
    if (duration && (duration[1] || duration[2])) {
      return { blank: false, value: (Number(duration[1]) || 0) * 60 + (Number(duration[2]) || 0), type: "number" };
    }

    if (/^-?[\d,.]+(?:\.\d+)?\s*(?:%|min|h)?$/i.test(text)) {
      const n = Number(text.replace(/,/g, "").replace(/\s*(?:%|min|h)$/i, ""));
      if (Number.isFinite(n)) return { blank: false, value: n, type: "number" };
    }

    const date = Date.parse(text);
    if (Number.isFinite(date) && /\d/.test(text) && /[-/]/.test(text)) return { blank: false, value: date, type: "number" };
    return { blank: false, value: text.toLocaleLowerCase(), type: "text" };
  }

  function sortTable(table, columnIndex, direction) {
    const tbody = table.tBodies?.[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows).map((row, index) => ({ row, index, sort: valueForSort(row.cells[columnIndex]) }));
    const dir = direction === "descending" ? -1 : 1;
    rows.sort((a, b) => {
      if (a.sort.blank !== b.sort.blank) return a.sort.blank ? 1 : -1;
      if (a.sort.blank && b.sort.blank) return a.index - b.index;
      let cmp = 0;
      if (a.sort.type === "number" && b.sort.type === "number") cmp = a.sort.value - b.sort.value;
      else cmp = String(a.sort.value).localeCompare(String(b.sort.value), undefined, { numeric: true, sensitivity: "base" });
      return cmp === 0 ? a.index - b.index : cmp * dir;
    });
    rows.forEach(({ row }) => tbody.appendChild(row));
  }

  function decorateTable(table) {
    if (!table?.tHead || !table.tBodies?.length) return;
    const headers = Array.from(table.tHead.rows?.[0]?.cells || []);
    headers.forEach((th, index) => {
      if (th.dataset.reportSortReady === "1") return;
      const label = cleanText(th.textContent).toLowerCase();
      if (!label || noSortHeaders.has(label) || th.dataset.noSort === "true") return;
      th.dataset.reportSortReady = "1";
      th.dataset.sortable = "true";
      th.setAttribute("aria-sort", "none");
      const mark = document.createElement("span");
      mark.className = "report-sort-mark";
      mark.textContent = "↕";
      th.appendChild(mark);
      th.addEventListener("click", () => {
        const next = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
        headers.forEach((other) => {
          if (other === th || other.dataset.reportSortReady !== "1") return;
          other.setAttribute("aria-sort", "none");
          const m = other.querySelector(".report-sort-mark");
          if (m) m.textContent = "↕";
        });
        th.setAttribute("aria-sort", next);
        mark.textContent = next === "ascending" ? "▲" : "▼";
        sortTable(table, index, next);
      });
    });
  }

  function decorateTables() {
    document.querySelectorAll("table").forEach(decorateTable);
  }

  function easternToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function decorateDailyReporting() {
    const host = document.getElementById("table");
    const table = host?.querySelector("table");
    if (!table) return;
    table.querySelectorAll("td.report-data-warning").forEach((td) => {
      td.classList.remove("report-data-warning");
      td.removeAttribute("title");
    });
    if (!document.getElementById("daily-tab")?.classList.contains("active")) return;

    const headers = Array.from(table.tHead?.rows?.[0]?.cells || []).map((th) => cleanText(th.childNodes?.[0]?.textContent || th.textContent));
    const dateIndex = headers.findIndex((h) => h === "Date");
    const workedIndex = headers.findIndex((h) => h === "Worked Min");
    const efficiencyIndex = headers.findIndex((h) => h === "Efficiency");
    if (dateIndex < 0) return;
    const today = easternToday();

    Array.from(table.tBodies?.[0]?.rows || []).forEach((row) => {
      const date = cleanText(row.cells[dateIndex]?.textContent);
      if (workedIndex >= 0) {
        const worked = cleanText(row.cells[workedIndex]?.textContent);
        if ((worked === "—" || worked === "") && date && date < today) {
          row.cells[workedIndex].classList.add("report-data-warning");
          row.cells[workedIndex].title = "Hours worked have not been entered for this completed day.";
        }
      }
      if (efficiencyIndex >= 0) {
        const efficiency = Number(cleanText(row.cells[efficiencyIndex]?.textContent).replace("%", ""));
        if (Number.isFinite(efficiency) && efficiency > 95) {
          row.cells[efficiencyIndex].classList.add("report-data-warning");
          row.cells[efficiencyIndex].title = "Possible time discrepancy: daily efficiency is greater than 95%.";
        }
      }
    });
  }

  function shiftDate(text, days) {
    const d = new Date(`${text}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function previousSaturday() {
    const today = easternToday();
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const days = (dow + 1) % 7 || 7;
    return shiftDate(today, -days);
  }

  function formatWeekLabel(dateText) {
    const d = new Date(`${dateText}T12:00:00Z`);
    return `Week Ending ${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" })}`;
  }

  function ensureWeekSelector() {
    if (!weeklyPage) return;
    let field = document.getElementById("week-ending");
    if (!field) return;
    const priorValue = field.value;
    if (field.tagName !== "SELECT") {
      const select = document.createElement("select");
      select.id = field.id;
      select.className = field.className;
      select.setAttribute("aria-label", "Week ending");
      field.replaceWith(select);
      field = select;
    }
    if (field.dataset.weekOptionsReady === "1") return;
    const base = previousSaturday();
    const values = [];
    const options = [];
    for (let i = 0; i < 260; i += 1) {
      const value = shiftDate(base, -7 * i);
      values.push(value);
      options.push(`<option value="${value}">${formatWeekLabel(value)}</option>`);
    }
    field.innerHTML = options.join("");
    field.value = priorValue && values.includes(priorValue) ? priorValue : base;
    field.dataset.weekOptionsReady = "1";
  }

  function scoreClass(value, kind) {
    const n = Number(String(value ?? "").replace("%", ""));
    if (!Number.isFinite(n)) return "weekly-score-neutral";
    if (kind === "error") return n < 1 ? "weekly-score-good" : "weekly-score-bad";
    return n >= 85 ? "weekly-score-good" : "weekly-score-bad";
  }

  function applyScore(el, kind) {
    if (!el) return;
    el.classList.remove("weekly-score-good", "weekly-score-bad", "weekly-score-neutral");
    el.classList.add(scoreClass(cleanText(el.textContent), kind));
  }

  function decorateWeeklyScores() {
    if (!weeklyPage) return;
    const roster = document.getElementById("roster-body")?.closest("table");
    if (roster) {
      const labels = Array.from(roster.tHead?.rows?.[0]?.cells || []).map((th) => cleanText(th.childNodes?.[0]?.textContent || th.textContent));
      const indexes = {
        productivity: labels.indexOf("Productivity"),
        efficiency: labels.indexOf("Efficiency"),
        error: labels.indexOf("Error Rate")
      };
      Array.from(roster.tBodies?.[0]?.rows || []).forEach((row) => {
        if (indexes.productivity >= 0) applyScore(row.cells[indexes.productivity], "productivity");
        if (indexes.efficiency >= 0) applyScore(row.cells[indexes.efficiency], "efficiency");
        if (indexes.error >= 0) applyScore(row.cells[indexes.error], "error");
      });
    }

    ["metric-cards", "employee-metrics"].forEach((id) => {
      document.querySelectorAll(`#${id} > .metric`).forEach((card) => {
        const label = cleanText(card.querySelector(".muted")?.textContent).toLowerCase();
        if (label === "productivity") applyScore(card, "productivity");
        else if (label === "efficiency") applyScore(card, "efficiency");
        else if (label === "error rate") applyScore(card, "error");
      });
    });
  }

  function enhance() {
    ensureWeekSelector();
    decorateTables();
    decorateDailyReporting();
    decorateWeeklyScores();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(enhance, 80);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.getElementById("daily-tab")?.addEventListener("click", () => setTimeout(enhance, 0));
  document.getElementById("weekly-tab")?.addEventListener("click", () => setTimeout(enhance, 0));
  document.addEventListener("DOMContentLoaded", enhance);
  window.addEventListener("pageshow", enhance);
  setTimeout(enhance, 0);
  setTimeout(enhance, 500);
})();
