"use strict";

(() => {
  const config = window.TaskTrackerConfig;
  const supabaseLib = window.supabase;

  if (!config || !supabaseLib) return;

  const sessionKey = config.sessionStorageKey;
  const heartbeatIntervalMs = 5 * 60 * 1000;
  const loginWatchIntervalMs = 500;

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

  let expiryTimer = null;
  let heartbeatTimer = null;
  let loginWatchTimer = null;
  let heartbeatInFlight = false;
  let lastHeartbeatAttemptAt = 0;
  let expiryMs = null;

  const style = document.createElement("style");
  style.textContent = `
    .session-expired-overlay{position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.78);display:grid;place-items:center;padding:20px}
    .session-expired-card{width:min(520px,96vw);background:#fff;border:3px solid #991b1b;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center}
    .session-expired-card h2{margin:0 0 10px;font-size:26px}
    .session-expired-card p{margin:0 0 18px;color:#475569}
    .session-expired-card button{border:0;border-radius:10px;padding:12px 18px;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer}
  `;
  document.head.appendChild(style);

  function goToNeutralLogin() {
    sessionStorage.removeItem(sessionKey);
    window.top.location.replace("index.html");
  }

  function showExpired() {
    if (document.getElementById("session-expired-overlay")) return;

    document
      .querySelectorAll("button, input, select, textarea")
      .forEach((element) => {
        if (!element.closest("#session-expired-overlay")) {
          element.disabled = true;
        }
      });

    const overlay = document.createElement("div");
    overlay.id = "session-expired-overlay";
    overlay.className = "session-expired-overlay";
    overlay.innerHTML = `
      <div class="session-expired-card">
        <h2>Session Expired</h2>
        <p>Your Task Tracker session has ended. Sign back in to continue.</p>
        <button type="button">Return to Sign In</button>
      </div>
    `;
    overlay.querySelector("button").addEventListener("click", goToNeutralLogin);
    document.body.appendChild(overlay);
  }

  function scheduleExpiry(expiresAt) {
    const parsedExpiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(parsedExpiry)) return;

    expiryMs = parsedExpiry;
    if (expiryTimer) clearTimeout(expiryTimer);

    expiryTimer = window.setTimeout(
      showExpired,
      Math.max(0, expiryMs - Date.now())
    );
  }

  function isMissingHeartbeatFunction(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
      error?.code === "PGRST202" ||
      (message.includes("heartbeat_employee_session") &&
        message.includes("schema cache"))
    );
  }

  async function requestSessionHeartbeat(token) {
    let response = await client.rpc("heartbeat_employee_session", {
      p_session_token: token
    });

    // Backward-compatible during deployment: before the heartbeat migration
    // exists, validate through the existing session-context endpoint.
    if (response.error && isMissingHeartbeatFunction(response.error)) {
      response = await client.rpc("get_employee_session_context", {
        p_session_token: token
      });
    }

    if (response.error) throw response.error;

    const row = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (!row?.expires_at) {
      throw new Error("The login session is invalid or has expired.");
    }

    return row;
  }

  async function heartbeat(force = false) {
    const token = sessionStorage.getItem(sessionKey);
    if (!token || heartbeatInFlight) return;

    const now = Date.now();
    if (!force && now - lastHeartbeatAttemptAt < heartbeatIntervalMs) return;

    lastHeartbeatAttemptAt = now;
    heartbeatInFlight = true;

    try {
      const session = await requestSessionHeartbeat(token);
      scheduleExpiry(session.expires_at);
    } catch (error) {
      console.warn(
        "Task Tracker session heartbeat failed:",
        error?.message || error
      );

      // Do not strand someone because of one brief network interruption. If the
      // known expiration has passed, end the session; otherwise the next timer,
      // focus, or visibility change will try again.
      if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
        showExpired();
      }
    } finally {
      heartbeatInFlight = false;
    }
  }

  function beginHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeat(true);
    heartbeatTimer = window.setInterval(
      () => heartbeat(false),
      heartbeatIntervalMs
    );
  }

  function watchForLogin() {
    if (sessionStorage.getItem(sessionKey)) {
      beginHeartbeat();
      return;
    }

    loginWatchTimer = window.setInterval(() => {
      if (!sessionStorage.getItem(sessionKey)) return;
      clearInterval(loginWatchTimer);
      loginWatchTimer = null;
      beginHeartbeat();
    }, loginWatchIntervalMs);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) heartbeat(false);
  });
  window.addEventListener("focus", () => heartbeat(false));

  watchForLogin();
})();

(() => {
  if (!document.querySelector('.nav button[data-view="memos"]')) return;
  if (document.querySelector('script[data-employee-memo-actions="true"]')) return;

  const script = document.createElement("script");
  script.src = "js/employee-memo-actions.js?v=memo-poll-20260820-1117";
  script.dataset.employeeMemoActions = "true";
  document.body.appendChild(script);
})();
