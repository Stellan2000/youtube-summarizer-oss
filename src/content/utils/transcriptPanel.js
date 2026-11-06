// YouTube currently serves both the legacy transcript renderer and a newer
// timeline panel. The latter can have no target-id on its expanded panel.
const PANEL = "ytd-engagement-panel-section-list-renderer";
const ROWS = "ytd-transcript-segment-renderer, transcript-segment-view-model";
export const EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
export const TRANSCRIPT_PANEL_SELECTOR = `${PANEL}:is(
  [target-id="engagement-panel-searchable-transcript"],
  [target-id="PAmodern_transcript_view"],
  :has(ytd-transcript-segment-renderer),
  :has(transcript-segment-view-model),
  :has([role="tab"][aria-selected="true"][aria-label="Manuskript"]),
  :has([role="tab"][aria-selected="true"][aria-label="Transcript"])
)`;

export function findOpenTranscriptPanel() {
  return Array.from(document.querySelectorAll(PANEL)).find((panel) => {
    if (panel.getAttribute("visibility") !== EXPANDED) return false;
    if (panel.querySelector(ROWS)) return true;
    const target = panel.getAttribute("target-id");
    if (target === "engagement-panel-searchable-transcript" || target === "PAmodern_transcript_view") return true;
    return Array.from(panel.querySelectorAll('[role="tab"][aria-selected="true"]'))
      .some((tab) => /^(manuskript|transcript)$/i.test(
        (tab.getAttribute("aria-label") || tab.textContent || "").trim()
      ));
  });
}

export function readVisibleTranscript() {
  const panel = findOpenTranscriptPanel();
  if (!panel) return "";
  return Array.from(panel.querySelectorAll(ROWS))
    .filter((row) => row.getClientRects().length > 0)
    .map((row) => {
      const text = row.querySelector('.segment-text, span.ytAttributedStringHost[role="text"]')
        ?.textContent?.replace(/\s+/g, " ").trim();
      const time = row.querySelector('.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp')
        ?.textContent?.trim();
      return text ? `${time ? `[${time}] ` : ""}${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
