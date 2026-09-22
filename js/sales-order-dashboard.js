"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  const csv=window.TaskTrackerCsv;
  if(!config||!supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $=(id)=>document.getElementById(id);
  const token=sessionStorage.getItem(config.sessionStorageKey);

  let payload=null;
  let rows=[];
  let page=1;
  const pageSize=100;
  let sortKey="ship_date";
  let sortDir="asc";
  let quickFilter="";
  let focusMode=false;
  let detailKey=null;
  let detailData=null;
  const selected=new Set();

  const columns=[
    {key:"select",label:"Select",type:"select",sortable:false},
    {key:"order_date",label:"Date",type:"date"},
    {key:"ship_date",label:"Ship Date",type:"date"},
    {key:"document_number",label:"Document Number",type:"doc"},
    {key:"effective_sales_order_type",label:"Sales Order Type"},
    {key:"item_status_date",label:"Item Status Date",type:"date"},
    {key:"item_name",label:"Item",type:"item"},
    {key:"customer_name",label:"Customer",type:"customer"},
    {key:"quantity",label:"Quantity",type:"num"},
    {key:"amount",label:"Amount",type:"money"},
    {key:"quantity_committed",label:"Quantity Committed",type:"num"},
    {key:"quantity_picked",label:"Quantity Picked",type:"num"},
    {key:"quantity_packed",label:"Quantity Packed",type:"num"},
    {key:"item_status",label:"Item Status",type:"status"},
    {key:"item_available_new_wall",label:"Free Available New Wall",type:"available"},
    {key:"max_build_quantity",label:"Max Build",type:"maxbuild"},
    {key:"work_orders_in_progress",label:"Work Orders In Progress",type:"wip"},
    {key:"constraint_text",label:"Constraint",type:"constraint"},
    {key:"priority_requirement",label:"Priority Back Order",type:"num"},
    {key:"order_status",label:"Order Status"},
    {key:"fulfillment_status",label:"Fulfillment Status"},
    {key:"print_date",label:"Print Date",type:"date"}
  ];

  function esc(value){
    return String(value??"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function num(value,decimals=2){
    if(value===null||value===undefined||value==="") return "0";
    const n=Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:decimals})
      : String(value);
  }

  function money(value){
    const n=Number(value||0);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US",{style:"currency",currency:"USD"})
      : String(value||"");
  }

  function dateText(value){
    if(!value) return "—";
    const raw=String(value);
    const d=new Date(raw.length===10?raw+"T12:00:00":raw);
    return Number.isNaN(d.getTime())?raw:d.toLocaleDateString("en-US");
  }

  function dateTime(value){
    if(!value) return "Not reviewed";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }

  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||(name+" failed."));
    return data;
  }

  function setMessage(text,type="info"){
    const el=$("message");
    el.textContent=text||"";
    el.dataset.type=type;
    el.hidden=!text;
  }

  function showError(error){
    setMessage(error?.message||String(error),"error");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function keyOf(row){
    return String(row.sales_order_internal_id)+"|"+String(row.line_unique_key);
  }

  function rowByKey(key){
    return rows.find(row=>keyOf(row)===key)||null;
  }

  function protectedDashboardStatus(status){
    return status==="SCRP"||status==="Cosmetic Rejection";
  }

  function manualOptions(currentStatus=null){
    const base=Array.isArray(payload?.item_status_options)?[...payload.item_status_options]:[];
    if(currentStatus&&!base.includes(currentStatus)) base.unshift(currentStatus);
    return base;
  }

  function statusColorClass(status){
    const s=String(status||"");
    if(s==="Reallocate/Pick") return "status-reallocate";
    if(s==="Ready to Pick") return "status-ready";
    if(s==="Printed") return "status-printed";
    if(s==="GWO") return "status-gwo";
    if(s==="PWO") return "status-pwo";
    if(s==="Cosmetic Rejection") return "status-cosmetic";
    if(s==="SCRP") return "status-scrp";
    if(["Ready to Pick - Stalled","Printed - Stalled","GWO - Stalled","PWO - Stalled"].includes(s)) return "status-stalled";
    if(s==="On Hold Review") return "status-hold";
    if(s==="Out of Stock Review") return "status-oos-review";
    if(s==="Out of Stock - Procurement") return "status-oos-proc";
    if(s==="Out of Stock - CS") return "status-oos-cs";
    if(s==="Out of Stock - Component") return "status-oos-component";
    if(s==="Out of Stock - External Packaging") return "status-oos-packaging";
    if(s==="Cancel") return "status-cancel";
    return "";
  }

  function fillSelect(id,values,allLabel){
    const el=$(id);
    const current=el.value;
    el.innerHTML='<option value="">'+esc(allLabel)+'</option>'+
      values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if(values.includes(current)) el.value=current;
  }

  function fillFilters(){
    const dashboardStatuses=[...new Set(rows.map(r=>r.dashboard_status).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));
    const itemStatuses=[...new Set(rows.map(r=>r.item_status).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));
    const types=[...new Set(rows.map(r=>r.effective_sales_order_type).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));

    fillSelect("dashboard-status-filter",dashboardStatuses,"All Dashboard Statuses");
    fillSelect("item-status-filter",itemStatuses,"All Item Statuses");
    fillSelect("type-filter",types,"All Types");

    const current=$("bulk-status").value;
    const options=manualOptions();
    $("bulk-status").innerHTML='<option value="">Choose Item Status...</option>'+
      options.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if(options.includes(current)) $("bulk-status").value=current;
  }

  function updateMetrics(){
    const orders=new Set(rows.map(r=>r.document_number));
    $("metric-lines").textContent=num(rows.length,0);
    $("metric-orders").textContent=num(orders.size,0)+" orders";
    $("metric-oos").textContent=num(rows.filter(r=>r.dashboard_status==="Out of Stock Review").length,0);
    $("metric-proc").textContent=num(rows.filter(r=>r.item_status==="Out of Stock - Procurement").length,0);
    $("metric-production").textContent=num(rows.filter(r=>["GWO","PWO"].includes(r.dashboard_status)).length,0);
    $("metric-late").textContent=num(rows.filter(r=>r.shipment_timeline_status==="Late").length,0);
    $("metric-pending").textContent=num(rows.filter(r=>r.pending_status_change).length,0);
  }

  function renderReviewInfo(){
    const last=payload?.last_review;
    const pending=rows.filter(r=>r.pending_status_change).length;

    if(!last){
      $("review-info").innerHTML="<strong>No Sales Order Review has been committed yet.</strong> The dashboard is showing live Dashboard Status calculations. Run Sales Order Review to establish Item Status history.";
      return;
    }

    $("review-info").innerHTML=
      "<strong>Last committed review:</strong> "+esc(dateTime(last.completed_at||last.started_at))+
      " by "+esc(last.run_by_name_snapshot||"Administrator")+
      " · "+num(last.active_line_count,0)+" open lines"+
      " · "+num(last.status_change_count,0)+" Item Status changes"+
      (pending?" · <strong>"+num(pending,0)+" Dashboard Status change(s) waiting for the next review</strong>":" · No Dashboard Status changes waiting");
  }

  function matchesQuick(row){
    if(!quickFilter) return true;
    if(quickFilter==="OOS") return row.dashboard_status==="Out of Stock Review";
    if(quickFilter==="REALLOCATE") return row.dashboard_status==="Reallocate/Pick";
    if(quickFilter==="PRODUCTION") return row.dashboard_status==="Production Review";
    if(quickFilter==="LATE") return row.shipment_timeline_status==="Late";
    if(quickFilter==="DUPLICATES") return Boolean(row.is_duplicate_order);
    if(quickFilter==="STUCK"){
      return row.reviewed &&
        Number(row.status_age_days||0)>5 &&
        !["Cosmetic Rejection","SCRP","Cancel"].includes(row.item_status);
    }
    return true;
  }

  function filteredRows(){
    const search=$("search").value.trim().toLowerCase();
    const dashboardStatus=$("dashboard-status-filter").value;
    const itemStatus=$("item-status-filter").value;
    const type=$("type-filter").value;
    const includeHidden=$("include-hidden").checked;

    const filtered=rows.filter(row=>{
      if(!includeHidden&&row.hidden) return false;
      if(dashboardStatus&&row.dashboard_status!==dashboardStatus) return false;
      if(itemStatus&&row.item_status!==itemStatus) return false;
      if(type&&row.effective_sales_order_type!==type) return false;
      if(!matchesQuick(row)) return false;

      if(search){
        const hay=[
          row.document_number,row.item_name,row.customer_name,row.effective_sales_order_type,
          row.dashboard_status,row.item_status,row.order_status,row.fulfillment_status,row.constraint_text
        ].map(v=>String(v??"").toLowerCase()).join(" ");
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    const column=columns.find(c=>c.key===sortKey);
    filtered.sort((a,b)=>{
      let av=a?.[sortKey],bv=b?.[sortKey];
      if(["num","money","available","maxbuild","wip"].includes(column?.type)){
        av=Number(av||0);bv=Number(bv||0);
        if(av!==bv) return sortDir==="asc"?av-bv:bv-av;
      }else if(column?.type==="date"){
        const at=av?new Date(String(av).length===10?av+"T12:00:00":av).getTime():NaN;
        const bt=bv?new Date(String(bv).length===10?bv+"T12:00:00":bv).getTime():NaN;
        if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt) return sortDir==="asc"?at-bt:bt-at;
        if(Number.isFinite(at)&&!Number.isFinite(bt)) return -1;
        if(!Number.isFinite(at)&&Number.isFinite(bt)) return 1;
      }else{
        const cmp=String(av??"").localeCompare(String(bv??""),undefined,{numeric:true,sensitivity:"base"});
        if(cmp!==0) return sortDir==="asc"?cmp:-cmp;
      }
      return String(a.document_number||"").localeCompare(String(b.document_number||""),undefined,{numeric:true});
    });

    return filtered;
  }

  function statusSelectHtml(row){
    const disabled=!row.reviewed||protectedDashboardStatus(row.dashboard_status);
    const options=manualOptions(row.item_status);
    const title=protectedDashboardStatus(row.dashboard_status)
      ? "This Item Status is protected by the current Dashboard Status."
      : (!row.reviewed?"Run Sales Order Review before manually updating this line.":"Update Item Status");
    return '<select class="status-select" data-row-status="'+esc(keyOf(row))+'" '+(disabled?"disabled":"")+' title="'+esc(title)+'">'+
      options.map(v=>'<option value="'+esc(v)+'" '+(v===row.item_status?"selected":"")+'>'+esc(v)+'</option>').join("")+
    '</select>';
  }

  function cellHtml(row,col){
    if(col.type==="select"){
      return '<input type="checkbox" data-row-select="'+esc(keyOf(row))+'" '+(selected.has(keyOf(row))?"checked":"")+' '+(row.reviewed?"":"disabled")+'>';
    }
    if(col.type==="date") return dateText(row[col.key]);
    if(col.type==="num"||col.type==="available"||col.type==="maxbuild"||col.type==="wip") return num(row[col.key],2);
    if(col.type==="money") return money(row[col.key]);
    if(col.type==="status") return statusSelectHtml(row);
    if(col.type==="constraint") return esc(row.constraint_text||"—");
    return esc(row[col.key]||"—");
  }

  function cellClass(row,col){
    const classes=[];
    if(["num","money","available","maxbuild","wip"].includes(col.type)) classes.push("num");
    if(col.type==="select") classes.push("select-cell");
    if(col.type==="customer") classes.push("customer-cell");
    if(col.type==="constraint") classes.push("constraint-cell");
    if(col.type==="item") classes.push("item-cell");
    if(col.type==="available") classes.push("availability-cell");
    if(col.type==="maxbuild") classes.push("maxbuild-cell");
    if(col.type==="wip") classes.push("wip-cell");
    if(["item","customer"].includes(col.type)||col.key==="quantity"){
      const color=statusColorClass(row.item_status);
      if(color) classes.push(color);
    }
    return classes.join(" ");
  }

  function updateSelectionBar(){
    $("selected-count").textContent=selected.size+" selected";
    const disabled=selected.size===0;
    $("apply-status").disabled=disabled;
    $("hide-selected").disabled=disabled;
    $("unhide-selected").disabled=disabled;
    $("clear-selection").disabled=disabled;
  }

  function renderTable(){
    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if(page>pages) page=pages;
    const start=(page-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);
    const selectablePageRows=pageRows.filter(r=>r.reviewed);
    const allPageSelected=selectablePageRows.length>0&&selectablePageRows.every(r=>selected.has(keyOf(r)));

    $("order-head").innerHTML='<tr>'+columns.map(col=>{
      if(col.type==="select"){
        return '<th class="no-sort select-cell"><input id="select-page" type="checkbox" '+(allPageSelected?"checked":"")+' title="Select all reviewed rows on this page"></th>';
      }
      const arrow=sortKey===col.key?(sortDir==="asc"?" ▲":" ▼"):"";
      return '<th data-sort="'+esc(col.key)+'">'+esc(col.label)+arrow+'</th>';
    }).join("")+'</tr>';

    $("order-body").innerHTML=pageRows.length?pageRows.map(row=>{
      const rowClasses=[
        row.is_duplicate_order?"duplicate":"",
        row.hidden?"hidden-row":"",
        row.pending_status_change?"pending-change":""
      ].filter(Boolean).join(" ");

      return '<tr class="'+rowClasses+'" data-line-id="'+esc(row.sales_order_internal_id)+'" data-line-key="'+esc(row.line_unique_key)+'">'+
        columns.map(col=>'<td '+(col.type==="doc"?'data-doc="1" ':'')+'class="'+cellClass(row,col)+'">'+cellHtml(row,col)+'</td>').join("")+
      '</tr>';
    }).join(""):'<tr><td colspan="'+columns.length+'" class="muted" style="text-align:center;padding:18px">No Sales Order lines match the current filters.</td></tr>';

    $("summary").textContent=(filtered.length
      ?"Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length
      :"0 rows")+" · Page "+page+" of "+pages;
    $("prev").disabled=page<=1;
    $("next").disabled=page>=pages;

    $("order-head").querySelectorAll("[data-sort]").forEach(th=>{
      th.addEventListener("click",()=>{
        const key=th.dataset.sort;
        if(sortKey===key) sortDir=sortDir==="asc"?"desc":"asc";
        else{
          sortKey=key;
          const type=columns.find(c=>c.key===key)?.type;
          sortDir=["num","money","available","maxbuild","wip"].includes(type)?"desc":"asc";
        }
        page=1;
        renderTable();
      });
    });

    $("select-page")?.addEventListener("change",event=>{
      selectablePageRows.forEach(row=>{
        const key=keyOf(row);
        if(event.target.checked) selected.add(key);
        else selected.delete(key);
      });
      updateSelectionBar();
      renderTable();
    });

    $("order-body").querySelectorAll("[data-row-select]").forEach(box=>{
      box.addEventListener("click",event=>event.stopPropagation());
      box.addEventListener("change",()=>{
        if(box.checked) selected.add(box.dataset.rowSelect);
        else selected.delete(box.dataset.rowSelect);
        updateSelectionBar();
        renderTable();
      });
    });

    $("order-body").querySelectorAll("[data-row-status]").forEach(selectEl=>{
      selectEl.addEventListener("click",event=>event.stopPropagation());
      selectEl.addEventListener("change",async()=>{
        const key=selectEl.dataset.rowStatus;
        const row=rowByKey(key);
        if(!row) return;
        const oldStatus=row.item_status;
        selectEl.disabled=true;
        try{
          await updateItemStatus([row],selectEl.value,null);
          setMessage('Item Status updated to "'+selectEl.value+'". Item Status Date was refreshed.',"success");
          await loadData();
        }catch(error){
          selectEl.value=oldStatus;
          showError(error);
        }finally{
          selectEl.disabled=false;
        }
      });
    });

    $("order-body").querySelectorAll("[data-line-id]").forEach(tr=>{
      tr.addEventListener("click",event=>{
        if(event.target.closest("input,select,button,a")) return;
        openDetail(tr.dataset.lineId,tr.dataset.lineKey).catch(showError);
      });
    });

    updateSelectionBar();
  }

  function renderAll(){
    fillFilters();
    updateMetrics();
    renderReviewInfo();
    renderTable();
  }

  async function loadData(){
    payload=await rpc("get_sales_order_dashboard",{p_session_token:token});
    rows=Array.isArray(payload?.rows)?payload.rows:[];

    const validKeys=new Set(rows.filter(r=>r.reviewed).map(keyOf));
    [...selected].forEach(key=>{if(!validKeys.has(key))selected.delete(key);});

    renderAll();
  }

  function selectedRows(){
    return [...selected].map(rowByKey).filter(Boolean);
  }

  function linePayload(list){
    return list.map(row=>({
      sales_order_internal_id:row.sales_order_internal_id,
      line_unique_key:row.line_unique_key
    }));
  }

  async function updateItemStatus(list,status,comment){
    return rpc("bulk_update_sales_order_item_status",{
      p_session_token:token,
      p_lines:linePayload(list),
      p_item_status:status,
      p_comment:comment||null
    });
  }

  async function applySelectedStatus(){
    const list=selectedRows();
    const status=$("bulk-status").value;
    if(!list.length) throw new Error("Select at least one Sales Order line.");
    if(!status) throw new Error("Choose an Item Status first.");

    if(!window.confirm('Update '+list.length+' selected line(s) to "'+status+'"?\n\nThe Item Status Date will be refreshed for every selected line.')) return;

    $("apply-status").disabled=true;
    try{
      const result=await updateItemStatus(list,status,null);
      selected.clear();
      setMessage(result.updated_count+' line(s) updated to "'+status+'".',"success");
      await loadData();
    }finally{
      $("apply-status").disabled=false;
    }
  }

  async function setSelectedHidden(hidden){
    const list=selectedRows();
    if(!list.length) throw new Error("Select at least one Sales Order line.");

    const verb=hidden?"Hide":"Unhide";
    if(!window.confirm(verb+" "+list.length+" selected line(s)?")) return;

    const result=await rpc("bulk_set_sales_order_lines_hidden",{
      p_session_token:token,
      p_lines:linePayload(list),
      p_hidden:hidden,
      p_comment:null
    });
    selected.clear();
    setMessage(result.updated_count+" line(s) "+(hidden?"hidden from":"returned to")+" normal review.","success");
    await loadData();
  }

  async function runReview(){
    const pending=rows.filter(r=>r.pending_status_change).length;
    const text=
      "Run Sales Order Review now?\n\n"+
      "Dashboard Status will be committed from the current data. Manual Item Status overrides remain while the Dashboard Status is unchanged. On Hold Review stays locked until you manually change it. SCRP and Cosmetic Rejection remain protected."+
      (pending?"\n\n"+pending+" line(s) currently show a Dashboard Status change.":"");
    if(!window.confirm(text)) return;

    $("run-review").disabled=true;
    try{
      const result=await rpc("run_sales_order_review",{p_session_token:token});
      setMessage(
        "Sales Order Review complete. "+
        result.active_lines+" active lines · "+
        result.new_lines+" new · "+
        (result.dashboard_status_changes??0)+" Dashboard Status changes · "+
        (result.item_status_changes??result.status_changes??0)+" Item Status changes · "+
        result.closed_lines+" closed.",
        "success"
      );
      await loadData();
    }finally{
      $("run-review").disabled=false;
    }
  }

  function setQuick(value){
    quickFilter=value==="RESET"?"":value;
    document.querySelectorAll("[data-quick]").forEach(button=>{
      button.classList.toggle("active",button.dataset.quick===quickFilter);
    });
    page=1;
    renderTable();
  }


  function setFocusMode(enabled){
    focusMode=Boolean(enabled);
    document.body.classList.toggle("focus-mode",focusMode);
    const button=$("focus-table");
    if(button) button.textContent=focusMode?"▣ Show Overview":"⛶ Focus Table";
  }

  function exportVisible(){
    const data=filteredRows();
    if(!data.length) throw new Error("There are no visible Sales Order rows to export.");
    if(!csv) throw new Error("CSV export is unavailable.");

    const headers=[
      "Date","Ship Date","Document Number","Sales Order Type","Item Status Date","Item","Customer",
      "Quantity","Amount","Quantity Committed","Quantity Picked","Quantity Packed","Item Status",
      "Free Available New Wall","Max Build","Work Orders In Progress","Constraint","Priority Back Order",
      "Order Status","Fulfillment Status","Print Date"
    ];
    const values=data.map(r=>[
      dateText(r.order_date),dateText(r.ship_date),r.document_number,r.effective_sales_order_type,
      dateText(r.item_status_date),r.item_name,r.customer_name,r.quantity,r.amount,
      r.quantity_committed,r.quantity_picked,r.quantity_packed,r.item_status,
      r.item_available_new_wall,r.max_build_quantity,r.work_orders_in_progress,r.constraint_text,
      r.priority_requirement,r.order_status,r.fulfillment_status,dateText(r.print_date)
    ]);
    csv.download("sales-order-dashboard-visible.csv",headers,values);
  }

  function detailBox(label,value){
    return '<div class="detail"><div class="label">'+esc(label)+'</div><div class="value">'+value+'</div></div>';
  }

  function renderDetail(){
    const live=detailData?.live||{};
    const workflow=detailData?.workflow||null;
    const events=Array.isArray(detailData?.events)?detailData.events:[];
    const itemStatus=workflow?.item_status||live.calculated_status||"—";

    $("detail-title").textContent=(live.document_number||workflow?.document_number||"Sales Order")+" · "+(live.item_name||workflow?.item_name||"Item");
    $("detail-subtitle").textContent=[
      live.effective_sales_order_type||live.sales_order_type,
      live.customer_name,
      "Internal ID "+(live.sales_order_internal_id||workflow?.sales_order_internal_id||"—"),
      "Line "+(live.line_unique_key||workflow?.line_unique_key||"—")
    ].filter(Boolean).join(" · ");

    $("detail-grid").innerHTML=[
      detailBox("Dashboard Status",esc(live.calculated_status||"—")),
      detailBox("Item Status",esc(itemStatus)),
      detailBox("Item Status Date",esc(dateText(workflow?.item_status_since))),
      detailBox("Manual Override",workflow?.manual_override?"Yes — based on "+esc(workflow.manual_override_dashboard_status||"prior Dashboard Status"):"No"),
      detailBox("Order / Ship Date",esc(dateText(live.order_date)+" / "+dateText(live.ship_date))),
      detailBox("Quantity",esc(num(live.quantity,2))),
      detailBox("Amount",esc(money(live.amount))),
      detailBox("Committed / Picked / Packed",esc(num(live.quantity_committed,2)+" / "+num(live.quantity_picked,2)+" / "+num(live.quantity_packed,2))),
      detailBox("Free Available New Wall",esc(num(live.item_available_new_wall,2))),
      detailBox("Max Build",esc(num(live.max_build_quantity,2))),
      detailBox("Work Orders In Progress",esc(num(live.work_orders_in_progress,2))),
      detailBox("Priority Back Order",esc(num(live.priority_requirement,2))),
      detailBox("Constraint",esc(live.constraint_text||"—")),
      detailBox("Order Status",esc(live.order_status||"—")),
      detailBox("Fulfillment Status",esc(live.fulfillment_status||"—")),
      detailBox("Print Date",esc(dateText(live.print_date)))
    ].join("");

    const reviewed=Boolean(workflow);
    const protectedStatus=protectedDashboardStatus(live.calculated_status);
    const options=manualOptions(itemStatus);
    $("detail-status").innerHTML=options.map(v=>'<option value="'+esc(v)+'" '+(v===itemStatus?"selected":"")+'>'+esc(v)+'</option>').join("");
    $("detail-status").disabled=!reviewed||protectedStatus;
    $("detail-status-save").disabled=!reviewed||protectedStatus;
    $("detail-hidden").disabled=!reviewed;
    $("detail-hidden").checked=Boolean(workflow?.exclude_review);
    $("comment-add").disabled=!reviewed;

    if(!reviewed){
      $("detail-status-note").textContent="Run Sales Order Review before manually updating Item Status, hiding, or commenting on this line.";
    }else if(protectedStatus){
      $("detail-status-note").textContent=live.calculated_status+" is protected by the current Dashboard Status and cannot be manually overridden.";
    }else if(itemStatus==="On Hold Review"){
      $("detail-status-note").textContent="On Hold Review will remain locked through future reviews until you manually choose another Item Status.";
    }else{
      $("detail-status-note").textContent="A manual Item Status stays in place while the Dashboard Status remains unchanged. If the Dashboard Status changes later, Run Sales Order Review can replace the manual status.";
    }

    $("event-list").innerHTML=events.length?events.map(e=>{
      const change=(e.previous_status||e.new_status)&&e.previous_status!==e.new_status
        ? '<div class="event-change">'+esc(e.previous_status||"—")+' → <strong>'+esc(e.new_status||"—")+'</strong></div>'
        : "";
      return '<div class="event"><div class="event-head"><div><strong>'+esc(String(e.event_type||"").replaceAll("_"," "))+'</strong> · '+esc(e.performed_by||"System")+'</div><div>'+esc(dateTime(e.occurred_at))+'</div></div>'+change+(e.comment_text?'<p>'+esc(e.comment_text)+'</p>':'')+'</div>';
    }).join(""):'<div class="muted">No history yet.</div>';
  }

  async function fetchDetail(){
    if(!detailKey) return;
    detailData=await rpc("get_sales_order_line_detail",{
      p_session_token:token,
      p_sales_order_internal_id:detailKey.id,
      p_line_unique_key:detailKey.key
    });
    renderDetail();
  }

  async function openDetail(id,key){
    detailKey={id,key};
    $("detail-comment").value="";
    await fetchDetail();
    $("detail-modal").hidden=false;
  }

  function closeDetail(){
    $("detail-modal").hidden=true;
    detailKey=null;
    detailData=null;
  }

  async function saveDetailStatus(){
    if(!detailKey) return;
    const row=rowByKey(detailKey.id+"|"+detailKey.key);
    if(!row) throw new Error("Sales Order line is no longer active.");

    const status=$("detail-status").value;
    const comment=$("detail-comment").value.trim()||null;
    await updateItemStatus([row],status,comment);
    $("detail-comment").value="";
    setMessage('Item Status updated to "'+status+'". Item Status Date was refreshed.',"success");
    await loadData();
    await fetchDetail();
  }

  async function setDetailHidden(){
    if(!detailKey) return;
    const row=rowByKey(detailKey.id+"|"+detailKey.key);
    if(!row) throw new Error("Sales Order line is no longer active.");

    const hidden=$("detail-hidden").checked;
    try{
      await rpc("bulk_set_sales_order_lines_hidden",{
        p_session_token:token,
        p_lines:linePayload([row]),
        p_hidden:hidden,
        p_comment:$("detail-comment").value.trim()||null
      });
      $("detail-comment").value="";
      setMessage(hidden?"Sales Order line hidden from normal review.":"Sales Order line returned to normal review.","success");
      await loadData();
      await fetchDetail();
    }catch(error){
      $("detail-hidden").checked=!hidden;
      throw error;
    }
  }

  async function addComment(){
    if(!detailKey) return;
    const comment=$("detail-comment").value.trim();
    if(!comment) throw new Error("Enter a comment first.");

    $("comment-add").disabled=true;
    try{
      detailData=await rpc("add_sales_order_line_comment",{
        p_session_token:token,
        p_sales_order_internal_id:detailKey.id,
        p_line_unique_key:detailKey.key,
        p_comment:comment
      });
      $("detail-comment").value="";
      renderDetail();
      setMessage("Sales Order comment added.","success");
    }finally{
      $("comment-add").disabled=false;
    }
  }

  async function init(){
    if(!token){
      window.location.replace("index.html");
      return;
    }
    try{
      $("app").hidden=false;
      await loadData();
    }catch(error){
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("search").addEventListener("input",()=>{page=1;renderTable();});
  ["dashboard-status-filter","item-status-filter","type-filter","include-hidden"].forEach(id=>{
    $(id).addEventListener("change",()=>{page=1;renderTable();});
  });

  document.querySelectorAll("[data-quick]").forEach(button=>{
    button.addEventListener("click",()=>setQuick(button.dataset.quick));
  });

  $("focus-table").addEventListener("click",()=>setFocusMode(!focusMode));
  $("refresh").addEventListener("click",()=>loadData().then(()=>setMessage("Sales Order Dashboard refreshed.","success")).catch(showError));
  $("run-review").addEventListener("click",()=>runReview().catch(showError));
  $("export-visible").addEventListener("click",()=>{try{exportVisible();}catch(error){showError(error);}});
  $("apply-status").addEventListener("click",()=>applySelectedStatus().catch(showError));
  $("hide-selected").addEventListener("click",()=>setSelectedHidden(true).catch(showError));
  $("unhide-selected").addEventListener("click",()=>setSelectedHidden(false).catch(showError));
  $("clear-selection").addEventListener("click",()=>{selected.clear();renderTable();});

  $("prev").addEventListener("click",()=>{if(page>1){page--;renderTable();}});
  $("next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(page<pages){page++;renderTable();}});

  $("detail-close").addEventListener("click",closeDetail);
  $("detail-modal").addEventListener("click",event=>{if(event.target===$("detail-modal"))closeDetail();});
  $("detail-status-save").addEventListener("click",()=>saveDetailStatus().catch(showError));
  $("detail-hidden").addEventListener("change",()=>setDetailHidden().catch(showError));
  $("comment-add").addEventListener("click",()=>addComment().catch(showError));

  updateSelectionBar();
  init();
})();
