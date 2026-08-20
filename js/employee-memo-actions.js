"use strict";

(() => {
  const config=window.TaskTrackerConfig,supabaseLib=window.supabase;
  if(!config||!supabaseLib)return;
  if(!document.querySelector('.nav button[data-view="memos"]'))return;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const sessionKey=config.sessionStorageKey;
  const esc=v=>String(v??"").replace(/[&<>'\"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[ch]));
  let lastPendingCount=null,lastLatestAssignment=null,pollTimer=null,rendering=false,noticeChecking=false;

  async function rpc(name,args={}){
    const {data,error}=await client.rpc(name,args);
    if(error)throw new Error(error.message||`${name} failed.`);
    return data;
  }

  function token(){return sessionStorage.getItem(sessionKey);}

  function addStyles(){
    if(document.getElementById("employee-memo-actions-style"))return;
    const s=document.createElement("style");s.id="employee-memo-actions-style";
    s.textContent=`
      .memo-nav-badge{display:inline-block;min-width:20px;margin-left:7px;padding:2px 6px;border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:900;text-align:center}
      .memo-alert{position:sticky;top:12px;z-index:35;margin:0 0 16px;padding:13px 15px;border:2px solid #f59e0b;border-radius:12px;background:#fffbeb;box-shadow:0 8px 20px rgba(15,23,42,.12);display:flex;gap:12px;align-items:center;justify-content:space-between}
      .memo-alert strong{display:block}.memo-alert span{font-size:12px;color:#78350f}.memo-alert button{border:0;border-radius:9px;padding:9px 12px;background:#1d4ed8;color:#fff;font-weight:900;white-space:nowrap}
      .memo-ack-box{margin-top:14px;padding-top:12px;border-top:1px solid #cbd5e1}.memo-ack-box textarea{width:100%;min-height:72px;border:1px solid #94a3b8;border-radius:9px;padding:8px 10px;margin:8px 0}.memo-ack-box button{border:0;border-radius:9px;padding:9px 12px;background:#1d4ed8;color:#fff;font-weight:900}
    `;
    document.head.appendChild(s);
  }

  function memoNavButton(){return document.querySelector('.nav button[data-view="memos"]');}

  function setBadge(count){
    const b=memoNavButton();if(!b)return;
    let badge=b.querySelector(".memo-nav-badge");
    if(count>0){
      if(!badge){badge=document.createElement("span");badge.className="memo-nav-badge";b.appendChild(badge);}
      badge.textContent=String(count);
    }else if(badge){badge.remove();}
  }

  function ensureAlert(count){
    const app=document.getElementById("app"),main=document.querySelector("main.main");
    if(!app||app.hidden||!main)return;
    let alert=document.getElementById("memo-live-alert");
    if(count<=0){alert?.remove();return;}
    if(!alert){
      alert=document.createElement("div");alert.id="memo-live-alert";alert.className="memo-alert";
      alert.innerHTML='<div><strong>New memo — acknowledgment required</strong><span id="memo-live-alert-text"></span></div><button type="button">View Memo</button>';
      alert.querySelector("button").addEventListener("click",()=>memoNavButton()?.click());
      const top=main.querySelector(".top"); if(top) top.insertAdjacentElement("afterend",alert); else main.prepend(alert);
    }
    const text=alert.querySelector("#memo-live-alert-text");if(text)text.textContent=`You have ${count} pending memo${count===1?"":"s"}.`;
  }

  async function checkNotice(showBannerForExisting=false){
    const t=token();if(!t||noticeChecking)return;
    noticeChecking=true;
    try{
      const notice=await rpc("get_my_pending_memo_notice",{p_session_token:t});
      const count=Number(notice?.pending_count||0),latest=notice?.latest_assignment_id||null;
      setBadge(count);
      const isNew=lastPendingCount!==null&&(count>lastPendingCount||latest!==lastLatestAssignment);
      if(showBannerForExisting||isNew)ensureAlert(count);
      if(count===0)ensureAlert(0);
      lastPendingCount=count;lastLatestAssignment=latest;
    }catch(e){
      // Session expiration is handled by the dedicated session watcher.
    }finally{
      noticeChecking=false;
    }
  }

  async function renderMemos(includeAcknowledged){
    const host=document.getElementById("memo-list"),t=token();
    if(!host||!t||rendering)return;
    rendering=true;
    try{
      const rows=await rpc("get_my_memos",{p_session_token:t,p_include_acknowledged:!!includeAcknowledged});
      if(!rows?.length){host.innerHTML='<div class="empty">No memos found.</div>';return;}
      host.innerHTML=rows.map(m=>`<article class="memo-card" data-memo-assignment="${esc(m.assignment_id)}">
        <span class="status-pill">${m.acknowledged_at?"Acknowledged":"Pending"}</span>
        <h3>${esc(m.memo_title||m.category_name||"Memo")}</h3>
        <div class="details">${esc(m.category_name||"")} · ${new Date(m.assigned_at||m.created_at).toLocaleString()}${m.created_by_employee_name?` · From ${esc(m.created_by_employee_name)}`:""}</div>
        <p>${esc(m.memo_body||"")}</p>
        ${m.acknowledged_at?`<div class="details"><strong>Acknowledged:</strong> ${new Date(m.acknowledged_at).toLocaleString()}</div>${m.acknowledgment_comments?`<div class="details"><strong>Your comments:</strong> ${esc(m.acknowledgment_comments)}</div>`:""}`:`<div class="memo-ack-box"><label><strong>Acknowledgment comments</strong> <span class="details">(optional)</span></label><textarea data-ack-comment placeholder="Optional comments"></textarea><button type="button" data-acknowledge="${esc(m.assignment_id)}">Acknowledge Memo</button></div>`}
      </article>`).join("");
      host.querySelectorAll("[data-acknowledge]").forEach(b=>b.addEventListener("click",()=>acknowledge(b.dataset.acknowledge,b.closest(".memo-card"))));
    }catch(e){host.innerHTML=`<div class="msg" data-type="error">${esc(e.message)}</div>`;}
    finally{rendering=false;}
  }

  async function acknowledge(assignmentId,card){
    const button=card?.querySelector("[data-acknowledge]");if(button)button.disabled=true;
    try{
      const comment=card?.querySelector("[data-ack-comment]")?.value.trim()||null;
      await rpc("acknowledge_my_memo",{p_session_token:token(),p_memo_assignment_id:assignmentId,p_acknowledgment_comments:comment});
      await checkNotice(false);
      const includeAcknowledged=document.getElementById("memos-all")?.classList.contains("active")||false;
      await renderMemos(includeAcknowledged);
      const dashboard=document.getElementById("view-dashboard");if(dashboard&&!dashboard.hidden){document.getElementById("performance-period")?.dispatchEvent(new Event("change"));}
    }catch(e){alert(e.message);}finally{if(button&&document.body.contains(button))button.disabled=false;}
  }

  function wireMemos(){
    const pending=document.getElementById("memos-pending"),all=document.getElementById("memos-all"),nav=memoNavButton();
    pending?.addEventListener("click",()=>{pending.classList.add("active");all?.classList.remove("active");setTimeout(()=>renderMemos(false),0);});
    all?.addEventListener("click",()=>{all.classList.add("active");pending?.classList.remove("active");setTimeout(()=>renderMemos(true),0);});
    nav?.addEventListener("click",()=>setTimeout(()=>renderMemos(false),0));
  }

  function startPolling(){
    if(pollTimer)clearInterval(pollTimer);
    checkNotice(true);
    pollTimer=setInterval(()=>{if(!document.hidden)checkNotice(false);},120000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkNotice(false);});
  }

  function init(){addStyles();wireMemos();startPolling();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
