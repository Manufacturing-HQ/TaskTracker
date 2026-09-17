"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{ autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
  const $ = (id) => document.getElementById(id);
  const token = sessionStorage.getItem(config.sessionStorageKey);

  let bootstrap = null;
  let demandRows = [];
  let woRows = [];
  let parsedInput = null;
  let currentRunId = null;
  let currentValidation = null;
  let busy = false;
  let demandPage = 1;
  let woPage = 1;
  const pageSize = 100;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function rpc(name,args={}) {
    const { data,error } = await client.rpc(name,args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(message,type="info") {
    const el=$("message");
    el.textContent=message||"";
    el.dataset.type=type;
    el.hidden=!message;
  }

  function showError(error) {
    setMessage(error?.message || String(error),"error");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function num(value,decimals=0) {
    if (value === null || value === undefined || value === "") return "—";
    const n=Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:decimals});
  }

  function dt(value) {
    if (!value) return "Never";
    const d=new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function dateOnly(value) {
    if (!value) return "—";
    const d=new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  function statusPill(status) {
    const value=String(status||"").toUpperCase();
    const cls=value==="SUCCESS"?"success":value==="FAILED"?"failed":value==="STAGING"?"staging":"";
    return `<span class="pill ${cls}">${esc(value||"—")}</span>`;
  }

  function normalizeHeader(value) {
    return String(value??"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  }

  function parseCsv(text) {
    const rows=[]; let row=[]; let field=""; let inQuotes=false;
    for (let i=0;i<text.length;i+=1) {
      const ch=text[i];
      if (inQuotes) {
        if (ch==='"') {
          if (text[i+1]==='"') { field+='"'; i+=1; }
          else inQuotes=false;
        } else field+=ch;
        continue;
      }
      if (ch==='"' && field==="") inQuotes=true;
      else if (ch===",") { row.push(field); field=""; }
      else if (ch==="\n") { row.push(field); rows.push(row); row=[]; field=""; }
      else if (ch==="\r") { if (text[i+1]!=="\n") { row.push(field); rows.push(row); row=[]; field=""; } }
      else field+=ch;
    }
    if (inQuotes) throw new Error("The CSV contains an unterminated quoted field.");
    if (field!=="" || row.length) { row.push(field); rows.push(row); }
    while (rows.length && rows[rows.length-1].every(v=>String(v||"").trim()==="")) rows.pop();
    if (!rows.length) throw new Error("The CSV is empty.");
    const headers=rows[0].map((v,i)=>i===0?String(v??"").replace(/^\uFEFF/,"").trim():String(v??"").trim());
    if (!headers.some(Boolean)) throw new Error("The CSV header row is blank.");
    const data=[];
    rows.slice(1).forEach((r,index)=>{
      if (r.every(v=>String(v||"").trim()==="")) return;
      if (r.length>headers.length) throw new Error(`CSV row ${index+2} contains more columns than the header row.`);
      const out=r.map(v=>String(v??"").trim());
      while(out.length<headers.length) out.push("");
      data.push(out);
    });
    if (!data.length) throw new Error("The CSV contains no usable data rows.");
    return {headers,rows:data};
  }

  function headerIndex(headers,aliases) {
    const normalized=headers.map(normalizeHeader);
    for (const alias of aliases) {
      const idx=normalized.indexOf(normalizeHeader(alias));
      if (idx>=0) return idx;
    }
    return -1;
  }

  function canonicalRows(source,parsed) {
    const h=parsed.headers;
    if (source==="ITEM_PLANNING_FIELDS") {
      const internal=headerIndex(h,["Internal ID","Internal Id"]);
      const item=headerIndex(h,["Name","Item Name","Item"]);
      const preferred=headerIndex(h,["Preferred Stock Level","Preferred Stock"]);
      const usage=headerIndex(h,["Usage Classification","Usage Class"]);
      const missing=[];
      if (internal<0) missing.push("Internal ID");
      if (preferred<0) missing.push("Preferred Stock Level");
      if (usage<0) missing.push("Usage Classification");
      if (missing.length) throw new Error(`Missing required header${missing.length===1?"":"s"}: ${missing.join(", ")}.`);
      return parsed.rows.map(r=>({
        internal_id:r[internal]||"",
        item_name:item>=0?(r[item]||""):"",
        preferred_stock_level:r[preferred]||"",
        usage_classification:r[usage]||""
      }));
    }

    if (source==="FLEET_WIDE_PAR") {
      const product=headerIndex(h,["product","Item","Name"]);
      const totalQty=headerIndex(h,["Total Quantity"]);
      const totalPar=headerIndex(h,["Total Par"]);
      const transit=headerIndex(h,["In Transit Restocks"]);
      const reach=headerIndex(h,["To Reach Par"]);
      const vans=headerIndex(h,["Total Vans Below Par"]);
      const missing=[];
      if (product<0) missing.push("product");
      if (reach<0) missing.push("To Reach Par");
      if (missing.length) throw new Error(`Missing required header${missing.length===1?"":"s"}: ${missing.join(", ")}.`);
      return parsed.rows.map(r=>({
        item_name:r[product]||"",
        total_quantity:totalQty>=0?(r[totalQty]||""):"",
        total_par:totalPar>=0?(r[totalPar]||""):"",
        in_transit_restocks:transit>=0?(r[transit]||""):"",
        to_reach_par:r[reach]||"",
        total_vans_below_par:vans>=0?(r[vans]||""):""
      }));
    }
    throw new Error("Select a planning input source first.");
  }

  function sourceHelp() {
    const source=$("input-source").value;
    const box=$("input-help");
    if (!source) { box.hidden=true; box.textContent=""; return; }
    if (source==="ITEM_PLANNING_FIELDS") {
      box.innerHTML="<strong>Item Planning Fields:</strong> export the current Demand Planner <strong>Items</strong> tab as CSV. Only Internal ID, Preferred Stock Level, and Usage Classification are applied. Existing Task Tracker items are matched by Internal ID; no items are created or deleted.";
    } else {
      box.innerHTML="<strong>Fleet Wide Par:</strong> export the <strong>Fleet Wide Par</strong> tab as CSV. The import replaces the current Fleet Wide Par snapshot. Fleet Need is the <strong>To Reach Par</strong> field.";
    }
    box.hidden=false;
  }

  function renderInputPreview() {
    const box=$("input-preview");
    if (!parsedInput) { box.hidden=true; box.innerHTML=""; return; }
    const preview=parsedInput.rows.slice(0,5);
    box.innerHTML=`<strong>${esc(parsedInput.fileName)}</strong><div class="muted" style="margin-top:4px">${num(parsedInput.rows.length)} data rows · ${num(parsedInput.headers.length)} columns</div><div class="table-wrap" style="margin-top:10px;max-height:260px"><table><thead><tr>${parsedInput.headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${preview.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    box.hidden=false;
  }

  async function handleInputFile() {
    parsedInput=null; currentValidation=null;
    $("input-validation").hidden=true; $("commit-input").disabled=true;
    const file=$("input-file").files?.[0];
    if (!file) { renderInputPreview(); updateImportButtons(); return; }
    try {
      const parsed=parseCsv(await file.text());
      canonicalRows($("input-source").value,parsed);
      parsedInput={...parsed,fileName:file.name};
      renderInputPreview();
      setMessage(`${file.name} parsed successfully. Stage it to validate against Task Tracker.`,"success");
    } catch(error) {
      $("input-file").value=""; renderInputPreview(); showError(error);
    }
    updateImportButtons();
  }

  function setImportProgress(percent,label) {
    $("input-progress").hidden=false;
    $("input-progress-bar").style.width=`${Math.max(0,Math.min(100,percent))}%`;
    $("input-progress-label").textContent=label||"Working...";
  }

  function clearImportProgress() {
    $("input-progress").hidden=true;
    $("input-progress-bar").style.width="0%";
    $("input-progress-label").textContent="";
  }

  function updateImportButtons() {
    const canStage=!busy && !currentRunId && !!parsedInput && !!$("input-source").value;
    $("stage-input").disabled=!canStage;
    $("commit-input").disabled=busy || !currentRunId || !currentValidation?.ready_to_commit;
    $("abort-input").disabled=busy || !currentRunId;
    $("input-source").disabled=busy || !!currentRunId;
    $("input-file").disabled=busy || !!currentRunId;
    $("reset-input").disabled=busy;
  }

  function renderValidation(result) {
    currentValidation=result;
    const errors=result?.errors||[]; const warnings=result?.warnings||[];
    const box=$("input-validation");
    box.innerHTML=`${result?.ready_to_commit?`<div class="ok"><strong>Validation passed.</strong> ${num(result.valid_row_count)} valid row(s) are ready to import${result.skipped_row_count?`; ${num(result.skipped_row_count)} row(s) will be skipped`:""}.</div>`:""}${errors.map(x=>`<div class="bad"><strong>Validation Error:</strong> ${esc(x)}</div>`).join("")}${warnings.map(x=>`<div class="warn"><strong>Warning:</strong> ${esc(x)}</div>`).join("")}`;
    box.hidden=false;
    updateImportButtons();
  }

  async function stageInput() {
    const source=$("input-source").value;
    if (!source || !parsedInput) throw new Error("Select an input source and CSV first.");
    const rows=canonicalRows(source,parsedInput);
    busy=true; updateImportButtons(); setImportProgress(0,"Starting planning input import...");
    try {
      const started=await rpc("start_demand_planning_input_import",{p_session_token:token,p_source_code:source,p_headers:parsedInput.headers,p_source_file_name:parsedInput.fileName});
      currentRunId=started.run_id;
      const chunkSize=Number(started.recommended_chunk_size||bootstrap?.recommended_chunk_size||400);
      for (let offset=0;offset<rows.length;offset+=chunkSize) {
        const chunk=rows.slice(offset,offset+chunkSize);
        await rpc("stage_demand_planning_input_chunk",{p_session_token:token,p_run_id:currentRunId,p_start_row:offset+2,p_rows:chunk});
        const done=Math.min(rows.length,offset+chunk.length);
        setImportProgress((done/rows.length)*90,`Staged ${num(done)} of ${num(rows.length)} rows...`);
      }
      setImportProgress(95,"Validating...");
      const validation=await rpc("preview_demand_planning_input_import",{p_session_token:token,p_run_id:currentRunId});
      renderValidation(validation);
      setImportProgress(100,validation.ready_to_commit?"Validation complete. Ready to import valid rows.":"Validation complete. Review errors.");
      setMessage(validation.ready_to_commit?"Planning input validation passed. Review any warnings, then import valid rows.":"Planning input validation found errors.",validation.ready_to_commit?"success":"error");
    } catch(error) {
      if (currentRunId) { try { await rpc("abort_demand_planning_input_import",{p_session_token:token,p_run_id:currentRunId}); } catch {} }
      currentRunId=null; currentValidation=null; clearImportProgress(); throw error;
    } finally { busy=false; updateImportButtons(); }
  }

  async function commitInput() {
    if (!currentRunId || !currentValidation?.ready_to_commit) throw new Error("Stage and validate the input first.");
    const source=$("input-source").value;
    const label=source==="ITEM_PLANNING_FIELDS"?"update Item Master Preferred Stock / Usage Classification":"replace the current Fleet Wide Par snapshot";
    if (!window.confirm(`Proceed and ${label} with ${num(currentValidation.valid_row_count)} valid row(s)?`)) return;
    busy=true; updateImportButtons(); setImportProgress(40,"Applying planning input...");
    try {
      const result=await rpc("commit_demand_planning_input_import",{p_session_token:token,p_run_id:currentRunId});
      if (!result?.success) throw new Error(result?.error||"Planning input import failed.");
      setImportProgress(100,`Imported ${num(result.applied_row_count)} row(s).`);
      setMessage(`Planning input refreshed successfully with ${num(result.applied_row_count)} row(s).`,"success");
      currentRunId=null; currentValidation=null; parsedInput=null;
      $("input-file").value=""; $("input-validation").hidden=true; renderInputPreview();
      await refreshAll(false);
      setTimeout(clearImportProgress,1000);
    } finally { busy=false; updateImportButtons(); }
  }

  async function abortInput() {
    if (currentRunId) await rpc("abort_demand_planning_input_import",{p_session_token:token,p_run_id:currentRunId});
    resetInput(); setMessage("Staged planning input was aborted.");
  }

  function resetInput() {
    parsedInput=null; currentRunId=null; currentValidation=null;
    $("input-file").value=""; $("input-validation").hidden=true; clearImportProgress(); renderInputPreview(); updateImportButtons();
  }

  function reviewState() {
    const calc=bootstrap?.calculation;
    const el=$("review-state");
    if (!calc) {
      el.innerHTML="<strong>No Planning Review has been run yet.</strong> Import the two planning inputs below, then run the review when you are ready.";
      return;
    }
    if (calc.status==="FAILED") {
      el.innerHTML=`<strong>Last Planning Review failed.</strong> ${esc(calc.error_message||"")} The previous successful current result set, if one exists, was left intact.`;
      return;
    }
    if (calc.is_stale) {
      el.innerHTML=`<strong>Planning Review is out of date.</strong> At least one NetSuite or planning input changed after the last calculation at ${esc(dt(calc.completed_at))}. Current calculated values remain frozen until you run the review again.`;
      return;
    }
    el.innerHTML=`<strong>Planning Review is current.</strong> Last calculated ${esc(dt(calc.completed_at))}.`;
  }

  function renderFoundation() {
    const inputs=bootstrap?.inputs||{}; const calc=bootstrap?.calculation;
    $("viewer-name").textContent=bootstrap?.viewer?.employee_name||"Administrator";
    $("metric-items").textContent=num(inputs.planning_item_rows||0);
    $("metric-items-meta").textContent=`Preferred Stock loaded: ${num(inputs.preferred_stock_rows||0)} · Usage loaded: ${num(inputs.usage_classification_rows||0)}`;
    $("metric-fleet").textContent=num(inputs.fleet_par_rows||0);
    $("metric-fleet-meta").textContent=inputs.last_fleet_import?.completed_at?`Last import: ${dt(inputs.last_fleet_import.completed_at)}`:"No Fleet Wide Par import yet";
    $("metric-results").textContent=num(bootstrap?.current_result_rows||0);
    $("metric-results-meta").textContent=calc?.is_stale?"Frozen result set · inputs changed":"Latest calculated result set";
    $("metric-review").textContent=calc?.completed_at?dt(calc.completed_at):"Never";
    $("metric-review-meta").textContent=calc?`${calc.status} · ${num(calc.result_row_count||0)} rows`:"Import planning inputs first";
    $("run-review").disabled=busy || !inputs.ready_to_run;
    reviewState();
    renderHistory();
  }

  async function runReview() {
    if (!bootstrap?.inputs?.ready_to_run) throw new Error("Planning inputs are not ready yet.");
    if (!window.confirm("Run Planning Review now?\n\nThis recalculates the current Demand result set from the latest snapshots. Snapshot imports by themselves never trigger this calculation.")) return;
    busy=true; $("run-review").disabled=true; setMessage("Running shared Demand Planning calculations...");
    try {
      const result=await rpc("run_demand_planning_review",{p_session_token:token});
      if (!result?.success) throw new Error(result?.error||"Planning Review failed.");
      setMessage(`Planning Review completed successfully with ${num(result.result_row_count)} item rows.`,"success");
      await refreshAll(false);
    } finally { busy=false; renderFoundation(); }
  }

  function optionList(id,values) {
    const el=$(id); const current=el.value;
    const unique=[...new Set(values.map(v=>String(v??"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    el.innerHTML='<option value="">All</option>'+unique.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (unique.includes(current)) el.value=current;
  }

  function populateFilters() {
    optionList("filter-status",demandRows.map(r=>r.demand_status));
    optionList("filter-dept",demandRows.map(r=>r.work_order_department));
    optionList("filter-usage",demandRows.map(r=>r.usage_classification));
    optionList("filter-sku",demandRows.map(r=>r.sku_group));
    optionList("wo-operation",woRows.map(r=>r.operation_in_progress));
    optionList("wo-demand",woRows.map(r=>r.demand_status));
  }

  function filteredDemand() {
    const q=$("demand-search").value.trim().toLowerCase();
    const status=$("filter-status").value; const dept=$("filter-dept").value; const usage=$("filter-usage").value; const sku=$("filter-sku").value;
    const minBuild=Number($("filter-max-build").value||0); const hideHolds=$("hide-holds").checked;
    const rows=demandRows.filter(r=>{
      if (q && ![r.item_name,r.internal_id,r.sku_group,r.usage_classification,r.work_order_department,r.constraint_text].some(v=>String(v??"").toLowerCase().includes(q))) return false;
      if (status && r.demand_status!==status) return false;
      if (dept && r.work_order_department!==dept) return false;
      if (usage && r.usage_classification!==usage) return false;
      if (sku && r.sku_group!==sku) return false;
      if (minBuild && (r.max_build_quantity===null || Number(r.max_build_quantity)<minBuild)) return false;
      if (hideHolds && r.is_on_hold) return false;
      return true;
    });
    const sort=$("demand-sort").value;
    rows.sort((a,b)=>{
      if (sort==="item-asc") return String(a.item_name||"").localeCompare(String(b.item_name||""));
      if (sort==="weeks-asc") return (a.weeks_supply===null?Infinity:Number(a.weeks_supply))-(b.weeks_supply===null?Infinity:Number(b.weeks_supply));
      if (sort==="max-desc") return (b.max_build_quantity===null?-Infinity:Number(b.max_build_quantity))-(a.max_build_quantity===null?-Infinity:Number(a.max_build_quantity));
      if (sort==="priority-desc") return Number(b.priority_backorder_total||0)-Number(a.priority_backorder_total||0);
      return Number(b.target_demand||0)-Number(a.target_demand||0);
    });
    return rows;
  }

  function renderDemand() {
    const combined=$("show-combined").checked;
    $("demand-head").innerHTML=`<tr><th>Item</th><th>Hold</th><th>SKU Group</th><th>Usage</th><th>Department</th><th>Target Demand</th><th>Total Demand</th>${combined?"<th>Combined Demand</th><th>Combined Target</th>":""}<th>Max Build</th><th>Weeks Supply</th><th>Priority Backorder</th><th>Preferred Stock</th><th>Fleet Need</th><th>On Hand</th><th>WIP</th><th>Total In House</th><th>Status</th><th>Constraint</th></tr>`;
    const rows=filteredDemand(); const pages=Math.max(1,Math.ceil(rows.length/pageSize)); demandPage=Math.min(Math.max(demandPage,1),pages);
    const start=(demandPage-1)*pageSize; const shown=rows.slice(start,start+pageSize);
    $("demand-body").innerHTML=shown.length?shown.map(r=>`<tr class="${r.is_on_hold?"row-hold":""}"><td><strong>${esc(r.item_name)}</strong></td><td>${r.is_on_hold?`<span class="status hold" title="${esc(r.hold_reason||"")}">ON HOLD</span>`:""}</td><td>${esc(r.sku_group||"")}</td><td>${esc(r.usage_classification||"")}</td><td>${esc(r.work_order_department||"")}</td><td><strong>${num(r.target_demand,2)}</strong></td><td>${num(r.total_demand,2)}</td>${combined?`<td>${num(r.combined_demand,2)}</td><td>${num(r.combined_target_demand,2)}</td>`:""}<td>${r.has_bom?num(r.max_build_quantity,2):"N/A"}</td><td>${r.weeks_supply===null?"N/A":num(r.weeks_supply,2)}</td><td>${num(r.priority_backorder_total,2)}</td><td>${num(r.preferred_stock_level,2)}</td><td>${num(r.fleet_need,2)}</td><td>${num(r.production_available,2)}</td><td>${num(r.wip_quantity,2)}</td><td>${num(r.total_in_house,2)}</td><td><span class="status ${r.demand_status==="Demand"?"demand":"good"}">${esc(r.demand_status)}</span></td><td style="white-space:normal;max-width:360px">${esc(r.constraint_text||"").replaceAll("\n","<br>")}</td></tr>`).join(""):`<tr><td colspan="19" class="muted">No rows match the current filters.</td></tr>`;
    $("demand-summary").textContent=rows.length?`Showing ${num(start+1)}-${num(Math.min(start+pageSize,rows.length))} of ${num(rows.length)} matching items · Page ${demandPage} of ${pages}`:"0 matching items";
    $("demand-prev").disabled=demandPage<=1; $("demand-next").disabled=demandPage>=pages;
  }

  function filteredWo() {
    const q=$("wo-search").value.trim().toLowerCase(); const op=$("wo-operation").value; const status=$("wo-demand").value; const stalled=$("wo-stalled").value; const hide=$("wo-hide-holds").checked;
    return woRows.filter(r=>{
      if (q && ![r.document_number,r.item_name,r.work_order_type,r.work_order_job_type,r.build_employee,r.qc_employee,r.stalled_work_order_comments].some(v=>String(v??"").toLowerCase().includes(q))) return false;
      if (op && r.operation_in_progress!==op) return false;
      if (status && r.demand_status!==status) return false;
      if (stalled==="yes" && !r.stalled_work_order) return false;
      if (stalled==="no" && r.stalled_work_order) return false;
      if (hide && r.is_on_hold) return false;
      return true;
    });
  }

  function renderWo() {
    $("wo-head").innerHTML="<tr><th>Date</th><th>Document #</th><th>W/O Type</th><th>Job Type</th><th>Item</th><th>Qty</th><th>Operation</th><th>Op Completion</th><th>Target Demand</th><th>Demand Status</th><th>Max Build</th><th>Usage</th><th>Build Type</th><th>Department</th><th>Hold</th><th>Build Employee</th><th>QC Employee</th><th>Stalled</th><th>Comments</th></tr>";
    const rows=filteredWo(); const pages=Math.max(1,Math.ceil(rows.length/pageSize)); woPage=Math.min(Math.max(woPage,1),pages); const start=(woPage-1)*pageSize; const shown=rows.slice(start,start+pageSize);
    $("wo-body").innerHTML=shown.length?shown.map(r=>`<tr class="${r.is_on_hold?"row-hold":""}"><td>${dateOnly(r.work_order_date)}</td><td><strong>${esc(r.document_number||"")}</strong></td><td>${esc(r.work_order_type||"")}</td><td>${esc(r.work_order_job_type||"")}</td><td><strong>${esc(r.item_name||"")}</strong></td><td>${num(r.quantity,2)}</td><td>${esc(r.operation_in_progress||"")}</td><td>${esc(r.operation_completion_value||"")}</td><td>${num(r.target_demand,2)}</td><td>${r.demand_status?`<span class="status ${r.demand_status==="Demand"?"demand":"good"}">${esc(r.demand_status)}</span>`:"—"}</td><td>${r.max_build_quantity===null||r.max_build_quantity===undefined?"N/A":num(r.max_build_quantity,2)}</td><td>${esc(r.usage_classification||"")}</td><td>${esc(r.build_type||"")}</td><td>${esc(r.work_order_department||"")}</td><td>${r.is_on_hold?`<span class="status hold" title="${esc(r.hold_reason||"")}">ON HOLD</span>`:""}</td><td>${esc(r.build_employee||"")}</td><td>${esc(r.qc_employee||"")}</td><td>${r.stalled_work_order?"Yes":"No"}</td><td style="white-space:normal;max-width:320px">${esc(r.stalled_work_order_comments||"")}</td></tr>`).join(""):`<tr><td colspan="19" class="muted">No work orders match the current filters.</td></tr>`;
    $("wo-summary").textContent=rows.length?`Showing ${num(start+1)}-${num(Math.min(start+pageSize,rows.length))} of ${num(rows.length)} work orders · Page ${woPage} of ${pages}`:"0 matching work orders";
    $("wo-prev").disabled=woPage<=1; $("wo-next").disabled=woPage>=pages;
  }

  function renderHistory() {
    const calc=bootstrap?.calculation_history||[];
    $("calc-history").innerHTML=`<table><thead><tr><th>Status</th><th>Started</th><th>Completed</th><th>Result Rows</th><th>Error</th></tr></thead><tbody>${calc.length?calc.map(r=>`<tr><td>${statusPill(r.status)}</td><td>${esc(dt(r.started_at))}</td><td>${esc(dt(r.completed_at))}</td><td>${num(r.result_row_count||0)}</td><td>${esc(r.error_message||"")}</td></tr>`).join(""):'<tr><td colspan="5" class="muted">No calculation history yet.</td></tr>'}</tbody></table>`;
    const imports=bootstrap?.input_history||[];
    $("input-history").innerHTML=`<table><thead><tr><th>Source</th><th>Status</th><th>File</th><th>Applied Rows</th><th>Warnings</th><th>Started</th><th>Completed</th><th>Error</th></tr></thead><tbody>${imports.length?imports.map(r=>`<tr><td>${esc(r.source_code)}</td><td>${statusPill(r.status)}</td><td>${esc(r.source_file_name||"")}</td><td>${num(r.applied_row_count||0)}</td><td>${num(r.warning_count||0)}</td><td>${esc(dt(r.started_at))}</td><td>${esc(dt(r.completed_at))}</td><td>${esc(r.error_message||"")}</td></tr>`).join(""):'<tr><td colspan="8" class="muted">No planning input history yet.</td></tr>'}</tbody></table>`;
  }

  async function refreshAll(showMessage=true) {
    const [b,d,w]=await Promise.all([
      rpc("get_demand_planning_bootstrap",{p_session_token:token}),
      rpc("get_demand_planning_results",{p_session_token:token}),
      rpc("get_demand_work_order_prioritization",{p_session_token:token})
    ]);
    bootstrap=b; demandRows=Array.isArray(d)?d:[]; woRows=Array.isArray(w)?w:[];
    renderFoundation(); populateFilters(); demandPage=1; woPage=1; renderDemand(); renderWo(); updateImportButtons();
    if (showMessage) setMessage("Demand Planning data refreshed.","success");
  }

  function showTab(name) {
    ["demand","wo","history"].forEach(key=>{$(`tab-${key}`).hidden=key!==name;});
    document.querySelectorAll(".tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===name));
  }

  function bind() {
    $("input-source").addEventListener("change",()=>{ resetInput(); sourceHelp(); });
    $("input-file").addEventListener("change",handleInputFile);
    $("stage-input").addEventListener("click",()=>stageInput().catch(showError));
    $("commit-input").addEventListener("click",()=>commitInput().catch(showError));
    $("abort-input").addEventListener("click",()=>abortInput().catch(showError));
    $("reset-input").addEventListener("click",resetInput);
    $("run-review").addEventListener("click",()=>runReview().catch(showError));
    $("refresh-all").addEventListener("click",()=>refreshAll(true).catch(showError));
    document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>showTab(btn.dataset.tab)));

    ["demand-search","filter-status","filter-dept","filter-usage","filter-sku","filter-max-build","demand-sort","hide-holds","show-combined"].forEach(id=>$(id).addEventListener("input",()=>{demandPage=1;renderDemand();}));
    $("demand-prev").addEventListener("click",()=>{demandPage=Math.max(1,demandPage-1);renderDemand();});
    $("demand-next").addEventListener("click",()=>{demandPage+=1;renderDemand();});
    ["wo-search","wo-operation","wo-demand","wo-stalled","wo-hide-holds"].forEach(id=>$(id).addEventListener("input",()=>{woPage=1;renderWo();}));
    $("wo-prev").addEventListener("click",()=>{woPage=Math.max(1,woPage-1);renderWo();});
    $("wo-next").addEventListener("click",()=>{woPage+=1;renderWo();});
  }

  async function init() {
    bind(); sourceHelp();
    if (!token) { $("access-denied").hidden=false; setMessage("Sign in through Task Tracker before opening Demand Planning.","error"); return; }
    try {
      bootstrap=await rpc("get_demand_planning_bootstrap",{p_session_token:token});
      $("app").hidden=false;
      await refreshAll(false);
    } catch(error) {
      $("access-denied").hidden=false;
      showError(error);
    }
  }

  init();
})();
