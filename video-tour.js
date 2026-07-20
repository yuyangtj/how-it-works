/* video-tour.js — scripted camera tour + one-click video recording for
   Three.js "how it works" pages. Topic-agnostic: the page supplies the scene
   list and hooks; this module supplies the tour driver, the MediaRecorder
   capture, and label compositing. No dependencies.
   Usage contract: see .kimi-code/skills/how-it-works-video/SKILL.md */
window.VideoTour = (() => {
  let cfg = null;                 // init() config
  let tourT = -1;                 // seconds into the tour; <0 = idle
  let tourScene = -1;
  let lastTick = 0;               // performance.now() of the previous tick()
  let recorder = null, recChunks = [];
  let recCanvas = null, recCtx = null;   // composite canvas: WebGL frame + labels
  let va = null, vb = null;              // temp vectors (created from cfg.THREE)

  // Deterministic capture mode (?record=1&capture=<fps>): instead of recording
  // in real time with MediaRecorder, freeze the clock to a virtual timeline and
  // let tools/record-headless.mjs pull one composited PNG per frame via
  // window.__vtFrame(). performance.now() and requestAnimationFrame are
  // overridden before the page's module script runs, so the page's own
  // THREE.Clock and render loop step by exactly 1/fps with no page changes.
  const capFps = Number(new URLSearchParams(location.search).get('capture')) || 0;
  let capFrame = 0;
  const rafQueue = [];
  if (capFps > 0) {
    performance.now = () => capFrame / capFps * 1000;
    window.requestAnimationFrame = cb => (rafQueue.push(cb), 0);
    window.__vtFrame = () => {
      if (recCanvas && tourT < 0) return null;        // tour finished
      capFrame++;
      const cbs = rafQueue.splice(0);
      for (const cb of cbs) cb(performance.now());
      return recCanvas ? recCanvas.toDataURL('image/png') : '';
    };
  }

  const easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function makeButton() {
    const b = document.createElement('button');
    b.textContent = '🎬 Record video';
    b.title = 'Play the scripted camera tour and record it to a .webm file';
    b.style.cssText = 'position:absolute;right:14px;bottom:14px;z-index:10;' +
      'background:#3a4652;color:#e8e4da;border:1px solid #55616e;border-radius:6px;' +
      'padding:5px 10px;font-size:12.5px;cursor:pointer;';
    document.body.appendChild(b);
    return b;
  }

  function start(record) {
    if (tourT >= 0) return;
    if (record && !capFps && (typeof MediaRecorder === 'undefined' ||
                   !document.createElement('canvas').captureStream)) {
      alert('MediaRecorder is not supported in this browser — try Chrome or Edge.');
      return;
    }
    cfg.controls.enabled = false;
    cfg.onStart?.();
    tourT = 0; tourScene = -1;
    lastTick = performance.now();
    if (!record) return;
    // Record a composite canvas: the WebGL frame plus the part labels
    // (they live in a separate DOM overlay, so the raw canvas lacks them).
    recCanvas = document.createElement('canvas');
    recCanvas.width = cfg.renderer.domElement.width;
    recCanvas.height = cfg.renderer.domElement.height;
    recCtx = recCanvas.getContext('2d');
    if (capFps) return;                  // frames are pulled via __vtFrame()
    const mime = ['video/webm;codecs=vp9', 'video/webm', '']
      .find(m => !m || MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(recCanvas.captureStream(30),
      mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
    recChunks = [];
    const rec = recorder;           // stop() nulls `recorder` before onstop fires
    rec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(recChunks, { type: rec.mimeType || 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = cfg.filename || 'video.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    rec.start();
  }

  function stop() {
    if (tourT < 0) return;
    tourT = -1;
    cfg.controls.enabled = true;
    cfg.onStop?.();
    if (recorder) { const r = recorder; recorder = null; r.stop(); }
  }

  function toggle() { tourT >= 0 ? stop() : start(true); }

  // Advance the tour; call once per frame before rendering. Keeps its own
  // wall clock (not the page's clamped sim dt) so scene durations — and the
  // narration timecodes — stay exact even when the frame rate is low.
  function tick() {
    if (tourT < 0) return;
    const now = performance.now();
    tourT += Math.min((now - lastTick) / 1000, 1);
    lastTick = now;
    if (tourT >= cfg.totalLen) { stop(); return; }
    let t = tourT, i = 0;
    while (t >= cfg.scenes[i].dur) { t -= cfg.scenes[i].dur; i++; }
    const sc = cfg.scenes[i];
    if (i !== tourScene) { tourScene = i; cfg.onScene?.(sc, i); }
    const k = easeIO(t / sc.dur);
    cfg.camera.position.lerpVectors(va.fromArray(sc.from[0]), vb.fromArray(sc.to[0]), k);
    cfg.controls.target.lerpVectors(va.fromArray(sc.from[1]), vb.fromArray(sc.to[1]), k);
  }

  // While recording: copy the WebGL frame and stamp the visible labels on top,
  // styled like on-screen chips. Call once per frame after rendering.
  function composite() {
    if (!recorder && !(capFps && recCanvas)) return;
    const src = cfg.renderer.domElement;
    if (recCanvas.width !== src.width || recCanvas.height !== src.height) {
      recCanvas.width = src.width; recCanvas.height = src.height;
    }
    recCtx.drawImage(src, 0, 0);
    if (!cfg.labels?.length || (cfg.labelsVisible && !cfg.labelsVisible())) return;
    const sx = recCanvas.width / innerWidth, sy = recCanvas.height / innerHeight;
    recCtx.font = `${Math.round(11.5 * sx)}px -apple-system, "Segoe UI", sans-serif`;
    recCtx.textAlign = 'center'; recCtx.textBaseline = 'middle';
    for (const l of cfg.labels) {
      if (!l.visible) continue;
      va.setFromMatrixPosition(l.matrixWorld).project(cfg.camera);
      if (va.z > 1 || va.z < -1) continue;                 // behind the camera
      const x = (va.x * 0.5 + 0.5) * recCanvas.width;
      const y = (-va.y * 0.5 + 0.5) * recCanvas.height;
      if (x < 0 || x > recCanvas.width || y < 0 || y > recCanvas.height) continue;
      const w = recCtx.measureText(l.element.textContent).width;
      const padX = 8 * sx, h = 21 * sy;
      recCtx.fillStyle = 'rgba(20,24,28,.78)';
      recCtx.beginPath();
      recCtx.roundRect(x - w / 2 - padX, y - h / 2, w + 2 * padX, h, 5 * sx);
      recCtx.fill();
      recCtx.fillStyle = getComputedStyle(l.element).color;
      recCtx.fillText(l.element.textContent, x, y);
    }
  }

  function init(c) {
    cfg = c;
    cfg.totalLen = c.scenes.reduce((s, sc) => s + sc.dur, 0);
    va = new cfg.THREE.Vector3(); vb = new cfg.THREE.Vector3();
    (cfg.button || makeButton()).addEventListener('click', toggle);
    addEventListener('keydown', e => { if (e.key === 'Escape') stop(); });
    const p = new URLSearchParams(location.search);
    if (p.get('record')) start(true);        // used by tools/record-headless.mjs
    else if (p.get('tour')) start(false);    // preview without recording
  }

  return { init, tick, composite, start, stop };
})();
