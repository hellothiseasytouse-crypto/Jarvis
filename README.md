# JARVIS

A voice-first personal assistant that runs as a static site on GitHub Pages.

- **Brain:** Groq (your own key, pasted in Settings). Replies keep a dry British-butler tone.
- **Voice:** push-to-talk mic, plus a Wake word mode that listens for "Jarvis". Replies are spoken aloud.
- **Skills (instant, no AI):** time, date, battery, weather, diagnostics, timers, open YouTube/Google/GitHub/Maps/Gmail/Wikipedia, remember/forget facts.
- **Vision:** camera with hand tracking, ported from SPECTRA-V2. Open palm starts listening, thumbs up says "Very good, sir", fist stops speech, victory runs diagnostics.
- **From ORACLE:** quick-reply chips and chat export.

## Setup
1. Get a key at console.groq.com and paste it in **Settings**. It stays in your browser and is sent only to Groq.
2. Use Chrome or Edge for speech. Allow the microphone (and camera for Vision).
3. Wake word only works while the tab is open.

## Security notes
- Never commit a key. The page's Content-Security-Policy allows only Groq, Open-Meteo, and the MediaPipe CDN/model host.
- Keys are held per tab by default. "Remember on this device" stores them in localStorage, which every page on your github.io account can read.
- Speech recognition is done by your browser vendor's service, so audio leaves the device.
