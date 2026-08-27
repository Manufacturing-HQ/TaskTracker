"use strict";

(() => {
  function safeCell(value) {
    if (value === null || value === undefined) return "";
    const isNumber = typeof value === "number" && Number.isFinite(value);
    let text = String(value);
    if (!isNumber && /^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function download(filename, headers, rows) {
    if (!Array.isArray(headers) || !headers.length) throw new Error("CSV headers are required.");
    const lines = [headers.map(safeCell).join(",")];
    (rows || []).forEach((row) => {
      const values = Array.isArray(row) ? row : headers.map((header) => row?.[header]);
      lines.push(values.map(safeCell).join(","));
    });
    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "export.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slug(value) {
    return String(value || "all")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "all";
  }

  window.TaskTrackerCsv = { download, slug };
})();

(() => {
  if (!/Reporting/i.test(document.title || "")) return;
  if (document.querySelector('script[data-report-ui-enhancements]')) return;
  const script = document.createElement("script");
  script.src = "js/report-ui-enhancements.js?v=report-ui-20260827";
  script.dataset.reportUiEnhancements = "1";
  document.body.appendChild(script);
})();
