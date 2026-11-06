import { findOpenTranscriptPanel, readVisibleTranscript, TRANSCRIPT_PANEL_SELECTOR } from "./transcriptPanel.js";

// This runs in the extension's isolated world. The cache stays in this tab.
(() => {
  const MASK = "data-yt-summary-prefetch";
  let controller;
  let sequence = 0;
  let previousVideo = "";
  let previousText = "";
  let closeOwnedPanel;

  const style = document.createElement("style");
  style.textContent = `html[${MASK}] ${TRANSCRIPT_PANEL_SELECTOR} { opacity: 0 !important; pointer-events: none !important; transition: none !important; }`;
  document.documentElement.appendChild(style);

  function videoId() {
    return location.pathname === "/watch"
      ? new URLSearchParams(location.search).get("v")
      : null;
  }

  function pause(signal) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, 100);
      signal.addEventListener("abort", done, { once: true });
      if (signal.aborted) done();
    });
  }

  async function waitFor(check, signal, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (!signal.aborted && Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await pause(signal);
    }
    return null;
  }

  async function load(state, signal, ticket, staleText) {
    let openedByExtension = false;
    let userInteracted = false;
    const onInteraction = (event) => {
      if (event.isTrusted && event.target?.closest?.(TRANSCRIPT_PANEL_SELECTOR)) userInteracted = true;
    };
    const closeIfOwned = () => {
      if (!openedByExtension || userInteracted) return;
      const panel = findOpenTranscriptPanel();
      const close = Array.from(panel?.querySelectorAll("button") || [])
        .find((button) => /^(stäng|close)$/i.test(button.getAttribute("aria-label") || ""));
      close?.click();
    };
    closeOwnedPanel = closeIfOwned;
    document.addEventListener("pointerdown", onInteraction, true);
    document.addEventListener("keydown", onInteraction, true);
    try {
      // YouTube updates the URL before it has finished replacing the video DOM.
      const watch = await waitFor(() => {
        const element = document.querySelector("ytd-watch-flexy");
        return videoId() === state.videoId &&
          element?.getAttribute("video-id") === state.videoId ? element : null;
      }, signal);
      if (!watch || signal.aborted) return;

      const alreadyOpen = Boolean(findOpenTranscriptPanel());
      if (!alreadyOpen) {
        const button = await waitFor(() => {
          const buttons = Array.from(watch.querySelectorAll("button"))
            .filter((element) => !element.disabled &&
              element.getAttribute("aria-disabled") !== "true" &&
              /^(visa transkription|show transcript)$/i.test(
                (element.getAttribute("aria-label") || element.textContent || "").trim()
              ));
          return buttons.find((element) => element.getClientRects().length > 0) || buttons[0];
        }, signal);
        if (!button || signal.aborted || videoId() !== state.videoId) return;
        document.documentElement.setAttribute(MASK, String(ticket));
        openedByExtension = true;
        // This button exists even inside the collapsed video description.
        button.click();
      }

      let candidate = "";
      let stableSince = 0;
      const text = await waitFor(() => {
        if (videoId() !== state.videoId) return null;
        const current = readVisibleTranscript();
        // A reused panel can briefly contain the preceding video's transcript.
        if (!current || (staleText && current === staleText)) return null;
        if (current !== candidate) {
          candidate = current;
          stableSince = Date.now();
          return null;
        }
        return Date.now() - stableSince >= 400 ? current : null;
      }, signal);
      if (text && !signal.aborted && videoId() === state.videoId) {
        state.text = text;
        previousText = text;
      }
    } finally {
      document.removeEventListener("pointerdown", onInteraction, true);
      document.removeEventListener("keydown", onInteraction, true);
      // Never close a panel the user opened or began using themselves.
      if (openedByExtension && !userInteracted && !signal.aborted && videoId() === state.videoId) {
        closeIfOwned();
      }
      if (closeOwnedPanel === closeIfOwned) closeOwnedPanel = undefined;
      if (document.documentElement.getAttribute(MASK) === String(ticket)) {
        document.documentElement.removeAttribute(MASK);
      }
    }
  }

  function cancel() {
    if (document.querySelector("ytd-watch-flexy")?.getAttribute("video-id") === previousVideo) {
      const text = readVisibleTranscript();
      if (text) previousText = text;
    }
    closeOwnedPanel?.();
    controller?.abort();
    globalThis.__ytSummaryTranscriptCache = undefined;
    document.documentElement.removeAttribute(MASK);
  }

  function start() {
    const id = videoId();
    const existing = globalThis.__ytSummaryTranscriptCache;
    if (id && existing?.videoId === id) return;
    cancel();
    const staleText = id !== previousVideo ? previousText : "";
    if (!id) return;
    previousVideo = id;
    controller = new AbortController();
    const state = { videoId: id, text: "", staleText, ready: undefined };
    globalThis.__ytSummaryTranscriptCache = state;
    state.ready = load(state, controller.signal, ++sequence, staleText).catch(() => {
      // Leave the existing subtitle fallback available if YouTube changes its UI.
    });
  }

  document.addEventListener("yt-navigate-start", cancel);
  document.addEventListener("yt-navigate-finish", start);
  window.addEventListener("popstate", start);
  window.addEventListener("pagehide", cancel);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
