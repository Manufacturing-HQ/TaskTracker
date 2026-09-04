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
  const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

  let activeProjectId = null;
  let pendingFiles = [];
  let peopleCache = null;
  let enhancementScheduled = false;
  let inlineObserver = null;
  const inlinePreviewUrls = new Map();
  const inlinePreviewPromises = new Map();

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

  function isImageFileName(name) {
    return IMAGE_EXTENSIONS.has(extensionOf(name));
  }

  function isAccepted(file) {
    return ACCEPTED_EXTENSIONS.has(extensionOf(file.name));
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified, file.type].join("|");
  }

  function previewKey(updateId, attachmentIndex) {
    return `${updateId}:${attachmentIndex}`;
  }

  function clearPendingFiles() {
    pendingFiles.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    pendingFiles = [];
    renderPendingFiles();
  }

  function clearInlinePreviewCache() {
    inlinePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    inlinePreviewUrls.clear();
    inlinePreviewPromises.clear();
    if (inlineObserver) inlineObserver.disconnect();
    inlineObserver = null;
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
    host.innerHTML = pendingFiles.map((entry, index) => {
      const fileName = escapeHtml(entry.file.name);
      if (entry.previewUrl) {
        return `
          <div class="wh-pending-image-card">
            <div class="wh-pending-image-head">
              <div class="wh-attachment-name" title="${fileName}">${fileName}</div>
              <button type="button" class="wh-remove-attachment" data-index="${index}" aria-label="Remove ${fileName}">×</button>
            </div>
            <img class="wh-pending-image-preview" src="${entry.previewUrl}" alt="${fileName}">
          </div>
        `;
      }
      return `
        <div class="wh-attachment-chip">
          <span class="wh-file-icon">📎</span>
          <div class="wh-attachment-name" title="${fileName}">${fileName}</div>
          <button type="button" class="wh-remove-attachment" data-index="${index}" aria-label="Remove ${fileName}">×</button>
        </div>
      `;
    }).join("");

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
      .wh-pending-attachments{display:flex;flex-direction:column;gap:10px;margin-top:10px;align-items:flex-start}
      .wh-pending-image-card{width:min(760px,100%);border:1px solid #94a3b8;border-radius:11px;background:#fff;padding:8px;box-shadow:0 2px 8px rgba(15,23,42,.05)}
      .wh-pending-image-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
      .wh-pending-image-preview{display:block;max-width:100%;width:auto;max-height:380px;object-fit:contain;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}
      .wh-attachment-chip{display:flex;align-items:center;gap:7px;max-width:320px;border:1px solid #94a3b8;border-radius:9px;background:#fff;padding:6px 7px}
      .wh-file-icon{font-size:20px}
      .wh-attachment-name{min-width:0;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:750}
      .wh-remove-attachment{border:0;background:transparent;color:#991b1b;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;flex:0 0 auto}
      .wh-attachment-link{border:0;background:transparent;padding:0;color:var(--blue);font:inherit;font-size:13px;font-weight:800;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .wh-attachment-link:disabled{opacity:.6;cursor:wait}
      .feed-item .links{align-items:flex-start}
      .wh-inline-attachment{flex:1 1 100%;width:min(760px,100%);max-width:760px;margin-top:8px}
      .wh-inline-image-button{display:block;width:100%;padding:0;border:1px solid #94a3b8;border-radius:10px;background:#f8fafc;overflow:hidden;cursor:zoom-in;text-align:left}
      .wh-inline-image-button img{display:block;max-width:100%;width:auto;max-height:500px;object-fit:contain;background:#f8fafc;margin:0 auto}
      .wh-inline-image-placeholder{min-height:150px;display:grid;place-items:center;padding:24px;color:#64748b;font-size:13px;font-weight:750;background:linear-gradient(135deg,#f8fafc,#eef4fb)}
      .wh-inline-image-meta{margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .wh-inline-image-note{font-size:11px;color:#64748b}
      .wh-inline-attachment.preview-error .wh-inline-image-placeholder{color:#991b1b;background:#fef2f2}
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

  async function fetchAttachmentBlob(updateId, attachmentIndex) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "apikey": config.supabasePublishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "download",
        session_token: token(),
        update_id: updateId,
        attachment_index: Number(attachmentIndex || 0)
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Attachment could not be opened.");
    }

    return await response.blob();
  }

  async function getInlinePreviewUrl(updateId, attachmentIndex) {
    const key = previewKey(updateId, attachmentIndex);
    if (inlinePreviewUrls.has(key)) return inlinePreviewUrls.get(key);
    if (inlinePreviewPromises.has(key)) return await inlinePreviewPromises.get(key);

    const promise = (async () => {
      const blob = await fetchAttachmentBlob(updateId, attachmentIndex);
      const url = URL.createObjectURL(blob);
      inlinePreviewUrls.set(key, url);
      inlinePreviewPromises.delete(key);
      return url;
    })().catch((error) => {
      inlinePreviewPromises.delete(key);
      throw error;
    });

    inlinePreviewPromises.set(key, promise);
    return await promise;
  }

  function getInlineObserver() {
    if (inlineObserver) return inlineObserver;
    inlineObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        loadInlinePreview(entry.target);
      });
    }, { root: null, rootMargin: "350px 0px", threshold: 0.01 });
    return inlineObserver;
  }

  async function loadInlinePreview(wrapper) {
    if (!wrapper || wrapper.dataset.previewState === "loaded" || wrapper.dataset.previewState === "loading") return;
    const button = wrapper.querySelector(".wh-inline-image-button");
    const placeholder = wrapper.querySelector(".wh-inline-image-placeholder");
    if (!button || !placeholder) return;

    wrapper.dataset.previewState = "loading";
    placeholder.textContent = "Loading screenshot...";

    try {
      const url = await getInlinePreviewUrl(wrapper.dataset.updateId, Number(wrapper.dataset.attachmentIndex || 0));
      if (!wrapper.isConnected) return;
      const img = document.createElement("img");
      img.src = url;
      img.alt = wrapper.dataset.fileName || "Project screenshot";
      img.loading = "lazy";
      img.decoding = "async";
      button.replaceChildren(img);
      wrapper.dataset.previewState = "loaded";
    } catch (error) {
      wrapper.dataset.previewState = "error";
      wrapper.classList.add("preview-error");
      placeholder.textContent = "Preview unavailable. Click the file name to open it.";
    }
  }

  function openCachedInlinePreview(wrapper, fallbackButton) {
    const key = previewKey(wrapper.dataset.updateId, Number(wrapper.dataset.attachmentIndex || 0));
    const cachedUrl = inlinePreviewUrls.get(key);
    if (!cachedUrl) {
      openAttachment(fallbackButton);
      return;
    }
    const previewWindow = window.open(cachedUrl, "_blank");
    if (previewWindow) previewWindow.opener = null;
  }

  function createInlineImageAttachment(updateId, attachmentIndex, fileName) {
    const wrapper = document.createElement("div");
    wrapper.className = "wh-inline-attachment";
    wrapper.dataset.updateId = updateId;
    wrapper.dataset.attachmentIndex = String(attachmentIndex);
    wrapper.dataset.fileName = fileName;
    wrapper.dataset.previewState = "waiting";

    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "wh-inline-image-button";
    imageButton.setAttribute("aria-label", `Open ${fileName} full size`);
    imageButton.innerHTML = `<div class="wh-inline-image-placeholder">Screenshot preview</div>`;

    const meta = document.createElement("div");
    meta.className = "wh-inline-image-meta";

    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.className = "wh-attachment-link";
    linkButton.textContent = `📎 ${fileName} · Open full size`;
    linkButton.dataset.updateId = updateId;
    linkButton.dataset.attachmentIndex = String(attachmentIndex);
    linkButton.dataset.fileName = fileName;

    const note = document.createElement("span");
    note.className = "wh-inline-image-note";
    note.textContent = "Loads only when it is near the visible comment area.";

    imageButton.addEventListener("click", () => openCachedInlinePreview(wrapper, linkButton));
    linkButton.addEventListener("click", () => openCachedInlinePreview(wrapper, linkButton));

    meta.append(linkButton, note);
    wrapper.append(imageButton, meta);
    getInlineObserver().observe(wrapper);
    return wrapper;
  }

  function enhanceExistingAttachments() {
    document.querySelectorAll(".feed-item").forEach((article) => {
      const updateId = article.querySelector(".pin-update")?.dataset.id;
      if (!updateId) return;
      const spans = Array.from(article.querySelectorAll(".links span"));
      spans.forEach((span, attachmentIndex) => {
        if (span.dataset.attachmentEnhanced === "true") return;
        const fileName = span.textContent.replace(/^\s*📎\s*/, "").trim() || "Attachment";
        span.dataset.attachmentEnhanced = "true";

        if (isImageFileName(fileName)) {
          span.replaceWith(createInlineImageAttachment(updateId, attachmentIndex, fileName));
          return;
        }

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
    if (!card) return;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
      const blob = await fetchAttachmentBlob(button.dataset.updateId, Number(button.dataset.attachmentIndex || 0));
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
      if (activeProjectId !== projectCard.dataset.id) {
        clearPendingFiles();
        clearInlinePreviewCache();
      }
      activeProjectId = projectCard.dataset.id;
    }

    if (event.target.closest?.("#close-drawer,#drawer-overlay")) {
      clearPendingFiles();
      clearInlinePreviewCache();
      activeProjectId = null;
    }

    const postButton = event.target.closest?.("#post-project-comment");
    if (!postButton || !pendingFiles.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    postWithAttachments(postButton);
  }, true);

  window.addEventListener("beforeunload", clearInlinePreviewCache);

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleEnhancement();
})();
