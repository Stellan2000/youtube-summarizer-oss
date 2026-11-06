import React from "react";
import { createRoot } from "react-dom/client";
import { SummaryButton } from "./components/SummaryButton";
import "./utils/autoTranscript.js";

const BUTTON_CONTAINER_ID = "yt-summary-extension-container";

function injectSummaryButton() {
  // Check if we're on a YouTube video page
  if (!window.location.pathname.includes("/watch")) {
    return;
  }

  // Wait for the secondary column (recommendations) to load
  const secondaryInner = document.getElementById("secondary-inner");
  if (!secondaryInner) {
    setTimeout(injectSummaryButton, 1000);
    return;
  }

  // Check if our container already exists
  let container = document.getElementById(BUTTON_CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = BUTTON_CONTAINER_ID;
    secondaryInner.insertBefore(container, secondaryInner.firstChild);
  }

  // Create root if it doesn't exist
  if (!container.hasAttribute("data-root-initialized")) {
    const root = createRoot(container);
    container.setAttribute("data-root-initialized", "true");
    root.render(React.createElement(SummaryButton));
  }
}

// Initial injection
injectSummaryButton();

// Listen for YouTube's navigation events
window.addEventListener("yt-navigate-finish", injectSummaryButton);
