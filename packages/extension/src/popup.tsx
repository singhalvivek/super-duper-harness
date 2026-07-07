/**
 * Extension popup — the STATUS-ONLY capture UI (NOT a live transcript).
 *
 * Shows: recording indicator (dot + "Recording"/"Idle"), an elapsed mm:ss
 * timer, "Captions: ON/OFF", the 15s caption-off countdown warning, the
 * captions-on-to-start gate prompt, and a post-stop "Saved N lines" / retryable
 * error confirmation. All capture state comes FROM the content script (this is
 * a thin view); Start/Stop are commands sent to it.
 */

import { StrictMode, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";

import { DEFAULT_BACKEND_BASE_URL } from "./capture";
import {
  STATUS_STORAGE_KEY,
  idleStatus,
  type ContentPush,
  type PopupCommand,
  type PopupStatus,
} from "./messages";

const DASHBOARD_URL = `${DEFAULT_BACKEND_BASE_URL}/`;

/** Format an elapsed duration (ms) as mm:ss. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Send a command to the active tab's content script, resolving its status. */
async function sendCommand(command: PopupCommand): Promise<PopupStatus | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    const reply = (await chrome.tabs.sendMessage(tab.id, command)) as
      | PopupStatus
      | undefined;
    return reply ?? null;
  } catch {
    // Content script not present (not a Meet tab) — treat as idle.
    return null;
  }
}

function Popup(): JSX.Element {
  const [status, setStatus] = useState<PopupStatus>(idleStatus());
  const [notMeetTab, setNotMeetTab] = useState(false);
  // Local "now" drives the elapsed timer between status pushes.
  const [now, setNow] = useState(Date.now());

  // Initial status fetch + subscribe to pushes + hydrate from storage.
  useEffect(() => {
    let alive = true;

    void (async () => {
      // Fast hydrate from storage (survives popup close/reopen).
      try {
        const stored = await chrome.storage?.session?.get(STATUS_STORAGE_KEY);
        const cached = stored?.[STATUS_STORAGE_KEY] as PopupStatus | undefined;
        if (alive && cached) setStatus(cached);
      } catch {
        /* no storage — fine */
      }
      const fresh = await sendCommand({ type: "GET_STATUS" });
      if (!alive) return;
      if (fresh) setStatus(fresh);
      else setNotMeetTab(true);
    })();

    const onPush = (msg: ContentPush): void => {
      if (msg?.type === "STATUS") setStatus(msg.status);
    };
    chrome.runtime?.onMessage?.addListener(onPush);

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      chrome.runtime?.onMessage?.removeListener(onPush);
      clearInterval(timer);
    };
  }, []);

  const recording = status.status === "recording" || status.status === "warning";
  const elapsedMs = status.startedAt ? now - status.startedAt : 0;

  async function onStart(): Promise<void> {
    const reply = await sendCommand({ type: "START" });
    if (reply) setStatus(reply);
  }
  async function onStop(): Promise<void> {
    const reply = await sendCommand({ type: "STOP" });
    if (reply) setStatus(reply);
  }

  return (
    <div className="popup">
      <h1 className="popup__title">
        <span className={`dot ${recording ? "dot--live" : ""}`} aria-hidden />
        Meeting Capture Assistant
      </h1>

      <div className="status-row">
        <span className="status-row__label">Status:</span>
        <strong>{recording ? "Recording" : "Idle"}</strong>
      </div>

      <div className="timer" aria-label="Elapsed time">
        {formatElapsed(recording ? elapsedMs : 0)}
      </div>

      <div className="status-row">
        <span className="status-row__label">Captions:</span>
        <span className={status.captionsOn ? "captions--on" : "captions--off"}>
          {status.captionsOn ? "ON" : "OFF"}
        </span>
      </div>

      {recording && status.lineCount > 0 && (
        <div className="status-row">
          <span className="status-row__label">Lines captured:</span>
          <strong>{status.lineCount}</strong>
        </div>
      )}

      {/* Captions-on-to-start gate prompt */}
      {status.startBlockedCaptionsOff && !recording && (
        <div className="gate-prompt" role="alert">
          Turn on Google Meet captions first, then Start.
        </div>
      )}

      {/* 15s caption-off countdown */}
      {status.status === "warning" && (
        <div className="warning" role="alert">
          Recording will stop in {status.countdownSecondsLeft}s unless you turn
          captions back on.
        </div>
      )}

      <div className="actions">
        {!recording ? (
          <button className="btn--start" onClick={onStart} disabled={notMeetTab}>
            Start
          </button>
        ) : (
          <button className="btn--stop" onClick={onStop}>
            Stop
          </button>
        )}
        <a
          className="dashboard-link"
          href={DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          style={{ flex: "none", alignSelf: "center" }}
        >
          Dashboard
        </a>
      </div>

      {/* Post-stop confirmation / retryable error */}
      {status.lastSave && !recording && (
        <div className={`save ${status.lastSave.ok ? "save--ok" : "save--err"}`}>
          {status.lastSave.message}
          {status.lastSave.ok && (
            <>
              <br />
              <a
                className="dashboard-link"
                href={DASHBOARD_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open dashboard →
              </a>
            </>
          )}
        </div>
      )}

      {notMeetTab && (
        <p className="hint">
          Open a Google Meet tab (meet.google.com) and turn on captions to
          capture a meeting.
        </p>
      )}
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}
