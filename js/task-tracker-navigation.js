"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    }
  );

  const sessionKey = config.sessionStorageKey;
  const collapseKey = "task_tracker_shared_nav_collapsed";
  const currentPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const sectionDefinitions = {
    operations: {
      label: "Operations",
      href: "management.html#attendance",
      pages: ["management.html","attendance.html","change-log.html","reporting.html"],
      children: [
        ["Attendance Audit","management.html#attendance"],
        ["Task Tracker Audit","management.html#audit"],
        ["Memos","management.html#memos"],
        ["Attendance / Employee Summary","attendance.html"],
        ["Change Log","change-log.html"],
        ["Reporting","reporting.html"]
      ]
    },
    employees_setup: {
      label: "Employees & Setup",
      href: "management.html#employees",
      pages: [],
      children: [
        ["Employees","management.html#employees"],
        ["Items","management.html#items"],
        ["BOM","management.html#boms"],
        ["Item / Cycle Time Import","management.html#item-import"],
        ["BOM Import","management.html#bom-import"]
      ]
    },
    project_dashboard: {
      label: "Project Dashboard",
      href: "work-hub.html#routines",
      pages: ["work-hub.html","weekly-reviews.html"],
      children: [
        ["Daily & Weekly","work-hub.html#routines"],
        ["Projects","work-hub.html#projects"],
        ["Task Queue","work-hub.html#queue"],
        ["Weekly Reviews","weekly-reviews.html"]
      ]
    },
    item_change_log: {
      label: "Item Change Log",
      href: "item-changes.html",
      pages: ["item-changes.html"],
      children: []
    },
    history: {
      label: "History",
      href: "history.html#employee",
      pages: ["history.html"],
      children: [
        ["Employee History","history.html#employee"],
        ["QA History","history.html#qa"]
      ]
    },
    quality_training: {
      label: "Quality & Training",
      href: "qa.html",
      pages: ["qa.html","training.html","qa-reporting.html"],
      children: [
        ["Pending QA","qa.html"],
        ["Training","training.html"],
        ["QA Reporting","qa-reporting.html"]
      ]
    },
    shipping_team: {
      label: "Shipping Team",
      href: "sales-order-dashboard.html",
      pages: ["sales-order-dashboard.html","pps-operations.html"],
      children: [
        ["Sales Order Dashboard","sales-order-dashboard.html",{permission:"sales_order_dashboard.view"}],
        ["Pick Batches","pps-operations.html#pick",{permission:"pps.pick_batch.create"}],
        ["PPS QA Queue","pps-operations.html#qa",{permission:"pps.qa.process"}],
        ["Cosmetic Rejections","pps-operations.html#cosmetic",{permission:"pps.cosmetic.manage"}],
        ["PPS Reporting","pps-operations.html#reporting",{permission:"pps.reporting.view"}]
      ]
    },
    inventory_team: {
      label: "Inventory Team",
      href: "inventory-team.html",
      pages: ["inventory-team.html","stage-work-orders.html","work-order-history.html","fgi-put-away.html","demand-planning.html","work-order-prioritization.html","daily-review.html","netsuite-data.html"],
      children: [
        ["Inventory Team Dashboard","inventory-team.html",{permission:"inventory_dashboard.view"}],
        ["Demand Planning","demand-planning.html",{permission:"demand_planning.view"}],
        ["W/O Prioritization","work-order-prioritization.html",{permission:"work_order_prioritization.use"}],
        ["Daily Review","daily-review.html",{adminOnly:true}],
        ["NetSuite Data","netsuite-data.html",{adminOnly:true}]
      ]
    }
  };

  function injectStyles() {
    if (document.getElementById("tt-shared-nav-style")) return;
    const style = document.createElement("style");
    style.id = "tt-shared-nav-style";
    style.textContent = `
      .tt-shared-nav{display:grid;gap:7px;margin:0}
      .tt-shared-nav a,.tt-nav-main-button{display:flex;align-items:center;gap:9px;width:100%;border:1px solid transparent;background:transparent;color:#cbd5e1;text-align:left;padding:11px 12px;border-radius:10px;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}
      .tt-shared-nav a:hover,.tt-shared-nav a.active,.tt-nav-main-button:hover,.tt-nav-main-button.active{background:#17233c;color:#fff;border-color:#334155}
      .tt-nav-home-note{display:block;margin:-3px 11px 5px;color:#94a3b8;font-size:10px;line-height:1.2}
      .tt-nav-section{display:grid;gap:4px}
      .tt-nav-sub{display:grid;gap:3px;padding-left:12px;margin-top:-2px}
      .tt-nav-sub[hidden]{display:none!important}
      .tt-nav-sub a{padding:8px 10px;font-size:12px;font-weight:700;border-left:2px solid #334155;border-radius:7px}
      .tt-nav-sub a.active{border-left-color:#60a5fa;background:#17233c}
      .tt-nav-collapse{margin:0 0 12px;width:100%;border:1px solid #475569;background:transparent;color:#cbd5e1;border-radius:9px;padding:8px 10px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      .tt-nav-collapse:hover{background:#17233c;color:#fff}
      .tt-nav-legacy-hidden{display:none!important}
      .tt-nav-host .brand{position:relative}
      .tt-generated-shell{min-height:100vh;display:grid;grid-template-columns:245px minmax(0,1fr);background:var(--bg,#e8eef5)}
      .tt-generated-shell>.side{min-height:100vh}
      .tt-generated-side{background:#0b1220;color:#fff;padding:20px 16px;display:flex;flex-direction:column}
      .tt-generated-content{min-width:0}
      .tt-generated-content>.shell{max-width:none!important;margin:0!important}
      .tt-nav-legacy-top-link{display:none!important}
      .tt-generated-side .brand{display:flex;gap:10px;align-items:center;padding:4px 8px 20px}
      .tt-generated-side .mark{width:42px;height:42px;border-radius:12px;background:#2563eb;display:grid;place-items:center;font-weight:900;color:#fff}
      .tt-generated-side .side-footer{margin-top:auto}
      .tt-generated-side .who{background:rgba(255,255,255,.06);border:1px solid #334155;border-radius:12px;padding:12px}
      .tt-generated-side .who strong,.tt-generated-side .who span{display:block}
      .tt-generated-side .who span{font-size:12px;color:#94a3b8;margin-top:4px}
      .tt-generated-side .side-footer button{width:100%;margin-top:10px;background:transparent;color:white;border:1px solid #475569;border-radius:9px;padding:10px}
      .tt-nav-collapsed .side{padding-left:10px;padding-right:10px}
      .tt-nav-collapsed .tt-shared-nav a,.tt-nav-collapsed .tt-nav-main-button{justify-content:center;padding-left:7px;padding-right:7px;font-size:0}
      .tt-nav-collapsed .tt-shared-nav a::before,.tt-nav-collapsed .tt-nav-main-button::before{content:attr(data-short);font-size:12px;font-weight:900}
      .tt-nav-collapsed .tt-nav-sub,.tt-nav-collapsed .tt-nav-home-note{display:none}
      .tt-nav-collapsed .brand>div:last-child{display:none}
      .tt-nav-collapsed .brand{justify-content:center;padding-left:0;padding-right:0}
      .tt-nav-collapsed .tt-nav-collapse{font-size:0;padding:8px 4px}
      .tt-nav-collapsed .tt-nav-collapse::before{content:"»";font-size:16px}
      .tt-nav-collapsed .side-footer .who{display:none}
      @media(min-width:901px){
        .app.tt-nav-collapsed{grid-template-columns:76px minmax(0,1fr)!important}
        .tt-generated-shell.tt-nav-collapsed{grid-template-columns:76px minmax(0,1fr)!important}
      }
      @media(max-width:900px){
        .tt-generated-shell{grid-template-columns:1fr}
        .tt-generated-shell>.side{min-height:auto}
        .tt-generated-content>.shell{padding-top:18px!important}

        .tt-nav-collapse{display:none}
        .tt-nav-collapsed .tt-shared-nav a,.tt-nav-collapsed .tt-nav-main-button{justify-content:flex-start;padding:11px 12px;font-size:inherit}
        .tt-nav-collapsed .tt-shared-nav a::before,.tt-nav-collapsed .tt-nav-main-button::before{content:none}
        .tt-nav-collapsed .tt-nav-sub,.tt-nav-collapsed .tt-nav-home-note{display:grid}
        .tt-nav-collapsed .brand>div:last-child{display:block}
        .tt-nav-collapsed .side-footer .who{display:block}
      }
    `;
    document.head.appendChild(style);
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function isHrefActive(href) {
    const [path, hash = ""] = String(href || "").split("#");
    const page = (path.split("/").pop() || currentPage).toLowerCase();
    if (page !== currentPage) return false;
    const currentHash = String(location.hash || "").replace(/^#/,"").toLowerCase();
    if (currentPage === "pps-operations.html" && hash.toLowerCase() === "pick" && !currentHash) return true;
    if (!hash) return !location.hash;
    return currentHash === hash.toLowerCase();
  }

  function shortLabel(label) {
    const words = String(label || "").split(/\s+/).filter(Boolean);
    if (!words.length) return "•";
    if (words.length === 1) return words[0].slice(0,2).toUpperCase();
    return words.slice(0,2).map((word) => word[0]).join("").toUpperCase();
  }

  function createLink(label, href, active = false) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.dataset.short = shortLabel(label);
    if (active) link.classList.add("active");
    return link;
  }

  function currentSectionKey() {
    if (currentPage === "management.html") {
      const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();
      if (!hash || hash === "home") return null;
      if (["attendance","audit","memos","overview","operations"].includes(hash)) return "operations";
      if (["employees","items","boms","item-import","bom-import","setup"].includes(hash)) return "employees_setup";
    }
    for (const [key, definition] of Object.entries(sectionDefinitions)) {
      if (definition.pages.includes(currentPage)) return key;
    }
    return null;
  }

  function isHomeActive(bootstrap) {
    const homePath = String(bootstrap?.home?.href || "index.html").split("#")[0].toLowerCase();
    if (homePath === "employee.html" && currentPage === "weekly-reviews.html") return true;
    if (currentPage !== homePath) return false;
    if (currentPage === "management.html") {
      const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();
      return !hash || hash === "home";
    }
    return true;
  }

  function homeChildren(bootstrap) {
    const homePath = String(bootstrap?.home?.href || "index.html").split("#")[0].toLowerCase();
    if (homePath !== "employee.html") return [];
    return [
      ["Start / Current Task","employee.html#task"],
      ["My Dashboard","employee.html#dashboard"],
      ["Memos","employee.html#memos"],
      ["Weekly Reviews","weekly-reviews.html"]
    ];
  }

  function visibleChildren(key, definition, bootstrap) {
    const role = bootstrap?.viewer?.role || "";
    const permissions = bootstrap?.permissions || {};
    return (definition.children || []).filter((entry) => {
      const options = entry[2] || {};
      if (options.permission && !permissions[options.permission]) return false;
      return !options.adminOnly || role === "Administrator";
    });
  }

  function sectionVisible(key, sections, bootstrap) {
    if (sections[key]?.visible) return true;
    if (key === "employees_setup") return !!sections.operations?.visible;
    return key === "shipping_team" && bootstrap?.viewer?.role === "Administrator";
  }

  function keepTransitionSubnavExpanded(key, bootstrap) {
    return currentPage === "management.html"
      && bootstrap?.viewer?.role === "Administrator"
      && ["shipping_team","inventory_team"].includes(key);
  }

  function applyManagementHash() {
    if (currentPage !== "management.html") return;
    const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();

    if (!hash || hash === "home") {
      document.querySelector('button[data-view="home"]')?.click();
      return;
    }

    const setupMap = {
      "employees":"employees",
      "items":"items",
      "boms":"boms",
      "item-import":"import",
      "bom-import":"bom-import",
      "setup":"employees"
    };

    if (setupMap[hash]) {
      document.querySelector('button[data-view="overview"]')?.click();
      let tries = 0;
      const openSetup = () => {
        tries += 1;
        document.querySelector('[data-hub-tab="setup"]')?.click();
        const targetTab = document.querySelector(`#ops-master [data-ops-tab="${setupMap[hash]}"]`);
        if (targetTab) {
          targetTab.click();
          document.getElementById("ops-master")?.scrollIntoView({behavior:"auto",block:"start"});
          return;
        }
        if (tries < 24) window.setTimeout(openSetup,100);
      };
      window.setTimeout(openSetup,120);
      return;
    }

    if (!["attendance","audit","memos","overview","operations"].includes(hash)) return;

    document.querySelector('button[data-view="overview"]')?.click();

    let tries = 0;
    const focusTarget = () => {
      tries += 1;
      document.querySelector('[data-hub-tab="daily"]')?.click();

      const target = hash === "audit"
        ? document.getElementById("view-audit")
        : hash === "memos"
          ? document.getElementById("management-memos-panel")
          : hash === "attendance"
            ? document.getElementById("view-attendance")
            : document.getElementById("ops-hub");

      if (target) {
        target.scrollIntoView({behavior:"auto",block:"start"});
        return;
      }
      if (tries < 18) window.setTimeout(focusTarget,100);
    };
    window.setTimeout(focusTarget,120);
  }

  function applyEmployeeHash() {
    if (currentPage !== "employee.html") return;
    const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();
    const view = ["task","dashboard","memos"].includes(hash) ? hash : "task";
    const button = document.querySelector(`.nav button[data-view="${view}"]`);
    if (button) window.setTimeout(() => button.click(),0);
  }

  function applyPpsHash() {
    if (currentPage !== "pps-operations.html") return;
    const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();
    const tab = ["pick","qa","cosmetic","reporting"].includes(hash) ? hash : "pick";
    const button = document.querySelector(`[data-tab="${tab}"]`);
    if (button && !button.hidden) window.setTimeout(() => button.click(),0);
  }

  function applyHistoryHash() {
    if (currentPage !== "history.html") return;
    const hash = String(location.hash || "").replace(/^#/,"").toLowerCase();
    const id = hash === "qa" ? "qa-view-btn" : hash === "employee" ? "employee-view-btn" : null;
    if (!id) return;
    const button = document.getElementById(id);
    if (button) window.setTimeout(() => button.click(), 0);
  }

  function ensureNavigationHost(bootstrap) {
    let side = document.querySelector("aside.side");
    let app = document.getElementById("app");
    if (!app) return null;
    if (side) return { side, app, shell: app };

    const pageShell = app.closest(".shell");
    if (!pageShell || pageShell.dataset.ttNavWrapped === "1") {
      const existing = document.querySelector(".tt-generated-shell");
      const existingSide = existing?.querySelector(":scope > aside.side");
      return existingSide ? { side: existingSide, app, shell: existing } : null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "tt-generated-shell";
    pageShell.parentNode.insertBefore(wrapper,pageShell);

    side = document.createElement("aside");
    side.className = "side tt-generated-side";
    side.innerHTML = `
      <div class="brand">
        <div class="mark">TT</div>
        <div><strong>Task Tracker</strong><div style="font-size:12px;color:#94a3b8">Workspace</div></div>
      </div>
      <div class="side-footer">
        <div class="who">
          <strong>${esc(bootstrap?.viewer?.employee_name || "")}</strong>
          <span>${esc([bootstrap?.viewer?.role,bootstrap?.viewer?.department].filter(Boolean).join(" · "))}</span>
        </div>
        <button id="tt-shared-sign-out" type="button">Sign Out</button>
      </div>`;

    const content = document.createElement("div");
    content.className = "tt-generated-content";
    wrapper.appendChild(side);
    wrapper.appendChild(content);
    content.appendChild(pageShell);
    pageShell.dataset.ttNavWrapped = "1";

    pageShell.querySelectorAll(".topbar .top-actions a").forEach((link) => {
      const href = String(link.getAttribute("href") || "").toLowerCase();
      if (href.includes(".html") || href === "index.html") link.classList.add("tt-nav-legacy-top-link");
    });
    pageShell.querySelectorAll(".topbar > a[href='index.html'], .topbar .top-actions #sign-out").forEach((el) => {
      el.classList.add("tt-nav-legacy-top-link");
    });

    side.querySelector("#tt-shared-sign-out")?.addEventListener("click", () => {
      const existing = pageShell.querySelector("#sign-out") || pageShell.querySelector("#logout");
      if (existing) existing.click();
      else window.location.href = "index.html";
    });

    return { side, app, shell: wrapper };
  }

  function renderNavigation(bootstrap) {
    const host = ensureNavigationHost(bootstrap);
    if (!host) return false;
    const { side, app, shell } = host;
    if (side.querySelector(".tt-shared-nav")) return true;

    injectStyles();
    side.classList.add("tt-nav-host");

    const legacyNav = side.querySelector(":scope > nav.nav");
    const shared = document.createElement("nav");
    shared.className = "tt-shared-nav";
    shared.setAttribute("aria-label","Task Tracker navigation");

    const home = createLink(
      "Home",
      bootstrap?.home?.href || "index.html",
      isHomeActive(bootstrap)
    );
    home.dataset.short = "H";
    shared.appendChild(home);

    const homeNote = document.createElement("span");
    homeNote.className = "tt-nav-home-note";
    homeNote.textContent = `Default: ${bootstrap?.home?.default_label || "Workspace"}`;
    shared.appendChild(homeNote);

    const homeEntries = homeChildren(bootstrap);
    let homeSub = null;
    if (homeEntries.length) {
      homeSub = document.createElement("div");
      homeSub.className = "tt-nav-sub tt-nav-home-sub";
      homeSub.hidden = !isHomeActive(bootstrap);
      homeEntries.forEach(([label,href]) => {
        const child = createLink(label,href,isHrefActive(href));
        child.dataset.short = shortLabel(label);
        homeSub.appendChild(child);
      });
      shared.appendChild(homeSub);
    }

    const activeSection = currentSectionKey();
    const sections = bootstrap?.sections || {};

    for (const [key, definition] of Object.entries(sectionDefinitions)) {
      if (!sectionVisible(key, sections, bootstrap)) continue;

      const wrapper = document.createElement("div");
      wrapper.className = "tt-nav-section";
      wrapper.dataset.sectionKey = key;

      const main = createLink(
        definition.label,
        sections[key]?.href || definition.href,
        activeSection === key
      );
      main.dataset.short = shortLabel(definition.label);
      wrapper.appendChild(main);

      const children = visibleChildren(key,definition,bootstrap);
      if (children.length) {
        const sub = document.createElement("div");
        sub.className = "tt-nav-sub";
        sub.hidden = activeSection !== key && !keepTransitionSubnavExpanded(key,bootstrap);
        children.forEach(([label, href]) => {
          const child = createLink(label, href, isHrefActive(href));
          child.dataset.short = shortLabel(label);
          sub.appendChild(child);
        });
        wrapper.appendChild(sub);
      }

      shared.appendChild(wrapper);
    }

    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "tt-nav-collapse";
    collapse.textContent = "Collapse Navigation";
    collapse.setAttribute("aria-label","Collapse navigation");

    const collapseTarget = shell || app;
    const collapsed = localStorage.getItem(collapseKey) === "1";
    if (collapsed) collapseTarget.classList.add("tt-nav-collapsed");

    const updateCollapseLabel = () => {
      const isCollapsed = collapseTarget.classList.contains("tt-nav-collapsed");
      collapse.textContent = isCollapsed ? "Expand Navigation" : "Collapse Navigation";
      collapse.setAttribute("aria-label",collapse.textContent);
    };
    updateCollapseLabel();

    collapse.addEventListener("click", () => {
      collapseTarget.classList.toggle("tt-nav-collapsed");
      localStorage.setItem(
        collapseKey,
        collapseTarget.classList.contains("tt-nav-collapsed") ? "1" : "0"
      );
      updateCollapseLabel();
    });

    if (legacyNav) {
      side.insertBefore(collapse, legacyNav);
      side.insertBefore(shared, legacyNav);
      legacyNav.classList.add("tt-nav-legacy-hidden");
    } else {
      const footer = side.querySelector(".side-footer");
      side.insertBefore(collapse, footer || null);
      side.insertBefore(shared, footer || null);
    }

    applyManagementHash();
    applyEmployeeHash();
    applyPpsHash();
    applyHistoryHash();
    window.addEventListener("hashchange", () => {
      if (currentPage === "management.html") applyManagementHash();
      if (currentPage === "employee.html") applyEmployeeHash();
      if (currentPage === "pps-operations.html") applyPpsHash();
      if (currentPage === "history.html") applyHistoryHash();
      window.setTimeout(() => {
        const current = currentSectionKey();
        shared.querySelectorAll(".tt-nav-section").forEach((section) => {
          const key = section.dataset.sectionKey || "";
          const link = section.querySelector(":scope > a");
          if (!link) return;
          link.classList.toggle("active",key === current);
          const sub = section.querySelector(":scope > .tt-nav-sub");
          if (sub) sub.hidden = key !== current && !keepTransitionSubnavExpanded(key,bootstrap);
        });
        home.classList.toggle("active",isHomeActive(bootstrap));
        if (homeSub) homeSub.hidden = !isHomeActive(bootstrap);
        shared.querySelectorAll(".tt-nav-sub a").forEach((link) => {
          link.classList.toggle("active",isHrefActive(link.getAttribute("href")));
        });
      },0);
    });

    return true;
  }

  let attempts = 0;
  let stopped = false;

  async function tryMount() {
    if (stopped) return;
    const token = sessionStorage.getItem(sessionKey);
    const app = document.getElementById("app");
    if (!token || !app || app.hidden) return;

    attempts += 1;
    try {
      const bootstrap = await rpc("get_navigation_bootstrap", {
        p_session_token: token
      });
      if (renderNavigation(bootstrap)) {
        stopped = true;
        return;
      }
    } catch (error) {
      console.warn("Shared navigation did not load:", error?.message || error);
    }

    if (attempts >= 20) stopped = true;
  }

  const observer = new MutationObserver(() => tryMount());
  const app = document.getElementById("app");
  if (app) observer.observe(app,{attributes:true,attributeFilter:["hidden"]});

  const timer = window.setInterval(() => {
    if (stopped) {
      window.clearInterval(timer);
      observer.disconnect();
      return;
    }
    tryMount();
  },500);

  window.setTimeout(tryMount,100);
})();