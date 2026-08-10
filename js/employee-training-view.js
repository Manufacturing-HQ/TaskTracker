"use strict";

(() => {
  const nav = document.querySelector(".nav");
  const main = document.querySelector("main.main");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");
  if (!nav || !main || !pageTitle || !pageSubtitle) return;
  if (document.getElementById("employee-training-nav")) return;

  const trainingButton = document.createElement("button");
  trainingButton.id = "employee-training-nav";
  trainingButton.type = "button";
  trainingButton.textContent = "Training";
  nav.appendChild(trainingButton);

  const trainingView = document.createElement("section");
  trainingView.id = "view-training";
  trainingView.hidden = true;
  trainingView.innerHTML = '<div class="iframe-wrap"><iframe id="training-frame" data-src="training.html" title="Employee Training"></iframe></div>';
  main.appendChild(trainingView);

  const trainingFrame = document.getElementById("training-frame");

  function ensureTrainingFrame() {
    if (!trainingFrame.getAttribute("src")) {
      trainingFrame.setAttribute("src", trainingFrame.dataset.src || "training.html");
    }
  }

  function closeTraining() {
    trainingView.hidden = true;
    trainingButton.classList.remove("active");
  }

  trainingButton.addEventListener("click", () => {
    document.querySelectorAll(".nav button").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll('main.main > section[id^="view-"]').forEach((section) => {
      section.hidden = true;
    });
    trainingButton.classList.add("active");
    trainingView.hidden = false;
    pageTitle.textContent = "Training";
    pageSubtitle.textContent = "View your assigned training plan, checklist progress, and trainer comments.";
    ensureTrainingFrame();
  });

  document.querySelectorAll('.nav button[data-view]').forEach((button) => {
    button.addEventListener("click", closeTraining);
  });

  document.getElementById("sign-out")?.addEventListener("click", () => {
    trainingFrame.removeAttribute("src");
  });
})();
