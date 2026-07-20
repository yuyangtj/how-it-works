---
name: how-it-works-video
description: Add scripted camera-tour video recording to a Three.js "how it works" HTML page and produce a narrated video (headless capture + Gemini TTS voice-over)
whenToUse: When the user wants to create, record, re-cut, or narrate an explainer video from one of the Three.js topic pages in this project, or add video support to a new topic page
---

# How-it-works videos from Three.js topic pages

This project produces narrated explainer videos **without manual recording**:
each topic page (e.g. `hook-hoist/index.html`) carries a scripted camera tour,
a shared module records it to `.webm`, and a timecoded narration script is
voiced with Gemini TTS and muxed in.

## Architecture (already in place — reuse, don't reinvent)

- `video-tour.js` (project root) — topic-agnostic tour driver + recorder.
  Exposes `window.VideoTour` as a classic script; include it **before** the
  page's module script:
  ```html
  <script src="../video-tour.js"></script>
  <script type="module"> ... </script>
  ```
  Because pages reach one level up, always serve from the **project root**
  (`python3 -m http.server 8000` → `http://localhost:8000/<topic>/`), never
  from inside a topic folder.
- `tools/record-headless.mjs` — fully automated capture (headless Chrome +
  CDP, no browser interaction):
  ```bash
  node tools/record-headless.mjs hook-hoist/index.html out.webm
  ```
  Accepts a URL or a local HTML file (served over a temp HTTP server).
  Options: `--size WxH` (default 1280x720), `--fps n` (default 30),
  `--timeout s`, `--chrome path`. Requires `ffmpeg` on PATH.
  Capture is frame-stepped on a virtual clock (`?record=1&capture=<fps>`,
  handled inside `video-tour.js`): the page's sim and the tour advance exactly
  1/fps per captured frame, so output is always smooth at the requested fps
  regardless of how slowly headless software GL renders. This is the preferred
  path for final takes too; the in-page 🎬 button records in real time via
  MediaRecorder and depends on the machine's live frame rate.
- `<topic>/VIDEO-NARRATION.md` — voice-over script per topic, one block per
  scene with exact timecodes matching the tour.

## Adding video support to a new topic page

1. **Define the storyboard** in the page's module script. Scenes must follow
   the explanation order of the topic (e.g. power chain end to end), each
   scene = camera move + duration + page-specific flags:
   ```js
   const SCENES = [
     // dur (wall-clock s), from→to [[camX,camY,camZ],[tgtX,tgtY,tgtZ]], flags…
     { dur: 12, from: [[17,9,17],[4,3,0]], to: [[13,7,13],[4,3,0]], speed: 1 },
     { dur: 30, from: [[4,-6,4],[0,-6,0]], to: [[4,6,4],[0,5,0]],   speed: 0.5, xray: true },
   ];
   ```
   Reuse the page's existing camera presets where possible. Camera moves are
   ease-lerped; wall-clock durations drive both the tour and the narration
   timecodes.
2. **Wire the module** once, after scene/camera/labels exist:
   ```js
   VideoTour.init({
     THREE, renderer, camera, controls,      // OrbitControls
     scenes: SCENES,
     labels,                                  // CSS2DObject[] (composited into video)
     filename: '<topic>.webm',
     button: document.getElementById('btnVideo'),  // omit → floating button is created
     labelsVisible: () => chkLabels.checked,       // optional gate
     onScene(sc) { /* apply page flags: speed, x-ray, … */ },
     onStart()   { /* hide UI panels, unpause sim */ },
     onStop()    { /* restore UI */ },
   });
   ```
3. **Call it from the render loop**:
   ```js
   VideoTour.tick();             // first thing in animate(); keeps its own
                                 // wall clock, so scene timing is exact even
                                 // at low frame rates
   ...
   renderer.render(scene, camera);
   VideoTour.composite();        // last thing (no-op unless recording)
   ```
4. **Write `<topic>/VIDEO-NARRATION.md`**: one prose block per scene, headed
   by `Scene N — start–end — title`, sized to ~2.2 words/second of scene
   duration. Plain TTS-ready sentences, no markup. End the file with the
   concat + mux ffmpeg commands (see `hook-hoist/VIDEO-NARRATION.md`).
5. **Verify** (do not skip):
   ```bash
   node tools/record-headless.mjs <topic>/index.html /tmp/test.webm
   ffprobe -v error -show_entries format=duration -of default=nw=1 /tmp/test.webm
   ffprobe -v error -count_frames -select_streams v \
     -show_entries stream=nb_read_frames -of default=nw=1 /tmp/test.webm
   ffmpeg -y -v error -i /tmp/test.webm -ss <mid-scene> -frames:v 1 /tmp/frame.png
   ```
   Check duration ≈ sum of scene durs, frame count ≈ duration × 30 (a much
   lower count means the capture fell back to something non-frame-stepped —
   investigate), and **view the extracted frame** to
   confirm the scene renders and labels are legible. Fix page errors the
   recorder prints — a null reference in the record path means no file.
6. **Update the topic README**: button usage, headless command, TTS workflow.

## Conventions that keep the videos watchable

- Storyboard follows the *explanation*, not the geography: supply → power →
  transmission → work done → cycle. Wide shot first, hero close-up at ~60%,
  pull back at the end.
- Slow the sim (`speed: 0.5`) for the hero scene; keep total length 2–3 min.
- Keep part labels on during the tour — they are composited into the video
  and substitute for on-screen UI, which `onStart` hides.
- Scene boundaries = narration timecodes. If you re-cut `SCENES`, re-cut the
  timecodes in `VIDEO-NARRATION.md` to match.
- Esc or a second button click stops early; `?tour=1` previews without
  recording; `?record=1` auto-records (used by the headless tool).

## Voice-over + final assembly

1. Generate one Gemini TTS clip per scene from `VIDEO-NARRATION.md`
   (strip headers/quotes), name `01.wav`…`NN.wav`.
2. Concatenate, then mux (video is exactly the tour length; `-shortest`
   trims the longer stream):
   ```bash
   ffmpeg -i 01.wav -i 02.wav -filter_complex "concat=n=2:v=0:a=1" voice.wav
   ffmpeg -i <topic>.webm -i voice.wav -c:v copy -c:a aac -shortest <topic>-narrated.mp4
   ```
