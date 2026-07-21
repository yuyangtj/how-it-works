#!/usr/bin/env node
// generate-voiceover.mjs — automated voice-over for a topic's VIDEO-NARRATION.md
// using Gemini TTS. Parses the timecoded scene blocks, synthesizes one clip per
// scene, places each clip at its scene start (adelay + amix), and optionally
// muxes the result with the recorded tour video.
//
// Usage:
//   GEMINI_TTS_API_KEY=... node tools/generate-voiceover.mjs <topic>/VIDEO-NARRATION.md \
//     [--voice Algenib] [--model gemini-2.5-flash-preview-tts] \
//     [--out <dir>] [--video <topic>.webm] [--force]
//
// Output (in --out, default <topic>/voiceover/):
//   01.wav … NN.wav   per-scene clips (24 kHz mono PCM; cached — reuse unless --force)
//   voice.wav         full timeline-aligned track
//   <video>-narrated.mp4  only when --video is given
//
// Narration file format (see hook-hoist/VIDEO-NARRATION.md):
//   ## Scene N — M:SS–M:SS — title
//   > prose to speak (one or more quoted lines)
// Requires ffmpeg on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes('--' + name);
const positional = args.filter((a, i) => !a.startsWith('--')
  && !['--voice', '--model', '--out', '--video', '--rpm', '--gap'].includes(args[i - 1]));

const mdFile = positional[0];
if (!mdFile || !fs.existsSync(mdFile)) {
  console.error('Usage: node tools/generate-voiceover.mjs <topic>/VIDEO-NARRATION.md [--voice name] [--model id] [--out dir] [--video file.webm] [--force]');
  process.exit(2);
}
const API_KEY = process.env.GEMINI_TTS_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_TTS_API_KEY is not set.');
  process.exit(2);
}
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error) {
  console.error('ffmpeg not found on PATH.');
  process.exit(2);
}

const VOICE = opt('voice', 'Algenib');
const MODEL = opt('model', 'gemini-2.5-flash-preview-tts');
const outDir = opt('out', path.join(path.dirname(mdFile), 'voiceover'));
const video = opt('video', null);
fs.mkdirSync(outDir, { recursive: true });

// ---- parse scenes ----------------------------------------------------------
const toSec = (t) => {
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};
const md = fs.readFileSync(mdFile, 'utf8');
const scenes = [];
const re = /^## Scene (\d+)\s*—\s*(\d+:\d+)[–-](\d+:\d+)\s*—\s*(.+)$/gm;
let m;
while ((m = re.exec(md))) {
  const bodyStart = re.lastIndex;
  const next = md.indexOf('\n## ', bodyStart);
  const hr = md.indexOf('\n---', bodyStart);
  const end = Math.min(next < 0 ? md.length : next, hr < 0 ? md.length : hr);
  const text = md.slice(bodyStart, end).split('\n')
    .map((l) => l.replace(/^>\s?/, '').trim())
    .filter(Boolean).join(' ');
  scenes.push({ n: Number(m[1]), start: toSec(m[2]), end: toSec(m[3]), title: m[4].trim(), text });
}
if (!scenes.length) {
  console.error('No "## Scene N — M:SS–M:SS — title" blocks found in ' + mdFile);
  process.exit(2);
}
console.log(`Parsed ${scenes.length} scenes from ${mdFile}`);

// ---- Gemini TTS ------------------------------------------------------------
// Response audio is raw PCM (audio/L16, 24 kHz mono, 16-bit LE) — wrap as WAV.
function wavFromPCM(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function tts(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) || attempt * 30;
      console.warn(`  HTTP ${res.status}, retrying in ${wait}s…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new Error('No audio in response: ' + JSON.stringify(json).slice(0, 400));
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
    return wavFromPCM(Buffer.from(part.inlineData.data, 'base64'), rate);
  }
  throw new Error('TTS failed after 3 attempts');
}

// Pace requests to stay under the TTS model's per-minute rate limit
// (--rpm, default 3 — the free-tier limit for the TTS preview models).
const RPM = Number(opt('rpm', 3));
let lastReq = 0;
async function pacedTTS(text) {
  const gap = 60000 / RPM - (Date.now() - lastReq);
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  lastReq = Date.now();
  return tts(text);
}

const dur = (f) => Number(spawnSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
  { encoding: 'utf8' }).stdout.trim());

// ---- generate clips --------------------------------------------------------
for (const sc of scenes) {
  const f = path.join(outDir, String(sc.n).padStart(2, '0') + '.wav');
  if (fs.existsSync(f) && !flag('force')) {
    console.log(`Scene ${sc.n}: cached (${f})`);
  } else {
    console.log(`Scene ${sc.n}: synthesizing "${sc.title}" (${sc.text.split(/\s+/).length} words)…`);
    fs.writeFileSync(f, await pacedTTS(sc.text));
  }
  const d = dur(f);
  const slot = sc.end - sc.start;
  const over = d - slot;
  console.log(`  ${d.toFixed(1)}s for a ${slot}s scene` +
    (over > 1 ? `  ⚠ ${over.toFixed(1)}s over — trim the script or re-cut the scene` : ''));
  sc.file = f;
}

// ---- assemble timeline-aligned track --------------------------------------
// Each clip is delayed to its scene start, then all are mixed over silence
// running the full tour length. A clip that would run into the next scene's
// narration is gently sped up (atempo) so at least --gap seconds of silence
// separate consecutive scenes; > ~12% compression can't be hidden, so those
// clips are left alone and flagged (trim the script instead).
const GAP = Number(opt('gap', 0.7));
const total = scenes[scenes.length - 1].end;
const inputs = scenes.flatMap((sc) => ['-i', sc.file]);
const delays = scenes.map((sc, i) => {
  const target = (sc.end - sc.start) - GAP;
  const d = dur(sc.file);
  let tempo = '';
  if (d > target) {
    const r = d / target;
    if (r <= 1.12) {
      tempo = `atempo=${r.toFixed(4)},`;
      console.log(`Scene ${sc.n}: compressing ${d.toFixed(1)}s → ${target.toFixed(1)}s (atempo ${r.toFixed(3)})`);
    } else {
      console.warn(`Scene ${sc.n}: ${(d - target).toFixed(1)}s over even with max atempo — trim the script`);
    }
  }
  return `[${i}:a]${tempo}adelay=${sc.start * 1000}|${sc.start * 1000}[a${i}]`;
}).join(';');
const mix = scenes.map((_, i) => `[a${i}]`).join('') +
  `amix=inputs=${scenes.length}:normalize=0,apad=whole_dur=${total}[out]`;
const voice = path.join(outDir, 'voice.wav');
let r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs,
  '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-t', String(total), voice],
  { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Wrote ${voice} (${dur(voice).toFixed(1)}s, tour length ${total}s)`);

// ---- optional mux ----------------------------------------------------------
if (video) {
  const out = video.replace(/\.\w+$/, '') + '-narrated.mp4';
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', voice,
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',   // x264 needs even dimensions
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out],
    { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('Wrote ' + out);
}
