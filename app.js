// JARVIS web, step 1: UI only. getReply() is a placeholder that step 2 replaces with Groq.

const MAX_INPUT_CHARS = 4000;

const thread = document.getElementById('thread');
const empty = document.getElementById('empty');
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');

const STATUS_TEXT = { ready: 'Ready', thinking: 'Thinking', error: 'Something went wrong' };
let pending = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Placeholder. Returns { ok: true, text } or { ok: false, message }. */
async function getReply(text) {
  await delay(700);
  if (text === '/fail') {
    return { ok: false, message: 'This is a test error. The real AI connection comes in the next step.' };
  }
  return { ok: true, text: 'Placeholder reply: JARVIS is not connected to an AI model yet. Groq is the next step.' };
}

function setState(state) {
  document.body.dataset.state = state;
  statusEl.textContent = STATUS_TEXT[state];
}

function scrollToEnd() {
  thread.scrollTop = thread.scrollHeight;
}

// All text goes in with textContent, never innerHTML.
function addMessage(role, text) {
  empty.hidden = true;
  const li = document.createElement('li');
  li.className = `msg ${role}`;
  const body = document.createElement('div');
  body.className = 'msg-body';
  const p = document.createElement('p');
  p.className = 'msg-text';
  p.textContent = text;
  body.appendChild(p);
  li.appendChild(body);
  messages.appendChild(li);
  scrollToEnd();
  return li;
}

function addTyping() {
  empty.hidden = true;
  const li = document.createElement('li');
  li.className = 'msg assistant';
  li.setAttribute('aria-label', 'JARVIS is thinking');
  const body = document.createElement('div');
  body.className = 'msg-body';
  const dots = document.createElement('span');
  dots.className = 'typing';
  for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
  body.appendChild(dots);
  li.appendChild(body);
  messages.appendChild(li);
  scrollToEnd();
  return li;
}

function addError(message, retryText) {
  const li = document.createElement('li');
  li.className = 'msg assistant error';
  const body = document.createElement('div');
  body.className = 'msg-body';
  const title = document.createElement('p');
  title.className = 'msg-error-title';
  title.textContent = 'Message not sent';
  const text = document.createElement('p');
  text.className = 'msg-text';
  text.textContent = message;
  body.append(title, text);
  if (retryText) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => {
      li.remove();
      submit(retryText, false);
    });
    body.appendChild(retry);
  }
  li.appendChild(body);
  messages.appendChild(li);
  scrollToEnd();
}

async function submit(text, showUserMessage = true) {
  if (pending) return;
  if (text.length === 0 || text.length > MAX_INPUT_CHARS) return;
  if (showUserMessage) addMessage('user', text);
  pending = true;
  sendBtn.disabled = true;
  setState('thinking');
  const typing = addTyping();

  try {
    const result = await getReply(text);
    typing.remove();
    if (result.ok) {
      addMessage('assistant', result.text);
      setState('ready');
    } else {
      addError(result.message, text);
      setState('error');
    }
  } catch {
    typing.remove();
    addError('Something unexpected happened. Reload the page and try again.', text);
    setState('error');
  } finally {
    pending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function handleSend() {
  const text = input.value.trim();
  if (!text || pending) return;
  input.value = '';
  autosize();
  submit(text);
}

sendBtn.addEventListener('click', handleSend);
input.addEventListener('input', autosize);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    handleSend();
  }
});

input.focus();
