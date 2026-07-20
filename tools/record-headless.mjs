#!/usr/bin/env node
// record-headless.mjs — fully automated video capture for any page that uses
// video-tour.js. Loads the page with ?record=1 in headless Chrome, waits for
// the tour to finish, and saves the downloaded .webm.
//
// Usage:
//   node tools/record-headless.mjs <url-or-html-file> [output.webm]
//     [--size 1280x720] [--timeout 300] [--chrome /path/to/chrome]
//
// Notes:
//  - A local file is served over a temporary HTTP server (ES modules + CDN
//    imports misbehave under file://).
//  - Headless Chrome renders with SwiftShader (software GL): timing stays
//    correct because the tour is wall-clock driven, but frames render slower
//    than real time, so the capture can be choppier than clicking the
//    in-page button on a real GPU. Use it for automation/verification; use
//    the button for the final take.
import { spawn } from 'node:child_process';
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
  && args[i - 1] !== '--timeout' && args[i - 1] !== '--chrome');
const target = positional[0];
if (!target) {
  console.error('Usage: node tools/record-headless.mjs <url-or-html-file> [output.webm] [--size WxH] [--timeout s] [--chrome path]');
  process.exit(2);
}
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const TIMEOUT_S = Number(opt('timeout', 300));
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
url += (url.includes('?') ? '&' : '?') + 'record=1';
if (!outName) outName = path.basename(url.split('?')[0]).replace(/\.\w+$/, '') + '.webm';
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-dl-'));

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
  fs.rmSync(downloadDir, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGINT', () => cleanup(130));

/* ---- drive it: open the page, wait for the download ----------------------- */
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let msgId = 0;
const pending = new Map();
let downloadedPath = null, pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed') {
    downloadedPath = m.params.filePath;
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
await send('Browser.setDownloadBehavior',
  { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

console.log(`Recording ${url}`);
console.log(`(${W}x${H}, headless SwiftShader — this takes at least the tour length)`);
const deadline = Date.now() + TIMEOUT_S * 1000;
while (!downloadedPath && Date.now() < deadline) await sleep(1000);

if (!downloadedPath) {
  console.error(`Timed out after ${TIMEOUT_S}s with no download.`);
  if (pageErrors.length) console.error('Page errors:\n  ' + pageErrors.join('\n  '));
  cleanup(1);
}
fs.renameSync(downloadedPath, path.resolve(outName));
const mb = (fs.statSync(outName).size / 1e6).toFixed(1);
console.log(`Saved ${outName} (${mb} MB)`);
if (pageErrors.length) console.warn('Page errors seen during recording:\n  ' + pageErrors.join('\n  '));
cleanup(0);
