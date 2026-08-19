"use strict";

(() => {
  const allowedDepartments = [
    "Shipping",
    "Build Line",
    "Solid Keys",
    "Quality Assurance",
    "Inventory",
    "System Testing",
    "Director",
    "CKE",
    "Receiving"
  ];

  function normalizeDepartmentField(form) {
    let field = form?.querySelector("#oe-dept");
    if (!field) return;

    const currentValue = field.value || "";

    if (field.tagName !== "SELECT") {
      const select = document.createElement("select");
      select.id = field.id;
      select.name = field.name || "";
      select.required = true;
      field.replaceWith(select);
      field = select;
    }

    const values = [...new Set([...allowedDepartments, currentValue].filter(Boolean))];
    field.replaceChildren(new Option("Select Department", ""));
    values.forEach((department) => field.add(new Option(department, department)));
    field.value = currentValue;
  }

  function hideExemptControl(form) {
    const exempt = form?.querySelector("#oe-exempt");
    const label = exempt?.closest("label");
    if (!label) return;

    // Keep the existing value in the DOM so editing an already-exempt employee
    // does not silently change backend state. This only removes the control from
    // the management UI while the approach is reconsidered.
    label.hidden = true;
    label.setAttribute("aria-hidden", "true");
  }

  function normalizeEmployeeForm() {
    const form = document.getElementById("ops-employee-form");
    if (!form) return;
    normalizeDepartmentField(form);
    hideExemptControl(form);
  }

  const observer = new MutationObserver(normalizeEmployeeForm);
  observer.observe(document.body, { childList: true, subtree: true });
  normalizeEmployeeForm();
})();
