"use strict";

(() => {
  const departments=["Shipping","Build Line","Solid Keys","Quality Assurance","Inventory","System Testing","Director"];

  function replaceDepartmentInput(){
    const input=document.getElementById("oe-dept");
    if(!input || input.tagName==="SELECT") return;
    const select=document.createElement("select");
    select.id="oe-dept";
    select.required=true;
    select.innerHTML='<option value="">Select Department</option>'+departments.map(d=>`<option value="${d.replace(/"/g,"&quot;")}">${d}</option>`).join("");
    if(input.value && departments.includes(input.value)) select.value=input.value;
    input.replaceWith(select);
  }

  const observer=new MutationObserver(()=>replaceDepartmentInput());
  observer.observe(document.body,{childList:true,subtree:true});
  replaceDepartmentInput();
})();
