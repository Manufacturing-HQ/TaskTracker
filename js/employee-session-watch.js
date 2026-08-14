"use strict";

(() => {
  const config=window.TaskTrackerConfig,supabaseLib=window.supabase;
  if(!config||!supabaseLib)return;
  const sessionKey=config.sessionStorageKey;
  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  let timer=null,expiryMs=null,checking=false,lastActivity=Date.now(),tokenWatch=null;

  const style=document.createElement("style");
  style.textContent=`.session-expired-overlay{position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.78);display:grid;place-items:center;padding:20px}.session-expired-card{width:min(520px,96vw);background:#fff;border:3px solid #991b1b;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center}.session-expired-card h2{margin:0 0 10px;font-size:26px}.session-expired-card p{margin:0 0 18px;color:#475569}.session-expired-card button{border:0;border-radius:10px;padding:12px 18px;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer}`;
  document.head.appendChild(style);

  function showExpired(){
    if(document.getElementById("session-expired-overlay"))return;
    document.querySelectorAll("button, input, select, textarea").forEach(el=>{if(!el.closest("#session-expired-overlay"))el.disabled=true;});
    const o=document.createElement("div");o.id="session-expired-overlay";o.className="session-expired-overlay";
    o.innerHTML='<div class="session-expired-card"><h2>Session Expired</h2><p>Your Task Tracker session has ended. Sign back in to continue working with your current task.</p><button type="button">Sign Back In</button></div>';
    o.querySelector("button").onclick=()=>{sessionStorage.removeItem(sessionKey);window.top.location.href="employee.html";};
    document.body.appendChild(o);
  }

  function schedule(){
    if(timer)clearTimeout(timer);
    if(!Number.isFinite(expiryMs))return;
    const delay=Math.max(0,expiryMs-Date.now());
    timer=setTimeout(showExpired,delay);
  }

  async function refreshSession(){
    const token=sessionStorage.getItem(sessionKey);if(!token||checking)return;
    checking=true;
    try{
      const {data,error}=await client.rpc("get_employee_session_context",{p_session_token:token});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      if(!row?.expires_at)throw new Error("Session expired");
      expiryMs=new Date(row.expires_at).getTime();schedule();
    }catch{showExpired();}
    finally{checking=false;}
  }

  function noteActivity(){
    const now=Date.now();
    if(!Number.isFinite(expiryMs)){
      lastActivity=now;
      refreshSession();
      return;
    }
    if(now-lastActivity<60000)return;
    lastActivity=now;
    refreshSession();
  }

  function watchForLogin(){
    if(sessionStorage.getItem(sessionKey)){refreshSession();return;}
    tokenWatch=setInterval(()=>{
      if(!sessionStorage.getItem(sessionKey))return;
      clearInterval(tokenWatch);tokenWatch=null;
      lastActivity=Date.now();
      refreshSession();
    },500);
  }

  ["click","keydown","pointerdown","touchstart"].forEach(evt=>document.addEventListener(evt,noteActivity,{passive:true,capture:true}));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshSession();});
  window.addEventListener("focus",refreshSession);
  watchForLogin();
})();

(() => {
  if (document.querySelector('script[data-employee-memo-actions="true"]')) return;
  const script = document.createElement("script");
  script.src = "js/employee-memo-actions.js";
  script.dataset.employeeMemoActions = "true";
  document.body.appendChild(script);
})();
