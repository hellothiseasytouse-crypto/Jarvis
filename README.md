# JARVIS

A voice-first personal assistant that runs in the browser. Conversations, memory, settings, and generated images are stored locally on the device/browser profile.

## Capabilities

- **Brain:** Groq (your own key, entered in Settings).
- **Voice:** push-to-talk, wake word, and spoken replies.
- **Local skills:** time, date, battery, weather, diagnostics, timers, open common sites, and remember/forget facts.
- **Web search:** say `search for …` or `look up …` to open live Google results in a new tab.
- **Image search:** say `image search …` or `find images of …` to open Google Images.
- **Image generation:** say `generate an image of …`. Requires a Pollinations key entered in Settings; generated image files are saved in this browser's IndexedDB and can be downloaded.
- **Vision:** camera hand tracking runs in the browser; camera frames are not uploaded by the hand-tracking code.

## Setup

1. Get a Groq API key and enter it in Settings.
2. For image generation, get a Pollinations key from https://enter.pollinations.ai/ and enter it in Settings.
3. Use Chrome or Edge for speech. Allow microphone/camera permissions only if you want those features.

## Device-local storage and privacy

- Chat history, remembered facts, model preference, voice preference, and API keys are stored in this browser's local storage (the Groq key can instead be session-only).
- Generated images are stored in this browser's IndexedDB.
- This is device/browser-profile local storage, not encrypted vault storage. Anyone with access to this browser profile may be able to access it. Clearing browser site data removes it; use Export chat to keep a copy.
- When used, Groq receives chat prompts, Pollinations receives image prompts, Google receives search queries, and Open-Meteo receives weather coordinates. These services are not local.
- Never commit API keys to GitHub. Do not paste passwords or provider account tokens into the chat.

## Integrations not yet connected

Direct Gmail, GitHub, Supabase, and Vercel account actions require provider OAuth/app configuration and a secure server-side authorization layer. They are not enabled merely by adding this frontend. Destructive or external actions should require an explicit approval step.
