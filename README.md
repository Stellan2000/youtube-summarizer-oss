# YouTube Summary Extension

A Chrome extension that summarizes YouTube videos and lets you ask follow-up questions using your own AI provider.

This is a fork of [avarayr/youtube-summarizer-oss](https://github.com/avarayr/youtube-summarizer-oss), based on upstream [v1.0.5](https://github.com/avarayr/youtube-summarizer-oss/releases/tag/v1.0.5), commit [`7ac841d`](https://github.com/avarayr/youtube-summarizer-oss/commit/7ac841dfb6ada5d8bf929def8d28ff7e2970dba7). The original extension and its MIT license are credited to the upstream project.

## Changes from upstream v1.0.5

### Automatic transcript loading

- Opens YouTube's transcript panel when a video loads, reads the text with timestamps, then closes the panel it opened.
- Temporarily conceals the transcript panel during this process to reduce visual distraction.
- Supports both YouTube's older transcript renderer and its newer timeline/transcript panel, including the newer panel without a `target-id`.
- Keeps the transcript in the current tab's memory, associated with the current video. Navigation cancels an unfinished read and clears the preceding video's cache.
- Waits for transcript loading when **Summarize** is clicked early.
- Leaves a transcript panel open if it was already open or the user starts interacting with it.

Automatic transcript loading does not call an AI provider. A summary is requested when you click **Summarize**; follow-up questions make separate AI requests.

### Editable summary prompt

- Adds a **Summary prompt** field at the top of the gear-icon settings panel on YouTube.
- **Save prompt** stores your instructions locally in the browser and applies them to the next summary.
- **Reset to default** restores the built-in prompt shown below.
- The video transcript is appended automatically; you only need to write the summary instructions.
- A saved custom prompt overrides the built-in default. Updating the extension does not overwrite it.

### Revised default prompt

The default retains TLDR, Key Points, bullet points, bold text and section separators. It no longer requests italic emphasis, pulled-out quotes or code styling for technical terms, and asks the model not to refer to the transcript itself. This changes the requested formatting; it does not remove Markdown support or change the inherited Markdown colors.

```text
Provide a concise summary of this YouTube video transcript using markdown formatting.

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

Be direct and concise. Do not use introductory phrases like "Here's a summary" or "Let me summarize".  Do not refer to the transcript itself.
```

### Tests and clearer errors

- Adds tests for transcript loading, both panel layouts, automatic closing, video navigation, stale-text protection, timeouts and user interaction.
- Adds tests confirming that saved prompts reach the summary request, that the default is used after reset, and that follow-up chat keeps its own instructions.
- Provides a more useful error message when transcript extraction fails.

The upstream v1.0.5 fix for reading a custom provider base URL from saved settings is included in this fork's base; it is not a new change made by this fork.

## Install

1. Download `extension-unpacked.zip` from [this fork's Releases page](https://github.com/Stellan2000/youtube-summarizer-oss/releases).
2. Extract the ZIP to a folder you will keep on your computer.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Open or reload a YouTube video.

For an update, replace the files in the existing installation folder, click the extension's **Reload** button on `chrome://extensions`, then reload the YouTube tab. Keep the installation folder in place.

## Configure and use

1. On a YouTube video, click the **gear icon beside Summarize**. The toolbar popup points you to these settings; it is not the settings editor.
2. Choose an AI provider and enter its API key. The provider labeled **ChatGPT** uses the OpenAI API.
3. Select an available model. The selected model must support the provider's chat-completions interface.
4. Optionally edit **Summary prompt**, then click **Save prompt**.
5. Return to the video and click **Summarize**. Use **Ask Questions** below the result for follow-up questions.

To use the revised default after previously saving another prompt, click **Reset to default**. Existing summaries are not reformatted automatically; generate a new summary to apply a new prompt.

Provider options inherited from upstream include OpenAI, Google AI, Groq, OpenRouter, Ollama, LM Studio and other OpenAI-compatible endpoints. Live use has been checked with OpenAI; the other providers have not been individually revalidated for this fork.

## Requirements and limitations

- Requires a transcript available in YouTube. The extension reads text; it does not transcribe a video's audio or analyze its images.
- Automatic opening currently recognizes the English **Show transcript** and Swedish **Visa transkription** buttons. For other YouTube interface languages, open the transcript manually before summarizing.
- YouTube can change its page layout. If automatic reading fails, try **Show transcript / Visa transkription**, then **Summarize** again.
- Automatic reads stop waiting after a bounded timeout. Videos without a usable transcript cannot be summarized by this extension.
- Summaries and follow-up answers are AI-generated and may omit or misstate details. Check important claims against the video.

## Cost and data handling

The extension is free software. AI requests use your selected provider and may consume its API credits or incur charges. No AI usage is included with this fork.

Transcripts are cached in tab memory. Your custom summary prompt uses Chrome's local extension storage. API keys and provider/model settings continue to use Chrome's extension sync storage, as in upstream. When you summarize, the transcript and your instructions are sent to the selected AI provider. Follow-up chat sends the summary, question and conversation history to that provider.

No API key is bundled with the source or release package. Set your own key in the extension settings.

## Build and test

Requires [Bun](https://bun.sh/) and Node.js for the transcript tests.

```bash
bun install --frozen-lockfile
bun run test
bun run test:transcript
bunx tsc --noEmit
bun run build
```

Load the resulting `public` folder as an unpacked Chrome extension. To package a build:

```bash
cd public
zip -r ../extension-unpacked.zip .
```

Automated tests use synthetic transcript content and mocked AI requests, without a real API key.

## License and attribution

[MIT](LICENSE). Original extension by [avarayr](https://github.com/avarayr) and upstream contributors. This fork adds the changes listed above.
