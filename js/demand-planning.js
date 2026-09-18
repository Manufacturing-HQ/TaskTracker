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
  let woPriorityRows = [];
  let queueRows = [];
  let currentDetail = null;
  let currentItemId = null;
  let stageRows = [];
  let demandPage = 1;
  const pageSize = 100;
  let sortKey = "target_demand";
  let sortDir = "desc";
  let woPage = 1;
  const woPageSize = 100;
  let woSortKey = "priority_rank";
  let woSortDir = "asc";
  const optionalColumns = new Set();

  const columns = [
    {key:"copy",label:"Copy",sort:false,width:58},
    {key:"item_name",label:"Item",width:190},
    {key:"sku_group",label:"SKU Group",width:155},
    {key:"usage_classification",label:"Usage",width:72},
    {key:"work_order_department",label:"WO Department",width:155},
    {key:"target_demand",label:"Target Demand",numeric:true,width:110},
    {key:"max_build_quantity",label:"Max Build",numeric:true,width:92},
    {key:"pending_staged_quantity",label:"Pending Staged",numeric:true,width:108},
    {key:"weeks_supply",label:"Weeks Supply",numeric:true,width:95},
    {key:"constraint_text",label:"Constraint",width:250},
    {key:"demand_status",label:"Status",width:100},
    {key:"preferred_stock_level",label:"Preferred Stock",numeric:true,optional:"preferred",width:110},
    {key:"fleet_need",label:"Fleet Need",numeric:true,optional:"fleet",width:92},
    {key:"total_demand",label:"Total Demand",numeric:true,optional:"total-demand",width:105},
    {key:"production_available",label:"On Hand",numeric:true,optional:"on-hand",width:92},
    {key:"wip_quantity",label:"WIP",numeric:true,optional:"wip",width:82},
    {key:"total_in_house",label:"Total In House",numeric:true,optional:"in-house",width:105},
    {key:"priority_backorder_total",label:"Priority Backorder",numeric:true,optional:"priority",width:120}
  ];

  const woColumns = [
    {key:"priority_rank",label:"Priority #",numeric:true,width:76},
    {key:"demand_coverage_percent",label:"Demand Coverage",numeric:true,width:120},
    {key:"uncovered_demand",label:"Uncovered Demand",numeric:true,width:125},
    {key:"total_demand",label:"Total Demand",numeric:true,width:105},
    {key:"assembly_available",label:"Assembly Available",numeric:true,width:120},
    {key:"work_order_date",label:"Date Printed",date:true,width:100},
    {key:"document_number",label:"WO #",width:90},
    {key:"work_order_type",label:"WO Type",width:90},
    {key:"work_order_job_type",label:"Job Type",width:110},
    {key:"item_name",label:"Item",width:190},
    {key:"quantity",label:"Qty",numeric:true,width:72},
    {key:"operation_in_progress",label:"Operation",width:105},
    {key:"operation_started_date",label:"Operation Started",date:true,width:118},
    {key:"days_in_operation",label:"Days in Operation",numeric:true,width:115},
    {key:"build_employee",label:"Builder",width:145},
    {key:"qa_employee",label:"QA Employee",width:145},
    {key:"usage_classification",label:"Usage",width:75},
    {key:"is_on_hold",label:"Hold",width:80}
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
    const table=$("demand-table");
    const colgroup=$("demand-colgroup");
    const tableWidth=Math.max(1250,cols.reduce((sum,c)=>sum+(c.width||100),0));
    if (table) {
      table.style.width="100%";
      table.style.minWidth=tableWidth+"px";
    }
    if (colgroup) {
      colgroup.innerHTML=cols.map((c)=>'<col style="width:'+(c.width||100)+'px">').join("");
    }
    $("demand-head").innerHTML='<tr>'+cols.map((c)=>{
      if (c.sort===false) return '<th><span class="sort-label">'+esc(c.label)+'</span><span class="sort-indicator"></span></th>';
      const arrow=sortKey===c.key ? (sortDir==="asc" ? "▲" : "▼") : "";
      return '<th class="sort" data-sort="'+esc(c.key)+'"><span class="sort-label">'+esc(c.label)+'</span><span class="sort-indicator">'+arrow+'</span></th>';
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


  function renderWOFilterOptions() {
    fillSelect("wo-filter-operation",unique(woPriorityRows,"operation_in_progress"),"All");
    fillSelect("wo-filter-type",unique(woPriorityRows,"work_order_type"),"All");
    fillSelect("wo-filter-job-type",unique(woPriorityRows,"work_order_job_type"),"All");
    fillSelect("wo-filter-usage",unique(woPriorityRows,"usage_classification"),"All");
  }

  function filteredWORows() {
    const search=$("wo-search").value.trim().toLowerCase();
    const operation=$("wo-filter-operation").value;
    const type=$("wo-filter-type").value;
    const jobType=$("wo-filter-job-type").value;
    const usage=$("wo-filter-usage").value;
    const hideHolds=$("wo-hide-holds").checked;

    const rows=woPriorityRows.filter((r)=>{
      if (operation && String(r.operation_in_progress||"")!==operation) return false;
      if (type && String(r.work_order_type||"")!==type) return false;
      if (jobType && String(r.work_order_job_type||"")!==jobType) return false;
      if (usage && String(r.usage_classification||"")!==usage) return false;
      if (hideHolds && r.is_on_hold) return false;
      if (search) {
        const hay=[
          r.document_number,r.item_name,r.work_order_type,r.work_order_job_type,
          r.operation_in_progress,r.build_employee,r.qa_employee,r.usage_classification,
          r.hold_reason
        ].map((x)=>String(x??"").toLowerCase()).join(" ");
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const col=woColumns.find((x)=>x.key===woSortKey);
    rows.sort((a,b)=>{
      let av=a?.[woSortKey], bv=b?.[woSortKey];

      if (col?.numeric) {
        av=av===null||av===undefined||av==="" ? null : Number(av);
        bv=bv===null||bv===undefined||bv==="" ? null : Number(bv);
        if (av===null && bv===null) return Number(a.priority_rank||0)-Number(b.priority_rank||0);
        if (av===null) return 1;
        if (bv===null) return -1;
        const diff=av-bv;
        if (diff!==0) return woSortDir==="asc" ? diff : -diff;
      } else if (col?.date) {
        const at=av ? new Date(String(av)+"T12:00:00").getTime() : NaN;
        const bt=bv ? new Date(String(bv)+"T12:00:00").getTime() : NaN;
        if (Number.isNaN(at) && Number.isNaN(bt)) return Number(a.priority_rank||0)-Number(b.priority_rank||0);
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        if (at!==bt) return woSortDir==="asc" ? at-bt : bt-at;
      } else {
        const cmp=String(av??"").localeCompare(String(bv??""),undefined,{numeric:true,sensitivity:"base"});
        if (cmp!==0) return woSortDir==="asc" ? cmp : -cmp;
      }
      return Number(a.priority_rank||0)-Number(b.priority_rank||0);
    });
    return rows;
  }

  function woCellHtml(row,col) {
    if (col.key==="demand_coverage_percent") {
      return row.demand_coverage_percent===null || row.demand_coverage_percent===undefined
        ? '<span class="muted">No Demand</span>'
        : '<strong>'+num(row.demand_coverage_percent,1)+'%</strong>';
    }
    if (col.key==="item_name") {
      return row.item_id
        ? '<button class="item-button" type="button" data-wo-open-item="'+esc(row.item_id)+'">'+esc(row.item_name||"—")+'</button>'
        : esc(row.item_name||"—");
    }
    if (col.key==="operation_in_progress") {
      return '<span class="pill">'+esc(row.operation_in_progress||"—")+'</span>';
    }
    if (col.key==="is_on_hold") {
      return row.is_on_hold
        ? '<span class="status hold" title="'+esc(row.hold_reason||"")+'">On Hold</span>'
        : "—";
    }
    if (col.key==="work_order_date" || col.key==="operation_started_date") return dateText(row[col.key]);
    if (col.key==="days_in_operation") return row[col.key]===null || row[col.key]===undefined ? "—" : num(row[col.key],0);
    if (col.numeric) return num(row[col.key],2);
    return esc(row[col.key]||"—");
  }

  function renderWOPriority() {
    const table=$("wo-table");
    const colgroup=$("wo-colgroup");
    const tableWidth=Math.max(1500,woColumns.reduce((sum,col)=>sum+(col.width||100),0));
    if (table) {
      table.style.width="100%";
      table.style.minWidth=tableWidth+"px";
    }
    if (colgroup) {
      colgroup.innerHTML=woColumns.map((col)=>'<col style="width:'+(col.width||100)+'px">').join("");
    }

    $("wo-head").innerHTML='<tr>'+woColumns.map((col)=>{
      const arrow=woSortKey===col.key ? (woSortDir==="asc" ? "▲" : "▼") : "";
      return '<th class="sort" data-wo-sort="'+esc(col.key)+'"><span class="sort-label">'+esc(col.label)+'</span><span class="sort-indicator">'+arrow+'</span></th>';
    }).join("")+'</tr>';

    const filtered=filteredWORows();
    const pages=Math.max(1,Math.ceil(filtered.length/woPageSize));
    if (woPage>pages) woPage=pages;
    const start=(woPage-1)*woPageSize;
    const pageRows=filtered.slice(start,start+woPageSize);

    $("wo-body").innerHTML=pageRows.map((row)=>
      '<tr class="'+(row.is_on_hold?"row-hold":"")+'">'+
      woColumns.map((col)=>'<td>'+woCellHtml(row,col)+'</td>').join("")+
      '</tr>'
    ).join("") || '<tr><td colspan="'+woColumns.length+'" class="muted">No Work Orders match the selected filters.</td></tr>';

    $("wo-summary").textContent=(filtered.length
      ? ("Showing "+(start+1)+"–"+Math.min(start+woPageSize,filtered.length)+" of "+filtered.length)
      : "0 Work Orders")+" · Page "+woPage+" of "+pages;
    $("wo-prev").disabled=woPage<=1;
    $("wo-next").disabled=woPage>=pages;

    $("wo-head").querySelectorAll("[data-wo-sort]").forEach((th)=>{
      th.addEventListener("click",()=>{
        const key=th.dataset.woSort;
        if (woSortKey===key) woSortDir=woSortDir==="asc"?"desc":"asc";
        else {
          woSortKey=key;
          woSortDir=woColumns.find((col)=>col.key===key)?.numeric ? "desc" : "asc";
          if (key==="priority_rank" || key==="demand_coverage_percent") woSortDir="asc";
        }
        woPage=1;
        renderWOPriority();
      });
    });

    $("wo-body").querySelectorAll("[data-wo-open-item]").forEach((button)=>{
      button.addEventListener("click",()=>openItemModal(button.dataset.woOpenItem));
    });
  }

  function exportWOPriority() {
    const rows=filteredWORows();
    if (!rows.length) throw new Error("There are no prioritized Work Orders to export.");
    if (!csv) throw new Error("CSV export is unavailable.");
    const headers=[
      "Priority #","Demand Coverage %","Uncovered Demand","Total Demand","Assembly Available",
      "Date Printed","Work Order","Work Order Type","Work Order Job Type","Item","Quantity",
      "Operation In Progress","Operation Started","Days In Operation","Builder","QA Employee",
      "Usage Classification","On Hold"
    ];
    const values=rows.map((r)=>[
      r.priority_rank,r.demand_coverage_percent,r.uncovered_demand,r.total_demand,r.assembly_available,
      r.work_order_date,r.document_number,r.work_order_type,r.work_order_job_type,r.item_name,r.quantity,
      r.operation_in_progress,r.operation_started_date,r.days_in_operation,r.build_employee,r.qa_employee,
      r.usage_classification,r.is_on_hold?"Yes":"No"
    ]);
    csv.download("work-order-prioritization.csv",headers,values);
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
    if (s.max_build_quantity!==null && s.max_build_quantity!==undefined && total>Number(s.max_build_quantity)) {
      warning.hidden=false;
      warning.textContent="Warning: these rows total "+num(total,2)+" units, which is above the current Max Build of "+num(s.max_build_quantity,2)+". You can still proceed after confirmation.";
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
          "These Work Orders total "+num(result.new_staged_quantity,2)+
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
      const ok=window.confirm("This Work Order quantity is above the current Max Build of "+num(result.max_build_quantity,2)+". Save it anyway?");
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
    const [b,rows,woRows,queue]=await Promise.all([
      rpc("get_demand_planning_bootstrap",{p_session_token:token}),
      rpc("get_demand_planning_results",{p_session_token:token}),
      rpc("get_demand_work_order_prioritization",{p_session_token:token}),
      rpc("get_demand_work_order_staging_queue",{p_session_token:token,p_include_imported:false})
    ]);
    bootstrap=b||{};
    demandRows=Array.isArray(rows)?rows:[];
    woPriorityRows=(Array.isArray(woRows)?woRows:[]).map((row,index)=>({...row,priority_rank:index+1}));
    queueRows=Array.isArray(queue)?queue:[];
    renderFoundation();
    renderFilterOptions();
    renderDemand();
    renderWOFilterOptions();
    renderWOPriority();
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

  ["wo-search","wo-filter-operation","wo-filter-type","wo-filter-job-type","wo-filter-usage","wo-hide-holds"].forEach((id)=>{
    $(id)?.addEventListener(id==="wo-search"?"input":"change",()=>{woPage=1;renderWOPriority();});
  });
  $("wo-prev").addEventListener("click",()=>{if(woPage>1){woPage--;renderWOPriority();}});
  $("wo-next").addEventListener("click",()=>{const pages=Math.ceil(filteredWORows().length/woPageSize);if(woPage<pages){woPage++;renderWOPriority();}});
  $("wo-export").addEventListener("click",()=>{try{exportWOPriority();}catch(error){showError(error);}});

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
