#!/usr/bin/env node
// upload-youtube.mjs — upload a narrated topic video to YouTube with a
// description linking to the live GitHub Pages demo and the repo.
//
// Usage:
//   YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/upload-youtube.mjs \
//     <video.mp4> --title "…" --topic <topic-dir> \
//     [--privacy unlisted] [--tags "a,b,c"] [--desc-file extra.md]
//
// One-time setup (Google Cloud console):
//   1. Create a project, enable "YouTube Data API v3".
//   2. OAuth consent screen → External → add yourself as a test user.
//   3. Credentials → Create credentials → OAuth client ID → Desktop app.
//   4. export YT_CLIENT_ID=… YT_CLIENT_SECRET=… (e.g. in ~/.zshrc).
// First run opens a browser consent page; the refresh token is stored in
// ~/.config/how-it-works/youtube-oauth.json and reused afterwards.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PAGES_BASE = 'https://yuyangtj.github.io/how-it-works';
const REPO_URL = 'https://github.com/yuyangtj/how-it-works';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OPTS = ['--title', '--topic', '--privacy', '--tags', '--desc-file'];
const positional = args.filter((a, i) => !a.startsWith('--') && !OPTS.includes(args[i - 1]));

const video = positional[0];
const topic = opt('topic', video ? path.basename(path.dirname(path.resolve(video))) : null);
if (!video || !fs.existsSync(video)) {
  console.error('Usage: node tools/upload-youtube.mjs <video.mp4> --title "…" [--topic dir] [--privacy unlisted] [--tags "a,b"] [--desc-file f]');
  process.exit(2);
}
const TITLE = opt('title', null);
if (!TITLE) { console.error('--title is required.'); process.exit(2); }
const PRIVACY = opt('privacy', 'unlisted');
const TAGS = opt('tags', '')?.split(',').map((s) => s.trim()).filter(Boolean);
const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('YT_CLIENT_ID / YT_CLIENT_SECRET are not set — see the setup notes at the top of this file.');
  process.exit(2);
}

// ---- description -----------------------------------------------------------
// Lead paragraph: --desc-file if given, else the intro sentence(s) of the
// topic's VIDEO-NARRATION.md scene 1 block.
let lead = '';
const descFile = opt('desc-file', null);
if (descFile) {
  lead = fs.readFileSync(descFile, 'utf8').trim();
} else {
  const nf = path.join(topic, 'VIDEO-NARRATION.md');
  if (fs.existsSync(nf)) {
    const md = fs.readFileSync(nf, 'utf8');
    const m = /^## Scene 1[^\n]*\n((?:\s*>.*\n)+)/m.exec(md);
    if (m) lead = m[1].split('\n').map((l) => l.replace(/^\s*>\s?/, '').trim()).filter(Boolean).join(' ');
  }
}
const description = [
  lead,
  '',
  `▶ Interact with the 3D model: ${PAGES_BASE}/${topic}/`,
  `Source code: ${REPO_URL}`,
].join('\n').trim();

// ---- OAuth (installed-app flow with loopback redirect) --------------------
const tokenFile = path.join(os.homedir(), '.config', 'how-it-works', 'youtube-oauth.json');

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function authorize() {
  if (fs.existsSync(tokenFile)) {
    const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    try {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refresh_token });
      return t.access_token;
    } catch (e) {
      console.warn('Stored token refresh failed, re-authorizing… (' + e.message.split('\n')[0] + ')');
    }
  }
  // Loopback server catches the consent redirect.
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (!u.searchParams.has('code') && !u.searchParams.has('error')) { res.end(); return; }
      res.end('Authorized — you can close this tab and return to the terminal.');
      server.close();
      u.searchParams.has('code') ? resolve(u.searchParams.get('code'))
        : reject(new Error('OAuth error: ' + u.searchParams.get('error')));
    });
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: redirect, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.upload',
        access_type: 'offline', prompt: 'consent',
      });
      global.__redirect = redirect;
      console.log('Opening browser for YouTube authorization…\nIf it does not open, visit:\n' + url);
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
    });
  });
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: global.__redirect });
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, JSON.stringify({ refresh_token: t.refresh_token }, null, 2), { mode: 0o600 });
  console.log('Refresh token saved to ' + tokenFile);
  return t.access_token;
}

// ---- resumable upload ------------------------------------------------------
async function upload(accessToken) {
  const meta = {
    snippet: { title: TITLE, description, tags: TAGS, categoryId: '27' }, // Education
    status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false },
  };
  const size = fs.statSync(video).size;
  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(meta),
    });
  if (!start.ok) throw new Error(`upload init HTTP ${start.status}: ${await start.text()}`);
  const session = start.headers.get('location');

  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`Uploading ${(size / 1e6).toFixed(1)} MB${attempt > 1 ? ` (attempt ${attempt})` : ''}…`);
    // Ask the session how much it already has, so retries resume mid-file.
    let offset = 0;
    if (attempt > 1) {
      const probe = await fetch(session, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Range': `bytes */${size}` },
      });
      if (probe.status === 308) {
        const range = probe.headers.get('range');           // "bytes=0-N"
        offset = range ? Number(range.split('-')[1]) + 1 : 0;
      } else if (probe.ok) return probe.json();             // finished after all
    }
    const res = await fetch(session, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Length': String(size - offset),
        ...(offset ? { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` } : {}),
      },
      body: fs.createReadStream(video, { start: offset }),
      duplex: 'half',
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) return res.json();
    if (res.status >= 400 && res.status < 500 && res.status !== 408)
      throw new Error(`upload HTTP ${res.status}: ${await res.text()}`);
    console.warn(`  interrupted (HTTP ${res.status}), retrying in ${attempt * 10}s…`);
    await new Promise((r) => setTimeout(r, attempt * 10000));
  }
  throw new Error('upload failed after 5 attempts');
}

const token = await authorize();
const result = await upload(token);
console.log('\nUploaded: https://youtu.be/' + result.id);
console.log('Privacy:  ' + result.status.privacyStatus +
  (result.status.privacyStatus !== PRIVACY
    ? `  (requested ${PRIVACY} — YouTube restricts unverified OAuth apps; adjust in YouTube Studio)` : ''));
if (result.status.uploadStatus) console.log('Status:   ' + result.status.uploadStatus + ' (processing continues on YouTube)');
console.log('\nDescription used:\n' + description);
