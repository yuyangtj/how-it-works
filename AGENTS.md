# Agent notes

Interactive 3D "how it works" explainers (Three.js) + a pipeline that records
narrated videos from them and publishes to YouTube. MIT, educational.

## Layout & conventions

- One topic per folder (`hook-hoist/`), each a self-contained `index.html`
  ES-module page using CDN imports. Shared code sits at the repo root
  (`video-tour.js`) and in `tools/` (dependency-free Node ≥ 20 scripts,
  plain `fetch`, no npm install; `ffmpeg` on PATH is assumed).
- Always serve from the **repo root** (`python3 -m http.server 8000`) —
  topic pages load `../video-tour.js`.
- Generated media (`*.webm`, `*-narrated.mp4`, `voiceover/`) is gitignored;
  never commit it.
- Live site: GitHub Pages from `main`/root → https://yuyangtj.github.io/how-it-works/

## Video pipeline

Record → voice-over → publish; the full workflow, conventions, and
verification steps are in the skill `.claude/skills/how-it-works-video/SKILL.md`
(symlinked at `.kimi-code/skills/how-it-works-video` — edit the `.claude` copy).
Load that skill before touching the video tooling.

- `<topic>/VIDEO-NARRATION.md` scene headers (`## Scene N — M:SS–M:SS — title`,
  `>`-quoted prose) are parsed by `tools/generate-voiceover.mjs` — the format
  is load-bearing.
- Secrets live in `~/.zshrc` env vars, never in the repo:
  `GEMINI_TTS_API_KEY` (Gemini TTS), `YT_CLIENT_ID`/`YT_CLIENT_SECRET`
  (YouTube OAuth desktop client; refresh token cached at
  `~/.config/how-it-works/youtube-oauth.json`, scope youtube.force-ssl).
  Non-interactive shells don't inherit them — pull in with
  `eval "$(grep '^export GEMINI_TTS_API_KEY' ~/.zshrc)"` etc.
- Published: hook-hoist → https://youtu.be/wiVErnzYvco (unlisted). Use
  `tools/upload-youtube.mjs --update <id>` to edit its metadata in place;
  the description source of truth is `<topic>/youtube-description.md`.

## Historical accuracy

The models are best guesses from museum descriptions, not verified
engineering. Keep narration and descriptions honest about that; verify any
new historical claim (e.g. the Lustiga Huset stairs analogy) before adding it.
