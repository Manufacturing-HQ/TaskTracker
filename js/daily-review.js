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

  const statuses = [
    "Generate Work Order",
    "Generate Partial Work Order",
    "On Hold",
    "Out of Stock",
    "Resolved",
    "Work Order In Progress"
  ];

  const selectedStatuses = new Set(statuses.filter((s)=>s!=="Resolved"));
  let reviewDate = null;
  let rows = [];
  let page = 1;
  const pageSize = 100;
  let sortKey = "item_name";
  let sortDir = "asc";

  const columns = [
    {key:"review_date",label:"Date",date:true},
    {key:"item_name",label:"Item"},
    {key:"cke_bulk_key",label:"CKE Bulk Key",numeric:true},
    {key:"hertz_special_request",label:"Hertz Special Request",numeric:true},
    {key:"retail",label:"Retail",numeric:true},
    {key:"sales_order",label:"Sales Order",numeric:true},
    {key:"van_exceptions",label:"Van Exceptions",numeric:true},
    {key:"van_requests",label:"Van Requests",numeric:true},
    {key:"grand_total",label:"Grand Total",numeric:true},
    {key:"item_available_new_wall",label:"Item Available New Wall",numeric:true},
    {key:"usku_available_production",label:"USKU Available Production",numeric:true},
    {key:"work_orders_in_progress",label:"Work Orders In Progress",numeric:true},
    {key:"review_status",label:"Status"}
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
    if (value===null || value===undefined || value==="") return "0";
    const n=Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:decimals});
  }

  function dateText(value) {
    if (!value) return "—";
    const d=new Date(String(value).length===10 ? value+"T12:00:00" : value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-US");
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

  function statusClass(status) {
    if (status==="Resolved") return "status-resolved";
    if (status==="Generate Work Order") return "status-gwo";
    if (status==="Generate Partial Work Order") return "status-pwo";
    if (status==="Work Order In Progress") return "status-wip";
    if (status==="On Hold") return "status-hold";
    return "status-oos";
  }

  function renderStatusFilter() {
    $("status-options").innerHTML=statuses.map((status)=>
      '<label><input type="checkbox" data-status-option="'+esc(status)+'" '+(selectedStatuses.has(status)?"checked":"")+'> '+esc(status)+'</label>'
    ).join("");

    $("status-options").querySelectorAll("[data-status-option]").forEach((box)=>{
      box.addEventListener("change",()=>{
        if (box.checked) selectedStatuses.add(box.dataset.statusOption);
        else selectedStatuses.delete(box.dataset.statusOption);
        page=1;
        updateStatusButton();
        renderTable();
      });
    });
    updateStatusButton();
  }

  function updateStatusButton() {
    let text;
    if (selectedStatuses.size===statuses.length) text="All Statuses";
    else if (selectedStatuses.size===statuses.length-1 && !selectedStatuses.has("Resolved")) text="Open Review";
    else if (selectedStatuses.size===0) text="No Statuses";
    else text=selectedStatuses.size+" Statuses";
    $("status-button-text").textContent=text;
  }

  function setStatusPreset(type) {
    selectedStatuses.clear();
    if (type==="open") statuses.filter((s)=>s!=="Resolved").forEach((s)=>selectedStatuses.add(s));
    if (type==="all") statuses.forEach((s)=>selectedStatuses.add(s));
    renderStatusFilter();
    page=1;
    renderTable();
  }

  function filteredRows() {
    const search=$("search").value.trim().toLowerCase();
    const result=rows.filter((row)=>{
      if (!selectedStatuses.has(row.review_status)) return false;
      if (search) {
        const hay=[
          row.item_name,row.review_status,row.work_order_job_type,row.priority_department
        ].map((x)=>String(x??"").toLowerCase()).join(" ");
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const col=columns.find((c)=>c.key===sortKey);
    result.sort((a,b)=>{
      let av=a?.[sortKey],bv=b?.[sortKey];

      if (col?.numeric) {
        av=av===null||av===undefined?null:Number(av);
        bv=bv===null||bv===undefined?null:Number(bv);
        if (av===null && bv===null) return String(a.item_name).localeCompare(String(b.item_name));
        if (av===null) return 1;
        if (bv===null) return -1;
        if (av!==bv) return sortDir==="asc"?av-bv:bv-av;
      } else if (col?.date) {
        const at=av?new Date(String(av)+"T12:00:00").getTime():NaN;
        const bt=bv?new Date(String(bv)+"T12:00:00").getTime():NaN;
        if (!Number.isNaN(at) && !Number.isNaN(bt) && at!==bt) return sortDir==="asc"?at-bt:bt-at;
      } else {
        const cmp=String(av??"").localeCompare(String(bv??""),undefined,{numeric:true,sensitivity:"base"});
        if (cmp!==0) return sortDir==="asc"?cmp:-cmp;
      }
      return String(a.item_name||"").localeCompare(String(b.item_name||""),undefined,{numeric:true,sensitivity:"base"});
    });

    return result;
  }

  function cellHtml(row,col) {
    if (col.key==="review_date") return dateText(row.review_date||reviewDate);
    if (col.key==="review_status") return '<span class="status '+statusClass(row.review_status)+'">'+esc(row.review_status)+'</span>';
    if (col.numeric) return num(row[col.key],2);
    return esc(row[col.key]||"—");
  }

  function renderTable() {
    $("review-head").innerHTML='<tr>'+columns.map((col)=>{
      const arrow=sortKey===col.key ? (sortDir==="asc"?"▲":"▼") : "";
      return '<th class="sort" data-sort="'+esc(col.key)+'">'+esc(col.label)+'<span class="sort-indicator">'+arrow+'</span></th>';
    }).join("")+'</tr>';

    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if (page>pages) page=pages;
    const start=(page-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);

    $("review-body").innerHTML=pageRows.map((row)=>
      '<tr>'+columns.map((col)=>'<td>'+cellHtml(row,col)+'</td>').join("")+'</tr>'
    ).join("") || '<tr><td colspan="'+columns.length+'" class="muted">No Daily Review rows match the current filters.</td></tr>';

    $("summary").textContent=(filtered.length
      ? "Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length
      : "0 rows")+" · Page "+page+" of "+pages;
    $("prev").disabled=page<=1;
    $("next").disabled=page>=pages;

    $("review-head").querySelectorAll("[data-sort]").forEach((th)=>{
      th.addEventListener("click",()=>{
        const key=th.dataset.sort;
        if (sortKey===key) sortDir=sortDir==="asc"?"desc":"asc";
        else {
          sortKey=key;
          sortDir=columns.find((c)=>c.key===key)?.numeric?"desc":"asc";
        }
        page=1;
        renderTable();
      });
    });
  }

  function standardExport() {
    const data=filteredRows();
    if (!data.length) throw new Error("There are no Daily Review rows to export.");
    if (!csv) throw new Error("CSV export is unavailable.");

    const headers=[
      "Date","Item","CKE Bulk Key","Hertz Special Request","Retail","Sales Order",
      "Van Exceptions","Van Requests","Grand Total","Item Available New Wall",
      "USKU Available Production","Work Orders In Progress","Status"
    ];
    const values=data.map((r)=>[
      dateText(r.review_date||reviewDate),
      r.item_name,
      r.cke_bulk_key,
      r.hertz_special_request,
      r.retail,
      r.sales_order,
      r.van_exceptions,
      r.van_requests,
      r.grand_total,
      r.item_available_new_wall,
      r.usku_available_production,
      r.work_orders_in_progress,
      r.review_status
    ]);

    const stamp=(reviewDate||new Date().toISOString().slice(0,10));
    csv.download("daily-review-"+stamp+".csv",headers,values);
  }

  function stageCandidates() {
    return filteredRows().filter((r)=>
      r.review_status==="Generate Work Order" ||
      r.review_status==="Generate Partial Work Order"
    );
  }

  function openStageModal() {
    const candidates=stageCandidates();
    $("stage-modal").hidden=false;
    $("stage-empty").hidden=candidates.length>0;
    $("stage-table-wrap").hidden=candidates.length===0;
    $("stage-submit").disabled=candidates.length===0;

    $("stage-body").innerHTML=candidates.map((r)=>{
      const eligible=Boolean(r.can_stage_priority);
      const qty=Number(r.recommended_priority_quantity||0);
      const availability=eligible
        ? '<span class="eligible">Ready to stage</span>'
        : '<span class="blocked">'+esc(r.stage_block_reason||"Not eligible")+'</span>';

      return '<tr data-stage-item="'+esc(r.item_id||"")+'">'+
        '<td><input type="checkbox" data-stage-select '+(eligible?"checked":"disabled")+'></td>'+
        '<td><strong>'+esc(r.item_name)+'</strong></td>'+
        '<td><span class="status '+statusClass(r.review_status)+'">'+esc(r.review_status)+'</span></td>'+
        '<td>'+num(r.grand_total,2)+'</td>'+
        '<td>'+num(r.max_build_quantity,2)+'</td>'+
        '<td><input type="number" min="1" step="1" data-stage-qty value="'+esc(qty)+'" '+(eligible?"":"disabled")+'></td>'+
        '<td>'+esc(r.work_order_job_type||"—")+'</td>'+
        '<td>'+esc(r.priority_department||"—")+'</td>'+
        '<td>'+availability+'</td>'+
      '</tr>';
    }).join("");

    updateStageSummary();
    $("stage-body").querySelectorAll("input").forEach((input)=>input.addEventListener("change",updateStageSummary));
  }

  function closeStageModal() {
    $("stage-modal").hidden=true;
  }

  function selectedStageRows() {
    const selected=[];
    $("stage-body").querySelectorAll("[data-stage-item]").forEach((tr)=>{
      const checked=tr.querySelector("[data-stage-select]");
      if (!checked || !checked.checked || checked.disabled) return;
      const itemId=tr.dataset.stageItem;
      const row=rows.find((r)=>String(r.item_id||"")===String(itemId));
      if (!row) return;
      const qty=Number(tr.querySelector("[data-stage-qty]")?.value);
      selected.push({
        item_id:itemId,
        item_name:row.item_name,
        quantity:qty,
        max_build:Number(row.max_build_quantity||0),
        recommended:Number(row.recommended_priority_quantity||0)
      });
    });
    return selected;
  }

  function updateStageSummary() {
    const selected=selectedStageRows();
    const total=selected.reduce((sum,r)=>sum+(Number(r.quantity)||0),0);
    $("stage-summary").textContent=selected.length+" Work Order(s) selected · "+num(total,2)+" total units";
    $("stage-submit").disabled=selected.length===0;
  }

  async function submitPriorityStage() {
    const selected=selectedStageRows();
    if (!selected.length) throw new Error("Select at least one Priority Work Order.");

    for (const row of selected) {
      if (!(row.quantity>0)) throw new Error(row.item_name+" needs a Quantity greater than zero.");
      if (row.quantity>row.max_build) throw new Error(row.item_name+" exceeds current Max Build of "+num(row.max_build,2)+".");
    }

    const changed=selected.filter((r)=>Number(r.quantity)!==Number(r.recommended));
    const message=changed.length
      ? "Stage "+selected.length+" Priority Work Order(s)? "+changed.length+" proposed quantity value(s) were edited from the recommended amount."
      : "Stage "+selected.length+" Priority Work Order(s) into the shared Pending Import queue?";
    if (!window.confirm(message)) return;

    $("stage-submit").disabled=true;
    try {
      const result=await rpc("stage_daily_review_priority_work_orders",{
        p_session_token:token,
        p_rows:selected.map((r)=>({item_id:r.item_id,item_name:r.item_name,quantity:r.quantity}))
      });

      if (!result?.success) {
        const errors=Array.isArray(result?.errors)?result.errors:[];
        throw new Error(errors.length
          ? errors.map((e)=>e.item_name+": "+e.error).join(" | ")
          : "Unable to stage Priority Work Orders.");
      }

      closeStageModal();
      setMessage(result.inserted_count+" Priority Work Order(s) staged as Pending Import.","success");
      await loadData();
    } finally {
      $("stage-submit").disabled=false;
    }
  }

  async function loadData() {
    const data=await rpc("get_daily_review",{p_session_token:token});
    reviewDate=data?.review_date||null;
    rows=Array.isArray(data?.rows)?data.rows:[];
    renderTable();
  }

  async function init() {
    if (!token) {
      window.location.replace("index.html");
      return;
    }

    try {
      $("app").hidden=false;
      renderStatusFilter();
      await loadData();
    } catch (error) {
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("status-button").addEventListener("click",()=>{$("status-panel").hidden=!$("status-panel").hidden;});
  document.addEventListener("click",(event)=>{
    if (!event.target.closest(".status-filter")) $("status-panel").hidden=true;
  });
  $("status-open-review").addEventListener("click",()=>setStatusPreset("open"));
  $("status-all").addEventListener("click",()=>setStatusPreset("all"));
  $("status-clear").addEventListener("click",()=>setStatusPreset("clear"));
  $("search").addEventListener("input",()=>{page=1;renderTable();});
  $("refresh").addEventListener("click",()=>loadData().then(()=>setMessage("Daily Review refreshed.","success")).catch(showError));
  $("standard-export").addEventListener("click",()=>{try{standardExport();}catch(error){showError(error);}});
  $("stage-priority").addEventListener("click",openStageModal);
  $("prev").addEventListener("click",()=>{if(page>1){page--;renderTable();}});
  $("next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(page<pages){page++;renderTable();}});

  $("stage-close").addEventListener("click",closeStageModal);
  $("stage-cancel").addEventListener("click",closeStageModal);
  $("stage-modal").addEventListener("click",(event)=>{if(event.target===$("stage-modal"))closeStageModal();});
  $("stage-submit").addEventListener("click",()=>submitPriorityStage().catch(showError));

  init();
})();
