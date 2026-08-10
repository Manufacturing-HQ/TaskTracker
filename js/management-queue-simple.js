"use strict";

(() => {
  const queueList = document.getElementById("queue-list");
  if (!queueList) return;

  function simplify() {
    queueList.querySelectorAll(".task-card .actions").forEach((actions) => {
      actions.querySelectorAll("button").forEach((button) => {
        const label = (button.textContent || "").trim().toLowerCase();
        if (label === "start") button.remove();
        if (label === "complete") {
          button.textContent = "Complete";
          button.style.marginLeft = "0";
        }
      });
    });
  }

  new MutationObserver(simplify).observe(queueList,{childList:true,subtree:true});
  simplify();
})();
