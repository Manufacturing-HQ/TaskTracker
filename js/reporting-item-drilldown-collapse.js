"use strict";

/* Keeps Item Reporting drill-downs contained and easy to collapse. */
(() => {
  const tableWrap = document.getElementById("table");
  if (!tableWrap) return;

  const style = document.createElement("style");
  style.id = "item-drilldown-collapse-style";
  style.textContent = `
    .item-drilldown-panel > .table-wrap{max-height:min(58vh,620px);overflow:auto}
    .item-collapse-jobs{white-space:nowrap}
    @media(max-width:700px){.item-drilldown-panel > .table-wrap{max-height:52vh}}
  `;
  document.head.appendChild(style);

  function enhancePanel(panel) {
    if (!panel || panel.querySelector(".item-collapse-jobs")) return;
    const head = panel.querySelector(".item-drilldown-head");
    if (!head) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary item-collapse-jobs";
    button.textContent = "Collapse Jobs";

    const actions = head.querySelector(".item-job-column-actions");
    if (actions) actions.appendChild(button);
    else head.appendChild(button);
  }

  function enhanceAll() {
    tableWrap.querySelectorAll(".item-drilldown-panel").forEach(enhancePanel);
  }

  tableWrap.addEventListener("click", (event) => {
    const button = event.target.closest?.(".item-collapse-jobs");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const detailRow = button.closest("tr.item-report-drilldown-row");
    const summaryRow = detailRow?.previousElementSibling;
    if (!detailRow) return;

    summaryRow?.classList.remove("item-report-expanded");
    detailRow.remove();
    summaryRow?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  const observer = new MutationObserver((mutations) => {
    const added = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.(".item-drilldown-panel,.item-job-column-actions")
        || Boolean(node.querySelector?.(".item-drilldown-panel,.item-job-column-actions"));
    }));
    if (added) setTimeout(enhanceAll, 0);
  });
  observer.observe(tableWrap, { childList: true, subtree: true });

  setTimeout(enhanceAll, 800);
})();
