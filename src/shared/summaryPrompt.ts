export const DEFAULT_SUMMARY_PROMPT = `Provide a concise summary of this YouTube video transcript using markdown formatting.

Required format:

# TLDR

[2-3 sentence overview]

# Key Points

[Main content summary formatted as markdown]

Formatting rules:

- Use bullet points for key points
- Use **bold** for important terms
- Use --- for section breaks
- Use [text](link) for any references

Be direct and concise. Do not use introductory phrases like "Here's a summary" or "Let me summarize".  Do not refer to the transcript itself.`;

export function normalizeSummaryPrompt(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_SUMMARY_PROMPT;
}

export async function getSummaryPrompt(): Promise<string> {
  const { summaryPrompt } = await chrome.storage.local.get("summaryPrompt");
  return normalizeSummaryPrompt(summaryPrompt);
}

export function buildSummaryPrompt(transcript: string, instructions: string): string {
  return `${normalizeSummaryPrompt(instructions)}\n\nVideo transcript:\n${transcript}`;
}
