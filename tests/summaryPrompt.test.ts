import { beforeEach, expect, mock, test } from "bun:test";

let storedPrompt: unknown;
let lastRequest: { url: string; body: any } | undefined;

globalThis.chrome = {
  storage: {
    local: { get: async () => ({ summaryPrompt: storedPrompt }) },
    sync: {
      get: async () => ({ apiKey: "test-key-only", selectedModel: "test-model" }),
    },
  },
} as unknown as typeof chrome;

mock.module("../src/shared/utils/proxy", () => ({
  proxyFetch: async () => ({ data: [] }),
  proxyFetchStream: async function* (url: string, options: RequestInit) {
    lastRequest = { url, body: JSON.parse(options.body as string) };
    yield "Summary response";
  },
}));

const { generateSummary, askQuestion } = await import("../src/content/utils/ai");
const { DEFAULT_SUMMARY_PROMPT } = await import("../src/shared/summaryPrompt");
const provider = { name: "Test", baseUrl: "https://example.invalid/v1", model: "fallback-model" };

beforeEach(() => {
  storedPrompt = undefined;
  lastRequest = undefined;
});

async function summarize(transcript = "[0:04] Video text.") {
  let text = "";
  for await (const chunk of generateSummary(transcript, provider)) text += chunk;
  return text;
}

test("saved instructions reach the summary request with the transcript appended", async () => {
  storedPrompt = "Sammanfatta på svenska i fem punkter. Ta med tidsstämplar.";
  expect(await summarize()).toBe("Summary response");
  expect(lastRequest?.body.messages).toEqual([{
    role: "user",
    content: `${storedPrompt}\n\nVideo transcript:\n[0:04] Video text.`,
  }]);
  expect(lastRequest?.body.model).toBe("test-model");
  expect(lastRequest?.url).toBe("https://example.invalid/v1/chat/completions");
});

test("a missing or reset prompt uses the built-in instructions", async () => {
  await summarize();
  expect(lastRequest?.body.messages[0].content).toBe(`${DEFAULT_SUMMARY_PROMPT}\n\nVideo transcript:\n[0:04] Video text.`);
});

test("a whitespace-only saved prompt falls back to the standard format", async () => {
  storedPrompt = "   \n  ";
  await summarize();
  expect(lastRequest?.body.messages[0].content).toContain(DEFAULT_SUMMARY_PROMPT);
});

test("the latest saved prompt is read for each new summary", async () => {
  storedPrompt = "First format";
  await summarize();
  storedPrompt = "Second format";
  await summarize("New video");
  expect(lastRequest?.body.messages[0].content).toBe("Second format\n\nVideo transcript:\nNew video");
});

test("custom summary instructions do not replace the follow-up chat prompt", async () => {
  storedPrompt = "CUSTOM_SUMMARY_ONLY";
  for await (const _chunk of askQuestion("What happened?", "Original summary", provider)) {}
  expect(lastRequest?.body.messages[0].role).toBe("system");
  expect(lastRequest?.body.messages[0].content).toContain("Original summary");
  expect(lastRequest?.body.messages[0].content).not.toContain("CUSTOM_SUMMARY_ONLY");
  expect(lastRequest?.body.messages.at(-1).content).toBe("What happened?");
});
