// JARVIS web: voice with wake word, Groq brain, local skills, hand-tracking vision.
// Quick-reply chips come from ORACLE, vision.js is ported from SPECTRA-V2.
import { startVision, stopVision } from './vision.js';

const $ = (id) => document.getElementById(id);
const thread = $('thread'), empty = $('empty'), messages = $('messages'), input = $('input'),
  sendBtn = $('send'), statusEl = $('status'), micBtn = $('mic'), wakeBtn = $('wake'),
  voiceBtn = $('voice'), visionBtn = $('visionBtn'), settingsBtn = $('settings'),
  dlg = $('dlg'), telemetry = $('telemetry'), visionBox = $('vision');

const MAX_INPUT_CHARS = 4000;
const API = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const STATUS = { ready: 'Ready', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', error: 'Something went wrong' };
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', github: 'https://github.com',
  maps: 'https://maps.google.com', gmail: 'https://mail.google.com', wikipedia: 'https://www.wikipedia.org',
};
const UNITS = { second: 1000, minute: 60000, hour: 3600000 };
const CHOICES = /\[\[choices\]\]([\s\S]*?)\[\[\/choices\]\]/i;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

// ---------- storage (the key never goes in the repo) ----------
const get = (k, d = '') => { try { return localStorage.getItem('jarvis.' + k) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem('jarvis.' + k, v); } catch { /* storage blocked */ } };
const load = (k) => { try { const v = JSON.parse(get(k, '[]')); return Array.isArray(v) ? v : []; } catch { return []; } };
const getKey = () => { try { return sessionStorage.getItem('jarvis.key') || localStorage.getItem('jarvis.key') || ''; } catch { return ''; } };
const remembered = () => { try { return !!localStorage.getItem('jarvis.key'); } catch { return false; } };
function setKey(k, remember) {
  try {
    sessionStorage.removeItem('jarvis.key');
    localStorage.removeItem('jarvis.key');
    if (k) (remember ? localStorage : sessionStorage).setItem('jarvis.key', k);
  } catch { /* storage blocked */ }
}

let history = load('history'), facts = load('facts');
let pending = false, speaking = false, voiceOn = get('voice', '1') === '1';
let rec = null, listenMode = 'off', awaitUntil = 0, visionOn = false, batt = null;

// ---------- UI ----------
function setState(s) { document.body.dataset.state = s; statusEl.textContent = STATUS[s]; }
const idle = () => setState(listenMode !== 'off' ? 'listening' : 'ready');
const scrollToEnd = () => { thread.scrollTop = thread.scrollHeight; };

// Bold and code only, built with DOM nodes so model text is never parsed as HTML.
function inline(el, text) {
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) { const b = document.createElement('strong'); b.textContent = part.slice(2, -2); el.append(b); }
    else if (/^`[^`]+`$/.test(part)) { const c = document.createElement('code'); c.textContent = part.slice(1, -1); el.append(c); }
    else el.append(part);
  });
}

function bubble(role, cls = '') {
  empty.hidden = true;
  const li = document.createElement('li');
  li.className = `msg ${role} ${cls}`.trim();
  const body = document.createElement('div');
  body.className = 'msg-body';
  li.append(body);
  messages.append(li);
  scrollToEnd();
  return body;
}

function addMessage(role, raw, chips = true) {
  const m = raw.match(CHOICES);
  const text = raw.replace(CHOICES, '').trim();
  const body = bubble(role);
  const p = document.createElement('p');
  p.className = 'msg-text';
  inline(p, text);
  body.append(p);
  if (m && chips) {
    const row = document.createElement('div');
    row.className = 'chips';
    m[1].split('\n').map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 3).forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = c.slice(0, 80);
      b.addEventListener('click', () => { row.remove(); submit(c); });
      row.append(b);
    });
    body.append(row);
  }
  scrollToEnd();
  return text;
}

function addTyping() {
  const body = bubble('assistant');
  body.parentElement.setAttribute('aria-label', 'JARVIS is thinking');
  const dots = document.createElement('span');
  dots.className = 'typing';
  for (let i = 0; i < 3; i++) dots.append(document.createElement('span'));
  body.append(dots);
  return body.parentElement;
}

function addError(message, retryText, title = 'Message not sent') {
  const body = bubble('assistant', 'error');
  const t = document.createElement('p'); t.className = 'msg-error-title'; t.textContent = title;
  const p = document.createElement('p'); p.className = 'msg-text'; p.textContent = message;
  body.append(t, p);
  if (retryText) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'retry'; b.textContent = 'Try again';
    b.addEventListener('click', () => { body.parentElement.remove(); submit(retryText, false); });
    body.append(b);
  }
}

// ---------- speech out ----------
function speak(text) {
  if (!voiceOn || !synth) { idle(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*`]/g, ''));
  const uk = synth.getVoices().filter((v) => /en-GB/i.test(v.lang));
  u.voice = uk.find((v) => /daniel|george|ryan|arthur|male/i.test(v.name) && !/female/i.test(v.name)) || uk[0] || null;
  u.pitch = 0.85; u.rate = 1.02;
  u.onstart = () => { speaking = true; setState('speaking'); };
  u.onend = u.onerror = () => { speaking = false; idle(); };
  synth.speak(u);
}

