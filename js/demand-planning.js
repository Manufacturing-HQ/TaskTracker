"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  const csv = window.TaskTrackerCsv;
  if (!config || !supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $ = (id) => document.getElementById(id);
  const token = sessionStorage.getItem(config.sessionStorageKey);

  let bootstrap = null;
  let demandRows = [];
  let queueRows = [];
  let currentDetail = null;
  let currentItemId = null;
  let stageRows = [];
  let demandPage = 1;
  const pageSize = 100;
  let sortKey = "target_demand";
  let sortDir = "desc";
  const optionalColumns = new Set();

  const columns = [
    {key:"copy",label:"Copy",sort:false},
    {key:"item_name",label:"Item"},
    {key:"sku_group",label:"SKU Group"},
    {key:"usage_classification",label:"Usage"},
    {key:"work_order_department",label:"WO Department"},
    {key:"target_demand",label:"Target Demand",numeric:true},
    {key:"max_build_quantity",label:"Max Build",numeric:true},
    {key:"pending_staged_quantity",label:"Pending Staged",numeric:true},
    {key:"available_to_stage",label:"Available to Stage",numeric:true},
    {key:"weeks_supply",label:"Weeks Supply",numeric:true},
    {key:"constraint_text",label:"Constraint"},
    {key:"demand_status",label:"Status"},
    {key:"preferred_stock_level",label:"Preferred Stock",numeric:true,optional:"preferred"},
    {key:"fleet_need",label:"Fleet Need",numeric:true,optional:"fleet"},
    {key:"total_demand",label:"Total Demand",numeric:true,optional:"total-demand"},
    {key:"production_available",label:"On Hand",numeric:true,optional:"on-hand"},
    {key:"wip_quantity",label:"WIP",numeric:true,optional:"wip"},
    {key:"total_in_house",label:"Total In House",numeric:true,optional:"in-house"},
    {key:"priority_backorder_total",label:"Priority Backorder",numeric:true,optional:"priority"}
  ];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error(error.message || (name + " failed."));
    return data;
  }

  function setMessage(text,type="info") {
    const el=$("message");
    el.textContent=text||"";
    el.dataset.type=type;
    el.hidden=!text;
  }

  function showError(error) {
    setMessage(error?.message || String(error),"error");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function num(value,decimals=0) {
    if (value===null || value===undefined || value==="") return "—";
    const n=Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:decimals});
  }

  function dateText(value) {
    if (!value) return "—";
    const d=new Date(String(value).length===10 ? (value+"T12:00:00") : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  function dateTime(value) {
    if (!value) return "—";
    const d=new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function unique(rows,key) {
    return [...new Set(rows.map((r)=>String(r?.[key]??"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  }

  function fillSelect(id,values,label) {
    const el=$(id);
    const selected=el.value;
    el.innerHTML='<option value="">'+esc(label)+'</option>'+values.map((v)=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if ([...el.options].some((o)=>o.value===selected)) el.value=selected;
  }

  async function copyText(text) {
    const value=String(text||"").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(value+" copied.","success");
    } catch {
      const ta=document.createElement("textarea");
      ta.value=value; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
      setMessage(value+" copied.","success");
    }
  }

  function latestRefreshText() {
    const sources=Object.values(bootstrap?.latest_sources||{}).filter((x)=>x?.completed_at);
    if (!sources.length) return "No snapshots";
    const newest=sources.map((x)=>new Date(x.completed_at)).filter((d)=>!Number.isNaN(d.getTime())).sort((a,b)=>b-a)[0];
    return newest ? newest.toLocaleString() : "—";
  }

  function renderFoundation() {
    $("viewer-name").textContent=bootstrap?.viewer?.employee_name || "Administrator";
    $("metric-items").textContent=num(bootstrap?.eligible_item_count);
    $("metric-fleet").textContent=num(bootstrap?.fleet_par_row_count);
    $("metric-staged").textContent=num(bootstrap?.pending_staged_count);
    $("metric-staged-meta").textContent=num(bootstrap?.pending_staged_quantity)+" total units pending";
    $("metric-refresh").textContent=latestRefreshText();

    const fleet=Number(bootstrap?.fleet_par_row_count||0);
    const note=$("foundation-note");
    if (!fleet) {
      note.textContent="Fleet Wide Par has not been imported into NetSuite Data yet. Fleet Need is currently treated as 0. Import Fleet Wide Par there when ready.";
      note.style.background="#fef3c7";
      note.style.color="#92400e";
    } else {
      note.textContent="Demand values are calculated from the current Item Master and the latest NetSuite snapshots whenever this page refreshes. No separate Planning Review is required.";
      note.style.background="#f8fafc";
      note.style.color="#475569";
    }
  }

  function renderFilterOptions() {
    fillSelect("filter-status",unique(demandRows,"demand_status"),"All");
    fillSelect("filter-dept",unique(demandRows,"work_order_department"),"All");
    fillSelect("filter-usage",unique(demandRows,"usage_classification"),"All");
    fillSelect("filter-sku",unique(demandRows,"sku_group"),"All");
  }

  function visibleColumns() {
    return columns.filter((c)=>!c.optional || optionalColumns.has(c.optional));
  }

  function filteredRows() {
    const search=$("demand-search").value.trim().toLowerCase();
    const status=$("filter-status").value;
    const dept=$("filter-dept").value;
    const usage=$("filter-usage").value;
    const sku=$("filter-sku").value;
    const minBuild=$("filter-max-build").value==="" ? null : Number($("filter-max-build").value);
    const hideHolds=$("hide-holds").checked;

    const rows=demandRows.filter((r)=>{
      if (status && String(r.demand_status||"")!==status) return false;
      if (dept && String(r.work_order_department||"")!==dept) return false;
      if (usage && String(r.usage_classification||"")!==usage) return false;
      if (sku && String(r.sku_group||"")!==sku) return false;
      if (hideHolds && r.is_on_hold) return false;
      if (minBuild!==null && (r.max_build_quantity===null || Number(r.max_build_quantity)<minBuild)) return false;
      if (search) {
        const hay=[
          r.item_name,r.internal_id,r.sku_group,r.usage_classification,r.work_order_department,
          r.build_type,r.constraint_text,r.demand_status,r.hold_reason
        ].map((x)=>String(x??"").toLowerCase()).join(" ");
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    rows.sort((a,b)=>{
      let av=a?.[sortKey], bv=b?.[sortKey];
      if (columns.find((c)=>c.key===sortKey)?.numeric) {
        av=av===null||av===undefined ? null : Number(av);
        bv=bv===null||bv===undefined ? null : Number(bv);
        if (av===null && bv===null) return String(a.item_name).localeCompare(String(b.item_name));
        if (av===null) return 1;
        if (bv===null) return -1;
        const diff=av-bv;
        if (diff!==0) return sortDir==="asc" ? diff : -diff;
      } else {
        const cmp=String(av??"").localeCompare(String(bv??""),undefined,{numeric:true,sensitivity:"base"});
        if (cmp!==0) return sortDir==="asc" ? cmp : -cmp;
      }
      return String(a.item_name).localeCompare(String(b.item_name));
    });
    return rows;
  }

  function cellHtml(row,col) {
    if (col.key==="copy") return '<button class="copy-btn" type="button" data-copy="'+esc(row.item_name)+'">Copy</button>';
    if (col.key==="item_name") return '<button class="item-button" type="button" data-open-item="'+esc(row.item_id)+'">'+esc(row.item_name)+'</button><div class="click-hint">Click for detail</div>';
    if (col.key==="demand_status") {
      const cls=row.is_on_hold ? "hold" : (row.demand_status==="Demand" ? "demand" : "good");
      const text=row.is_on_hold ? "On Hold" : (row.demand_status||"—");
      return '<span class="status '+cls+'">'+esc(text)+'</span>';
    }
    if (col.key==="constraint_text") {
      const value=String(row.constraint_text||"").trim();
      if (!value) return "—";
      const preview=value.replaceAll("\n"," · ");
      const short=preview.length>95 ? preview.slice(0,95)+"…" : preview;
      return '<div style="white-space:normal;max-width:280px" title="'+esc(preview)+'">'+esc(short)+'</div>';
    }
    if (col.key==="weeks_supply") return num(row.weeks_supply,2);
    if (col.numeric) return num(row[col.key],2);
    return esc(row[col.key]||"—");
  }

  function renderDemand() {
    const cols=visibleColumns();
    $("demand-head").innerHTML='<tr>'+cols.map((c)=>{
      if (c.sort===false) return '<th>'+esc(c.label)+'</th>';
      const arrow=sortKey===c.key ? (sortDir==="asc" ? " ▲" : " ▼") : "";
      return '<th class="sort" data-sort="'+esc(c.key)+'">'+esc(c.label)+arrow+'</th>';
    }).join("")+'</tr>';

    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if (demandPage>pages) demandPage=pages;
    const start=(demandPage-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);

    $("demand-body").innerHTML=pageRows.map((row)=>{
      return '<tr class="demand-row '+(row.is_on_hold?"row-hold":"")+'" data-row-item="'+esc(row.item_id)+'">'+
        cols.map((c)=>'<td>'+cellHtml(row,c)+'</td>').join("")+
      '</tr>';
    }).join("") || '<tr><td colspan="'+cols.length+'" class="muted">No Items match the selected filters.</td></tr>';

    $("demand-summary").textContent=(filtered.length ? ("Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length) : "0 Items")+" · Page "+demandPage+" of "+pages;
    $("demand-prev").disabled=demandPage<=1;
    $("demand-next").disabled=demandPage>=pages;

    $("demand-head").querySelectorAll("[data-sort]").forEach((th)=>{
      th.addEventListener("click",()=>{
        const key=th.dataset.sort;
        if (sortKey===key) sortDir=sortDir==="asc"?"desc":"asc";
        else { sortKey=key; sortDir=columns.find((c)=>c.key===key)?.numeric ? "desc" : "asc"; }
        demandPage=1; renderDemand();
      });
    });

    $("demand-body").querySelectorAll("[data-copy]").forEach((button)=>{
      button.addEventListener("click",(event)=>{event.stopPropagation();copyText(button.dataset.copy);});
    });
    $("demand-body").querySelectorAll("[data-open-item]").forEach((button)=>{
      button.addEventListener("click",(event)=>{event.stopPropagation();openItemModal(button.dataset.openItem);});
    });
    $("demand-body").querySelectorAll("[data-row-item]").forEach((row)=>{
      row.addEventListener("click",()=>openItemModal(row.dataset.rowItem));
    });
  }

  function tableOrEmpty(headers,rows,emptyText) {
    if (!rows.length) return '<div class="note">'+esc(emptyText)+'</div>';
    return '<table><thead><tr>'+headers.map((h)=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+
      rows.join("")+'</tbody></table>';
  }

  function componentDetailHtml(component) {
    const inv=Array.isArray(component.inventory)?component.inventory:[];
    const reqs=Array.isArray(component.requisitions)?component.requisitions:[];
    const invHtml=inv.length ? '<div class="subtable"><strong>Inventory</strong><table><thead><tr><th>Location</th><th>Bin</th><th>On Hand</th><th>Available</th></tr></thead><tbody>'+
      inv.map((x)=>'<tr><td>'+esc(x.location||"—")+'</td><td>'+esc(x.bin_number||"—")+'</td><td>'+num(x.on_hand,2)+'</td><td>'+num(x.available,2)+'</td></tr>').join("")+
      '</tbody></table></div>' : '<div class="muted">No inventory rows.</div>';
    const reqHtml=reqs.length ? '<div class="subtable"><strong>Open Requisitions</strong><table><thead><tr><th>Document</th><th>Name</th><th>Open Qty</th><th>Days Open</th></tr></thead><tbody>'+
      reqs.map((x)=>'<tr><td>'+esc(x.document_number||"—")+'</td><td>'+esc(x.name||"—")+'</td><td>'+num(x.open_quantity,2)+'</td><td>'+num(x.days_open,0)+'</td></tr>').join("")+
      '</tbody></table></div>' : '<div class="muted">No open requisitions.</div>';
    return '<details class="component-details"><summary>Inventory / Requisition detail</summary>'+invHtml+reqHtml+'</details>';
  }

  function renderModalDetail() {
    const d=currentDetail||{};
    const s=d.summary||{};
    $("modal-item-name").textContent=s.item_name||"Item Detail";
    $("modal-item-meta").textContent=[s.internal_id,s.sku_group,s.usage_classification,s.work_order_department].filter(Boolean).join(" · ");

    const hold=$("modal-hold");
    if (s.is_on_hold) {
      hold.hidden=false;
      hold.textContent="CONFIRMED ITEM HOLD — Work Order staging is blocked. "+(d.hold?.hold_reason||s.hold_reason||"");
    } else hold.hidden=true;

    const metrics=[
      ["Preferred Stock",num(s.preferred_stock_level,2)],
      ["Fleet Need",num(s.fleet_need,2)],
      ["Target Demand",num(s.target_demand,2)],
      ["Max Build",s.max_build_quantity===null ? "N/A" : num(s.max_build_quantity,2)],
      ["Pending Staged",num(s.pending_staged_quantity,2)],
      ["Available to Stage",s.available_to_stage===null ? "N/A" : num(s.available_to_stage,2)],
      ["On Hand",num(s.production_available,2)],
      ["WIP",num(s.wip_quantity,2)],
      ["Total In House",num(s.total_in_house,2)],
      ["Priority Backorder",num(s.priority_backorder_total,2)],
      ["Weeks Supply",num(s.weeks_supply,2)],
      ["Status",s.demand_status||"—"]
    ];
    $("modal-metrics").innerHTML=metrics.map((m)=>'<div class="modal-metric"><div class="label">'+esc(m[0])+'</div><div class="value">'+esc(m[1])+'</div></div>').join("");

    const inventory=Array.isArray(d.inventory)?d.inventory:[];
    $("modal-inventory").innerHTML=tableOrEmpty(
      ["Location","Bin","On Hand","Available"],
      inventory.map((x)=>'<tr><td>'+esc(x.location||"—")+'</td><td>'+esc(x.bin_number||"—")+'</td><td>'+num(x.on_hand,2)+'</td><td>'+num(x.available,2)+'</td></tr>'),
      "No assembly inventory rows found."
    );

    const components=Array.isArray(d.components)?d.components:[];
    $("modal-components").innerHTML=tableOrEmpty(
      ["Component","Qty / BOM","Production Available","Can Build","Open PO","Open Requisition","Detail"],
      components.map((c)=>'<tr'+(c.is_limiting?' style="background:#fff7ed"':'')+'><td><strong>'+esc(c.component_name)+'</strong>'+(c.is_limiting?' <span class="pill warn">Limiting</span>':'')+'</td><td>'+num(c.component_quantity,4)+'</td><td>'+num(c.production_available,2)+'</td><td>'+num(c.can_build,0)+'</td><td>'+num(c.open_po_quantity,2)+'</td><td>'+num(c.open_requisition_quantity,2)+'</td><td>'+componentDetailHtml(c)+'</td></tr>'),
      "No BOM components are linked to this Item."
    );

    const workOrders=Array.isArray(d.work_orders)?d.work_orders:[];
    $("modal-work-orders").innerHTML=tableOrEmpty(
      ["WO #","Date","Qty","Built","Status","WO Type","Current Step","Build Employee","QC Employee","Stalled"],
      workOrders.map((w)=>'<tr><td><strong>'+esc(w.work_order_number)+'</strong></td><td>'+dateText(w.work_order_date)+'</td><td>'+num(w.quantity,2)+'</td><td>'+num(w.built,2)+'</td><td>'+esc(w.work_order_status||"—")+'</td><td>'+esc(w.work_order_type||"—")+'</td><td>'+esc(w.operation_in_progress||"—")+'</td><td>'+esc(w.build_employee||"—")+'</td><td>'+esc(w.qc_employee||"—")+'</td><td>'+(w.stalled_work_order?('<span class="pill warn">Yes</span> '+esc(w.stalled_work_order_comments||"")):"No")+'</td></tr>'),
      "No open Work Orders found for this Item."
    );

    renderModalStaged();
    resetStageRows();
    $("modal-loading").hidden=true;
    $("modal-content").hidden=false;
  }

  function renderModalStaged() {
    const rows=Array.isArray(currentDetail?.staged_rows)?currentDetail.staged_rows:[];
    $("modal-staged").innerHTML=tableOrEmpty(
      ["External ID","Date","Qty","WO Type","Job Type","Priority Dept.","Created By"],
      rows.map((r)=>'<tr><td>'+esc(r.external_id||"—")+'</td><td>'+dateText(r.date_created)+'</td><td>'+num(r.quantity,2)+'</td><td>'+esc(r.work_order_type||"—")+'</td><td>'+esc(r.work_order_job_type||"—")+'</td><td>'+esc(r.priority_department||"—")+'</td><td>'+esc(r.created_by||"—")+'</td></tr>'),
      "No pending staged Work Orders for this Item."
    );
  }

  async function openItemModal(itemId) {
    currentItemId=itemId;
    currentDetail=null;
    $("item-modal").hidden=false;
    $("modal-loading").hidden=false;
    $("modal-content").hidden=true;
    const row=demandRows.find((x)=>String(x.item_id)===String(itemId));
    $("modal-item-name").textContent=row?.item_name||"Item Detail";
    $("modal-item-meta").textContent="Loading...";
    try {
      currentDetail=await rpc("get_demand_item_detail",{p_session_token:token,p_item_id:itemId});
      renderModalDetail();
    } catch (error) {
      $("modal-loading").textContent=error.message;
      $("modal-loading").style.background="#fee2e2";
      $("modal-loading").style.color="#991b1b";
    }
  }

  function closeModal() {
    $("item-modal").hidden=true;
    currentDetail=null;
    currentItemId=null;
    stageRows=[];
  }

  function defaultStageRow() {
    const dept=String(currentDetail?.summary?.work_order_department||"").trim();
    return {
      quantity:"",
      work_order_type:"Production",
      work_order_job_type:dept,
      priority_department:"",
      work_order_memo:dept ? ("Work Order Job Type = "+dept) : ""
    };
  }

  function resetStageRows() {
    stageRows=[defaultStageRow()];
    const dept=String(currentDetail?.summary?.work_order_department||"");
    $("stage-total-target").value="";
    $("stage-increment").value=/build line/i.test(dept) ? "50" : "";
    renderStageGrid();
  }

  function stageTotal() {
    return stageRows.reduce((sum,r)=>sum+(Number(r.quantity)||0),0);
  }

  function renderStageWarning() {
    const s=currentDetail?.summary||{};
    const total=stageTotal();
    const warning=$("stage-warning");
    const submit=$("stage-submit");
    if (s.is_on_hold) {
      warning.hidden=false;
      warning.textContent="This Item is on a confirmed hold. Work Orders cannot be staged.";
      submit.disabled=true;
      return;
    }
    submit.disabled=!stageRows.length || total<=0;
    if (s.available_to_stage!==null && s.available_to_stage!==undefined && total>Number(s.available_to_stage)) {
      warning.hidden=false;
      warning.textContent="Warning: these rows total "+num(total,2)+" units, but only "+num(s.available_to_stage,2)+" remain within the current Max Build after pending staged Work Orders. You can still proceed after confirmation.";
    } else {
      warning.hidden=true;
      warning.textContent="";
    }
  }

  function renderStageGrid() {
    if (!stageRows.length) {
      $("stage-grid").innerHTML='<div class="note">No Work Order rows. Use Generate Work Orders or Add Row.</div>';
      $("stage-total").textContent="Total staged in this batch: 0";
      renderStageWarning();
      return;
    }

    $("stage-grid").innerHTML='<table><thead><tr><th>#</th><th>Quantity</th><th>WO Type</th><th>Work Order Job Type</th><th>Priority Department</th><th>Memo</th><th>Actions</th></tr></thead><tbody>'+
      stageRows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td><input class="stage-input" data-stage-index="'+i+'" data-stage-field="quantity" type="number" min="1" step="1" value="'+esc(r.quantity)+'"></td><td><input class="stage-input" data-stage-index="'+i+'" data-stage-field="work_order_type" value="'+esc(r.work_order_type)+'"></td><td><input class="stage-input" data-stage-index="'+i+'" data-stage-field="work_order_job_type" value="'+esc(r.work_order_job_type)+'"></td><td><input class="stage-input" data-stage-index="'+i+'" data-stage-field="priority_department" value="'+esc(r.priority_department)+'"></td><td><input class="stage-input" data-stage-index="'+i+'" data-stage-field="work_order_memo" value="'+esc(r.work_order_memo)+'"></td><td><button class="secondary" type="button" data-duplicate-stage="'+i+'">Duplicate</button> <button class="danger" type="button" data-remove-stage="'+i+'">Remove</button></td></tr>').join("")+
      '</tbody></table>';

    $("stage-grid").querySelectorAll("[data-stage-index]").forEach((input)=>{
      input.addEventListener("input",()=>{
        const idx=Number(input.dataset.stageIndex);
        const field=input.dataset.stageField;
        stageRows[idx][field]=input.value;
        $("stage-total").textContent="Total staged in this batch: "+num(stageTotal(),2);
        renderStageWarning();
      });
    });
    $("stage-grid").querySelectorAll("[data-duplicate-stage]").forEach((button)=>{
      button.addEventListener("click",()=>{
        const idx=Number(button.dataset.duplicateStage);
        stageRows.splice(idx+1,0,{...stageRows[idx]});
        renderStageGrid();
      });
    });
    $("stage-grid").querySelectorAll("[data-remove-stage]").forEach((button)=>{
      button.addEventListener("click",()=>{
        stageRows.splice(Number(button.dataset.removeStage),1);
        renderStageGrid();
      });
    });
    $("stage-total").textContent="Total staged in this batch: "+num(stageTotal(),2);
    renderStageWarning();
  }

  function generateStageRows() {
    const total=Number($("stage-total-target").value);
    const increment=Number($("stage-increment").value);
    if (!(total>0)) return showError(new Error("Enter a Total to Stage greater than zero."));
    if (!(increment>0)) return showError(new Error("Enter a Suggested Increment greater than zero."));
    const count=Math.ceil(total/increment);
    if (count>100) return showError(new Error("This would create more than 100 Work Order rows. Increase the increment or stage a smaller batch."));
    const base=defaultStageRow();
    stageRows=[];
    let remaining=total;
    while (remaining>0) {
      const qty=Math.min(increment,remaining);
      stageRows.push({...base,quantity:String(qty)});
      remaining-=qty;
    }
    renderStageGrid();
  }

  async function submitStageRows() {
    const rows=stageRows.map((r)=>({
      quantity:Number(r.quantity),
      work_order_type:String(r.work_order_type||"").trim(),
      work_order_job_type:String(r.work_order_job_type||"").trim(),
      priority_department:String(r.priority_department||"").trim(),
      work_order_memo:String(r.work_order_memo||"").trim()
    }));
    if (!rows.length || rows.some((r)=>!(r.quantity>0))) throw new Error("Every staged Work Order row needs a Quantity greater than zero.");

    $("stage-submit").disabled=true;
    try {
      let result=await rpc("stage_demand_work_orders",{
        p_session_token:token,p_item_id:currentItemId,p_rows:rows,p_confirm_over_max:false
      });
      if (result?.requires_over_max_confirmation) {
        const ok=window.confirm(
          "These Work Orders would bring pending staged quantity to "+num(result.total_pending_after_stage,2)+
          ", above the current Max Build of "+num(result.max_build_quantity,2)+".\n\nStage them anyway?"
        );
        if (!ok) return;
        result=await rpc("stage_demand_work_orders",{
          p_session_token:token,p_item_id:currentItemId,p_rows:rows,p_confirm_over_max:true
        });
      }
      if (!result?.success) throw new Error(result?.error||"Unable to stage Work Orders.");
      setMessage(result.inserted_count+" Work Order row(s) staged for "+result.item_name+".","success");
      await loadData();
      currentDetail=await rpc("get_demand_item_detail",{p_session_token:token,p_item_id:currentItemId});
      renderModalDetail();
    } finally {
      $("stage-submit").disabled=false;
    }
  }

  function renderQueue() {
    const host=$("queue-table");
    if (!queueRows.length) {
      host.innerHTML='<div class="note">No Work Orders are waiting for import.</div>';
      return;
    }
    host.innerHTML='<table><thead><tr><th>Select</th><th>External ID</th><th>Date</th><th>Item</th><th>Qty</th><th>WO Type</th><th>Job Type</th><th>Priority Dept.</th><th>Memo</th><th>Created By</th><th>Actions</th></tr></thead><tbody>'+
      queueRows.map((r)=>'<tr data-queue-row="'+esc(r.id)+'"><td><input type="checkbox" data-queue-select="'+esc(r.id)+'"></td><td>'+esc(r.external_id||"—")+'</td><td>'+dateText(r.date_created)+'</td><td><strong>'+esc(r.item_name)+'</strong></td><td><input type="number" min="1" step="1" data-q-field="quantity" value="'+esc(r.quantity)+'"></td><td><input type="text" data-q-field="work_order_type" value="'+esc(r.work_order_type||"")+'"></td><td><input type="text" data-q-field="work_order_job_type" value="'+esc(r.work_order_job_type||"")+'"></td><td><input type="text" data-q-field="priority_department" value="'+esc(r.priority_department||"")+'"></td><td><input class="memo-input" type="text" data-q-field="work_order_memo" value="'+esc(r.work_order_memo||"")+'"></td><td>'+esc(r.created_by||"—")+'</td><td><button class="secondary" type="button" data-q-save="'+esc(r.id)+'">Save</button> <button class="danger" type="button" data-q-delete="'+esc(r.id)+'">Delete</button></td></tr>').join("")+
      '</tbody></table>';

    host.querySelectorAll("[data-q-save]").forEach((button)=>button.addEventListener("click",()=>saveQueueRow(button.dataset.qSave).catch(showError)));
    host.querySelectorAll("[data-q-delete]").forEach((button)=>button.addEventListener("click",()=>deleteQueueRow(button.dataset.qDelete).catch(showError)));
  }

  function queueFormValues(id) {
    const tr=$("queue-table").querySelector('[data-queue-row="'+CSS.escape(id)+'"]');
    const get=(field)=>tr?.querySelector('[data-q-field="'+field+'"]')?.value??"";
    return {
      quantity:Number(get("quantity")),
      work_order_type:get("work_order_type"),
      work_order_job_type:get("work_order_job_type"),
      priority_department:get("priority_department"),
      work_order_memo:get("work_order_memo")
    };
  }

  async function saveQueueRow(id) {
    const values=queueFormValues(id);
    let result=await rpc("update_demand_staged_work_order",{
      p_session_token:token,p_staging_id:id,p_quantity:values.quantity,
      p_work_order_type:values.work_order_type,p_work_order_job_type:values.work_order_job_type,
      p_priority_department:values.priority_department,p_work_order_memo:values.work_order_memo,
      p_confirm_over_max:false
    });
    if (result?.requires_over_max_confirmation) {
      const ok=window.confirm("This edit would put pending quantity above the current Max Build of "+num(result.max_build_quantity,2)+". Save it anyway?");
      if (!ok) return;
      result=await rpc("update_demand_staged_work_order",{
        p_session_token:token,p_staging_id:id,p_quantity:values.quantity,
        p_work_order_type:values.work_order_type,p_work_order_job_type:values.work_order_job_type,
        p_priority_department:values.priority_department,p_work_order_memo:values.work_order_memo,
        p_confirm_over_max:true
      });
    }
    if (!result?.success) throw new Error("Unable to update staged Work Order.");
    setMessage("Staged Work Order updated.","success");
    await loadData();
  }

  async function deleteQueueRow(id) {
    if (!window.confirm("Delete this pending staged Work Order?")) return;
    await rpc("delete_demand_staged_work_order",{p_session_token:token,p_staging_id:id});
    setMessage("Pending staged Work Order deleted.","success");
    await loadData();
  }

  function selectedQueueIds() {
    return [...$("queue-table").querySelectorAll("[data-queue-select]:checked")].map((x)=>x.dataset.queueSelect);
  }

  async function markSelectedImported() {
    const ids=selectedQueueIds();
    if (!ids.length) throw new Error("Select at least one staged Work Order first.");
    if (!window.confirm("Mark "+ids.length+" selected Work Order row(s) as Imported? Imported rows become read-only and stop counting as Pending Staged.")) return;
    const result=await rpc("mark_demand_work_orders_imported",{p_session_token:token,p_staging_ids:ids,p_import_date:null});
    setMessage(result.updated_count+" Work Order row(s) marked Imported.","success");
    await loadData();
  }

  function exportQueue() {
    if (!queueRows.length) throw new Error("There are no pending Work Orders to export.");
    if (!csv) throw new Error("CSV export is unavailable.");
    const headers=["External ID","Date Created","Work Order Type","Item","Quantity","Work Order Job Type","Priority Department","Work Order Memo","Created By","Status","Import Date","Usage Classification"];
    const rows=queueRows.map((r)=>[
      r.external_id,r.date_created,r.work_order_type,r.item_name,r.quantity,r.work_order_job_type,
      r.priority_department,r.work_order_memo,r.created_by,"Pending Import","",r.usage_classification
    ]);
    csv.download("work-order-staging-pending.csv",headers,rows);
  }

  async function loadData() {
    const [b,rows,queue]=await Promise.all([
      rpc("get_demand_planning_bootstrap",{p_session_token:token}),
      rpc("get_demand_planning_results",{p_session_token:token}),
      rpc("get_demand_work_order_staging_queue",{p_session_token:token,p_include_imported:false})
    ]);
    bootstrap=b||{};
    demandRows=Array.isArray(rows)?rows:[];
    queueRows=Array.isArray(queue)?queue:[];
    renderFoundation();
    renderFilterOptions();
    renderDemand();
    renderQueue();
  }

  async function init() {
    if (!token) {
      window.location.replace("index.html");
      return;
    }
    try {
      $("app").hidden=false;
      await loadData();
    } catch (error) {
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  ["demand-search","filter-status","filter-dept","filter-usage","filter-sku","filter-max-build","hide-holds"].forEach((id)=>{
    $(id)?.addEventListener(id==="demand-search"?"input":"change",()=>{demandPage=1;renderDemand();});
  });

  document.querySelectorAll("[data-col-toggle]").forEach((box)=>{
    box.addEventListener("change",()=>{
      if (box.checked) optionalColumns.add(box.dataset.colToggle);
      else optionalColumns.delete(box.dataset.colToggle);
      renderDemand();
    });
  });

  $("demand-prev").addEventListener("click",()=>{if(demandPage>1){demandPage--;renderDemand();}});
  $("demand-next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(demandPage<pages){demandPage++;renderDemand();}});
  $("refresh-all").addEventListener("click",()=>loadData().then(()=>setMessage("Demand Planning refreshed.","success")).catch(showError));
  $("queue-refresh").addEventListener("click",()=>loadData().catch(showError));
  $("queue-export").addEventListener("click",()=>{try{exportQueue();}catch(error){showError(error);}});
  $("queue-mark-imported").addEventListener("click",()=>markSelectedImported().catch(showError));

  $("modal-close").addEventListener("click",closeModal);
  $("item-modal").addEventListener("click",(event)=>{if(event.target===$("item-modal"))closeModal();});
  $("modal-copy").addEventListener("click",()=>copyText(currentDetail?.summary?.item_name||""));
  $("stage-generate").addEventListener("click",generateStageRows);
  $("stage-add-row").addEventListener("click",()=>{stageRows.push(defaultStageRow());renderStageGrid();});
  $("stage-submit").addEventListener("click",()=>submitStageRows().catch(showError));

  init();
})();
