"use strict";

(() => {
  const form=document.getElementById("review-form"),reviewCard=document.getElementById("review-card"),summary=document.getElementById("review-summary"),pass=document.getElementById("qty-pass"),reject=document.getElementById("qty-reject"),errorsHost=document.getElementById("errors");
  if(!form||!reviewCard||!summary||!pass||!reject||!errorsHost)return;

  const rateBox=document.createElement("div");
  rateBox.id="qa-error-rate-live";
  rateBox.style.cssText="margin-top:12px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-weight:800";
  errorsHost.insertAdjacentElement("afterend",rateBox);

  const totalBox=document.createElement("div");
  totalBox.id="qa-quantity-total-live";
  totalBox.style.cssText="grid-column:1/-1;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1;font-size:13px;font-weight:800";
  form.querySelector(".grid")?.appendChild(totalBox);

  let syncing=false,refreshQueued=false;
  const n=el=>Number.isFinite(Number(el.value))?Number(el.value):0;
  function jobQty(){const m=(summary.textContent||"").match(/\bQty\s+([0-9]+(?:\.[0-9]+)?)/i);return m?Number(m[1]):null;}

  function updateTotals(){
    const qty=jobQty(),total=n(pass)+n(reject),ok=Number.isFinite(qty)&&Math.abs(total-qty)<0.000001;
    totalBox.textContent=Number.isFinite(qty)?`Passed + Rejected: ${total} of ${qty}${ok?" ✓":" — must equal job quantity"}`:`Passed + Rejected: ${total}`;
    totalBox.style.background=ok?"#ecfdf5":"#fff7ed";
    totalBox.style.color=ok?"#166534":"#9a3412";
  }

  function updateErrorRate(){
    const qty=jobQty();
    const errorQty=Array.from(errorsHost.querySelectorAll("input[data-error-type-id]")).reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0);
    const rate=Number.isFinite(qty)&&qty>0?Math.min(100,(errorQty/qty)*100):0;
    rateBox.textContent=`Error Rate: ${rate.toFixed(2)}% · Error Detail Qty ${errorQty} / Job Qty ${Number.isFinite(qty)?qty:"—"}`;
  }

  function rebalance(source){
    if(syncing)return;
    const qty=jobQty(); if(!Number.isFinite(qty))return;
    syncing=true;
    if(source==="pass"){const p=Math.min(Math.max(n(pass),0),qty);pass.value=String(p);reject.value=String(Math.max(0,qty-p));}
    else {const r=Math.min(Math.max(n(reject),0),qty);reject.value=String(r);pass.value=String(Math.max(0,qty-r));}
    syncing=false; updateTotals();
  }

  function refresh(){
    refreshQueued=false;
    const qty=jobQty();
    if(Number.isFinite(qty)&&!reviewCard.hidden){pass.max=String(qty);reject.max=String(qty);}
    updateTotals();updateErrorRate();
  }
  function queueRefresh(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>requestAnimationFrame(refresh));}

  pass.addEventListener("input",()=>rebalance("pass"));
  reject.addEventListener("input",()=>rebalance("reject"));
  errorsHost.addEventListener("input",updateErrorRate);
  new MutationObserver(queueRefresh).observe(summary,{childList:true,subtree:true,characterData:true});
  new MutationObserver(queueRefresh).observe(reviewCard,{attributes:true,attributeFilter:["hidden"]});

  form.addEventListener("submit",event=>{
    const qty=jobQty(),total=n(pass)+n(reject);
    if(Number.isFinite(qty)&&Math.abs(total-qty)>=0.000001){
      event.preventDefault();event.stopImmediatePropagation();
      const m=document.getElementById("message");if(m){m.textContent=`Quantity Passed plus Quantity Rejected must equal the Job quantity of ${qty}. Current total: ${total}.`;m.dataset.type="error";m.hidden=false;}
    }
  },true);

  queueRefresh();
})();