function say(text) { speak(addMessage('assistant', text, false)); }

// ---------- speech in (push-to-talk and wake word) ----------
function stopListen() {
  const r = rec;
  rec = null; listenMode = 'off';
  try { r?.abort(); } catch { /* already stopped */ }
  wakeBtn.setAttribute('aria-pressed', 'false');
  micBtn.setAttribute('aria-pressed', 'false');
  if (!pending && !speaking) idle();
}

function listen(mode) {
  if (!SR) { addError('Speech recognition is not supported in this browser. Chrome or Edge work best.', '', 'Voice unavailable'); return; }
  stopListen();
  listenMode = mode;
  const r = new SR();
  rec = r;
  r.lang = 'en-GB'; r.continuous = mode === 'wake'; r.interimResults = false;
  r.onresult = (e) => {
    if (speaking || pending) return;
    const t = e.results[e.results.length - 1][0].transcript.trim();
    if (!t) return;
    if (mode === 'once') { stopListen(); submit(t); return; }
    const w = t.match(/\b(?:hey |hi |ok |okay )?jarvis\b[,.!?]?\s*(.*)/i);
    if (w && w[1]) { awaitUntil = 0; submit(w[1]); }
    else if (w) { awaitUntil = Date.now() + 8000; say('Yes, sir?'); }
    else if (Date.now() < awaitUntil) { awaitUntil = 0; submit(t); }
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopListen();
      addError('Microphone permission was denied. Allow it in the browser address bar and try again.', '', 'Microphone blocked');
    }
  };
  r.onend = () => {
    if (rec !== r) return;
    if (mode === 'wake') { try { r.start(); } catch { /* restart failed */ } }
    else { rec = null; listenMode = 'off'; micBtn.setAttribute('aria-pressed', 'false'); if (!pending && !speaking) idle(); }
  };
  try { r.start(); } catch { stopListen(); return; }
  (mode === 'wake' ? wakeBtn : micBtn).setAttribute('aria-pressed', 'true');
  if (!pending && !speaking) idle();
}

// ---------- skills (instant, no AI needed) ----------
const battery = () => (batt ? `Battery is at ${Math.round(batt.level * 100)} percent${batt.charging ? ' and charging' : ''}.` : 'Battery data is not available in this browser.');

