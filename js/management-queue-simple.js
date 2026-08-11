"use strict";

(() => {
  const queueList = document.getElementById("queue-list");
  if (!queueList) return;

  function simplify() {
    queueList.querySelectorAll(".task-card .actions").forEach((actions) => {
      actions.querySelectorAll("button").forEach((button) => {
        const label = (button.textContent || "").trim().toLowerCase();
        if (label === "start") {
          button.remove();
          return;
        }
        if (label === "complete" && button.style.marginLeft !== "0px") {
          button.style.marginLeft = "0px";
        }
      });
    });
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      simplify();
    });
  });

  observer.observe(queueList,{childList:true,subtree:true});
  simplify();
})();
