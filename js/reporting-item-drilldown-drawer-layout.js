"use strict";

/* Final Item Reporting drill-down layout: keep the report table untouched and float job detail as a drawer. */
(() => {
  if (document.getElementById("item-report-drawer-layout-style")) return;

  const style = document.createElement("style");
  style.id = "item-report-drawer-layout-style";
  style.textContent = `
    #table.item-report-split-open{
      display:block!important;
      overflow:auto!important;
      border:1px solid #e2e8f0!important;
      border-radius:12px!important;
      background:#fff!important;
    }

    #table.item-report-split-open > table{
      width:100%!important;
      align-self:auto!important;
      border:0!important;
      border-radius:0!important;
      background:#fff!important;
      overflow:visible!important;
    }

    #table > .item-report-side-panel{
      position:fixed!important;
      right:18px!important;
      top:84px!important;
      width:min(680px,44vw)!important;
      min-width:520px!important;
      max-height:calc(100vh - 102px)!important;
      overflow:hidden!important;
      z-index:5000!important;
      margin:0!important;
      border:1px solid #93c5fd!important;
      border-radius:14px!important;
      background:#fff!important;
      padding:14px!important;
      box-shadow:0 24px 70px rgba(15,23,42,.24)!important;
    }

    #table > .item-report-side-panel > .table-wrap{
      max-height:calc(100vh - 240px)!important;
      overflow:auto!important;
    }

    #table.item-report-split-open tr.item-report-summary-row.item-report-expanded td{
      background:#eff6ff!important;
    }

    @media(max-width:1100px){
      #table > .item-report-side-panel{
        right:12px!important;
        top:72px!important;
        width:calc(100vw - 24px)!important;
        min-width:0!important;
        max-height:calc(100vh - 84px)!important;
      }
      #table > .item-report-side-panel > .table-wrap{
        max-height:calc(100vh - 220px)!important;
      }
    }
  `;

  document.head.appendChild(style);
})();
