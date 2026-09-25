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

  let bootstrap=null;
  let items=[];
  let itemMap=new Map();
  let rows=[];
  let queue=[];

  function esc(value){
    return String(value??"")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function num(value){
    const n=Number(value||0);
    return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:2}):String(value||0);
  }

  function dateText(value){
    if(!value) return "—";
    const d=new Date(String(value).length===10?value+"T12:00:00":value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("en-US");
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

  function memoForJobType(jobType){
    switch(String(jobType||"").trim()){
      case "Aftermarket":
        return "Work Order Job Type = Aftermarket. The item cycle time for this job is 16.5 minutes for 50 items.";
      case "Priority Standard":
      case "NIB":
        return "Work Order Job Type = NIB - Save one Bag/Box or sticker to turn into QA. Each item should take approximately 34.8 seconds to complete";
      case "Build Line":
        return "Work Order Job Type = Build Line";
      case "Solid Keys":
        return "Work Order Job Type = Solid Keys";
      default:
        return String(jobType||"").trim();
    }
  }

  function emptyRow(){
    const jobType=$("default-job-type")?.value||"Build Line";
    return {
      item_name:"",
      quantity:"",
      work_order_type:$("default-wo-type")?.value||"Production",
      work_order_job_type:jobType,
      priority_department:"",
      work_order_memo:memoForJobType(jobType)
    };
  }

  function addRows(count=1){
    for(let i=0;i<count;i++) rows.push(emptyRow());
    renderEntryRows();
  }

  function renderJobTypeOptions(selected){
    const values=Array.isArray(bootstrap?.job_types)?bootstrap.job_types:[];
    return values.map((v)=>'<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
  }

  function renderPriorityOptions(selected){
    const values=Array.isArray(bootstrap?.priority_departments)?bootstrap.priority_departments:[];
    return '<option value="">—</option>'+values.map((v)=>'<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
  }

  function renderEntryRows(){
    $("entry-body").innerHTML=rows.map((row,index)=>
      '<tr data-entry-index="'+index+'">'+
        '<td>'+(index+1)+'</td>'+
        '<td><input class="item-input" list="item-list" data-field="item_name" value="'+esc(row.item_name)+'" placeholder="Search Item"></td>'+
        '<td><div class="qty-fill-wrap"><input class="qty-input" type="number" min="1" step="1" data-field="quantity" value="'+esc(row.quantity)+'"><button class="qty-fill-handle" type="button" data-fill-qty="'+index+'" title="Fill this quantity down into blank rows" aria-label="Fill quantity down"></button></div></td>'+
        '<td><select data-field="work_order_type"><option value="Production" '+(row.work_order_type==="Production"?"selected":"")+'>Production</option><option value="Priority" '+(row.work_order_type==="Priority"?"selected":"")+'>Priority</option></select></td>'+
        '<td><select class="job-input" data-field="work_order_job_type">'+renderJobTypeOptions(row.work_order_job_type)+'</select></td>'+
        '<td><select class="dept-input" data-field="priority_department">'+renderPriorityOptions(row.priority_department)+'</select></td>'+
        '<td><input class="memo-input" data-field="work_order_memo" value="'+esc(row.work_order_memo)+'"></td>'+
        '<td><button type="button" class="secondary" data-duplicate="'+index+'">Duplicate</button> <button type="button" class="danger" data-remove="'+index+'">Remove</button></td>'+
      '</tr>'
    ).join("");

    $("entry-body").querySelectorAll("[data-entry-index]").forEach((tr)=>{
      const index=Number(tr.dataset.entryIndex);
      tr.querySelectorAll("[data-field]").forEach((input)=>{
        input.addEventListener("input",()=>{
          const field=input.dataset.field;
          rows[index][field]=input.value;
          if(field==="work_order_job_type"){
            rows[index].work_order_memo=memoForJobType(input.value);
            renderEntryRows();
          }
        });
        input.addEventListener("change",()=>{
          const field=input.dataset.field;
          rows[index][field]=input.value;
          if(field==="work_order_job_type"){
            rows[index].work_order_memo=memoForJobType(input.value);
            renderEntryRows();
          }
        });
      });
    });

    $("entry-body").querySelectorAll("[data-duplicate]").forEach((button)=>{
      button.addEventListener("click",()=>{
        const index=Number(button.dataset.duplicate);
        rows.splice(index+1,0,{...rows[index]});
        renderEntryRows();
      });
    });

    $("entry-body").querySelectorAll("[data-remove]").forEach((button)=>{
      button.addEventListener("click",()=>{
        rows.splice(Number(button.dataset.remove),1);
        if(!rows.length) rows.push(emptyRow());
        renderEntryRows();
      });
    });

    $("entry-body").querySelectorAll("[data-fill-qty]").forEach((button)=>{
      button.addEventListener("click",()=>{
        const index=Number(button.dataset.fillQty);
        const value=String(rows[index]?.quantity??"").trim();
        if(!(Number(value)>0)){
          setMessage("Enter a Quantity greater than zero before filling down.","error");
          return;
        }
        let filled=0;
        for(let i=index+1;i<rows.length;i++){
          if(String(rows[i].quantity??"").trim()===""){
            rows[i].quantity=value;
            filled++;
          }
        }
        if(!filled){
          setMessage("There are no blank Quantity rows below this row.","info");
          return;
        }
        renderEntryRows();
        setMessage("Filled Quantity "+value+" into "+filled+" blank row"+(filled===1?"":"s")+".","success");
      });
    });
  }

  function resolveItem(name){
    return itemMap.get(String(name||"").trim().toLowerCase())||null;
  }

  async function stageRows(){
    const payload=[];
    for(const row of rows){
      const hasAnything=[row.item_name,row.quantity].some((v)=>String(v??"").trim()!=="");
      if(!hasAnything) continue;

      const item=resolveItem(row.item_name);
      if(!item) throw new Error('Item "'+row.item_name+'" does not exactly match an active Item.');
      if(!(Number(row.quantity)>0)) throw new Error(item.item_name+" needs a Quantity greater than zero.");
      if(!String(row.work_order_job_type||"").trim()) throw new Error(item.item_name+" needs a Work Order Job Type.");

      payload.push({
        item_id:item.item_id,
        quantity:Number(row.quantity),
        work_order_type:row.work_order_type,
        work_order_job_type:row.work_order_job_type,
        priority_department:row.priority_department||null,
        work_order_memo:row.work_order_memo||null
      });
    }

    if(!payload.length) throw new Error("Enter at least one Work Order row.");

    $("stage-rows").disabled=true;
    try{
      const result=await rpc("stage_inventory_work_orders",{
        p_session_token:token,
        p_rows:payload
      });
      setMessage(result.inserted_count+" Work Order row(s) staged as Pending Import.","success");
      rows=[emptyRow()];
      renderEntryRows();
      await loadQueue();
    }finally{
      $("stage-rows").disabled=false;
    }
  }

  function selectedIds(){
    return [...$("queue-body").querySelectorAll("[data-select-row]:checked")].map((x)=>x.dataset.selectRow);
  }

  function renderQueue(){
    const canImport=Boolean(bootstrap?.viewer?.can_import);
    $("manager-controls").hidden=!canImport;
    $("select-head").textContent=canImport?"Select":"";

    const totalQty=queue.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
    $("queue-summary").textContent=queue.length+" pending row(s) · "+num(totalQty)+" units";

    $("queue-body").innerHTML=queue.length?queue.map((row)=>
      '<tr>'+
        '<td>'+(canImport?'<input type="checkbox" data-select-row="'+esc(row.id)+'">':'')+'</td>'+
        '<td>'+esc(row.external_id||"—")+'</td>'+
        '<td>'+dateText(row.date_created)+'</td>'+
        '<td class="source">'+esc(row.source_label||row.source||"—")+'</td>'+
        '<td>'+esc(row.work_order_type||"—")+'</td>'+
        '<td><strong>'+esc(row.item_name||"—")+'</strong></td>'+
        '<td>'+num(row.quantity)+'</td>'+
        '<td>'+esc(row.work_order_job_type||"—")+'</td>'+
        '<td>'+esc(row.priority_department||"—")+'</td>'+
        '<td>'+esc(row.created_by||"—")+'</td>'+
        '<td><span class="pill pending">Pending Import</span></td>'+
      '</tr>'
    ).join(""):'<tr><td colspan="11" class="muted" style="text-align:center">No Work Orders are waiting for import.</td></tr>';
  }

  async function loadQueue(){
    queue=await rpc("get_inventory_work_order_staging",{
      p_session_token:token,
      p_include_imported:false
    })||[];
    if(!Array.isArray(queue)) queue=[];
    renderQueue();
  }

  function exportSelected(){
    const ids=new Set(selectedIds());
    if(!ids.size) throw new Error("Select at least one Pending Import row.");
    if(!csv) throw new Error("CSV export is unavailable.");

    const selected=queue.filter((row)=>ids.has(String(row.id)));
    const headers=[
      "External ID","Date Created","Work Order Type","Item","Quantity",
      "Work Order Job Type","Priority Department","Work Order Memo"
    ];
    const values=selected.map((row)=>[
      row.external_id,
      dateText(row.date_created),
      row.work_order_type,
      row.item_name,
      row.quantity,
      row.work_order_job_type,
      row.priority_department,
      row.work_order_memo
    ]);
    csv.download("work-orders-pending-import.csv",headers,values);
  }

  async function markImported(){
    const ids=selectedIds();
    if(!ids.length) throw new Error("Select at least one Pending Import row.");
    if(!window.confirm("Mark "+ids.length+" selected Work Order row(s) as Imported? Imported rows become read-only.")) return;

    const result=await rpc("mark_inventory_work_orders_imported",{
      p_session_token:token,
      p_staging_ids:ids,
      p_import_date:null
    });
    setMessage(result.updated_count+" Work Order row(s) marked Imported.","success");
    await loadQueue();
  }

  async function load(){
    const [b,q]=await Promise.all([
      rpc("get_inventory_staging_bootstrap",{p_session_token:token}),
      rpc("get_inventory_work_order_staging",{p_session_token:token,p_include_imported:false})
    ]);
    bootstrap=b||{};
    queue=Array.isArray(q)?q:[];
    items=Array.isArray(bootstrap.items)?bootstrap.items:[];
    itemMap=new Map(items.map((item)=>[String(item.item_name||"").trim().toLowerCase(),item]));

    $("viewer-meta").textContent=[
      bootstrap?.viewer?.employee_name,
      bootstrap?.viewer?.employee_role,
      bootstrap?.viewer?.department
    ].filter(Boolean).join(" · ");

    $("default-job-type").innerHTML=(bootstrap.job_types||[]).map((v)=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    $("item-list").innerHTML=items.map((item)=>'<option value="'+esc(item.item_name)+'"></option>').join("");

    rows=[emptyRow()];
    renderEntryRows();
    renderQueue();
  }

  async function init(){
    if(!token){
      window.location.replace("index.html");
      return;
    }
    try{
      $("app").hidden=false;
      await load();
    }catch(error){
      $("app").hidden=true;
      $("access-denied").hidden=false;
      $("access-denied").querySelector("p").textContent=error.message;
    }
  }

  $("add-row").addEventListener("click",()=>addRows(1));
  $("add-five").addEventListener("click",()=>addRows(5));
  $("stage-rows").addEventListener("click",()=>stageRows().catch(showError));
  $("default-job-type").addEventListener("change",()=>{});
  $("select-all").addEventListener("click",()=>{
    const boxes=[...$("queue-body").querySelectorAll("[data-select-row]")];
    const shouldCheck=boxes.some((box)=>!box.checked);
    boxes.forEach((box)=>{box.checked=shouldCheck;});
  });
  $("export-selected").addEventListener("click",()=>{try{exportSelected();}catch(error){showError(error);}});
  $("mark-imported").addEventListener("click",()=>markImported().catch(showError));

  init();
})();
