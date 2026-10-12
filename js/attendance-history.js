"use strict";
(() => {
  const config = window.TaskTrackerConfig;
  if (!config || !window.supabase) return;

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } }
  );

  const $ = id => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  let history = null;
  let selectedEventCodes = null;
  let sortKey = "business_date";
  let sortDirection = "desc";
  let loaded = false;
  let requestSequence = 0;

  const esc = value => String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  async function rpc(name,args={}){
    const token = sessionStorage.getItem(sessionKey);
    if(!token) throw new Error("Your session has expired. Please sign in again.");
    const {data,error} = await client.rpc(name,{p_session_token:token,...args});
    if(error) throw new Error(error.message || (name + " failed."));
    return data;
  }

  function dateValue(date){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,"0");
    const d=String(date.getDate()).padStart(2,"0");
    return y+"-"+m+"-"+d;
  }

  function addDays(value,days){
    const d=new Date(value+"T12:00:00");
    d.setDate(d.getDate()+days);
    return dateValue(d);
  }

  function dateLabel(value){
    if(!value) return "—";
    const d=new Date(value+"T12:00:00");
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }

  function numberLabel(value){
    if(value===null || value===undefined || value==="") return "—";
    const n=Number(value);
    if(!Number.isFinite(n)) return String(value);
    return n.toFixed(2).replace(/\.00$/,"");
  }

  function setTab(name,{load=true}={}){
    const isHistory=name==="history";
    $("attendance-summary-tab").hidden=isHistory;
    $("attendance-history-tab").hidden=!isHistory;
    $("attendance-tab-summary").classList.toggle("active",!isHistory);
    $("attendance-tab-history").classList.toggle("active",isHistory);
    $("attendance-tab-summary").setAttribute("aria-selected",String(!isHistory));
    $("attendance-tab-history").setAttribute("aria-selected",String(isHistory));

    if(isHistory && load && !loaded){
      loadHistory().catch(showError);
    }
  }

  function showError(error){
    const body=$("attendance-history-body");
    if(body) body.innerHTML='<tr><td colspan="8" class="empty">'+esc(error?.message || error || "Unable to load Attendance History.")+'</td></tr>';
    if($("history-count")) $("history-count").textContent="Unable to load Attendance History";
  }

  function eventTypes(){
    return Array.isArray(history?.event_types) ? history.event_types : [];
  }

  function normalizeSelection(){
    if(selectedEventCodes===null) return;
    const all=new Set(eventTypes().map(row=>row.event_code));
    selectedEventCodes=new Set([...selectedEventCodes].filter(code=>all.has(code)));
    if(selectedEventCodes.size===all.size) selectedEventCodes=null;
  }

  function updateEventLabel(){
    const all=eventTypes();
    const count=selectedEventCodes===null ? all.length : selectedEventCodes.size;
    $("history-event-button").textContent=!all.length
      ? "Attendance Types"
      : count===all.length
        ? "All Attendance Types"
        : count+" of "+all.length+" Attendance Types";
  }

  function renderEventOptions(){
    normalizeSelection();
    const allSelected=selectedEventCodes===null;
    $("history-event-options").innerHTML=eventTypes().map(row=>{
      const checked=allSelected || selectedEventCodes.has(row.event_code);
      return '<label class="event-option"><input type="checkbox" value="'+esc(row.event_code)+'" '+(checked?"checked":"")+'><span>'+esc(row.display_name)+'</span></label>';
    }).join("");
    updateEventLabel();
  }

  function renderSupervisorOptions(){
    const can=!!history?.viewer?.can_filter_supervisors;
    $("history-supervisor-wrap").hidden=!can;
    const select=$("history-supervisor");

    if(!can){
      select.innerHTML='<option value="">My Team</option>';
      return;
    }

    const current=select.value;
    select.innerHTML='<option value="">All Supervisors</option>';
    (history?.supervisors || []).forEach(row=>{
      const option=document.createElement("option");
      option.value=row.employee_id;
      option.textContent=row.employee_name;
      select.appendChild(option);
    });
    if([...select.options].some(option=>option.value===current)) select.value=current;
  }

  function renderEmployeeOptions(){
    const select=$("history-employee");
    const current=select.value;
    const supervisorId=$("history-supervisor").value;
    const rows=(history?.employees || []).filter(row=>!supervisorId || row.supervisor_id===supervisorId);

    select.innerHTML='<option value="">All Employees</option>';
    rows.forEach(row=>{
      const option=document.createElement("option");
      option.value=row.employee_id;
      option.textContent=row.employee_name+(row.is_active===false?" (Inactive)":"");
      select.appendChild(option);
    });

    if([...select.options].some(option=>option.value===current)) select.value=current;
    else select.value="";
  }

  function compare(a,b,key){
    if(key==="hours_worked" || key==="minutes_worked"){
      const av=a[key]==null ? Number.NEGATIVE_INFINITY : Number(a[key]);
      const bv=b[key]==null ? Number.NEGATIVE_INFINITY : Number(b[key]);
      return av-bv;
    }
    return String(a[key] ?? "").localeCompare(
      String(b[key] ?? ""),
      undefined,
      {numeric:true,sensitivity:"base"}
    );
  }

  function sortedRows(){
    const rows=[...(history?.rows || [])];
    rows.sort((a,b)=>{
      const primary=compare(a,b,sortKey);
      if(primary!==0) return sortDirection==="asc" ? primary : -primary;
      return String(a.employee_name||"").localeCompare(
        String(b.employee_name||""),
        undefined,
        {sensitivity:"base"}
      );
    });
    return rows;
  }

  function updateSortIndicators(){
    document.querySelectorAll("#attendance-history-table [data-history-sort]").forEach(button=>{
      const active=button.dataset.historySort===sortKey;
      button.classList.toggle("active",active);
      const indicator=button.querySelector(".sort-indicator");
      if(indicator) indicator.textContent=active ? (sortDirection==="asc" ? "▲" : "▼") : "";
    });
  }

  function renderRows(){
    const rows=sortedRows();
    $("history-count").textContent="Showing "+rows.length.toLocaleString()+" attendance record"+(rows.length===1?"":"s");
    $("history-export").disabled=!rows.length;

    if(!rows.length){
      $("attendance-history-body").innerHTML='<tr><td colspan="8" class="empty">No attendance records match the selected filters.</td></tr>';
      updateSortIndicators();
      return;
    }

    $("attendance-history-body").innerHTML=rows.map(row=>
      '<tr>'+
        '<td>'+esc(dateLabel(row.business_date))+'</td>'+
        '<td><strong>'+esc(row.employee_name)+'</strong></td>'+
        '<td>'+esc(row.supervisor_name || "—")+'</td>'+
        '<td>'+esc(row.attendance_type || "—")+'</td>'+
        '<td class="numeric">'+esc(numberLabel(row.hours_worked))+'</td>'+
        '<td class="numeric">'+esc(numberLabel(row.minutes_worked))+'</td>'+
        '<td class="history-notes">'+esc(row.notes || "—")+'</td>'+
        '<td>'+esc(row.recorded_by || "—")+'</td>'+
      '</tr>'
    ).join("");

    updateSortIndicators();
  }

  async function loadHistory(){
    const sequence=++requestSequence;
    $("attendance-history-body").innerHTML='<tr><td colspan="8" class="empty">Loading Attendance History...</td></tr>';
    $("history-count").textContent="Loading...";

    const data=await rpc("get_attendance_history",{
      p_start_date:$("history-start").value || null,
      p_end_date:$("history-end").value || null,
      p_employee_id:$("history-employee").value || null,
      p_supervisor_id:$("history-supervisor").value || null,
      p_event_codes:selectedEventCodes===null ? null : [...selectedEventCodes]
    });

    if(sequence!==requestSequence) return;

    history=data || {};
    loaded=true;

    if(!$("history-start").value) $("history-start").value=history.start_date || "";
    if(!$("history-end").value) $("history-end").value=history.end_date || "";

    renderSupervisorOptions();
    renderEmployeeOptions();
    renderEventOptions();
    renderRows();
  }

  async function openSummaryMetric(employeeId,metric){
    setTab("history",{load:false});
    if(!loaded) await loadHistory();

    const types=eventTypes();
    let codes=[];
    if(metric==="UNPLANNED_ABSENCE_UNAPPROVED" || metric==="UNPLANNED_LEFT_EARLY_UNAPPROVED"){
      codes=[metric];
    }else if(metric==="TARDY"){
      codes=types.filter(row=>row.counts_as_tardy).map(row=>row.event_code);
    }else if(metric==="NCNS"){
      codes=types.filter(row=>row.counts_as_ncns).map(row=>row.event_code);
    }

    selectedEventCodes=new Set(codes);

    const selectedTypes=types.filter(row=>codes.includes(row.event_code));
    const activeDays=Math.max(1,...selectedTypes.map(row=>Number(row.active_days || 0)));
    const end=history?.end_date || $("history-end").value;

    $("history-supervisor").value="";
    renderEmployeeOptions();
    $("history-employee").value=employeeId || "";

    if(end){
      $("history-end").value=end;
      $("history-start").value=addDays(end,-(activeDays-1));
    }

    renderEventOptions();
    await loadHistory();
  }

  function csvCell(value){
    return '"'+String(value ?? "").replaceAll('"','""')+'"';
  }

  function exportCsv(){
    const rows=sortedRows();
    if(!rows.length) return;

    const output=[
      ["Date","Employee","Supervisor","Attendance","Hours Worked","Minutes Worked","Notes","Recorded By"].map(csvCell).join(",")
    ];

    rows.forEach(row=>{
      output.push([
        row.business_date,
        row.employee_name,
        row.supervisor_name,
        row.attendance_type,
        row.hours_worked,
        row.minutes_worked,
        row.notes,
        row.recorded_by
      ].map(csvCell).join(","));
    });

    const blob=new Blob(["\ufeff"+output.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="attendance-history-"+($("history-start").value || "start")+"-to-"+($("history-end").value || "end")+".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function init(){
    const today=new Date();
    $("history-end").value=dateValue(today);
    today.setDate(today.getDate()-6);
    $("history-start").value=dateValue(today);

    $("attendance-tab-summary").addEventListener("click",()=>setTab("summary"));
    $("attendance-tab-history").addEventListener("click",()=>setTab("history"));
    $("history-refresh").addEventListener("click",()=>loadHistory().catch(showError));
    $("history-export").addEventListener("click",exportCsv);

    ["history-start","history-end","history-employee"].forEach(id=>{
      $(id).addEventListener("change",()=>loadHistory().catch(showError));
    });

    $("history-supervisor").addEventListener("change",()=>{
      renderEmployeeOptions();
      loadHistory().catch(showError);
    });

    $("history-event-button").addEventListener("click",event=>{
      event.stopPropagation();
      $("history-event-menu").hidden=!$("history-event-menu").hidden;
    });

    $("history-event-options").addEventListener("change",event=>{
      if(!(event.target instanceof HTMLInputElement) || event.target.type!=="checkbox") return;
      const all=eventTypes().map(row=>row.event_code);
      selectedEventCodes=new Set(
        [...$("history-event-options").querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value)
      );
      if(selectedEventCodes.size===all.length) selectedEventCodes=null;
      updateEventLabel();
      loadHistory().catch(showError);
    });

    $("history-events-all").addEventListener("click",()=>{
      selectedEventCodes=null;
      renderEventOptions();
      loadHistory().catch(showError);
    });

    $("history-events-none").addEventListener("click",()=>{
      selectedEventCodes=new Set();
      renderEventOptions();
      loadHistory().catch(showError);
    });

    document.addEventListener("click",event=>{
      if(!$("history-event-filter").contains(event.target)) $("history-event-menu").hidden=true;
    });

    $("attendance-history-table").addEventListener("click",event=>{
      const button=event.target.closest("[data-history-sort]");
      if(!button) return;
      const next=button.dataset.historySort;
      if(sortKey===next) sortDirection=sortDirection==="asc" ? "desc" : "asc";
      else{
        sortKey=next;
        sortDirection=next==="business_date" ? "desc" : "asc";
      }
      renderRows();
    });

    $("attendance-body").addEventListener("click",event=>{
      const button=event.target.closest("[data-attendance-history-metric]");
      if(!button) return;
      openSummaryMetric(
        button.dataset.attendanceHistoryEmployee,
        button.dataset.attendanceHistoryMetric
      ).catch(showError);
    });

    setTab("summary",{load:false});
  }

  init();
})();