async function weather() {
  const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { timeout: 10000 }));
  const { latitude: la, longitude: lo } = pos.coords;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code,wind_speed_10m`);
  if (!r.ok) throw new Error('the weather service did not answer');
  const c = (await r.json()).current, k = c.weather_code;
  const sky = k === 0 ? 'clear' : k < 4 ? 'partly cloudy' : k < 50 ? 'foggy' : k < 70 ? 'rainy' : k < 80 ? 'snowy' : k < 90 ? 'showery' : 'stormy';
  return `It is ${Math.round(c.temperature_2m)} degrees Celsius and ${sky}, with wind at ${Math.round(c.wind_speed_10m)} kilometres per hour.`;
}

function diagnostics() {
  const n = navigator;
  return `Systems check. Network ${n.onLine ? 'online' : 'offline'}, ${n.hardwareConcurrency || 'unknown'} logical cores, ` +
    `${n.deviceMemory ? n.deviceMemory + ' gigabyte memory class' : 'memory class unknown'}. ${battery()} ` +
    `Speech input ${SR ? 'available' : 'unavailable'}, vision ${visionOn ? 'online' : 'standing by'}. ` +
    (n.onLine ? 'All primary systems nominal, sir.' : 'Connectivity is down, sir.');
}

function setTimer(n, unit) {
  const ms = n * UNITS[unit];
  if (ms < 1000 || ms > 864e5) return 'I can set timers from one second to one day, sir.';
  setTimeout(() => say(`Sir, your ${n} ${unit} timer has finished.`), ms);
  return `Timer set for ${n} ${unit}${n === 1 ? '' : 's'}. It will not survive a page reload.`;
}

async function skill(t) {
  const s = t.toLowerCase().trim();
  let m;
  if (/\b(time is it|what['’]?s the time|what is the time|current time)\b/.test(s)) return `It is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  if (/\b(today['’]?s date|what day|what is the date|what['’]?s the date)\b/.test(s)) return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
  if (/\bbattery\b/.test(s)) return battery();
  if (/\b(diagnostics?|status report|system check)\b/.test(s)) return diagnostics();
  if (/\bweather\b/.test(s)) return weather();
  if ((m = s.match(/timer (?:for )?(\d+)\s*(second|minute|hour)s?/))) return setTimer(+m[1], m[2]);
  if ((m = s.match(/^open (youtube|google|github|maps|gmail|wikipedia)\b/))) {
    const w = window.open(SITES[m[1]], '_blank');
    if (w) w.opener = null;
    return w ? `Opening ${m[1]}.` : 'Your browser blocked the pop-up. Allow pop-ups for this site, sir.';
  }
  if ((m = s.match(/^remember (?:that )?(.{3,200})/))) {
    facts = [...facts, m[1]].slice(-20); put('facts', JSON.stringify(facts));
    return 'Noted, sir.';
  }
  if (/\b(forget everything|clear memory)\b/.test(s)) { facts = []; put('facts', '[]'); return 'Memory wiped, sir.'; }
  if (/\b(stop|close|disable|turn off)\b.*\b(vision|camera)\b/.test(s)) { toggleVision(false); return 'Vision offline.'; }
  if (/^(start|open|activate|enable|turn on)\b.*\b(vision|camera)\b|^scan\b/.test(s)) { toggleVision(true); return 'Activating vision. Show me your hands, sir.'; }
  return null;
}

// ---------- brain (Groq) ----------
function systemPrompt() {
  const mem = facts.length ? ` Things the user asked you to remember: ${facts.join('; ')}.` : '';
  return 'You are J.A.R.V.I.S., a calm, dry-witted British AI assistant. Address the user as "sir" now and then, not every line. ' +
    'Keep replies to one to three short sentences because they are spoken aloud. Use plain text with no headings or lists. ' +
    'You can only chat: never claim to have opened, sent, bought or changed anything. If a follow-up would help, end with [[choices]] ' +
    `then up to three short options, one per line, then [[/choices]].${mem} The current time is ${new Date().toLocaleString()}.`;
}

async function getReply(text) {
  let local;
  try { local = await skill(text); } catch (e) { local = `That did not work: ${e.message || 'unknown error'}.`; }
  if (local) return { ok: true, text: local };
  const key = getKey();
  if (!key) return { ok: false, message: 'No Groq API key yet. Open Settings and paste one.' };
  const model = get('model', DEFAULT_MODEL);
  const body = {
    model, temperature: 0.6, max_completion_tokens: 1024,
    messages: [{ role: 'system', content: systemPrompt() }, ...history.slice(-16), { role: 'user', content: text }],
  };
  if (model.includes('gpt-oss')) body.reasoning_effort = 'low';
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    if (r.status === 401) return { ok: false, message: 'Groq rejected the key. Check it in Settings.' };
    if (r.status === 429) return { ok: false, message: 'Groq rate limit reached. Try again in a moment.' };
    if (!r.ok) return { ok: false, message: `Groq returned error ${r.status}. Check the model name in Settings.` };
    const out = (await r.json()).choices?.[0]?.message?.content?.trim();
    return out ? { ok: true, text: out } : { ok: false, message: 'The model returned an empty reply.' };
  } catch {
    return { ok: false, message: 'Could not reach Groq. Check your connection.' };
  }
}

