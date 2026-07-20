# How it works

Interactive 3D "how it works" explainers built with Three.js — each topic is a
self-contained page in its own folder, plus shared tooling to record narrated
explainer videos from a scripted camera tour.

## Topics

- [`hook-hoist/`](hook-hoist/) — **Hakspelet**, Christopher Polhem's
  late-17th-century hook hoist for raising ore barrels from the Falun copper
  mine. See its README for controls, model notes, and the video workflow.

## Run

Serve from the project root (pages load the shared `video-tour.js` one level up):

```bash
python3 -m http.server 8000
# → http://localhost:8000/hook-hoist/
```

## Videos

`video-tour.js` (scripted camera tour + recorder) and
`tools/record-headless.mjs` (headless frame-stepped capture at a smooth
30 fps) turn any topic page into a narrated explainer video — see
`.kimi-code/skills/how-it-works-video/SKILL.md` for the full workflow.
