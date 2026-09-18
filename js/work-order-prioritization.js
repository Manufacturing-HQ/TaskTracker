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

  let rows = [];
  let page = 1;
  const pageSize = 100;
  let sortKey = "priority_rank";
  let sortDir = "asc";

  const optionalVisibility = new Map([
    ["work_order_date",true],
    ["work_order_type",true],
    ["work_order_job_type",true],
    ["quantity",true],
    ["operation_started_date",true],
    ["usage_classification",true],
    ["build_type",true],
    ["is_on_hold",true]
  ]);

  const allColumns = [
    {key:"priority_rank",label:"Priority #",numeric:true,width:78,locked:true},
    {key:"demand_coverage_percent",label:"Demand Coverage %",numeric:true,width:118,locked:true},
    {key:"work_order_date",label:"Date",date:true,width:92},
    {key:"document_number",label:"Doc #",width:86,locked:true},
    {key:"work_order_type",label:"WO Type",width:92},
    {key:"work_order_job_type",label:"Job Type",width:110},
    {key:"item_name",label:"Item",width:190,locked:true},
    {key:"quantity",label:"Qty",numeric:true,width:68},
    {key:"operation_in_progress",label:"Operation",width:105,locked:true},
    {key:"operation_started_date",label:"Op Time",date:true,width:92},
    {key:"usage_classification",label:"Usage",width:72},
    {key:"build_type",label:"Build Type",width:220},
    {key:"build_employee",label:"Build Employee",width:145,conditional:true},
    {key:"is_on_hold",label:"Hold",width:75},
    {key:"priority_status",label:"Priority Status",width:165,locked:true,sort:false}
  ];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function num(value,decimals=0) {
    if (value===null || value===undefined || value==="") return "—";
    const n=Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:decimals});
  }

  function dateText(value) {
    if (!value) return "—";
    const d=new Date(String(value).length===10 ? value+"T12:00:00" : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if (error) throw new Error(error.message || (name+" failed."));
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

  function unique(key) {
    return [...new Set(rows.map((r)=>String(r?.[key]??"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  }

  function fillSelect(id,values) {
    const el=$(id);
    const current=el.value;
    const first=el.options[0]?.outerHTML || '<option value="">All</option>';
    el.innerHTML=first+values.map((v)=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if ([...el.options].some((o)=>o.value===current)) el.value=current;
  }

  function renderFilterOptions() {
    fillSelect("filter-wo-type",unique("work_order_type"));
    fillSelect("filter-job-type",unique("work_order_job_type"));
    fillSelect("filter-operation",unique("operation_in_progress"));
    fillSelect("filter-build-type",unique("build_type"));
  }

  function activeFilterCount() {
    const ids=["filter-doc","filter-wo-type","filter-job-type","filter-item","filter-operation","filter-build-type","filter-priority-status","quick-search"];
    return ids.reduce((count,id)=>count+($(id).value.trim()?1:0),0);
  }

  function renderFilterCount() {
    $("filters-active").textContent="Filters Active - "+activeFilterCount();
  }

  function visibleColumns() {
    const pendingQC=$("filter-operation").value==="Pending QC";
    return allColumns.filter((col)=>{
      if (col.conditional) return pendingQC;
      if (col.locked) return true;
      return optionalVisibility.get(col.key)!==false;
    });
  }

  function filteredRows() {
    const doc=$("filter-doc").value.trim().toLowerCase();
    const woType=$("filter-wo-type").value;
    const jobType=$("filter-job-type").value;
    const item=$("filter-item").value.trim().toLowerCase();
    const operation=$("filter-operation").value;
    const buildType=$("filter-build-type").value;
    const priorityStatus=$("filter-priority-status").value;
    const search=$("quick-search").value.trim().toLowerCase();

    const result=rows.filter((r)=>{
      if (doc && !String(r.document_number||"").toLowerCase().includes(doc)) return false;
      if (woType && String(r.work_order_type||"")!==woType) return false;
      if (jobType && String(r.work_order_job_type||"")!==jobType) return false;
      if (item && !String(r.item_name||"").toLowerCase().includes(item)) return false;
      if (operation && String(r.operation_in_progress||"")!==operation) return false;
      if (buildType && String(r.build_type||"")!==buildType) return false;
      if (priorityStatus==="UNMARKED" && r.priority_status) return false;
      if (priorityStatus && priorityStatus!=="UNMARKED" && String(r.priority_status||"")!==priorityStatus) return false;

      if (search) {
        const hay=[
          r.document_number,r.work_order_type,r.work_order_job_type,r.item_name,
          r.operation_in_progress,r.build_employee,r.usage_classification,r.build_type,
          r.priority_status,r.hold_reason
        ].map((x)=>String(x??"").toLowerCase()).join(" ");
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const col=allColumns.find((x)=>x.key===sortKey);
    result.sort((a,b)=>{
      let av=a?.[sortKey], bv=b?.[sortKey];

      if (col?.numeric) {
        av=av===null||av===undefined||av===""?null:Number(av);
        bv=bv===null||bv===undefined||bv===""?null:Number(bv);
        if (av===null && bv===null) return Number(a.priority_rank||0)-Number(b.priority_rank||0);
        if (av===null) return 1;
        if (bv===null) return -1;
        if (av!==bv) return sortDir==="asc"?av-bv:bv-av;
      } else if (col?.date) {
        const at=av ? new Date(String(av)+"T12:00:00").getTime() : NaN;
        const bt=bv ? new Date(String(bv)+"T12:00:00").getTime() : NaN;
        if (Number.isNaN(at) && Number.isNaN(bt)) return Number(a.priority_rank||0)-Number(b.priority_rank||0);
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        if (at!==bt) return sortDir==="asc"?at-bt:bt-at;
      } else {
        const cmp=String(av??"").localeCompare(String(bv??""),undefined,{numeric:true,sensitivity:"base"});
        if (cmp!==0) return sortDir==="asc"?cmp:-cmp;
      }
      return Number(a.priority_rank||0)-Number(b.priority_rank||0);
    });

    return result;
  }

  function rowClass(row) {
    const status=String(row.priority_status||"").toUpperCase();
    const classes=[];
    if (status==="STAGED") classes.push("row-staged");
    if (status==="TRAINING") classes.push("row-training");
    if (status==="MISSING") classes.push("row-missing");
    if (row.is_on_hold) classes.push("row-hold");
    return classes.join(" ");
  }

  function statusButtons(row) {
    const active=String(row.priority_status||"").toUpperCase();
    const meta=row.priority_status_updated_by
      ? "Last updated by "+row.priority_status_updated_by+(row.priority_status_updated_at ? " · "+new Date(row.priority_status_updated_at).toLocaleString() : "")
      : "";
    return '<div class="status-buttons" title="'+esc(meta)+'">'+
      ['STAGED','TRAINING','MISSING'].map((status)=>{
        const label=status.charAt(0)+status.slice(1).toLowerCase();
        const cls=status.toLowerCase();
        return '<button type="button" class="status-btn '+cls+(active===status?' selected':'')+'" data-status="'+status+'" data-doc="'+esc(row.document_number)+'">'+label+'</button>';
      }).join("")+
    '</div>';
  }

  function cellHtml(row,col) {
    if (col.key==="priority_rank") return '<strong>'+num(row.priority_rank,0)+'</strong>';
    if (col.key==="demand_coverage_percent") {
      return row.demand_coverage_percent===null || row.demand_coverage_percent===undefined
        ? '<span class="muted">No Demand</span>'
        : '<span class="coverage">'+num(row.demand_coverage_percent,1)+'%</span>';
    }
    if (col.key==="work_order_date" || col.key==="operation_started_date") return dateText(row[col.key]);
    if (col.key==="priority_status") return statusButtons(row);
    if (col.key==="is_on_hold") {
      return row.is_on_hold ? '<span class="hold-pill" title="'+esc(row.hold_reason||"")+'">On Hold</span>' : "—";
    }
    if (col.numeric) return num(row[col.key],2);
    return esc(row[col.key]||"—");
  }

  function renderTable() {
    renderFilterCount();

    const cols=visibleColumns();
    const table=$("priority-table");
    const colgroup=$("priority-colgroup");
    const tableWidth=Math.max(1280,cols.reduce((sum,c)=>sum+(c.width||100),0));

    table.style.width="100%";
    table.style.minWidth=tableWidth+"px";
    colgroup.innerHTML=cols.map((c)=>'<col style="width:'+(c.width||100)+'px">').join("");

    $("priority-head").innerHTML='<tr>'+cols.map((col)=>{
      const arrow=sortKey===col.key ? (sortDir==="asc"?"▲":"▼") : "";
      const sortable=col.sort!==false;
      return '<th '+(sortable?'class="sort" data-sort="'+esc(col.key)+'"':'')+'><span>'+esc(col.label)+'</span><span class="sort-indicator">'+arrow+'</span></th>';
    }).join("")+'</tr>';

    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if (page>pages) page=pages;
    const start=(page-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);

    $("priority-body").innerHTML=pageRows.map((row)=>
      '<tr class="'+rowClass(row)+'">'+cols.map((col)=>'<td>'+cellHtml(row,col)+'</td>').join("")+'</tr>'
    ).join("") || '<tr><td colspan="'+cols.length+'" class="muted">No Work Orders match the selected filters.</td></tr>';

    $("priority-summary").textContent=(filtered.length
      ? "Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length
      : "0 Work Orders")+" · Page "+page+" of "+pages;
    $("prev").disabled=page<=1;
    $("next").disabled=page>=pages;

    $("priority-head").querySelectorAll("[data-sort]").forEach((th)=>{
      th.addEventListener("click",()=>{
        const key=th.dataset.sort;
        if (sortKey===key) sortDir=sortDir==="asc"?"desc":"asc";
        else {
          sortKey=key;
          const col=allColumns.find((x)=>x.key===key);
          sortDir=(col?.numeric && key!=="priority_rank" && key!=="demand_coverage_percent")?"desc":"asc";
        }
        page=1;
        renderTable();
      });
    });

    $("priority-body").querySelectorAll("[data-status]").forEach((button)=>{
      button.addEventListener("click",()=>togglePriorityStatus(button.dataset.doc,button.dataset.status).catch(showError));
    });
  }

  function renderColumnsPanel() {
    const panel=$("columns-panel");
    const options=allColumns.filter((c)=>!c.locked && !c.conditional);
    panel.innerHTML=options.map((col)=>
      '<label><input type="checkbox" data-column="'+esc(col.key)+'" '+(optionalVisibility.get(col.key)!==false?'checked':'')+'> '+esc(col.label)+'</label>'
    ).join("");

    panel.querySelectorAll("[data-column]").forEach((box)=>{
      box.addEventListener("change",()=>{
        optionalVisibility.set(box.dataset.column,box.checked);
        renderTable();
      });
    });
  }

  async function togglePriorityStatus(documentNumber,status) {
    const row=rows.find((r)=>String(r.document_number)===String(documentNumber));
    if (!row) throw new Error("Work Order was not found.");

    const current=String(row.priority_status||"").toUpperCase();
    const next=current===status ? null : status;

    const result=await rpc("set_work_order_priority_status",{
      p_session_token:token,
      p_document_number:row.document_number,
      p_netsuite_internal_id:row.netsuite_internal_id||null,
      p_item_name:row.item_name||null,
      p_operation_in_progress:row.operation_in_progress,
      p_operation_started_value:row.operation_completion_value||"",
      p_priority_status:next
    });

    row.priority_status=result?.priority_status||null;
    row.priority_status_updated_by=result?.updated_by||null;
    row.priority_status_updated_at=result?.updated_at||null;
    renderTable();
  }

  function exportRows() {
    const data=filteredRows();
    if (!data.length) throw new Error("There are no Work Orders to export.");
    if (!csv) throw new Error("CSV export is unavailable.");

    const includeBuilder=$("filter-operation").value==="Pending QC";
    const headers=[
      "Priority #","Demand Coverage %","Date","Doc #","WO Type","Job Type","Item","Qty",
      "Operation","Op Time","Usage","Build Type"
    ];
    if (includeBuilder) headers.push("Build Employee");
    headers.push("Priority Status","On Hold");

    const values=data.map((r)=>{
      const row=[
        r.priority_rank,r.demand_coverage_percent,r.work_order_date,r.document_number,
        r.work_order_type,r.work_order_job_type,r.item_name,r.quantity,r.operation_in_progress,
        r.operation_started_date,r.usage_classification,r.build_type
      ];
      if (includeBuilder) row.push(r.build_employee);
      row.push(r.priority_status||"",r.is_on_hold?"Yes":"No");
      return row;
    });

    csv.download("work-order-prioritization.csv",headers,values);
  }

  function clearFilters() {
    ["filter-doc","filter-wo-type","filter-job-type","filter-item","filter-operation","filter-build-type","filter-priority-status","quick-search"]
      .forEach((id)=>{$(id).value="";});
    page=1;
    renderTable();
  }

  async function loadRows() {
    rows=await rpc("get_work_order_prioritization",{p_session_token:token}) || [];
    if (!Array.isArray(rows)) rows=[];
    renderFilterOptions();
    renderTable();
  }

  async function init() {
    if (!token) {
      window.location.replace("index.html");
      return;
    }

    try {
      $("app").hidden=false;
      renderColumnsPanel();
      await loadRows();
    } catch (error) {
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  ["filter-doc","filter-item","quick-search"].forEach((id)=>{
    $(id).addEventListener("input",()=>{page=1;renderTable();});
  });
  ["filter-wo-type","filter-job-type","filter-operation","filter-build-type","filter-priority-status"].forEach((id)=>{
    $(id).addEventListener("change",()=>{page=1;renderTable();});
  });

  $("clear-filters").addEventListener("click",clearFilters);
  $("refresh").addEventListener("click",()=>loadRows().then(()=>setMessage("Work Order Prioritization refreshed.","success")).catch(showError));
  $("columns-button").addEventListener("click",()=>{$("columns-panel").hidden=!$("columns-panel").hidden;});
  document.addEventListener("click",(event)=>{
    if (!event.target.closest(".columns-wrap")) $("columns-panel").hidden=true;
  });
  $("export").addEventListener("click",()=>{try{exportRows();}catch(error){showError(error);}});
  $("prev").addEventListener("click",()=>{if(page>1){page--;renderTable();}});
  $("next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(page<pages){page++;renderTable();}});

  init();
})();
