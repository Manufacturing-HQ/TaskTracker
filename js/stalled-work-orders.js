"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib) throw new Error("Task Tracker configuration failed to load.");

  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const $=(id)=>document.getElementById(id);
  const token=sessionStorage.getItem(config.sessionStorageKey);
  let payload=null;
  let rows=[];

  const esc=(v)=>String(v??"").replace(/[&<>'"]/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const num=(v)=>Number(v||0).toLocaleString("en-US",{maximumFractionDigits:2});
  const dateText=(v)=>{if(!v)return "—";const d=new Date(String(v).length===10?v+"T12:00:00":v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString();};
  const dateTime=(v)=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();};

  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error) throw new Error(error.message||name+" failed.");
    return data;
  }

  function setMessage(text,type="info"){
    const el=$("message");
    el.textContent=text||"";
    el.dataset.type=type;
    el.hidden=!text;
  }

  function fillOperationFilter(){
    const select=$("operation-filter");
    const current=select.value;
    const values=[...new Set(rows.map(r=>r.operation_label).filter(Boolean))].sort();
    select.innerHTML='<option value="">All Operations</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    if(values.includes(current)) select.value=current;
  }

  function searchText(row){
    return [
      row.document_number,row.item_name,row.work_order_type,row.work_order_job_type,
      row.operation_label,row.build_employee,row.qc_employee,row.priority_status,
      row.hold_reason,row.netsuite_stalled_comments
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function filteredRows(){
    const q=$("search").value.trim().toLowerCase();
    const operation=$("operation-filter").value;
    const severity=$("severity-filter").value;
    return rows.filter(row=>
      (!q||searchText(row).includes(q)) &&
      (!operation||row.operation_label===operation) &&
      (!severity||row.severity===severity)
    );
  }

  function detailHtml(row){
    const parts=[];
    if(row.is_on_hold) parts.push('<span class="pill hold">On Hold</span> '+esc(row.hold_reason||""));
    if(row.netsuite_stalled) parts.push('<span class="pill red">NetSuite Stalled</span> '+esc(row.netsuite_stalled_comments||""));
    return parts.length?parts.join('<br>'):'—';
  }

  function render(){
    const counts=payload?.counts||{};
    $("viewer-name").textContent=payload?.viewer?.employee_name||"";
    $("refresh-meta").textContent="NetSuite refreshed "+dateTime(payload?.refreshed_at);
    $("metric-total").textContent=num(counts.total);
    $("metric-pending-build").textContent=num(counts.pending_build);
    $("metric-build-line").textContent=num(counts.build_line);
    $("metric-pending-qc").textContent=num(counts.pending_qc);
    $("metric-build-qc").textContent=num(counts.build_qc);
    $("metric-inventory").textContent=num(Number(counts.material_pull||0)+Number(counts.fgi_put_away||0));
    $("metric-critical").textContent=num(counts.critical);

    const t=payload?.thresholds||{};
    $("threshold-note").textContent="Stall thresholds: Material Pull > "+(t["Material Pull"]??1)+" day · Pending Build > "+(t["Pending Build"]??5)+" days · Build Line > "+(t["Build Line"]??2)+" days · Pending QC > "+(t["Pending QC"]??5)+" days · QC In Progress > "+(t["QC In Progress"]??1)+" day · FGI Put Away > "+(t["FGI Put Away"]??1)+" day.";

    const visible=filteredRows();
    $("stalled-body").innerHTML=visible.length?visible.map(row=>{
      const severity=String(row.severity||"AMBER").toLowerCase();
      return '<tr class="severity-'+severity+'">'+
        '<td><span class="wo">'+esc(row.document_number||"—")+'</span><div class="muted">'+dateText(row.work_order_date)+'</div></td>'+
        '<td><strong>'+esc(row.item_name||"—")+'</strong><div class="muted">'+esc(row.work_order_type||"")+'</div></td>'+
        '<td>'+num(row.quantity)+'</td>'+
        '<td><span class="pill '+severity+'">'+esc(row.operation_label||row.operation_in_progress||"—")+'</span></td>'+
        '<td>'+dateText(row.operation_started_date)+'</td>'+
        '<td class="age">'+num(row.days_in_operation)+'</td>'+
        '<td>'+num(row.threshold_days)+' day'+(Number(row.threshold_days)===1?'':'s')+'</td>'+
        '<td class="age">'+num(row.days_over_threshold)+'</td>'+
        '<td>'+esc(row.build_employee||"—")+'</td>'+
        '<td>'+esc(row.qc_employee||"—")+'</td>'+
        '<td>'+esc(row.work_order_job_type||"—")+'</td>'+
        '<td>'+(row.priority_status?'<span class="pill priority">'+esc(row.priority_status)+'</span>':'—')+'</td>'+
        '<td class="detail">'+detailHtml(row)+'</td>'+
      '</tr>';
    }).join(""):'<tr><td colspan="13" class="muted" style="text-align:center;padding:18px">No stalled Work Orders match the current filters.</td></tr>';
    $("summary").textContent=visible.length+" of "+rows.length+" stalled Work Orders shown.";
  }

  async function load(){
    payload=await rpc("get_stalled_work_orders",{p_session_token:token});
    rows=Array.isArray(payload?.rows)?payload.rows:[];
    fillOperationFilter();
    render();
  }

  async function init(){
    if(!token){window.location.replace("index.html");return;}
    try{
      $("app").hidden=false;
      await load();
    }catch(error){
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("refresh").addEventListener("click",()=>load().then(()=>setMessage("Stalled Work Orders refreshed.","success")).catch((e)=>setMessage(e.message,"error")));
  $("search").addEventListener("input",render);
  $("operation-filter").addEventListener("change",render);
  $("severity-filter").addEventListener("change",render);

  init();
})();