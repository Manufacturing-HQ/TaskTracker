"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionToken = sessionStorage.getItem(config.sessionStorageKey);
  let bootstrap = null;
  let parsedFile = null;
  let currentRunId = null;
  let currentValidation = null;
  let busy = false;

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

  function setMessage(message, type = "info") {
    const el = $("message");
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function showError(error) {
    setMessage(error?.message || String(error), "error");
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString() : String(value ?? "0");
  }

  function sourceByCode(code) {
    return (bootstrap?.sources || []).find((source) => source.source_code === code) || null;
  }

  function statusPill(status) {
    const value = String(status || "").toUpperCase();
    const cls = value === "SUCCESS" ? "success" : value === "FAILED" ? "failed" : value === "STAGING" ? "staging" : "aborted";
    return `<span class="pill ${cls}">${esc(value)}</span>`;
  }

  function sourceFreshness(source) {
    const last = source.last_success;
    if (!last?.completed_at) return { label:"No Snapshot", cls:"empty" };
    const ageMinutes = Math.max(0, (Date.now() - new Date(last.completed_at).getTime()) / 60000);
    const threshold = Math.max(30, Number(source.expected_refresh_minutes || 15) * 2);
    return ageMinutes <= threshold ? { label:"Current", cls:"current" } : { label:"Stale", cls:"stale" };
  }

  function renderSourceGrid() {
    const host = $("source-grid");
    host.innerHTML = (bootstrap?.sources || []).map((source) => {
      const freshness = sourceFreshness(source);
      const last = source.last_success;
      return `<div class="source-card">
        <h3>${esc(source.display_name)}</h3>
        <div class="source-count">${formatNumber(source.current_row_count)}</div>
        <div class="source-meta">current rows</div>
        <span class="source-state ${freshness.cls}">${freshness.label}</span>
        <div class="source-meta">Last successful refresh: ${last?.completed_at ? esc(formatDateTime(last.completed_at)) : "Never"}${last?.source_generated_at ? `<br>Source generated: ${esc(formatDateTime(last.source_generated_at))}` : ""}</div>
      </div>`;
    }).join("");
  }

  function populateSourceSelect() {
    const select = $("source-select");
    const current = select.value;
    select.innerHTML = '<option value="">Select source</option>' + (bootstrap?.sources || []).map((source) => `<option value="${esc(source.source_code)}">${esc(source.display_name)}</option>`).join("");
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function renderSourceSpec() {
    const source = sourceByCode($("source-select").value);
    const box = $("source-spec");
    if (!source) {
      box.hidden = true;
      box.innerHTML = "";
      updateStageButton();
      return;
    }
    let note = source.description || "";
    if (source.source_code === "OPEN_SALES_ORDERS") {
      note += " Internal ID + Line Unique Key is the stable line identity. If the export still contains two columns both labelled Date, the first is treated as Order Date and the second is retained as the secondary/status date.";
    }
    box.innerHTML = `<strong>${esc(source.display_name)}</strong><div class="muted" style="margin-top:5px">${esc(note)}</div>
      <div style="margin-top:9px;font-size:12px;font-weight:900">Required source fields</div>
      <div class="chips">${(source.required_headers || []).map((h) => `<span class="chip required">${esc(h)}</span>`).join("")}</div>
      ${(source.optional_headers || []).length ? `<div style="margin-top:9px;font-size:12px;font-weight:900">Optional / future-use fields</div><div class="chips">${source.optional_headers.map((h) => `<span class="chip">${esc(h)}</span>`).join("")}</div>` : ""}`;
    box.hidden = false;
    updateStageButton();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"' && field === "") {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        if (text[i + 1] === "\n") continue;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    if (inQuotes) throw new Error("The CSV contains an unterminated quoted field.");
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    while (rows.length && rows[rows.length - 1].every((value) => String(value || "").trim() === "")) rows.pop();
    if (!rows.length) throw new Error("The CSV is empty.");

    const headers = rows[0].map((value, index) => {
      const textValue = String(value ?? "");
      return index === 0 ? textValue.replace(/^\uFEFF/, "").trim() : textValue.trim();
    });
    if (!headers.some((value) => value)) throw new Error("The CSV header row is blank.");

    const dataRows = [];
    const widthErrors = [];
    rows.slice(1).forEach((original, index) => {
      if (original.every((value) => String(value || "").trim() === "")) return;
      const values = original.map((value) => String(value ?? "").trim());
      if (values.length > headers.length) {
        widthErrors.push(index + 2);
        return;
      }
      while (values.length < headers.length) values.push("");
      dataRows.push(values);
    });

    if (widthErrors.length) {
      const sample = widthErrors.slice(0, 8).join(", ");
      throw new Error(`CSV row${widthErrors.length === 1 ? "" : "s"} ${sample}${widthErrors.length > 8 ? "..." : ""} contain more columns than the header row.`);
    }
    if (!dataRows.length) throw new Error("The CSV contains no usable data rows.");
    return { headers, rows:dataRows };
  }

  function renderLocalPreview() {
    const box = $("local-preview");
    if (!parsedFile) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }

    const headers = parsedFile.headers;
    const previewRows = parsedFile.rows.slice(0,5);
    box.innerHTML = `<strong>${esc(parsedFile.fileName)}</strong><div class="muted" style="margin-top:4px">${formatNumber(parsedFile.rows.length)} data rows · ${formatNumber(headers.length)} columns. Duplicate header names are preserved by column position.</div>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr>${headers.map((h,index) => `<th>${esc(h || `(Blank ${index + 1})`)}</th>`).join("")}</tr></thead><tbody>${previewRows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${parsedFile.rows.length > 5 ? '<div class="muted" style="margin-top:7px">Preview shows the first 5 rows only.</div>' : ""}`;
    box.hidden = false;
  }

  async function handleFileChange() {
    const file = $("csv-file").files?.[0];
    parsedFile = null;
    currentValidation = null;
    $("validation").hidden = true;
    $("commit-import").disabled = true;
    if (!file) {
      renderLocalPreview();
      updateStageButton();
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      parsedFile = { ...parsed, fileName:file.name };
      renderLocalPreview();
      setMessage(`${file.name} parsed successfully. Stage it to run server-side validation.`, "success");
    } catch (error) {
      $("csv-file").value = "";
      renderLocalPreview();
      showError(error);
    }
    updateStageButton();
  }

  function setBusy(isBusy) {
    busy = isBusy;
    $("source-select").disabled = isBusy || !!currentRunId;
    $("csv-file").disabled = isBusy || !!currentRunId;
    $("source-generated").disabled = isBusy || !!currentRunId;
    $("reset-import").disabled = isBusy;
    updateStageButton();
    $("commit-import").disabled = isBusy || !currentRunId || !currentValidation?.ready_to_commit;
    $("abort-import").disabled = isBusy || !currentRunId;
  }

  function updateStageButton() {
    $("stage-import").disabled = busy || !!currentRunId || !parsedFile || !$("source-select").value;
  }

  function setProgress(percent, label) {
    const wrap = $("progress-wrap");
    wrap.hidden = false;
    $("progress-bar").style.width = `${Math.max(0,Math.min(100,percent))}%`;
    $("progress-label").textContent = label || "Working...";
  }

  function clearProgress() {
    $("progress-wrap").hidden = true;
    $("progress-bar").style.width = "0%";
    $("progress-label").textContent = "";
  }

  function renderValidation(result) {
    currentValidation = result;
    const box = $("validation");
    const errors = result?.errors || [];
    const warnings = result?.warnings || [];
    box.innerHTML = `${result?.ready_to_commit ? `<div class="ok"><strong>Validation passed.</strong> ${formatNumber(result.row_count)} rows are ready to replace the current snapshot.</div>` : ""}
      ${errors.map((value) => `<div class="bad"><strong>Validation Error:</strong> ${esc(value)}</div>`).join("")}
      ${warnings.map((value) => `<div class="warn"><strong>Warning:</strong> ${esc(value)}</div>`).join("")}`;
    box.hidden = false;
    $("commit-import").disabled = busy || !currentRunId || !result?.ready_to_commit;
  }

  function sourceGeneratedIso() {
    const value = $("source-generated").value;
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Source Generated At is invalid.");
    return date.toISOString();
  }

  async function stageAndValidate() {
    if (!parsedFile || !$("source-select").value) throw new Error("Select a source and CSV file first.");
    setBusy(true);
    setMessage("Staging CSV rows for validation...");
    setProgress(0,"Starting import...");
    let runCreated = false;
    try {
      const started = await rpc("start_netsuite_snapshot_import", {
        p_session_token:sessionToken,
        p_source_code:$("source-select").value,
        p_headers:parsedFile.headers,
        p_source_file_name:parsedFile.fileName,
        p_source_generated_at:sourceGeneratedIso()
      });
      currentRunId = started.run_id;
      runCreated = true;
      const chunkSize = Math.max(1,Number(started.recommended_chunk_size || bootstrap?.recommended_chunk_size || 500));
      const total = parsedFile.rows.length;

      for (let offset = 0; offset < total; offset += chunkSize) {
        const chunk = parsedFile.rows.slice(offset,offset + chunkSize);
        await rpc("stage_netsuite_snapshot_chunk", {
          p_session_token:sessionToken,
          p_run_id:currentRunId,
          p_start_row:offset + 2,
          p_rows:chunk
        });
        const staged = Math.min(total,offset + chunk.length);
        setProgress((staged / total) * 90,`Staged ${formatNumber(staged)} of ${formatNumber(total)} rows...`);
      }

      setProgress(95,"Running server-side validation...");
      const preview = await rpc("preview_netsuite_snapshot_import", { p_session_token:sessionToken,p_run_id:currentRunId });
      renderValidation(preview);
      setProgress(100,preview.ready_to_commit ? "Validation complete. Ready to replace the current snapshot." : "Validation complete. Correct the listed errors before importing.");
      setMessage(preview.ready_to_commit ? "Snapshot staging validation passed. Review warnings, then choose Replace Current Snapshot." : "Snapshot validation found errors. The existing current snapshot has not been changed.", preview.ready_to_commit ? "success" : "error");
    } catch (error) {
      if (runCreated && currentRunId) {
        try { await rpc("abort_netsuite_snapshot_import", { p_session_token:sessionToken,p_run_id:currentRunId }); } catch {}
      }
      currentRunId = null;
      currentValidation = null;
      clearProgress();
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!currentRunId || !currentValidation?.ready_to_commit) throw new Error("Stage and validate the CSV before replacing a snapshot.");
    const source = sourceByCode($("source-select").value);
    const ok = window.confirm(`Replace the current ${source?.display_name || "NetSuite"} snapshot with ${formatNumber(currentValidation.row_count)} validated rows?\n\nThe previous current snapshot will be replaced only if the database commit succeeds.`);
    if (!ok) return;

    setBusy(true);
    setProgress(25,"Replacing current snapshot...");
    try {
      const result = await rpc("commit_netsuite_snapshot_import", { p_session_token:sessionToken,p_run_id:currentRunId });
      if (!result?.success) throw new Error(result?.error || "The snapshot import failed.");
      setProgress(100,`${formatNumber(result.applied_row_count)} rows applied successfully.`);
      setMessage(`${source?.display_name || "NetSuite snapshot"} refreshed successfully with ${formatNumber(result.applied_row_count)} rows.`, "success");
      currentRunId = null;
      currentValidation = null;
      parsedFile = null;
      $("csv-file").value = "";
      $("source-generated").value = "";
      $("validation").hidden = true;
      renderLocalPreview();
      await refreshData();
      window.setTimeout(clearProgress,2500);
    } finally {
      setBusy(false);
    }
  }

  async function abortCurrentImport() {
    if (!currentRunId) return;
    setBusy(true);
    try {
      await rpc("abort_netsuite_snapshot_import", { p_session_token:sessionToken,p_run_id:currentRunId });
      currentRunId = null;
      currentValidation = null;
      $("validation").hidden = true;
      clearProgress();
      setMessage("Staged import aborted. The current snapshot was not changed.", "success");
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  async function resetImport() {
    if (currentRunId) await abortCurrentImport();
    parsedFile = null;
    currentValidation = null;
    $("csv-file").value = "";
    $("source-generated").value = "";
    $("validation").hidden = true;
    clearProgress();
    renderLocalPreview();
    updateStageButton();
  }

  async function loadHistory() {
    const rows = await rpc("get_netsuite_import_history", { p_session_token:sessionToken,p_limit:75 });
    const host = $("history-table");
    host.innerHTML = `<table><thead><tr><th>Status</th><th>Source</th><th>File</th><th>Source Generated</th><th>Started</th><th>Completed</th><th>Rows</th><th>Imported By</th><th>Details</th></tr></thead><tbody>${(rows || []).map((row) => `<tr>
      <td>${statusPill(row.status)}</td><td><strong>${esc(row.source_name)}</strong></td><td>${esc(row.file_name || "—")}</td><td>${esc(formatDateTime(row.source_generated_at))}</td>
      <td>${esc(formatDateTime(row.started_at))}</td><td>${esc(formatDateTime(row.completed_at))}</td><td>${formatNumber(row.applied_row_count ?? row.staged_row_count ?? 0)}</td><td>${esc(row.imported_by)}</td><td>${esc(row.error_message || "—")}</td>
    </tr>`).join("") || '<tr><td colspan="9">No NetSuite snapshot imports have been attempted yet.</td></tr>'}</tbody></table>`;
  }

  async function refreshBootstrap() {
    bootstrap = await rpc("get_netsuite_data_bootstrap", { p_session_token:sessionToken });
    if (bootstrap?.viewer?.role !== "Administrator") throw new Error("NetSuite Data is currently available only to Administrator accounts.");
    $("viewer-name").textContent = bootstrap.viewer.employee_name;
    $("viewer-meta").textContent = `Administrator · Business Date ${bootstrap.business_date} · Snapshot rows are replaced only after validation`;
    populateSourceSelect();
    renderSourceGrid();
    renderSourceSpec();
  }

  async function refreshData() {
    await Promise.all([refreshBootstrap(),loadHistory()]);
  }

  function wireEvents() {
    $("source-select").addEventListener("change",renderSourceSpec);
    $("csv-file").addEventListener("change",() => handleFileChange().catch(showError));
    $("stage-import").addEventListener("click",() => stageAndValidate().catch(showError));
    $("commit-import").addEventListener("click",() => commitImport().catch(showError));
    $("abort-import").addEventListener("click",() => abortCurrentImport().catch(showError));
    $("reset-import").addEventListener("click",() => resetImport().catch(showError));
    $("refresh-status").addEventListener("click",() => refreshBootstrap().catch(showError));
    $("refresh-history").addEventListener("click",() => loadHistory().catch(showError));
  }

  async function init() {
    if (!sessionToken) {
      $("access-denied").hidden = false;
      setMessage("Sign in through Task Tracker with an Administrator account before opening NetSuite Data.", "error");
      return;
    }
    try {
      await refreshBootstrap();
      wireEvents();
      $("app").hidden = false;
      await loadHistory();
    } catch (error) {
      $("access-denied").hidden = false;
      showError(error);
    }
  }

  init();
})();
