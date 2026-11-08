// JARVIS vision: hand-tracking HUD ported from SPECTRA-V2 (MediaPipe tasks-vision).
// The camera stays in this browser. Nothing is uploaded; only the model files are downloaded.
const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const LABELS = { Open_Palm: 'OPEN PALM', Closed_Fist: 'FIST', Thumb_Up: 'THUMBS UP', Thumb_Down: 'THUMBS DOWN', Victory: 'VICTORY', Pointing_Up: 'POINT', ILoveYou: 'I LOVE YOU' };
const PINCH = 0.085; // same threshold SPECTRA uses

let recognizer = null, stream = null, raf = 0, running = false, vid = null, cv = null;

export async function startVision({ video, canvas, onStatus, onGesture }) {
  if (running) return;
  running = true; vid = video; cv = canvas;
  try {
    onStatus('CAMERA…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } }, audio: false,
    });
    video.srcObject = stream;
    await video.play();
    if (!recognizer) {
      onStatus('LOADING HAND MODEL…');
      const m = await import(V);
      const files = await m.FilesetResolver.forVisionTasks(`${V}/wasm`);
      const make = (delegate) => m.GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
      });
      recognizer = await make('GPU').catch(() => make('CPU')); // CPU fallback for weak laptops
    }
    if (!running) return;
    onStatus('ONLINE');
    run(video, canvas, onStatus, onGesture);
  } catch (e) {
    stopVision();
    throw e;
  }
}

export function stopVision() {
  running = false;
  cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (vid) vid.srcObject = null;
  if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

function run(video, canvas, onStatus, onGesture) {
  const ctx = canvas.getContext('2d');
  let lastT = -1, held = '', frames = 0, cooldown = 0, fpsT = performance.now(), n = 0;

  const loop = () => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastT) return;
    lastT = video.currentTime;
    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const w = canvas.width, h = canvas.height;
    const r = recognizer.recognizeForVideo(video, performance.now());

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = ctx.fillStyle = '#35d6eb';
    ctx.lineWidth = 2; ctx.shadowColor = '#35d6eb'; ctx.shadowBlur = 8; ctx.font = '14px monospace';

    r.landmarks.forEach((hand, i) => {
      const p = (l) => [(1 - l.x) * w, l.y * h]; // mirrored, matches the flipped video
      ctx.beginPath();
      BONES.forEach(([a, b]) => { ctx.moveTo(...p(hand[a])); ctx.lineTo(...p(hand[b])); });
      ctx.stroke();
      hand.forEach((l) => { const [x, y] = p(l); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });

      const xs = hand.map((l) => (1 - l.x) * w), ys = hand.map((l) => l.y * h);
      const x0 = Math.min(...xs) - 16, y0 = Math.min(...ys) - 16;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(x0, y0, Math.max(...xs) + 16 - x0, Math.max(...ys) + 16 - y0);
      ctx.setLineDash([]);

      const g = r.gestures[i]?.[0]?.categoryName;
      if (g && g !== 'None') ctx.fillText(LABELS[g] || g, x0, Math.max(14, y0 - 6));
      if (Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) < PINCH) {
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...p(hand[4])); ctx.lineTo(...p(hand[8])); ctx.stroke(); ctx.lineWidth = 2;
      }
    });

    // A gesture counts only after it is held steady for 12 frames, then cools down for 2.5 s.
    const top = r.gestures[0]?.[0];
    const g = top && top.score > 0.6 ? top.categoryName : '';
    frames = g && g === held ? frames + 1 : 1;
    held = g;
    if (g && g !== 'None' && frames === 12 && performance.now() > cooldown) {
      cooldown = performance.now() + 2500;
      onGesture(g);
    }

    n++;
    if (performance.now() - fpsT >= 1000) { onStatus(`ONLINE · ${n} FPS`); n = 0; fpsT = performance.now(); }
  };
  raf = requestAnimationFrame(loop);
}
