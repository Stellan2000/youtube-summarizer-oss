import { readVisibleTranscript } from "./transcriptPanel.js";

interface SubtitleTrack {
  baseUrl: string;
  name: string;
  languageCode: string;
  isTranslatable: boolean;
}

declare global {
  var __ytSummaryTranscriptCache:
    | { videoId: string; text: string; staleText?: string; ready?: Promise<void> }
    | undefined;
}

export async function extractSubtitles(): Promise<string | null> {
  const currentVideoId = new URLSearchParams(window.location.search).get("v");
  const cached = globalThis.__ytSummaryTranscriptCache;
  if (cached?.videoId === currentVideoId) {
    await cached.ready;
    if (new URLSearchParams(window.location.search).get("v") !== currentVideoId) {
      return null;
    }
    if (cached.text) return cached.text;
  }

  // YouTube's own transcript panel already contains decoded caption text.
  // Prefer it over the legacy timed-text endpoint, which can return no text.
  const visibleTranscript = readVisibleTranscript();

  if (visibleTranscript && visibleTranscript !== cached?.staleText) {
    return visibleTranscript;
  }

  try {
    // Get video ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("v");
    if (!videoId) {
      throw new Error("Could not find video ID");
    }

    // First, try to get subtitles from YouTube's API
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    // Extract the ytInitialPlayerResponse from the page
    const playerResponseMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*({.+?});/
    );
    if (!playerResponseMatch) {
      throw new Error("Could not find player response");
    }

    const playerResponse = JSON.parse(playerResponseMatch[1]);
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;

    if (!captions) {
      throw new Error("No captions available");
    }

    // Find English subtitles or auto-generated English subtitles
    const captionTracks: SubtitleTrack[] = captions.captionTracks || [];
    const englishTrack = captionTracks.find(
      (track) => track.languageCode === "en" || track.languageCode === "a.en"
    );

    if (!englishTrack) {
      throw new Error("No English subtitles available");
    }

    // Fetch the actual subtitle content
    const subtitleResponse = await fetch(englishTrack.baseUrl);
    const subtitleXml = await subtitleResponse.text();

    // Parse the XML and extract text
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(subtitleXml, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName("text");

    // Combine all subtitle text
    let fullTranscript = "";
    for (let i = 0; i < textNodes.length; i++) {
      const text = textNodes[i].textContent;
      if (text) {
        fullTranscript += text + " ";
      }
    }

    return fullTranscript.trim();
  } catch (error) {
    console.error("Error extracting subtitles:", error);
    return null;
  }
}
