# How it works

Interactive 3D "how it works" explainers built with Three.js — each topic is a
self-contained page in its own folder, plus shared tooling that turns a page
into a narrated explainer video and publishes it to YouTube, end to end.

**Live demos:** https://yuyangtj.github.io/how-it-works/

## Topics

- [`hook-hoist/`](hook-hoist/) — **Hakspelet**, Christopher Polhem's
  c. 1700 hook hoist for raising ore barrels from the Falun copper mine.
  [Live demo](https://yuyangtj.github.io/how-it-works/hook-hoist/) ·
  [narrated video](https://youtu.be/5C3ChSinMds) · see its README for
  controls and model notes.

## Run locally

Serve from the project root (pages load the shared `video-tour.js` one level up):

```bash
python3 -m http.server 8000
# → http://localhost:8000/hook-hoist/
```

## Video pipeline

Three dependency-free Node tools (ffmpeg on PATH required):

```bash
# 1. Record the scripted camera tour (headless Chrome, frame-stepped 30 fps)
node tools/record-headless.mjs hook-hoist/index.html hook-hoist/hakspelet.webm

# 2. Voice-over: Gemini TTS per scene from the timecoded narration script,
#    aligned to scene boundaries and muxed in
GEMINI_TTS_API_KEY=... node tools/generate-voiceover.mjs \
  hook-hoist/VIDEO-NARRATION.md --video hook-hoist/hakspelet.webm

# 3. Publish to YouTube (resumable upload, auto-built description;
#    --update <id> edits metadata of an existing video)
YT_CLIENT_ID=... YT_CLIENT_SECRET=... node tools/upload-youtube.mjs \
  hook-hoist/hakspelet-narrated.mp4 --title "..."
```

The full workflow — storyboarding a tour for a new topic, narration
conventions, verification steps, one-time API setup — lives in the shared
skill at [`.claude/skills/how-it-works-video/SKILL.md`](.claude/skills/how-it-works-video/SKILL.md)
(symlinked into `.kimi-code/skills/` so both Claude and Kimi use it).

## License

Educational project — you're welcome to reuse and modify. See [LICENSE](LICENSE).
