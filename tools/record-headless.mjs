#!/usr/bin/env node
// record-headless.mjs — fully automated video capture for any page that uses
// video-tour.js. Loads the page with ?record=1&capture=<fps> in headless
// Chrome, steps the page frame by frame on a virtual clock (window.__vtFrame,
// see video-tour.js), and encodes the pulled PNG frames with ffmpeg.
// Render speed doesn't matter: output is always exactly <fps>, smooth even
// under SwiftShader software GL.
//
// Usage:
//   node tools/record-headless.mjs <url-or-html-file> [output.webm]
//     [--size 1280x720] [--fps 30] [--timeout 3600] [--chrome /path/to/chrome]
//
// Notes:
//  - A local file is served over a temporary HTTP server (ES modules + CDN
//    imports misbehave under file://).
//  - Requires ffmpeg on PATH (the narration mux step needs it anyway).
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--size'
  && args[i - 1] !== '--timeout' && args[i - 1] !== '--chrome' && args[i - 1] !== '--fps');
const target = positional[0];
if (!target) {
  console.error('Usage: node tools/record-headless.mjs <url-or-html-file> [output.webm] [--size WxH] [--fps n] [--timeout s] [--chrome path]');
  process.exit(2);
}
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const FPS = Number(opt('fps', 30));
const TIMEOUT_S = Number(opt('timeout', 3600));   // frame-stepped capture runs slower than real time under software GL
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error) {
  console.error('ffmpeg not found on PATH — required to encode the captured frames.');
  process.exit(2);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- resolve target to a URL (serve local files over temp HTTP) ---------- */
let server = null, url = target, outName = positional[1];
if (!/^https?:\/\//.test(target)) {
  const file = path.resolve(target);
  if (!fs.existsSync(file)) { console.error(`Not found: ${file}`); process.exit(2); }
  const dir = path.dirname(file);
  // Pages reference shared assets one level up (e.g. ../video-tour.js), so
  // resolve requests against the page's dir first, then its parent.
  const bases = [dir, path.dirname(dir)];
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                 '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };
  server = http.createServer((req, res) => {
    const urlPath = path.normalize(decodeURIComponent(req.url.split('?')[0]));
    const found = bases.map(b => path.join(b, urlPath))
      .find(p => bases.some(b => p.startsWith(b)) && fs.existsSync(p) && fs.statSync(p).isFile());
    if (!found) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(found)] || 'application/octet-stream' });
    fs.createReadStream(found).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  url = `http://localhost:${server.address().port}/${path.basename(file)}`;
}
url += (url.includes('?') ? '&' : '?') + `record=1&capture=${FPS}`;
if (!outName) outName = path.basename(url.split('?')[0]).replace(/\.\w+$/, '') + '.webm';
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-frames-'));

/* ---- locate Chrome -------------------------------------------------------- */
const CHROME = opt('chrome', process.env.CHROME ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
   '/Applications/Chromium.app/Contents/MacOS/Chromium',
   '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync));
if (!CHROME || !fs.existsSync(CHROME)) {
  console.error('Chrome not found — pass --chrome or set $CHROME.'); process.exit(2);
}

/* ---- launch headless Chrome with CDP -------------------------------------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-prof-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) res(m[1]);
  });
  chrome.on('exit', () => rej(new Error('Chrome exited before CDP was ready')));
  setTimeout(() => rej(new Error('Timed out waiting for CDP')), 20000);
});

function cleanup(code) {
  chrome.kill('SIGKILL');
  server?.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(framesDir, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGINT', () => cleanup(130));

/* ---- drive it: open the page, pull one PNG per virtual frame -------------- */
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let msgId = 0;
const pending = new Map();
let pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    pageErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);

const evalJs = async expr => {
  const { result, exceptionDetails } = await send('Runtime.evaluate',
    { expression: expr, returnByValue: true }, sessionId);
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

console.log(`Recording ${url}`);
console.log(`(${W}x${H} @ ${FPS} fps, frame-stepped on a virtual clock)`);
const deadline = Date.now() + TIMEOUT_S * 1000;

// Wait until video-tour.js has loaded and installed the frame stepper.
while (await evalJs('typeof window.__vtFrame') !== 'function') {
  if (Date.now() > deadline) {
    console.error(`Timed out waiting for the page to load __vtFrame.`);
    if (pageErrors.length) console.error('Page errors:\n  ' + pageErrors.join('\n  '));
    cleanup(1);
  }
  await sleep(200);
}

let n = 0;
for (;;) {
  if (Date.now() > deadline) {
    console.error(`Timed out after ${TIMEOUT_S}s (${n} frames captured).`);
    if (pageErrors.length) console.error('Page errors:\n  ' + pageErrors.join('\n  '));
    cleanup(1);
  }
  const dataUrl = await evalJs('window.__vtFrame()');
  if (dataUrl === null) break;                         // tour finished
  if (dataUrl === '') { await sleep(100); continue; }  // tour not started yet
  fs.writeFileSync(path.join(framesDir, String(n).padStart(6, '0') + '.png'),
    Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  n++;
  if (n % (FPS * 10) === 0) console.log(`  ${n} frames (${(n / FPS).toFixed(0)}s)…`);
}
if (!n) {
  console.error('Tour ended without producing any frames.');
  if (pageErrors.length) console.error('Page errors:\n  ' + pageErrors.join('\n  '));
  cleanup(1);
}

console.log(`Encoding ${n} frames → ${outName}`);
const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS),
  '-i', path.join(framesDir, '%06d.png'),
  '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-pix_fmt', 'yuv420p',
  '-row-mt', '1', '-cpu-used', '4',
  path.resolve(outName)], { stdio: 'inherit' });
if (ff.status !== 0) { console.error('ffmpeg failed.'); cleanup(1); }
const mb = (fs.statSync(outName).size / 1e6).toFixed(1);
console.log(`Saved ${outName} (${mb} MB, ${n} frames @ ${FPS} fps = ${(n / FPS).toFixed(1)}s)`);
if (pageErrors.length) console.warn('Page errors seen during recording:\n  ' + pageErrors.join('\n  '));
cleanup(0);
