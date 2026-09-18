"use strict";

(() => {
  const config=window.TaskTrackerConfig;
  const supabaseLib=window.supabase;
  if(!config||!supabaseLib) return;

  const client=supabaseLib.createClient(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
  const token=sessionStorage.getItem(config.sessionStorageKey);
  const app=document.getElementById("app");
  const message=document.getElementById("message");

  async function init(){
    if(!token){
      window.location.replace("index.html");
      return;
    }
    const {data,error}=await client.rpc("get_inventory_team_access",{p_session_token:token});
    if(error||!data?.can_view){
      message.textContent=error?.message||"You do not have access to the Inventory Team Dashboard.";
      message.hidden=false;
      return;
    }
    app.hidden=false;
  }

  init();
})();
