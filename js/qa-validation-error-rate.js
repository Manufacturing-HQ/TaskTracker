"use strict";

(() => {
  const form = document.getElementById("review-form");
  const reviewCard = document.getElementById("review-card");
  const pass = document.getElementById("qty-pass");
  const reject = document.getElementById("qty-reject");
  const errorsHost = document.getElementById("errors");
  if (!form || !reviewCard || !pass || !reject || !errorsHost) return;

  const rateBox = document.createElement("div");
  rateBox.id = "qa-error-rate-live";
  rateBox.style.cssText = "margin-top:12px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-weight:800";
  errorsHost.insertAdjacentElement("afterend", rateBox);

  const totalBox = document.createElement("div");
  totalBox.id = "qa-quantity-total-live";
  totalBox.style.cssText = "grid-column:1/-1;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1;font-size:13px;font-weight:800";
  const grid = form.querySelector(".grid");
  if (grid) grid.appendChild(totalBox);

  let jobQty = null;
  let syncing = false;

  function parseJobQty() {
    const text = document.getElementById("review-summary")?.textContent || "";
    const match = text.match(/\bQty\s+([0-9]+(?:\.[0-9]+)?)/i);
    jobQty = match ? Number(match[1]) : null;
    return jobQty;
  }

  function n(el) {
    const value = Number(el.value);
    return Number.isFinite(value) ? value : 0;
  }

  function updateTotals() {
    if (!Number.isFinite(jobQty)) parseJobQty();
    const total = n(pass) + n(reject);
    const ok = Number.isFinite(jobQty) && Math.abs(total - jobQty) < 0.000001;
    totalBox.textContent = Number.isFinite(jobQty)
      ? `Passed + Rejected: ${total} of ${jobQty}${ok ? " ✓" : " — must equal job quantity"}`
      : `Passed + Rejected: ${total}`;
    totalBox.style.background = ok ? "#ecfdf5" : "#fff7ed";
    totalBox.style.color = ok ? "#166534" : "#9a3412";
  }

  function updateErrorRate() {
    if (!Number.isFinite(jobQty)) parseJobQty();
    const errorQty = Array.from(errorsHost.querySelectorAll("input[data-error-type-id]"))
      .reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
    const rate = Number.isFinite(jobQty) && jobQty > 0 ? (errorQty / jobQty) * 100 : 0;
    rateBox.textContent = `Error Rate: ${rate.toFixed(2)}% · Error Detail Qty ${errorQty} / Job Qty ${Number.isFinite(jobQty) ? jobQty : "—"}`;
  }

  function rebalanceFromPass() {
    if (syncing || !Number.isFinite(jobQty)) return;
    syncing = true;
    const p = Math.min(Math.max(n(pass), 0), jobQty);
    pass.value = String(p);
    reject.value = String(Math.max(0, jobQty - p));
    syncing = false;
    updateTotals();
  }

  function rebalanceFromReject() {
    if (syncing || !Number.isFinite(jobQty)) return;
    syncing = true;
    const r = Math.min(Math.max(n(reject), 0), jobQty);
    reject.value = String(r);
    pass.value = String(Math.max(0, jobQty - r));
    syncing = false;
    updateTotals();
  }

  function initializeReview() {
    parseJobQty();
    if (Number.isFinite(jobQty) && !reviewCard.hidden) {
      pass.max = String(jobQty);
      reject.max = String(jobQty);
      if (pass.value === "" && reject.value === "") {
        pass.value = String(jobQty);
        reject.value = "0";
      } else {
        rebalanceFromPass();
      }
    }
    updateTotals();
    updateErrorRate();
  }

  pass.addEventListener("input", rebalanceFromPass);
  reject.addEventListener("input", rebalanceFromReject);
  errorsHost.addEventListener("input", updateErrorRate);

  form.addEventListener("submit", (event) => {
    parseJobQty();
    const total = n(pass) + n(reject);
    if (Number.isFinite(jobQty) && Math.abs(total - jobQty) >= 0.000001) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const message = document.getElementById("message");
      if (message) {
        message.textContent = `Quantity Passed plus Quantity Rejected must equal the Job quantity of ${jobQty}. Current total: ${total}.`;
        message.dataset.type = "error";
        message.hidden = false;
      }
    }
  }, true);

  new MutationObserver(initializeReview).observe(reviewCard, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(updateErrorRate).observe(errorsHost, { childList: true, subtree: true });
  initializeReview();
})();
