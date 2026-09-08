"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) throw new Error("Item Changes configuration failed to load.");

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const $ = (id) => document.getElementById(id);
  const sessionKey = config.sessionStorageKey;
  const ATTACHMENT_ENDPOINT = `${config.supabaseUrl}/functions/v1/item-change-attachment`;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const PAGE_SIZE = 50;
  const ACCEPTED_EXTENSIONS = new Set(["png","jpg","jpeg","webp","gif","pdf","txt","csv","docx","xlsx"]);

  let sessionToken = sessionStorage.getItem(sessionKey);
  let bootstrap = null;
  let requests = [];
  let totalCount = 0;
  let pageOffset = 0;
  let activeRequestId = null;
  let activeDetail = null;
  let activeStatus = "ACTIVE";
  let activeOwnerMode = null;
  let searchTimer = null;
  let selectedNewItems = new Map();
  let selectedAddItems = new Map();
  let pendingFiles = [];
  let mentionMenuVisible = false;
  let imageObserver = null;
  const attachmentCache = new Map();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function setMessage(text, type = "info", login = false) {
    const el = login ? $("message") : $("app-message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  function showError(error) {
    setMessage(error?.message || String(error), "error");
  }

  function labelStatus(value) {
    return ({
      OPEN: "Open",
      UNDER_REVIEW: "Under Review",
      IN_PROGRESS: "In Progress",
      ON_HOLD: "On Hold",
      RESOLVED: "Resolved",
      NO_CHANGE_REQUIRED: "No Change Required"
    }[value] || value || "");
  }

  function labelHold(value, operationalActive = false) {
    if (operationalActive) return "Confirmed Hold";
    return ({ NONE: "None", TENTATIVE: "Tentative Hold", CONFIRMED: "Confirmed Hold (Released Elsewhere)", RELEASED: "Released" }[value] || value || "None");
  }

  function statusPill(value) {
    const css = String(value || "OPEN").toLowerCase().replaceAll("_", "-");
    return `<span class="status-pill status-${esc(css)}">${esc(labelStatus(value))}</span>`;
  }

  function holdPill(value, operationalActive = false) {
    const effective = operationalActive ? "CONFIRMED" : (value || "NONE");
    return `<span class="hold-pill hold-${esc(String(effective).toLowerCase())}">${esc(labelHold(value, operationalActive))}</span>`;
  }

  function dateOnly(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }

  function dateTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function relativeActivity(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return dateOnly(value);
  }

  async function listEmployees() {
    const rows = await rpc("list_login_employees");
    $("employee").innerHTML = '<option value="">Select employee</option>' + (rows || [])
      .map((row) => `<option value="${esc(row.employee_id)}">${esc(row.employee_name)}</option>`).join("");
  }

  async function loadBootstrap() {
    if (!sessionToken) return false;
    bootstrap = await rpc("get_item_change_bootstrap", { p_session_token: sessionToken });
    return true;
  }

  async function login(event) {
    event.preventDefault();
    setMessage("Signing in...", "info", true);
    try {
      const rows = await rpc("login_with_employee_pin", {
        p_employee_id: $("employee").value,
        p_pin: $("pin").value
      });
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result?.login_successful || !result.session_token) throw new Error(result?.login_message || "Login failed.");
      sessionToken = result.session_token;
      sessionStorage.setItem(sessionKey, sessionToken);
      $("pin").value = "";
      try {
        await loadBootstrap();
      } catch (error) {
        try { await rpc("logout_employee_session", { p_session_token: sessionToken }); } catch {}
        sessionStorage.removeItem(sessionKey);
        sessionToken = null;
        throw error;
      }
      await enterApp();
    } catch (error) {
      setMessage(error.message || String(error), "error", true);
    }
  }

  async function signOut() {
    const token = sessionToken;
    sessionStorage.removeItem(sessionKey);
    sessionToken = null;
    bootstrap = null;
    if (token) {
      try { await rpc("logout_employee_session", { p_session_token: token }); } catch {}
    }
    window.location.replace("index.html");
  }

  function optionPeople(rows, selected = "", includeBlank = false, blankLabel = "Unassigned") {
    return `${includeBlank ? `<option value="">${esc(blankLabel)}</option>` : ""}${(rows || []).map((p) =>
      `<option value="${esc(p.employee_id)}" ${String(p.employee_id) === String(selected || "") ? "selected" : ""}>${esc(p.employee_name)}${p.role ? ` · ${esc(p.role)}` : ""}</option>`
    ).join("")}`;
  }

  function configureNavigation() {
    const role = bootstrap?.viewer?.role || "";
    const department = bootstrap?.viewer?.department || "";
    $("management-link").hidden = !["Supervisor","Manager","Administrator"].includes(role);
    $("qa-link").hidden = !(department === "Quality Assurance" || ["Supervisor","Manager","Administrator"].includes(role));
    rpc("get_work_hub_bootstrap", { p_session_token: sessionToken })
      .then(() => { $("work-hub-link").hidden = false; })
      .catch(() => { $("work-hub-link").hidden = true; });
  }

  function hydrateControls() {
    const categories = bootstrap?.categories || [];
    const waiting = bootstrap?.waiting_options || [];
    const people = bootstrap?.people || [];

    $("filter-category").innerHTML = '<option value="">All Categories</option>' + categories.map((c) => `<option value="${esc(c.category_code)}">${esc(c.category_name)}</option>`).join("");
    $("filter-owner").innerHTML = '<option value="">All Owners</option>' + people.map((p) => `<option value="${esc(p.employee_id)}">${esc(p.employee_name)}</option>`).join("");
    $("filter-waiting").innerHTML = '<option value="">All Waiting On</option>' + waiting.map((w) => `<option value="${esc(w.waiting_on_code)}">${esc(w.waiting_on_name)}</option>`).join("");
    $("new-category").innerHTML = '<option value="">Select category</option>' + categories.map((c) => `<option value="${esc(c.category_code)}">${esc(c.category_name)}</option>`).join("");
    $("new-submitted-by").value = bootstrap?.viewer?.employee_name || "";
    $("new-request").hidden = !bootstrap?.viewer?.can_submit;
  }

  async function enterApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("side-name").textContent = bootstrap.viewer.employee_name || "";
    $("side-meta").textContent = [bootstrap.viewer.role, bootstrap.viewer.department].filter(Boolean).join(" · ");
    hydrateControls();
    configureNavigation();
    await Promise.all([loadNotifications(), loadRequests()]);

    const deepLinkId = new URLSearchParams(window.location.search).get("request_id");
    if (deepLinkId) {
      try { await openRequest(deepLinkId); } catch (error) { showError(error); }
    }
  }

  async function loadRequests() {
    setMessage("");
    $("request-body").innerHTML = '<tr><td colspan="11" class="empty">Loading Change Requests...</td></tr>';
    try {
      const data = await rpc("get_item_change_requests", {
        p_session_token: sessionToken,
        p_search: $("filter-search").value.trim() || null,
        p_status: activeStatus,
        p_category_code: $("filter-category").value || null,
        p_owner_employee_id: activeOwnerMode ? null : ($("filter-owner").value || null),
        p_owner_mode: activeOwnerMode,
        p_waiting_on_code: $("filter-waiting").value || null,
        p_limit: PAGE_SIZE,
        p_offset: pageOffset
      });
      requests = data?.requests || [];
      totalCount = Number(data?.total_count || 0);
      renderRequestTable();
    } catch (error) {
      $("request-body").innerHTML = `<tr><td colspan="11" class="empty">${esc(error.message || String(error))}</td></tr>`;
    }
  }

  function renderRequestTable() {
    if (!requests.length) {
      $("request-body").innerHTML = '<tr><td colspan="11" class="empty">No Change Requests match these filters.</td></tr>';
    } else {
      $("request-body").innerHTML = requests.map((r) => {
        const items = r.items || [];
        const visible = items.slice(0, 4);
        const itemHtml = visible.map((item) => `<span class="item-chip">${esc(item.item_name)}</span>`).join("") + (items.length > 4 ? `<span class="item-chip">+${items.length - 4} more</span>` : "");
        const holdFlags = [];
        if (Number(r.confirmed_hold_count || 0) > 0) holdFlags.push(`<span class="hold-pill hold-confirmed">${Number(r.confirmed_hold_count)} Confirmed</span>`);
        if (Number(r.tentative_hold_count || 0) > 0) holdFlags.push(`<span class="hold-pill hold-tentative">${Number(r.tentative_hold_count)} Tentative</span>`);
        return `<tr class="request-row" data-request-id="${esc(r.request_id)}">
          <td><strong>${esc(r.request_number)}</strong>${r.legacy_master_id ? `<div class="muted" style="font-size:10px">Legacy ${esc(r.legacy_master_id)}</div>` : ""}</td>
          <td>${esc(dateOnly(r.created_at))}</td>
          <td>${esc(r.submitted_by_name)}</td>
          <td><div class="items-cell">${itemHtml}</div>${holdFlags.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px">${holdFlags.join("")}</div>` : ""}</td>
          <td>${esc(r.category_name)}</td>
          <td class="desc-cell">${esc(r.description)}</td>
          <td>${Number(r.closed_count || 0)}/${Number(r.item_count || 0)} Resolved</td>
          <td>${statusPill(r.parent_status)}</td>
          <td>${esc(r.owner_name || "Unassigned")}</td>
          <td>${esc(r.waiting_on_name || "None")}</td>
          <td title="${esc(dateTime(r.last_activity_at))}">${esc(relativeActivity(r.last_activity_at))}</td>
        </tr>`;
      }).join("");
    }
    const start = totalCount ? pageOffset + 1 : 0;
    const end = Math.min(pageOffset + requests.length, totalCount);
    $("page-summary").textContent = `${start}-${end} of ${totalCount}`;
    $("page-prev").disabled = pageOffset <= 0;
    $("page-next").disabled = pageOffset + PAGE_SIZE >= totalCount;
    document.querySelectorAll(".request-row").forEach((row) => row.addEventListener("click", () => openRequest(row.dataset.requestId)));
  }

  function setQuickFilter(button) {
    document.querySelectorAll(".quick-filter").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    activeOwnerMode = button.dataset.special || null;
    activeStatus = button.dataset.status || "ACTIVE";
    if (activeOwnerMode) activeStatus = "ACTIVE";
    pageOffset = 0;
    if (activeOwnerMode) $("filter-owner").value = "";
    loadRequests();
  }

  function categoryByCode(code) {
    return (bootstrap?.categories || []).find((c) => c.category_code === code) || null;
  }

  function openNewRequest() {
    selectedNewItems.clear();
    $("new-request-form").reset();
    $("new-submitted-by").value = bootstrap.viewer.employee_name || "";
    $("new-selected-items").innerHTML = "";
    $("new-item-results").hidden = true;
    $("new-hold-note").hidden = true;
    $("new-request-modal").hidden = false;
  }

  function updateHoldSubmissionNote() {
    const category = categoryByCode($("new-category").value);
    const note = $("new-hold-note");
    if (!category?.is_hold_category) {
      note.hidden = true;
      return;
    }
    note.hidden = false;
    note.dataset.type = "info";
    note.textContent = bootstrap.viewer.can_authorize_hold
      ? "Because your role can authorize production holds, submitting this Item Hold request will immediately create a Confirmed Hold for the selected Items."
      : "This will create a Tentative Hold only. Inventory can see the warning, but work-order generation is not blocked until an authorized Supervisor, Manager, or Administrator confirms it.";
  }

  function renderSelectedItems(map, hostId) {
    const host = $(hostId);
    host.innerHTML = [...map.values()].map((item) => `<span class="selected-item">${esc(item.item_name)} <button type="button" data-remove-item="${esc(item.item_id)}">×</button></span>`).join("");
    host.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => {
      map.delete(button.dataset.removeItem);
      renderSelectedItems(map, hostId);
    }));
  }

  function itemResultHtml(rows, selectedMap) {
    if (!rows.length) return '<div class="empty" style="padding:12px">No matching Items.</div>';
    return rows.map((item) => {
      const selected = selectedMap.has(String(item.item_id));
      const holds = `${item.confirmed_hold ? '<span class="hold-pill hold-confirmed">On Hold</span>' : ""}${Number(item.tentative_hold_count || 0) ? '<span class="hold-pill hold-tentative">Tentative Hold</span>' : ""}`;
      return `<button type="button" class="search-result" data-search-item="${esc(item.item_id)}" ${selected ? "disabled" : ""}><strong>${esc(item.item_name)}</strong><div class="muted" style="font-size:11px">Internal ID ${esc(item.internal_id)} ${holds}</div></button>`;
    }).join("");
  }

  async function searchItems(query, resultsHost, selectedMap, selectedHostId, excludeItemIds = new Set()) {
    const clean = String(query || "").trim();
    if (!clean) {
      resultsHost.hidden = true;
      resultsHost.innerHTML = "";
      return;
    }
    try {
      const rows = await rpc("search_item_change_items", { p_session_token: sessionToken, p_query: clean, p_limit: 30 });
      const filtered = (rows || []).filter((item) => !excludeItemIds.has(String(item.item_id)));
      resultsHost.innerHTML = itemResultHtml(filtered, selectedMap);
      resultsHost.hidden = false;
      resultsHost.querySelectorAll("[data-search-item]").forEach((button) => button.addEventListener("click", () => {
        const item = filtered.find((x) => String(x.item_id) === String(button.dataset.searchItem));
        if (!item) return;
        selectedMap.set(String(item.item_id), item);
        renderSelectedItems(selectedMap, selectedHostId);
        resultsHost.hidden = true;
      }));
    } catch (error) {
      resultsHost.innerHTML = `<div class="empty" style="padding:12px">${esc(error.message || String(error))}</div>`;
      resultsHost.hidden = false;
    }
  }

  async function submitNewRequest(event) {
    event.preventDefault();
    if (!selectedNewItems.size) {
      setMessage("Select at least one Item.", "error");
      return;
    }
    const button = $("submit-new-request");
    button.disabled = true;
    button.textContent = "Submitting...";
    try {
      const result = await rpc("submit_item_change_request", {
        p_session_token: sessionToken,
        p_category_code: $("new-category").value,
        p_description: $("new-description").value.trim(),
        p_item_ids: [...selectedNewItems.keys()]
      });
      $("new-request-modal").hidden = true;
      pageOffset = 0;
      await loadRequests();
      setMessage(`${result.request_number} created.${result.hold_message ? ` ${result.hold_message}` : ""}`, "success");
      await openRequest(result.request_id);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Submit Request";
    }
  }

  async function openRequest(requestId) {
    activeRequestId = requestId;
    clearPendingFiles();
    $("drawer-title").textContent = "Loading...";
    $("drawer-subtitle").textContent = "";
    $("drawer-content").innerHTML = '<div class="ticket-section empty">Loading Change Request...</div>';
    $("drawer-overlay").classList.add("open");
    $("request-drawer").classList.add("open");
    try {
      activeDetail = await rpc("get_item_change_request_detail", { p_session_token: sessionToken, p_request_id: requestId });
      renderRequestDrawer();
      const url = new URL(window.location.href);
      url.searchParams.set("request_id", requestId);
      history.replaceState(null, "", url);
    } catch (error) {
      $("drawer-content").innerHTML = `<div class="ticket-section empty">${esc(error.message || String(error))}</div>`;
    }
  }

  function closeDrawer() {
    $("drawer-overlay").classList.remove("open");
    $("request-drawer").classList.remove("open");
    activeRequestId = null;
    activeDetail = null;
    selectedAddItems.clear();
    clearPendingFiles();
    const url = new URL(window.location.href);
    url.searchParams.delete("request_id");
    history.replaceState(null, "", url);
  }

  function participantChecklist(selected) {
    const selectedSet = new Set((selected || []).map((p) => String(p.employee_id)));
    return (bootstrap?.people || []).map((p) => `<label><input type="checkbox" data-participant-id="${esc(p.employee_id)}" ${selectedSet.has(String(p.employee_id)) ? "checked" : ""}> ${esc(p.employee_name)} <span class="muted">${esc(p.role || "")}</span></label>`).join("");
  }

  function routingSection(detail) {
    const r = detail.request;
    if (!detail.viewer.can_manage_ticket) {
      return `<section class="ticket-section"><h3 style="margin-top:0">Routing</h3><div class="routing-grid"><div><strong>Owner</strong><div>${esc(r.owner_name || "Unassigned")}</div></div><div><strong>Waiting On</strong><div>${esc(r.waiting_on_name || "None")}</div></div><div><strong>Participants</strong><div>${detail.participants?.length ? detail.participants.map((p) => esc(p.employee_name)).join(", ") : "None"}</div></div></div></section>`;
    }
    return `<section class="ticket-section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h3 style="margin:0">Routing</h3><div class="muted" style="font-size:12px">Owner is accountable. Waiting On identifies the current dependency. Participants receive updates but never control visibility.</div></div><button id="save-routing" class="primary small">Save Routing</button></div><div class="routing-grid" style="margin-top:10px"><div class="field" style="margin:0"><label>Owner</label><select id="route-owner">${optionPeople(bootstrap.people || [], r.owner_employee_id, true, "Unassigned")}</select></div><div class="field" style="margin:0"><label>Waiting On</label><select id="route-waiting">${(bootstrap.waiting_options || []).map((w) => `<option value="${esc(w.waiting_on_code)}" ${w.waiting_on_code === r.waiting_on_code ? "selected" : ""}>${esc(w.waiting_on_name)}</option>`).join("")}</select></div><div><label style="display:block;font-size:12px;font-weight:850;margin-bottom:6px">Participants</label><div id="route-participants" class="check-list">${participantChecklist(detail.participants)}</div></div></div></section>`;
  }

  function lineWorkflowToolbar(detail) {
    if (!detail.viewer.can_manage_ticket || detail.request.is_legacy_read_only) return "";
    const statusOptions = `<option value="KEEP">Keep Current Status</option>${(bootstrap.statuses || []).map((s) => `<option value="${esc(s.status_code)}">${esc(s.status_name)}</option>`).join("")}`;
    let holdOptions = '<option value="">No Hold Change</option>';
    if (detail.request.is_hold_category) {
      holdOptions += '<option value="TENTATIVE">Mark Tentative Hold</option><option value="CLEAR_TENTATIVE">Clear Tentative Hold</option>';
      if (detail.viewer.can_authorize_hold) holdOptions += '<option value="CONFIRM">Confirm Operational Hold</option><option value="RELEASE">Release Operational Hold</option>';
    }
    return `<div class="line-toolbar"><div class="field" style="margin:0"><label>Apply Status to Checked Items</label><select id="bulk-line-status">${statusOptions}</select></div><div class="field" style="margin:0"><label>Resolution / Closing Notes</label><input id="bulk-resolution" placeholder="Required when resolving or marking no change"></div>${detail.request.is_hold_category ? `<div class="field" style="margin:0"><label>Operational Hold Action</label><select id="bulk-hold-action">${holdOptions}</select></div>` : '<div></div>'}<button id="apply-line-workflow" class="primary">Apply to Selected</button></div>`;
  }

  function itemLinesSection(detail) {
    const selectable = detail.viewer.can_manage_ticket && !detail.request.is_legacy_read_only;
    const rows = (detail.items || []).map((item) => `<tr>
      <td>${selectable ? `<input type="checkbox" class="line-select" value="${esc(item.request_item_id)}">` : ""}</td>
      <td><strong>${esc(item.item_name)}</strong><div class="muted" style="font-size:10px">${esc(item.internal_id)}</div>${item.related_item_name ? `<div style="font-size:11px;margin-top:4px">Component: ${esc(item.related_item_name)}${item.related_action ? ` · ${esc(item.related_action)}` : ""}</div>` : ""}</td>
      <td>${statusPill(item.line_status)}</td>
      <td>${holdPill(item.hold_state, item.operational_hold_active)}</td>
      <td>${esc(item.resolution || "")}</td>
      <td>${esc(item.updated_by_name || "")}${item.updated_at ? `<div class="muted" style="font-size:10px">${esc(dateTime(item.updated_at))}</div>` : ""}</td>
    </tr>`).join("");
    return `<section class="ticket-section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px"><div><h3 style="margin:0">Item Lines</h3><div class="muted" style="font-size:12px">Ticket workflow and production-hold state are separate. Only Confirmed Hold is a hard operational stop.</div></div>${selectable ? '<button id="toggle-add-items" class="ghost small">+ Add Items</button>' : ""}</div>${lineWorkflowToolbar(detail)}${selectable ? '<div style="margin-bottom:7px"><label style="font-size:12px;font-weight:850"><input id="select-all-lines" type="checkbox" style="width:16px;height:16px;vertical-align:middle"> Select all item lines</label></div>' : ""}<div class="table-wrap line-table"><table><thead><tr><th style="width:42px"></th><th>Item</th><th>Status</th><th>Hold State</th><th>Resolution</th><th>Last Updated</th></tr></thead><tbody>${rows}</tbody></table></div>${selectable ? `<div id="add-items-wrap" class="composer" hidden style="margin-top:11px"><strong>Add Items to this Request</strong><div class="field item-search-box"><label>Search Item Master</label><input id="add-item-search" type="search" autocomplete="off" placeholder="Start typing an Item or Internal ID"><div id="add-item-results" class="search-results" hidden></div><div id="add-selected-items" class="selected-items"></div></div><div style="display:flex;justify-content:flex-end;margin-top:9px"><button id="save-added-items" class="primary small">Add Selected Items</button></div></div>` : ""}</section>`;
  }

  function attachmentHtml(attachment) {
    const mime = String(attachment.mime_type || "").toLowerCase();
    const image = mime.startsWith("image/");
    return `<div class="attachment-card">${image ? `<div class="inline-image-host" data-inline-attachment="${esc(attachment.attachment_id)}" data-file-name="${esc(attachment.file_name)}"><span class="muted">Image will load when visible.</span></div>` : ""}<button type="button" class="attachment-link" data-open-attachment="${esc(attachment.attachment_id)}" data-file-name="${esc(attachment.file_name)}" data-mime-type="${esc(mime)}">📎 ${esc(attachment.file_name)}</button></div>`;
  }

  function commentsSection(detail) {
    const comments = detail.comments || [];
    const commentHtml = comments.length ? comments.map((c) => `<article class="comment-item ${c.is_system ? "system" : ""}">
      <div class="comment-meta"><strong>${esc(c.author_name)}</strong><span>${esc(dateTime(c.created_at))}</span></div>
      ${c.request_item_id ? `<span class="comment-scope">${esc(c.item_name || "Item-specific")}</span>` : ""}
      <div class="comment-body">${esc(c.body)}</div>
      ${(c.attachments || []).length ? `<div class="attachment-list">${c.attachments.map(attachmentHtml).join("")}</div>` : ""}
    </article>`).join("") : '<div class="empty">No comments yet.</div>';

    if (detail.request.is_legacy_read_only) {
      return `<section class="ticket-section"><h3 style="margin-top:0">Discussion</h3>${commentHtml}</section>`;
    }

    const itemOptions = '<option value="">General Request</option>' + (detail.items || []).map((item) => `<option value="${esc(item.request_item_id)}">${esc(item.item_name)}</option>`).join("");
    return `<section class="ticket-section"><h3 style="margin-top:0">Discussion</h3>${commentHtml}<div class="composer" style="margin-top:12px"><div class="composer-grid"><div class="field" style="margin:0"><label>Comment About</label><select id="comment-item">${itemOptions}</select></div><div><label style="display:block;font-size:12px;font-weight:850;margin-bottom:6px">Comment</label><textarea id="comment-body" placeholder="Add a comment. Type @ to mention someone. Paste a screenshot with Ctrl+V."></textarea></div></div><div class="attachment-tools"><button id="attach-file" type="button" class="ghost small">📎 Add Screenshot / File</button><input id="attachment-input" type="file" hidden multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx"><span class="muted" style="font-size:11px">Images, PDF, TXT, CSV, DOCX, XLSX · 10 MB max each</span></div><div id="pending-files" class="pending-files"></div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button id="post-comment" class="primary">Post Comment</button></div></div></section>`;
  }

  function renderRequestDrawer() {
    if (!activeDetail) return;
    const r = activeDetail.request;
    $("drawer-title").textContent = r.request_number;
    $("drawer-subtitle").innerHTML = `${statusPill(r.parent_status)} <span style="margin-left:8px">${esc(r.closed_count)}/${esc(r.item_count)} resolved · Last activity ${esc(relativeActivity(r.last_activity_at))}</span>`;
    $("drawer-content").innerHTML = `
      <section class="ticket-section"><div class="ticket-header-grid"><div><strong>Submitted</strong><div>${esc(dateTime(r.created_at))}</div></div><div><strong>Submitted By</strong><div>${esc(r.submitted_by_name)}</div></div><div><strong>Category</strong><div>${esc(r.category_name)}</div></div><div><strong>Progress</strong><div>${esc(r.closed_count)}/${esc(r.item_count)} Resolved</div></div></div><hr style="border:0;border-top:1px solid #cbd5e1;margin:12px 0"><strong>Description</strong><div class="ticket-desc" style="margin-top:6px">${esc(r.description)}</div>${r.is_legacy_read_only ? '<div class="msg" style="margin-top:12px">Imported historical record — read-only.</div>' : ""}</section>
      ${routingSection(activeDetail)}
      ${itemLinesSection(activeDetail)}
      ${commentsSection(activeDetail)}
    `;
    bindDrawerEvents();
    observeInlineImages();
  }

  function bindDrawerEvents() {
    $("save-routing")?.addEventListener("click", saveRouting);
    $("apply-line-workflow")?.addEventListener("click", applyLineWorkflow);
    $("select-all-lines")?.addEventListener("change", (event) => document.querySelectorAll(".line-select").forEach((box) => { box.checked = event.target.checked; }));
    $("toggle-add-items")?.addEventListener("click", () => { $("add-items-wrap").hidden = !$("add-items-wrap").hidden; if (!$("add-items-wrap").hidden) $("add-item-search").focus(); });
    $("save-added-items")?.addEventListener("click", saveAddedItems);
    $("add-item-search")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const exclude = new Set((activeDetail?.items || []).map((i) => String(i.item_id)));
        searchItems($("add-item-search").value, $("add-item-results"), selectedAddItems, "add-selected-items", exclude);
      }, 250);
    });
    $("attach-file")?.addEventListener("click", () => $("attachment-input")?.click());
    $("attachment-input")?.addEventListener("change", (event) => { addFiles(event.target.files); event.target.value = ""; });
    $("comment-body")?.addEventListener("input", updateMentionMenu);
    $("comment-body")?.addEventListener("paste", handlePaste);
    $("comment-body")?.addEventListener("dragover", (event) => { if (event.dataTransfer?.types?.includes("Files")) event.preventDefault(); });
    $("comment-body")?.addEventListener("drop", (event) => { if (!event.dataTransfer?.files?.length) return; event.preventDefault(); addFiles(event.dataTransfer.files); });
    $("post-comment")?.addEventListener("click", postComment);
    document.querySelectorAll("[data-open-attachment]").forEach((button) => button.addEventListener("click", () => openAttachment(button.dataset.openAttachment, button.dataset.fileName, button.dataset.mimeType)));
  }

  async function saveRouting() {
    const button = $("save-routing");
    const participantIds = [...document.querySelectorAll("[data-participant-id]:checked")].map((box) => box.dataset.participantId);
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      activeDetail = await rpc("update_item_change_request", {
        p_session_token: sessionToken,
        p_request_id: activeRequestId,
        p_owner_employee_id: $("route-owner").value || null,
        p_waiting_on_code: $("route-waiting").value || "NONE",
        p_participant_employee_ids: participantIds
      });
      renderRequestDrawer();
      await Promise.all([loadRequests(), loadNotifications()]);
      setMessage("Request routing updated.", "success");
    } catch (error) {
      showError(error);
      button.disabled = false;
      button.textContent = "Save Routing";
    }
  }

  async function applyLineWorkflow() {
    const ids = [...document.querySelectorAll(".line-select:checked")].map((box) => box.value);
    if (!ids.length) {
      setMessage("Check at least one Item line.", "error");
      return;
    }
    const status = $("bulk-line-status").value || "KEEP";
    const resolution = $("bulk-resolution").value.trim() || null;
    const holdAction = $("bulk-hold-action")?.value || null;
    if (["RESOLVED","NO_CHANGE_REQUIRED"].includes(status) && !resolution) {
      setMessage("Resolution / Closing Notes are required when closing Item lines.", "error");
      return;
    }
    if (status === "KEEP" && !holdAction) {
      setMessage("Choose a status or an Operational Hold action.", "error");
      return;
    }
    const button = $("apply-line-workflow");
    button.disabled = true;
    button.textContent = "Applying...";
    try {
      activeDetail = await rpc("update_item_change_lines", {
        p_session_token: sessionToken,
        p_request_id: activeRequestId,
        p_request_item_ids: ids,
        p_line_status: status,
        p_resolution: resolution,
        p_hold_action: holdAction
      });
      renderRequestDrawer();
      await Promise.all([loadRequests(), loadNotifications()]);
      setMessage("Selected Item lines updated.", "success");
    } catch (error) {
      showError(error);
      button.disabled = false;
      button.textContent = "Apply to Selected";
    }
  }

  async function saveAddedItems() {
    if (!selectedAddItems.size) {
      setMessage("Select at least one new Item to add.", "error");
      return;
    }
    const button = $("save-added-items");
    button.disabled = true;
    button.textContent = "Adding...";
    try {
      activeDetail = await rpc("add_item_change_request_items", {
        p_session_token: sessionToken,
        p_request_id: activeRequestId,
        p_item_ids: [...selectedAddItems.keys()]
      });
      selectedAddItems.clear();
      renderRequestDrawer();
      await loadRequests();
      setMessage("Items added to the Change Request.", "success");
    } catch (error) {
      showError(error);
      button.disabled = false;
      button.textContent = "Add Selected Items";
    }
  }

  function extensionOf(name) {
    const text = String(name || "").toLowerCase();
    const dot = text.lastIndexOf(".");
    return dot >= 0 ? text.slice(dot + 1) : "";
  }

  function clearPendingFiles() {
    pendingFiles.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); });
    pendingFiles = [];
    renderPendingFiles();
  }

  function addFiles(files) {
    const existing = new Set(pendingFiles.map((entry) => `${entry.file.name}|${entry.file.size}|${entry.file.lastModified}`));
    const errors = [];
    for (const file of Array.from(files || [])) {
      if (!file.size || file.size > MAX_FILE_BYTES) { errors.push(`${file.name}: must be 1 byte to 10 MB`); continue; }
      if (!ACCEPTED_EXTENSIONS.has(extensionOf(file.name))) { errors.push(`${file.name}: unsupported file type`); continue; }
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (existing.has(key)) continue;
      existing.add(key);
      pendingFiles.push({ file, previewUrl: String(file.type || "").startsWith("image/") ? URL.createObjectURL(file) : null });
    }
    renderPendingFiles();
    if (errors.length) setMessage(errors.join(" · "), "error");
  }

  function renderPendingFiles() {
    const host = $("pending-files");
    if (!host) return;
    host.innerHTML = pendingFiles.map((entry, index) => `<div class="pending-file">${entry.previewUrl ? `<img src="${entry.previewUrl}" alt="">` : '<span>📎</span>'}<span>${esc(entry.file.name)}</span><button type="button" data-remove-file="${index}">×</button></div>`).join("");
    host.querySelectorAll("[data-remove-file]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.removeFile);
      const [removed] = pendingFiles.splice(index, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      renderPendingFiles();
    }));
  }

  function handlePaste(event) {
    const images = Array.from(event.clipboardData?.files || []).filter((file) => String(file.type || "").startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    addFiles(images);
  }

  function exactMentionIds(body) {
    const lower = String(body || "").toLowerCase();
    return (bootstrap?.mention_people || []).filter((p) => lower.includes(`@${String(p.employee_name || "").toLowerCase()}`)).map((p) => p.employee_id);
  }

  function updateMentionMenu() {
    const textarea = $("comment-body");
    const menu = $("mention-menu");
    if (!textarea || !menu) return;
    const before = textarea.value.slice(0, textarea.selectionStart);
    const match = before.match(/@([^@\n]{0,40})$/);
    if (!match) { menu.hidden = true; mentionMenuVisible = false; return; }
    const term = match[1].trim().toLowerCase();
    const people = (bootstrap?.mention_people || []).filter((p) => String(p.employee_name || "").toLowerCase().includes(term)).slice(0, 10);
    if (!people.length) { menu.hidden = true; mentionMenuVisible = false; return; }
    const rect = textarea.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 285)}px`;
    menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 240)}px`;
    menu.innerHTML = people.map((p) => `<button type="button" data-mention-id="${esc(p.employee_id)}" data-mention-name="${esc(p.employee_name)}"><strong>${esc(p.employee_name)}</strong><div class="muted" style="font-size:10px">${esc([p.role,p.department].filter(Boolean).join(" · "))}</div></button>`).join("");
    menu.hidden = false;
    mentionMenuVisible = true;
    menu.querySelectorAll("[data-mention-id]").forEach((button) => button.addEventListener("click", () => {
      const start = textarea.selectionStart;
      const prefix = textarea.value.slice(0, start).replace(/@([^@\n]{0,40})$/, `@${button.dataset.mentionName} `);
      textarea.value = prefix + textarea.value.slice(start);
      menu.hidden = true;
      mentionMenuVisible = false;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = prefix.length;
    }));
  }

  async function uploadAttachment(commentId, file) {
    const form = new FormData();
    form.append("operation", "upload");
    form.append("session_token", sessionToken);
    form.append("comment_id", commentId);
    form.append("file", file, file.name);
    const response = await fetch(ATTACHMENT_ENDPOINT, { method: "POST", headers: { apikey: config.supabasePublishableKey }, body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Attachment upload failed for ${file.name}.`);
    }
    return await response.json();
  }

  async function postComment() {
    const button = $("post-comment");
    const typed = $("comment-body").value.trim();
    const files = pendingFiles.map((entry) => entry.file);
    const body = typed || (files.length === 1 ? `Attached ${files[0].name}.` : files.length ? `Attached ${files.length} files.` : "");
    if (!body) { setMessage("Enter a comment or attach a file.", "error"); return; }
    button.disabled = true;
    button.textContent = "Posting...";
    try {
      const result = await rpc("add_item_change_comment", {
        p_session_token: sessionToken,
        p_request_id: activeRequestId,
        p_request_item_id: $("comment-item").value || null,
        p_body: body,
        p_mention_employee_ids: exactMentionIds(body)
      });
      const failures = [];
      for (let i = 0; i < files.length; i++) {
        button.textContent = `Uploading ${i + 1} of ${files.length}...`;
        try { await uploadAttachment(result.comment_id, files[i]); }
        catch (error) { failures.push(`${files[i].name}: ${error.message || String(error)}`); }
      }
      clearPendingFiles();
      $("mention-menu").hidden = true;
      activeDetail = await rpc("get_item_change_request_detail", { p_session_token: sessionToken, p_request_id: activeRequestId });
      renderRequestDrawer();
      await Promise.all([loadRequests(), loadNotifications()]);
      if (failures.length) setMessage(`Comment posted, but ${failures.length} attachment${failures.length === 1 ? "" : "s"} failed: ${failures.join(" · ")}`, "error");
      else setMessage("Comment posted.", "success");
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Post Comment";
    }
  }

  async function fetchAttachmentBlob(attachmentId) {
    if (attachmentCache.has(attachmentId)) return attachmentCache.get(attachmentId);
    const response = await fetch(ATTACHMENT_ENDPOINT, {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "download", session_token: sessionToken, attachment_id: attachmentId })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Attachment could not be opened.");
    }
    const blob = await response.blob();
    const value = { blob, url: URL.createObjectURL(blob), mime: response.headers.get("content-type") || blob.type || "application/octet-stream" };
    attachmentCache.set(attachmentId, value);
    return value;
  }

  async function openAttachment(attachmentId, fileName, mimeType) {
    const shouldOpen = String(mimeType || "").startsWith("image/") || mimeType === "application/pdf" || String(mimeType || "").startsWith("text/");
    const preview = shouldOpen ? window.open("about:blank", "_blank") : null;
    if (preview) preview.opener = null;
    try {
      const asset = await fetchAttachmentBlob(attachmentId);
      if (shouldOpen && preview) preview.location.href = asset.url;
      else {
        if (preview) preview.close();
        const a = document.createElement("a");
        a.href = asset.url;
        a.download = fileName || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (error) {
      if (preview) preview.close();
      showError(error);
    }
  }

  function observeInlineImages() {
    imageObserver?.disconnect();
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const host = entry.target;
        imageObserver.unobserve(host);
        const attachmentId = host.dataset.inlineAttachment;
        try {
          const asset = await fetchAttachmentBlob(attachmentId);
          host.innerHTML = `<img class="inline-shot" src="${asset.url}" alt="${esc(host.dataset.fileName || "Screenshot")}">`;
          host.querySelector("img")?.addEventListener("click", () => openAttachment(attachmentId, host.dataset.fileName, asset.mime));
        } catch (error) {
          host.innerHTML = `<span class="muted">Image preview unavailable: ${esc(error.message || String(error))}</span>`;
        }
      });
    }, { root: $("drawer-content"), rootMargin: "300px" });
    document.querySelectorAll("[data-inline-attachment]").forEach((host) => imageObserver.observe(host));
  }

  async function loadNotifications() {
    try {
      const data = await rpc("get_my_notifications", { p_session_token: sessionToken, p_unread_only: false, p_limit: 40 });
      const count = Number(data?.unread_count || 0);
      $("notification-badge").textContent = String(count);
      $("notification-badge").hidden = count === 0;
      const rows = data?.notifications || [];
      $("notification-panel").innerHTML = rows.length ? rows.map((n) => `<div class="notification-item ${n.is_read ? "" : "unread"}" data-notification-id="${esc(n.notification_id)}" data-link-path="${esc(n.link_path || "")}"><strong>${esc(n.title)}</strong><div style="font-size:12px;margin-top:3px">${esc(n.body || "")}</div><div class="muted" style="font-size:10px;margin-top:4px">${esc(dateTime(n.created_at))}</div></div>`).join("") : '<div class="empty">No notifications.</div>';
      $("notification-panel").querySelectorAll("[data-notification-id]").forEach((item) => item.addEventListener("click", async () => {
        try { await rpc("mark_notification_read", { p_session_token: sessionToken, p_notification_id: item.dataset.notificationId, p_mark_all: false }); } catch {}
        const path = item.dataset.linkPath;
        if (path) window.location.href = path;
        else loadNotifications();
      }));
    } catch {}
  }

  async function restoreOrLogin() {
    try { await listEmployees(); } catch (error) { setMessage(error.message || String(error), "error", true); }
    if (!sessionToken) return;
    try {
      await loadBootstrap();
      await enterApp();
    } catch {
      sessionStorage.removeItem(sessionKey);
      sessionToken = null;
      bootstrap = null;
    }
  }

  $("login-form").addEventListener("submit", login);
  $("sign-out").addEventListener("click", signOut);
  $("new-request").addEventListener("click", openNewRequest);
  $("new-request-form").addEventListener("submit", submitNewRequest);
  $("new-category").addEventListener("change", updateHoldSubmissionNote);
  $("new-item-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchItems($("new-item-search").value, $("new-item-results"), selectedNewItems, "new-selected-items"), 250);
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { const modal = $(button.dataset.close); if (modal) modal.hidden = true; }));
  $("close-drawer").addEventListener("click", closeDrawer);
  $("drawer-overlay").addEventListener("click", closeDrawer);
  $("refresh-list").addEventListener("click", () => { pageOffset = 0; loadRequests(); });
  $("filter-category").addEventListener("change", () => { pageOffset = 0; loadRequests(); });
  $("filter-owner").addEventListener("change", () => { activeOwnerMode = null; document.querySelectorAll(".quick-filter").forEach((b) => b.classList.remove("active")); activeStatus = "ACTIVE"; pageOffset = 0; loadRequests(); });
  $("filter-waiting").addEventListener("change", () => { pageOffset = 0; loadRequests(); });
  $("filter-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { pageOffset = 0; loadRequests(); }, 300); });
  $("page-prev").addEventListener("click", () => { pageOffset = Math.max(0, pageOffset - PAGE_SIZE); loadRequests(); });
  $("page-next").addEventListener("click", () => { if (pageOffset + PAGE_SIZE < totalCount) { pageOffset += PAGE_SIZE; loadRequests(); } });
  document.querySelectorAll(".quick-filter").forEach((button) => button.addEventListener("click", () => setQuickFilter(button)));
  $("notification-button").addEventListener("click", () => { $("notification-panel").hidden = !$("notification-panel").hidden; if (!$("notification-panel").hidden) loadNotifications(); });
  document.addEventListener("click", (event) => {
    if (mentionMenuVisible && !event.target.closest("#mention-menu") && event.target !== $("comment-body")) { $("mention-menu").hidden = true; mentionMenuVisible = false; }
    if (!event.target.closest(".notification-wrap")) $("notification-panel").hidden = true;
  });
  window.addEventListener("beforeunload", () => {
    clearPendingFiles();
    attachmentCache.forEach((asset) => URL.revokeObjectURL(asset.url));
  });

  restoreOrLogin();
})();
