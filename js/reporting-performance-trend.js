"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const ChartLib = window.Chart;
  const section = document.getElementById("performance-trend");
  if (!config || !supabaseLib || !section) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const colorStorageKey = "task-tracker-reporting-trend-colors-v1";

  const metrics = [
    { key: "tracker_minutes", label: "Tracker Min", axis: "raw", digits: 1, color: "#2563eb" },
    { key: "productive_minutes", label: "Productive Min", axis: "raw", digits: 1, color: "#16a34a" },
    { key: "non_productive_minutes", label: "NP Min", axis: "raw", digits: 1, color: "#f59e0b" },
    { key: "minutes_worked", label: "Worked Min", axis: "raw", digits: 1, color: "#7c3aed" },
    { key: "completed_productive_jobs", label: "Completed Jobs", axis: "raw", digits: 0, color: "#0891b2" },
    { key: "completed_quantity", label: "Completed Qty", axis: "raw", digits: 2, color: "#0f766e" },
    { key: "expected_minutes", label: "Expected Min", axis: "raw", digits: 1, color: "#4f46e5" },
    { key: "productivity_percent", label: "Productivity", axis: "percent", digits: 1, color: "#dc2626" },
    { key: "tracker_coverage_percent", label: "Efficiency", axis: "percent", digits: 1, color: "#9333ea" },
    { key: "unaccounted_minutes", label: "Unaccounted Min", axis: "raw", digits: 1, color: "#ea580c" },
    { key: "qa_reviewed_pieces", label: "QA Reviewed", axis: "raw", digits: 2, color: "#0284c7" },
    { key: "qa_error_quantity", label: "Errors", axis: "raw", digits: 2, color: "#be123c" },
    { key: "error_rate_percent", label: "Error Rate", axis: "percent", digits: 1, color: "#b91c1c" }
  ];

  let chart = null;
  let chartRows = [];
  let setupLoaded = false;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function readColors() {
    try {
      const parsed = JSON.parse(localStorage.getItem(colorStorageKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveColors() {
    const colors = {};
    section.querySelectorAll('input[type="color"][data-metric-color]').forEach((input) => {
      colors[input.dataset.metricColor] = input.value;
    });
    try { localStorage.setItem(colorStorageKey, JSON.stringify(colors)); } catch {}
  }

  function metricColor(metric) {
    const input = section.querySelector(`input[data-metric-color="${metric.key}"]`);
    return input?.value || metric.color;
  }

  function selectedMetrics() {
    return metrics.filter((metric) => section.querySelector(`input[data-metric-key="${metric.key}"]`)?.checked);
  }

  function setTrendMessage(message, type = "info") {
    const el = $("trend-message");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function populateSetup(setup) {
    if (!setup) return;
    const employeeSelect = $("trend-employee");
    const supervisorSelect = $("trend-supervisor");
    const previousEmployee = employeeSelect.value;
    const previousSupervisor = supervisorSelect.value;

    employeeSelect.innerHTML = '<option value="">Select employee</option>';
    (setup.employees || []).forEach((employee) => {
      const option = document.createElement("option");
      option.value = employee.employee_id;
      option.textContent = [employee.employee_name, employee.department].filter(Boolean).join(" · ");
      employeeSelect.appendChild(option);
    });

    supervisorSelect.innerHTML = '<option value="">Select supervisor</option>';
    (setup.supervisors || []).forEach((supervisor) => {
      const option = document.createElement("option");
      option.value = supervisor.supervisor_id;
      option.textContent = supervisor.supervisor_name;
      supervisorSelect.appendChild(option);
    });

    const mainEmployee = $("report-employee")?.value;
    const mainSupervisor = $("report-supervisor")?.value;
    if (previousEmployee && [...employeeSelect.options].some((o) => o.value === previousEmployee)) {
      employeeSelect.value = previousEmployee;
    } else if (mainEmployee && [...employeeSelect.options].some((o) => o.value === mainEmployee)) {
      employeeSelect.value = mainEmployee;
    } else if (employeeSelect.options.length > 1) {
      employeeSelect.selectedIndex = 1;
    }

    if (previousSupervisor && [...supervisorSelect.options].some((o) => o.value === previousSupervisor)) {
      supervisorSelect.value = previousSupervisor;
    } else if (mainSupervisor && [...supervisorSelect.options].some((o) => o.value === mainSupervisor)) {
      supervisorSelect.value = mainSupervisor;
    } else if (supervisorSelect.options.length > 1) {
      supervisorSelect.selectedIndex = 1;
    }

    setupLoaded = true;
    syncViewControls();
  }

  function renderMetricControls() {
    const saved = readColors();
    const defaults = new Set(["productivity_percent", "tracker_coverage_percent"]);
    $("trend-metrics").innerHTML = metrics.map((metric) => `
      <div class="trend-metric-option">
        <label class="trend-metric-check">
          <input type="checkbox" data-metric-key="${esc(metric.key)}" ${defaults.has(metric.key) ? "checked" : ""}>
          <span>${esc(metric.label)}</span>
        </label>
        <input type="color" data-metric-color="${esc(metric.key)}" value="${esc(saved[metric.key] || metric.color)}" title="${esc(metric.label)} line color">
      </div>`).join("");
    updateMetricCount();
  }

  function updateMetricCount() {
    const count = selectedMetrics().length;
    $("trend-metric-count").textContent = `${count} of 5 selected`;
  }

  function syncViewControls() {
    const supervisorView = $("trend-view").value === "supervisor";
    $("trend-employee-wrap").hidden = supervisorView;
    $("trend-supervisor-wrap").hidden = !supervisorView;
    $("trend-subject-note").textContent = supervisorView
      ? "Supervisor view recalculates team percentages from the team's daily totals."
      : "Individual view plots the selected employee's daily reporting values.";
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function aggregateSupervisorRows(rows) {
    const map = new Map();
    for (const row of rows) {
      const date = row.work_date;
      if (!date) continue;
      if (!map.has(date)) {
        map.set(date, {
          work_date: date,
          tracker_minutes: 0,
          productive_minutes: 0,
          non_productive_minutes: 0,
          minutes_worked: 0,
          worked_value_count: 0,
          completed_productive_jobs: 0,
          completed_quantity: 0,
          expected_minutes: 0,
          qa_reviewed_pieces: 0,
          qa_error_quantity: 0
        });
      }
      const day = map.get(date);
      day.tracker_minutes += number(row.tracker_minutes);
      day.productive_minutes += number(row.productive_minutes);
      day.non_productive_minutes += number(row.non_productive_minutes);
      if (row.minutes_worked !== null && row.minutes_worked !== undefined && row.minutes_worked !== "") {
        day.minutes_worked += number(row.minutes_worked);
        day.worked_value_count += 1;
      }
      day.completed_productive_jobs += number(row.completed_productive_jobs);
      day.completed_quantity += number(row.completed_quantity);
      day.expected_minutes += number(row.expected_minutes);
      day.qa_reviewed_pieces += number(row.qa_reviewed_pieces);
      day.qa_error_quantity += number(row.qa_error_quantity);
    }

    return [...map.values()].sort((a, b) => a.work_date.localeCompare(b.work_date)).map((day) => {
      const worked = day.worked_value_count > 0 ? day.minutes_worked : null;
      return {
        ...day,
        minutes_worked: worked,
        productivity_percent: day.productive_minutes > 0
          ? day.expected_minutes / day.productive_minutes * 100
          : null,
        tracker_coverage_percent: worked !== null && worked > 0
          ? day.tracker_minutes / worked * 100
          : null,
        unaccounted_minutes: worked === null ? null : worked - day.tracker_minutes,
        error_rate_percent: day.qa_reviewed_pieces > 0
          ? Math.min(100, day.qa_error_quantity / day.qa_reviewed_pieces * 100)
          : 0
      };
    });
  }

  async function fetchChartRows() {
    const token = sessionStorage.getItem(sessionKey);
    const start = $("start-date")?.value;
    const end = $("end-date")?.value;
    if (!token || !start || !end || end < start) throw new Error("Select a valid date range.");

    const supervisorView = $("trend-view").value === "supervisor";
    const employeeId = $("trend-employee").value || null;
    const supervisorId = $("trend-supervisor").value || null;
    if (supervisorView && !supervisorId) throw new Error("Select a supervisor for the Performance Trend.");
    if (!supervisorView && !employeeId) throw new Error("Select an employee for the Performance Trend.");

    const rows = await rpc("get_reporting_daily", {
      p_session_token: token,
      p_start_date: start,
      p_end_date: end,
      p_employee_id: supervisorView ? null : employeeId,
      p_supervisor_id: supervisorView ? supervisorId : null,
      p_exclude_non_task_tracker: false
    });
    const data = Array.isArray(rows) ? rows : [];
    return supervisorView ? aggregateSupervisorRows(data) : data.sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
  }

  function formatChartValue(value, metric) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const formatted = n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: metric.digits
    });
    return metric.axis === "percent" ? `${formatted}%` : formatted;
  }

  const valueLabelsPlugin = {
    id: "taskTrackerValueLabels",
    afterDatasetsDraw(chartInstance) {
      if (!$("trend-show-labels")?.checked) return;
      const ctx = chartInstance.ctx;
      ctx.save();
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      chartInstance.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chartInstance.getDatasetMeta(datasetIndex);
        const metric = metrics.find((item) => item.key === dataset.metricKey);
        if (!metric || meta.hidden) return;
        meta.data.forEach((point, index) => {
          const value = dataset.data[index];
          if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
          ctx.fillStyle = dataset.borderColor;
          ctx.fillText(formatChartValue(value, metric), point.x, point.y - 6);
        });
      });
      ctx.restore();
    }
  };

  function renderChart() {
    if (!ChartLib) {
      setTrendMessage("Chart library failed to load. Refresh the page and try again.", "error");
      return;
    }
    const selected = selectedMetrics();
    if (!selected.length) {
      setTrendMessage("Select at least one chart metric.", "error");
      return;
    }

    const labels = chartRows.map((row) => row.work_date);
    const hasRaw = selected.some((metric) => metric.axis === "raw");
    const hasPercent = selected.some((metric) => metric.axis === "percent");

    const datasets = selected.map((metric) => ({
      label: metric.label,
      metricKey: metric.key,
      data: chartRows.map((row) => {
        const value = row[metric.key];
        return value === null || value === undefined || value === "" ? null : Number(value);
      }),
      borderColor: metricColor(metric),
      backgroundColor: metricColor(metric),
      yAxisID: metric.axis === "percent" ? "yPercent" : "yRaw",
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.2,
      spanGaps: false
    }));

    if (chart) chart.destroy();
    chart = new ChartLib($("trend-chart"), {
      type: "line",
      data: { labels, datasets },
      plugins: [valueLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label(context) {
                const metric = metrics.find((item) => item.key === context.dataset.metricKey);
                return `${context.dataset.label}: ${formatChartValue(context.raw, metric || { axis: "raw", digits: 1 })}`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Date" },
            ticks: { maxRotation: 45, minRotation: 0 }
          },
          yRaw: {
            display: hasRaw,
            position: "left",
            beginAtZero: true,
            title: { display: hasRaw, text: "Minutes / Quantity / Count" }
          },
          yPercent: {
            display: hasPercent,
            position: "right",
            beginAtZero: true,
            suggestedMax: 100,
            title: { display: hasPercent, text: "Percent" },
            grid: { drawOnChartArea: !hasRaw }
          }
        }
      }
    });

    $("trend-export").disabled = false;
    $("trend-point-count").textContent = `${chartRows.length} day${chartRows.length === 1 ? "" : "s"} with data`;
    const subject = $("trend-view").value === "supervisor"
      ? $("trend-supervisor").selectedOptions?.[0]?.textContent
      : $("trend-employee").selectedOptions?.[0]?.textContent;
    $("trend-chart-title").textContent = subject || "Performance Trend";
    setTrendMessage(chartRows.length ? "Performance Trend loaded." : "No daily reporting data matched this selection.", chartRows.length ? "success" : "info");
  }

  async function loadChart() {
    if (!setupLoaded) populateSetup(window.TaskTrackerReportingSetup);
    if (!setupLoaded) return;
    const selected = selectedMetrics();
    if (!selected.length) throw new Error("Select at least one chart metric.");
    if (selected.length > 5) throw new Error("Select no more than 5 chart metrics.");

    $("trend-update").disabled = true;
    $("trend-export").disabled = true;
    setTrendMessage("Loading Performance Trend...");
    try {
      chartRows = await fetchChartRows();
      renderChart();
    } catch (error) {
      setTrendMessage(error.message || String(error), "error");
      throw error;
    } finally {
      $("trend-update").disabled = false;
    }
  }

  function exportChart() {
    if (!chart) return;
    const link = document.createElement("a");
    const start = $("start-date")?.value || "start";
    const end = $("end-date")?.value || "end";
    const view = $("trend-view").value;
    const subject = view === "supervisor"
      ? $("trend-supervisor").selectedOptions?.[0]?.textContent
      : $("trend-employee").selectedOptions?.[0]?.textContent;
    const slug = String(subject || view).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.download = `task-tracker-performance-trend-${start}-to-${end}-${slug || view}.png`;
    link.href = chart.toBase64Image("image/png", 1);
    link.click();
  }

  function install() {
    renderMetricControls();
    populateSetup(window.TaskTrackerReportingSetup);
    syncViewControls();

    $("trend-view").addEventListener("change", () => {
      syncViewControls();
      setTrendMessage("Choose the subject and click Update Chart.");
    });

    $("trend-metrics").addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[type="checkbox"][data-metric-key]');
      if (checkbox && selectedMetrics().length > 5) {
        checkbox.checked = false;
        setTrendMessage("You can plot up to 5 metrics at once.", "error");
      } else if (checkbox && !selectedMetrics().length) {
        setTrendMessage("Select at least one chart metric.", "error");
      } else {
        setTrendMessage("");
      }
      if (event.target.matches('input[type="color"][data-metric-color]')) saveColors();
      updateMetricCount();
      if (chartRows.length && selectedMetrics().length) renderChart();
    });

    $("trend-show-labels").addEventListener("change", () => {
      if (chartRows.length) renderChart();
    });
    $("trend-update").addEventListener("click", () => loadChart().catch(() => {}));
    $("trend-export").addEventListener("click", exportChart);

    window.addEventListener("tasktracker:reporting-setup", (event) => populateSetup(event.detail));
    window.addEventListener("tasktracker:report-loaded", (event) => {
      if (event.detail?.mode !== "by-date") return;
      if ($("report-employee")?.value && $("trend-view").value === "individual") {
        const value = $("report-employee").value;
        if ([...$("trend-employee").options].some((option) => option.value === value)) $("trend-employee").value = value;
      }
      if ($("report-supervisor")?.value && $("trend-view").value === "supervisor") {
        const value = $("report-supervisor").value;
        if ([...$("trend-supervisor").options].some((option) => option.value === value)) $("trend-supervisor").value = value;
      }
      loadChart().catch(() => {});
    });
  }

  install();
})();