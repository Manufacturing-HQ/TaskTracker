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
  let detailKey=null;
  let detailData=null;

  const columns=[
    {key:"exclude_review",label:"Exclude",type:"exclude"},
    {key:"order_date",label:"Date",type:"date"},
    {key:"ship_date",label:"Ship Date",type:"date"},
    {key:"document_number",label:"Document #",type:"doc"},
    {key:"effective_sales_order_type",label:"Sales Order Type"},
    {key:"item_status",label:"Item Status",type:"status"},
    {key:"item_status_since",label:"Status Since",type:"datetime"},
    {key:"item_name",label:"Item"},
    {key:"customer_name",label:"Customer"},
    {key:"quantity",label:"Qty",type:"num"},
    {key:"quantity_committed",label:"Committed",type:"num"},
    {key:"quantity_picked",label:"Picked",type:"num"},
    {key:"quantity_packed",label:"Packed",type:"num"},
    {key:"item_available_new_wall",label:"Available",type:"num"},
    {key:"work_orders_in_progress",label:"WIP",type:"num"},
    {key:"max_build_quantity",label:"Max Build",type:"num"},
    {key:"priority_requirement",label:"Priority Need",type:"num"},
    {key:"fulfillment_status",label:"Fulfillment"},
    {key:"order_status",label:"Order Status"},
    {key:"print_date",label:"Print Date",type:"date"},
    {key:"review_route",label:"Route",type:"route"}
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
    return Number.isFinite(n)?n.toLocaleString("en-US",{style:"currency",currency:"USD"}):String(value||"");
  }

  function dateText(value){
    if(!value) return "—";
    const d=new Date(String(value).length===10?value+"T12:00:00":value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("en-US");
  }

  function dateTime(value){
    if(!value) return "Not reviewed";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }

  function routeLabel(route){
    if(route==="PROCUREMENT") return "Procurement";
    if(route==="CUSTOMER_SERVICE") return "Customer Service";
    if(route==="REVIEW") return "Review";
    return "—";
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

  function statusClass(status){
    const s=String(status||"");
    if(s==="Printed") return "st-printed";
    if(s==="Picked") return "st-picked";
    if(s==="Ready to Pick") return "st-ready";
    if(s==="Reallocate/Pick") return "st-realloc";
    if(s==="PWO") return "st-pwo";
    if(s==="GWO") return "st-gwo";
    if(s==="Production Review") return "st-prod";
    if(s==="Out of Stock Review") return "st-oos";
    if(s==="Out of Stock - Procurement") return "st-proc";
    if(s==="Out of Stock - Customer Service") return "st-cs";
    if(s==="Out of Stock - Review") return "st-review";
    if(s==="Cosmetic Rejection") return "st-cosmetic";
    return "st-pending";
  }

  function fillFilters(){
    const statuses=[...new Set(rows.map(r=>r.item_status).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));
    const types=[...new Set(rows.map(r=>r.effective_sales_order_type).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}));

    const currentStatus=$("status-filter").value;
    const currentType=$("type-filter").value;

    $("status-filter").innerHTML='<option value="">All Statuses</option>'+
      statuses.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    $("type-filter").innerHTML='<option value="">All Types</option>'+
      types.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");

    if(statuses.includes(currentStatus)) $("status-filter").value=currentStatus;
    if(types.includes(currentType)) $("type-filter").value=currentType;
  }

  function updateMetrics(){
    const openOrders=new Set(rows.map(r=>r.document_number));
    $("metric-lines").textContent=num(rows.length,0);
    $("metric-orders").textContent=num(openOrders.size,0)+" orders";
    $("metric-oos").textContent=num(rows.filter(r=>r.item_status==="Out of Stock Review").length,0);
    $("metric-proc").textContent=num(rows.filter(r=>r.review_route==="PROCUREMENT").length,0);
    $("metric-production").textContent=num(rows.filter(r=>["GWO","PWO"].includes(r.item_status)).length,0);
    $("metric-late").textContent=num(rows.filter(r=>r.shipment_timeline_status==="Late").length,0);
    $("metric-pending").textContent=num(rows.filter(r=>r.pending_status_change).length,0);
  }

  function renderReviewInfo(){
    const last=payload?.last_review;
    const pending=rows.filter(r=>r.pending_status_change).length;

    if(!last){
      $("review-info").innerHTML="<strong>No Sales Order Review has been committed yet.</strong> The table is showing live calculated preview statuses. Run Sales Order Review to establish Item Status history and Status Since dates.";
      return;
    }

    const completed=last.completed_at||last.started_at;
    $("review-info").innerHTML=
      "<strong>Last committed review:</strong> "+esc(dateTime(completed))+
      " by "+esc(last.run_by_name_snapshot||"Administrator")+
      " · "+num(last.active_line_count,0)+" open lines"+
      " · "+num(last.status_change_count,0)+" status changes"+
      (pending?" · <strong>"+num(pending,0)+" live change(s) waiting for the next review</strong>":" · No live status changes waiting");
  }

  function matchesQuick(row){
    if(!quickFilter) return true;
    if(quickFilter==="OOS") return row.item_status==="Out of Stock Review";
    if(quickFilter==="REALLOCATE") return row.item_status==="Reallocate/Pick";
    if(quickFilter==="PRODUCTION") return row.item_status==="Production Review";
    if(quickFilter==="LATE") return row.shipment_timeline_status==="Late";
    if(quickFilter==="DUPLICATES") return Boolean(row.is_duplicate_order);
    if(quickFilter==="STUCK"){
      const stuckStatuses=[
        "Pending","Printed","Ready to Pick","Reallocate/Pick","PWO","GWO",
        "Production Review","Out of Stock Review","Out of Stock - Procurement",
        "Out of Stock - Customer Service","Out of Stock - Review"
      ];
      return row.reviewed && Number(row.status_age_days||0)>5 && stuckStatuses.includes(row.item_status);
    }
    return true;
  }

  function filteredRows(){
    const search=$("search").value.trim().toLowerCase();
    const status=$("status-filter").value;
    const type=$("type-filter").value;
    const route=$("route-filter").value;
    const includeExcluded=$("include-excluded").checked;

    const filtered=rows.filter(row=>{
      if(!includeExcluded&&row.exclude_review) return false;
      if(status&&row.item_status!==status) return false;
      if(type&&row.effective_sales_order_type!==type) return false;
      if(route==="NONE"&&row.review_route) return false;
      if(route&&route!=="NONE"&&row.review_route!==route) return false;
      if(!matchesQuick(row)) return false;

      if(search){
        const hay=[
          row.document_number,row.item_name,row.customer_name,row.effective_sales_order_type,
          row.item_status,row.order_status,row.fulfillment_status,row.review_route
        ].map(v=>String(v??"").toLowerCase()).join(" ");
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    const column=columns.find(c=>c.key===sortKey);
    filtered.sort((a,b)=>{
      let av=a?.[sortKey],bv=b?.[sortKey];
      if(column?.type==="num"){
        av=Number(av||0);bv=Number(bv||0);
        if(av!==bv) return sortDir==="asc"?av-bv:bv-av;
      }else if(column?.type==="date"||column?.type==="datetime"){
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

  function cellHtml(row,col){
    if(col.type==="exclude"){
      return '<input type="checkbox" data-exclude-toggle="'+esc(row.sales_order_internal_id)+"|"+esc(row.line_unique_key)+'" '+(row.exclude_review?"checked":"")+' '+(row.reviewed?"":"disabled")+'>';
    }
    if(col.type==="date") return dateText(row[col.key]);
    if(col.type==="datetime") return dateTime(row[col.key]);
    if(col.type==="num") return num(row[col.key],2);
    if(col.type==="status") return '<span class="status '+statusClass(row.item_status)+'">'+esc(row.item_status||"—")+'</span>'+(row.pending_status_change?'<span title="Live source would change this status after the next review" style="margin-left:5px;color:#d97706;font-weight:950">●</span>':'');
    if(col.type==="route") return row.review_route?'<span class="route">'+esc(routeLabel(row.review_route))+'</span>':'—';
    return esc(row[col.key]||"—");
  }

  function renderTable(){
    $("order-head").innerHTML='<tr>'+columns.map(col=>{
      const arrow=sortKey===col.key?(sortDir==="asc"?" ▲":" ▼"):"";
      return '<th data-sort="'+esc(col.key)+'">'+esc(col.label)+arrow+'</th>';
    }).join("")+'</tr>';

    const filtered=filteredRows();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if(page>pages) page=pages;
    const start=(page-1)*pageSize;
    const pageRows=filtered.slice(start,start+pageSize);

    $("order-body").innerHTML=pageRows.length?pageRows.map(row=>{
      const classes=[
        row.is_duplicate_order?"duplicate":"",
        row.exclude_review?"excluded":"",
        row.pending_status_change?"pending-change":""
      ].filter(Boolean).join(" ");

      return '<tr class="'+classes+'" data-line-id="'+esc(row.sales_order_internal_id)+'" data-line-key="'+esc(row.line_unique_key)+'">'+
        columns.map(col=>'<td '+(col.type==="doc"?'data-doc="1" ':'')+'class="'+(col.type==="num"?"num":"")+'">'+cellHtml(row,col)+'</td>').join("")+
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
          sortDir=columns.find(c=>c.key===key)?.type==="num"?"desc":"asc";
        }
        page=1;
        renderTable();
      });
    });

    $("order-body").querySelectorAll("[data-line-id]").forEach(tr=>{
      tr.addEventListener("click",event=>{
        if(event.target.closest("[data-exclude-toggle]")) return;
        openDetail(tr.dataset.lineId,tr.dataset.lineKey).catch(showError);
      });
    });

    $("order-body").querySelectorAll("[data-exclude-toggle]").forEach(box=>{
      box.addEventListener("click",event=>event.stopPropagation());
      box.addEventListener("change",()=>{
        const [id,key]=box.dataset.excludeToggle.split("|");
        setExcluded(id,key,box.checked,null)
          .then(()=>loadData())
          .catch(error=>{
            box.checked=!box.checked;
            showError(error);
          });
      });
    });
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
    renderAll();
  }

  async function runReview(){
    const pending=rows.filter(r=>r.pending_status_change).length;
    const text=payload?.last_review
      ?"Run Sales Order Review now? This will commit current calculated statuses, preserve active manual out-of-stock routing, and update Status Since only where the effective status changes."+ (pending?"\n\n"+pending+" line(s) currently show a live status change.":"")
      :"Run the initial Sales Order Review? This will create persistent workflow records for the current open Sales Order lines.";
    if(!window.confirm(text)) return;

    $("run-review").disabled=true;
    try{
      const result=await rpc("run_sales_order_review",{p_session_token:token});
      setMessage(
        "Sales Order Review complete. "+
        result.active_lines+" active lines · "+
        result.new_lines+" new · "+
        result.status_changes+" status changes · "+
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

  function exportVisible(){
    const data=filteredRows();
    if(!data.length) throw new Error("There are no visible Sales Order rows to export.");
    if(!csv) throw new Error("CSV export is unavailable.");

    const headers=[
      "Date","Ship Date","Document Number","Sales Order Type","Item Status","Item Status Since",
      "Item","Customer","Quantity","Amount","Quantity Committed","Quantity Picked","Quantity Packed",
      "Item Available New Wall","Work Orders In Progress","Max Build","Priority Need",
      "Total Priority Need","Fulfillment Status","Order Status","Print Date","Shipment Timeline Status",
      "Route","Exclude Review","Internal ID","Line Unique Key"
    ];
    const values=data.map(r=>[
      dateText(r.order_date),dateText(r.ship_date),r.document_number,r.effective_sales_order_type,
      r.item_status,dateTime(r.item_status_since),r.item_name,r.customer_name,r.quantity,r.amount,
      r.quantity_committed,r.quantity_picked,r.quantity_packed,r.item_available_new_wall,
      r.work_orders_in_progress,r.max_build_quantity,r.priority_requirement,r.total_priority_need,
      r.fulfillment_status,r.order_status,dateText(r.print_date),r.shipment_timeline_status,
      routeLabel(r.review_route),r.exclude_review?"Yes":"No",r.sales_order_internal_id,r.line_unique_key
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
    const effective=workflow?.item_status||live.calculated_status||"—";

    $("detail-title").textContent=(live.document_number||workflow?.document_number||"Sales Order")+" · "+(live.item_name||workflow?.item_name||"Item");
    $("detail-subtitle").textContent=[
      live.effective_sales_order_type||live.sales_order_type,
      live.customer_name,
      "Internal ID "+(live.sales_order_internal_id||workflow?.sales_order_internal_id||"—"),
      "Line "+(live.line_unique_key||workflow?.line_unique_key||"—")
    ].filter(Boolean).join(" · ");

    $("detail-grid").innerHTML=[
      detailBox("Item Status",'<span class="status '+statusClass(effective)+'">'+esc(effective)+'</span>'),
      detailBox("Live Calculated Status",'<span class="status '+statusClass(live.calculated_status)+'">'+esc(live.calculated_status||"—")+'</span>'),
      detailBox("Status Since",esc(dateTime(workflow?.item_status_since))),
      detailBox("Route",esc(routeLabel(workflow?.review_route))),
      detailBox("Order / Ship Date",esc(dateText(live.order_date)+" / "+dateText(live.ship_date))),
      detailBox("Quantity",esc(num(live.quantity,2))),
      detailBox("Committed / Picked / Packed",esc(num(live.quantity_committed,2)+" / "+num(live.quantity_picked,2)+" / "+num(live.quantity_packed,2))),
      detailBox("Amount",esc(money(live.amount))),
      detailBox("Item Available New Wall",esc(num(live.item_available_new_wall,2))),
      detailBox("Work Orders In Progress",esc(num(live.work_orders_in_progress,2))),
      detailBox("Max Build",esc(num(live.max_build_quantity,2))),
      detailBox("Priority Need Through Order",esc(num(live.priority_requirement,2))),
      detailBox("Total Priority Need",esc(num(live.total_priority_need,2))),
      detailBox("Production Coverage",esc(num(live.total_production_coverage,2))),
      detailBox("Fulfillment / Order Status",esc((live.fulfillment_status||"—")+" / "+(live.order_status||"—"))),
      detailBox("Print Date",esc(dateText(live.print_date)))
    ].join("");

    const reviewed=Boolean(workflow);
    const canRoute=reviewed&&workflow.calculated_status==="Out of Stock Review";
    $("route-procurement").disabled=!canRoute;
    $("route-customer").disabled=!canRoute;
    $("route-review").disabled=!canRoute;
    $("route-clear").disabled=!reviewed||!workflow.review_route;
    $("detail-excluded").disabled=!reviewed;
    $("detail-excluded").checked=Boolean(workflow?.exclude_review);
    $("comment-add").disabled=!reviewed;

    if(!reviewed){
      $("route-note").textContent="Run Sales Order Review before routing, excluding, or commenting on this line.";
    }else if(canRoute){
      $("route-note").textContent="This line is currently Out of Stock Review. Routing changes the effective Item Status but preserves the underlying calculated status.";
    }else{
      $("route-note").textContent="Routing is only available while the committed calculated status is Out of Stock Review.";
    }

    $("event-list").innerHTML=events.length?events.map(e=>{
      const change=(e.previous_status||e.new_status) && e.previous_status!==e.new_status
        ? '<div class="event-change">'+esc(e.previous_status||"—")+' → <strong>'+esc(e.new_status||"—")+'</strong></div>'
        : "";
      const routeChange=(e.previous_route||e.new_route) && e.previous_route!==e.new_route
        ? '<div class="event-change">Route: '+esc(routeLabel(e.previous_route))+' → <strong>'+esc(routeLabel(e.new_route))+'</strong></div>'
        : "";
      return '<div class="event"><div class="event-head"><div><strong>'+esc(String(e.event_type||"").replaceAll("_"," "))+'</strong> · '+esc(e.performed_by||"System")+'</div><div>'+esc(dateTime(e.occurred_at))+'</div></div>'+change+routeChange+(e.comment_text?'<p>'+esc(e.comment_text)+'</p>':'')+'</div>';
    }).join(""):'<div class="muted">No history yet.</div>';
  }

  async function openDetail(id,key){
    detailKey={id,key};
    detailData=await rpc("get_sales_order_line_detail",{
      p_session_token:token,
      p_sales_order_internal_id:id,
      p_line_unique_key:key
    });
    $("detail-comment").value="";
    renderDetail();
    $("detail-modal").hidden=false;
  }

  function closeDetail(){
    $("detail-modal").hidden=true;
    detailKey=null;
    detailData=null;
  }

  async function setRoute(route){
    if(!detailKey) return;
    const comment=$("detail-comment").value.trim()||null;
    detailData=await rpc("set_sales_order_line_route",{
      p_session_token:token,
      p_sales_order_internal_id:detailKey.id,
      p_line_unique_key:detailKey.key,
      p_route:route,
      p_comment:comment
    });
    $("detail-comment").value="";
    renderDetail();
    await loadData();
    setMessage(route?"Sales Order line routed to "+routeLabel(route)+".":"Sales Order route cleared.","success");
  }

  async function setExcluded(id,key,excluded,comment){
    return rpc("set_sales_order_line_excluded",{
      p_session_token:token,
      p_sales_order_internal_id:id,
      p_line_unique_key:key,
      p_excluded:excluded,
      p_comment:comment
    });
  }

  async function setDetailExcluded(){
    if(!detailKey) return;
    const desired=$("detail-excluded").checked;
    try{
      detailData=await setExcluded(
        detailKey.id,
        detailKey.key,
        desired,
        $("detail-comment").value.trim()||null
      );
      $("detail-comment").value="";
      renderDetail();
      await loadData();
      setMessage(desired?"Sales Order line excluded from normal review filters.":"Sales Order line returned to normal review filters.","success");
    }catch(error){
      $("detail-excluded").checked=!desired;
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
  ["status-filter","type-filter","route-filter","include-excluded"].forEach(id=>{
    $(id).addEventListener("change",()=>{page=1;renderTable();});
  });
  document.querySelectorAll("[data-quick]").forEach(button=>{
    button.addEventListener("click",()=>setQuick(button.dataset.quick));
  });

  $("refresh").addEventListener("click",()=>loadData().then(()=>setMessage("Sales Order Dashboard refreshed.","success")).catch(showError));
  $("run-review").addEventListener("click",()=>runReview().catch(showError));
  $("export-visible").addEventListener("click",()=>{try{exportVisible();}catch(error){showError(error);}});
  $("prev").addEventListener("click",()=>{if(page>1){page--;renderTable();}});
  $("next").addEventListener("click",()=>{const pages=Math.ceil(filteredRows().length/pageSize);if(page<pages){page++;renderTable();}});

  $("detail-close").addEventListener("click",closeDetail);
  $("detail-modal").addEventListener("click",event=>{if(event.target===$("detail-modal"))closeDetail();});
  $("route-procurement").addEventListener("click",()=>setRoute("PROCUREMENT").catch(showError));
  $("route-customer").addEventListener("click",()=>setRoute("CUSTOMER_SERVICE").catch(showError));
  $("route-review").addEventListener("click",()=>setRoute("REVIEW").catch(showError));
  $("route-clear").addEventListener("click",()=>setRoute(null).catch(showError));
  $("detail-excluded").addEventListener("change",()=>setDetailExcluded().catch(showError));
  $("comment-add").addEventListener("click",()=>addComment().catch(showError));

  init();
})();
