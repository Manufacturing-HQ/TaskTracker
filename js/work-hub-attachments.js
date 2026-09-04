"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;
  if (!config || !supabaseLib) return;

  const client = supabaseLib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const ENDPOINT = `${config.supabaseUrl}/functions/v1/work-hub-attachment`;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_FILES = 10;
  const ACCEPTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "csv", "docx", "xlsx"]);

  let activeProjectId = null;
  let pendingFiles = [];
  let peopleCache = null;
  let enhancementScheduled = false;

  function token() {
    return sessionStorage.getItem(config.sessionStorageKey) || "";
  }

  function setMessage(text, type = "info") {
    const el = document.getElementById("app-message");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.type = type;
    el.hidden = !text;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || `${name} failed.`);
    return data;
  }

  function extensionOf(name) {
    const text = String(name || "").toLowerCase();
    const dot = text.lastIndexOf(".");
    return dot >= 0 ? text.slice(dot + 1) : "";
  }

  function isAccepted(file) {
    return ACCEPTED_EXTENSIONS.has(extensionOf(file.name));
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified, file.type].join("|");
  }

  function clearPendingFiles() {
    pendingFiles.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    pendingFiles = [];
    renderPendingFiles();
  }

  function addFiles(files) {
    const existing = new Set(pendingFiles.map((entry) => fileKey(entry.file)));
    const rejected = [];

    for (const file of Array.from(files || [])) {
      if (pendingFiles.length >= MAX_FILES) {
        rejected.push(`${file.name}: maximum ${MAX_FILES} files per update`);
        continue;
      }
      if (!file.size || file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name}: file must be between 1 byte and 10 MB`);
        continue;
      }
      if (!isAccepted(file)) {
        rejected.push(`${file.name}: unsupported file type`);
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) continue;
      existing.add(key);
      pendingFiles.push({
        file,
        previewUrl: String(file.type || "").startsWith("image/") ? URL.createObjectURL(file) : null
      });
    }

    renderPendingFiles();
    if (rejected.length) setMessage(rejected.join(" · "), "error");
  }

  function renderPendingFiles() {
    const host = document.getElementById("workhub-pending-attachments");
    if (!host) return;
    if (!pendingFiles.length) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.innerHTML = pendingFiles.map((entry, index) => `
      <div class="wh-attachment-chip">
        ${entry.previewUrl ? `<img src="${entry.previewUrl}" alt="">` : `<span class="wh-file-icon">📎</span>`}
        <div class="wh-attachment-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</div>
        <button type="button" class="wh-remove-attachment" data-index="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button>
      </div>
    `).join("");

    host.querySelectorAll(".wh-remove-attachment").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        const [removed] = pendingFiles.splice(index, 1);
        if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        renderPendingFiles();
      });
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyles() {
    if (document.getElementById("workhub-attachment-styles")) return;
    const style = document.createElement("style");
    style.id = "workhub-attachment-styles";
    style.textContent = `
      .wh-attachment-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
      .wh-attachment-helper{font-size:12px;color:var(--muted)}
      .wh-pending-attachments{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .wh-attachment-chip{display:flex;align-items:center;gap:7px;max-width:280px;border:1px solid #94a3b8;border-radius:9px;background:#fff;padding:6px 7px}
      .wh-attachment-chip img{width:48px;height:38px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1}
      .wh-file-icon{font-size:20px}
      .wh-attachment-name{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:750}
      .wh-remove-attachment{border:0;background:transparent;color:#991b1b;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}
      .wh-attachment-link{border:0;background:transparent;padding:0;color:var(--blue);font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .wh-attachment-link:disabled{opacity:.6;cursor:wait}
      #project-comment.wh-drop-ready{outline:3px solid #93c5fd;outline-offset:2px;background:#eff6ff}
    `;
    document.head.appendChild(style);
  }

  function enhanceComposer() {
    const composer = document.querySelector(".project-update-section .composer");
    const textarea = document.getElementById("project-comment");
    const postButton = document.getElementById("post-project-comment");
    if (!composer || !textarea || !postButton) return;
    if (composer.dataset.attachmentsEnhanced === "true") return;
    composer.dataset.attachmentsEnhanced = "true";

    const footer = postButton.closest("div");
    const existingHelper = footer?.querySelector("span.muted");
    if (existingHelper) existingHelper.textContent = "Paste a screenshot into the comment box, or attach a file before posting.";

    const tools = document.createElement("div");
    tools.className = "wh-attachment-tools";
    tools.innerHTML = `
      <button id="workhub-attach-file" class="ghost small" type="button">📎 Add Screenshot / File</button>
      <input id="workhub-file-input" type="file" hidden multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx">
      <span class="wh-attachment-helper">Images, PDF, TXT, CSV, DOCX, XLSX · 10 MB max each</span>
    `;

    const pending = document.createElement("div");
    pending.id = "workhub-pending-attachments";
    pending.className = "wh-pending-attachments";
    pending.hidden = true;

    if (footer) composer.insertBefore(tools, footer);
    else composer.appendChild(tools);
    if (footer) composer.insertBefore(pending, footer);
    else composer.appendChild(pending);

    document.getElementById("workhub-attach-file")?.addEventListener("click", () => {
      document.getElementById("workhub-file-input")?.click();
    });

    document.getElementById("workhub-file-input")?.addEventListener("change", (event) => {
      addFiles(event.target.files);
      event.target.value = "";
    });

    textarea.addEventListener("paste", (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) => String(file.type || "").startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    });

    textarea.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      textarea.classList.add("wh-drop-ready");
    });
    textarea.addEventListener("dragleave", () => textarea.classList.remove("wh-drop-ready"));
    textarea.addEventListener("drop", (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      textarea.classList.remove("wh-drop-ready");
      addFiles(event.dataTransfer.files);
    });

    renderPendingFiles();
  }

  function enhanceExistingAttachments() {
    document.querySelectorAll(".feed-item").forEach((article) => {
      const updateId = article.querySelector(".pin-update")?.dataset.id;
      if (!updateId) return;
      const spans = Array.from(article.querySelectorAll(".links span"));
      spans.forEach((span, attachmentIndex) => {
        if (span.dataset.attachmentEnhanced === "true") return;
        const fileName = span.textContent.replace(/^\s*📎\s*/, "").trim() || "Attachment";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wh-attachment-link";
        button.textContent = `📎 ${fileName}`;
        button.dataset.updateId = updateId;
        button.dataset.attachmentIndex = String(attachmentIndex);
        button.dataset.fileName = fileName;
        button.dataset.attachmentEnhanced = "true";
        button.addEventListener("click", () => openAttachment(button));
        span.replaceWith(button);
      });
    });
  }

  async function ensurePeople() {
    if (peopleCache) return peopleCache;
    const sessionToken = token();
    if (!sessionToken) return [];
    const data = await rpc("get_work_hub_bootstrap", { p_session_token: sessionToken });
    peopleCache = data?.people || [];
    return peopleCache;
  }

  async function detectedMentionIds(text) {
    const lower = String(text || "").toLowerCase();
    const people = await ensurePeople();
    return people
      .filter((person) => lower.includes(`@${String(person.employee_name || "").toLowerCase()}`))
      .map((person) => person.employee_id);
  }

  async function uploadFile(updateId, file) {
    const form = new FormData();
    form.append("operation", "upload");
    form.append("session_token", token());
    form.append("update_id", updateId);
    form.append("file", file, file.name);

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "apikey": config.supabasePublishableKey },
      body: form
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Attachment upload failed for ${file.name}.`);
    }
    return await response.json();
  }

  async function refreshNotificationBadge() {
    try {
      const data = await rpc("get_my_notifications", {
        p_session_token: token(),
        p_unread_only: false,
        p_limit: 40
      });
      const badge = document.getElementById("notification-badge");
      if (!badge) return;
      const count = Number(data?.unread_count || 0);
      badge.textContent = String(count);
      badge.hidden = count === 0;
    } catch {}
  }

  function refreshActiveProjectDrawer() {
    if (!activeProjectId) return;
    const card = Array.from(document.querySelectorAll(".project-card[data-id]")).find((el) => el.dataset.id === activeProjectId);
    if (card) card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  async function postWithAttachments(button) {
    const sessionToken = token();
    const textarea = document.getElementById("project-comment");
    const taskSelect = document.getElementById("comment-task");
    if (!sessionToken || !activeProjectId || !textarea) {
      setMessage("Open the project again before posting this attachment.", "error");
      return;
    }

    const filesToUpload = pendingFiles.map((entry) => entry.file);
    const typedBody = textarea.value.trim();
    const body = typedBody || (filesToUpload.length === 1 ? `Attached ${filesToUpload[0].name}.` : `Attached ${filesToUpload.length} files.`);
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Posting...";

    try {
      const result = await rpc("add_work_hub_project_update", {
        p_session_token: sessionToken,
        p_project_id: activeProjectId,
        p_project_task_id: taskSelect?.value || null,
        p_body: body,
        p_mention_employee_ids: await detectedMentionIds(body)
      });
      const updateId = result?.update_id;
      if (!updateId) throw new Error("Project update was created without an update ID.");

      const failed = [];
      for (let index = 0; index < filesToUpload.length; index++) {
        button.textContent = `Uploading ${index + 1} of ${filesToUpload.length}...`;
        try {
          await uploadFile(updateId, filesToUpload[index]);
        } catch (error) {
          failed.push(`${filesToUpload[index].name}: ${error.message || String(error)}`);
        }
      }

      textarea.value = "";
      clearPendingFiles();
      document.getElementById("mention-menu")?.setAttribute("hidden", "");
      await refreshNotificationBadge();
      refreshActiveProjectDrawer();

      if (failed.length) {
        setMessage(`Update posted, but ${failed.length} attachment${failed.length === 1 ? "" : "s"} failed: ${failed.join(" · ")}`, "error");
      } else {
        setMessage(`Update posted with ${filesToUpload.length} attachment${filesToUpload.length === 1 ? "" : "s"}.`, "success");
      }
    } catch (error) {
      setMessage(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function openAttachment(button) {
    const sessionToken = token();
    if (!sessionToken) return;

    const fileName = button.dataset.fileName || "attachment";
    const extension = extensionOf(fileName);
    const shouldOpen = ["png", "jpg", "jpeg", "webp", "gif", "pdf"].includes(extension);
    const previewWindow = shouldOpen ? window.open("about:blank", "_blank") : null;
    if (previewWindow) previewWindow.opener = null;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Opening...";

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "apikey": config.supabasePublishableKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operation: "download",
          session_token: sessionToken,
          update_id: button.dataset.updateId,
          attachment_index: Number(button.dataset.attachmentIndex || 0)
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Attachment could not be opened.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (shouldOpen && previewWindow) {
        previewWindow.location.href = url;
      } else {
        if (previewWindow) previewWindow.close();
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (previewWindow) previewWindow.close();
      setMessage(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function scheduleEnhancement() {
    if (enhancementScheduled) return;
    enhancementScheduled = true;
    window.requestAnimationFrame(() => {
      enhancementScheduled = false;
      ensureStyles();
      enhanceComposer();
      enhanceExistingAttachments();
    });
  }

  document.addEventListener("click", (event) => {
    const projectCard = event.target.closest?.(".project-card[data-id]");
    if (projectCard && !event.target.closest?.("button,a")) {
      if (activeProjectId !== projectCard.dataset.id) clearPendingFiles();
      activeProjectId = projectCard.dataset.id;
    }

    if (event.target.closest?.("#close-drawer,#drawer-overlay")) {
      clearPendingFiles();
      activeProjectId = null;
    }

    const postButton = event.target.closest?.("#post-project-comment");
    if (!postButton || !pendingFiles.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    postWithAttachments(postButton);
  }, true);

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleEnhancement();
})();