async function submit(text, showUser = true) {
  if (pending || !text || text.length > MAX_INPUT_CHARS) return;
  if (showUser) addMessage('user', text, false);
  pending = true; sendBtn.disabled = true; setState('thinking');
  const typing = addTyping();
  try {
    const r = await getReply(text);
    typing.remove();
    if (r.ok) {
      history = [...history, { role: 'user', content: text }, { role: 'assistant', content: r.text }].slice(-40);
      put('history', JSON.stringify(history));
      speak(addMessage('assistant', r.text));
    } else { addError(r.message, text); setState('error'); }
  } catch {
    typing.remove();
    addError('Something unexpected happened. Reload the page and try again.', text);
    setState('error');
  } finally {
    pending = false; sendBtn.disabled = false;
  }
}

// ---------- vision ----------
async function toggleVision(on = !visionOn) {
  if (on === visionOn) return;
  visionOn = on;
  visionBtn.setAttribute('aria-pressed', String(on));
  visionBox.hidden = !on;
  if (!on) { stopVision(); return; }
  try {
    await startVision({
      video: $('cam'), canvas: $('overlay'), onGesture,
      onStatus: (s) => { $('vstatus').textContent = s; },
    });
  } catch (e) {
    visionOn = false; visionBtn.setAttribute('aria-pressed', 'false'); visionBox.hidden = true;
    addError(e && e.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Vision could not start. Check your camera and connection.', '', 'Vision unavailable');
  }
}

function onGesture(g) {
  $('vgesture').textContent = g.replace('_', ' ').toUpperCase();
  if (g === 'Open_Palm') listen('once');
  else if (g === 'Thumb_Up') say('Very good, sir.');
  else if (g === 'Closed_Fist') { synth?.cancel(); speaking = false; idle(); }
  else if (g === 'Victory') submit('run diagnostics');
}

// ---------- telemetry ----------
navigator.getBattery?.().then((b) => { batt = b; }).catch(() => {});
function tick() {
  const bat = batt ? ` · BAT ${Math.round(batt.level * 100)}%` : '';
  telemetry.textContent = `${new Date().toLocaleTimeString([], { hour12: false })} · ${navigator.onLine ? 'ONLINE' : 'OFFLINE'}${bat} · WAKE WORD ${listenMode === 'wake' ? 'ON' : 'OFF'}`;
}
setInterval(tick, 1000);
tick();

// ---------- wiring ----------
function autosize() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; }
function handleSend() {
  const text = input.value.trim();
  if (!text || pending) return;
  input.value = ''; autosize(); submit(text);
}
sendBtn.addEventListener('click', handleSend);
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSend(); }
});

micBtn.addEventListener('click', () => {
  if (listenMode === 'once') { stopListen(); return; }
  synth?.cancel(); speaking = false;
  listen('once');
});
wakeBtn.addEventListener('click', () => { if (listenMode === 'wake') stopListen(); else listen('wake'); });
voiceBtn.setAttribute('aria-pressed', String(voiceOn));
voiceBtn.addEventListener('click', () => {
  voiceOn = !voiceOn; put('voice', voiceOn ? '1' : '0');
  voiceBtn.setAttribute('aria-pressed', String(voiceOn));
  if (!voiceOn) { synth?.cancel(); speaking = false; idle(); }
});
visionBtn.addEventListener('click', () => toggleVision());

settingsBtn.addEventListener('click', () => {
  $('key').value = getKey(); $('remember').checked = remembered(); $('model').value = get('model', DEFAULT_MODEL);
  dlg.showModal();
});
$('save').addEventListener('click', () => {
  setKey($('key').value.trim(), $('remember').checked);
  put('model', $('model').value.trim() || DEFAULT_MODEL);
  dlg.close();
});
$('forget').addEventListener('click', () => { setKey('', false); $('key').value = ''; });
$('close').addEventListener('click', () => dlg.close());
$('clear').addEventListener('click', () => {
  history = []; put('history', '[]'); messages.replaceChildren(); empty.hidden = false; dlg.close();
});
$('export').addEventListener('click', () => {
  const text = history.map((m) => `${m.role === 'user' ? 'You' : 'JARVIS'}: ${m.content.replace(CHOICES, '').trim()}`).join('\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = 'jarvis-chat.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

history.forEach((m) => addMessage(m.role === 'user' ? 'user' : 'assistant', m.content, false));
synth?.getVoices(); // warms up the voice list
input.focus();
