# Hakspelet — Polhem's Hook Hoist in 3D

An interactive 3D model of the **Hakspelet** ("hook hoist"), Christopher Polhem's
late-17th-century machine for hoisting ore barrels from the Falun copper mine —
built from photos of the museum exhibit. A single self-contained `index.html`,
no build step.

## Run it

Open `index.html` in any modern browser (needs internet access — Three.js is
loaded from a CDN). Or serve it **from the project root** (the page loads the
shared `../video-tour.js`):

```bash
cd ..                      # project root
python3 -m http.server 8000
# → http://localhost:8000/hook-hoist/
```

## What it shows

The whole power chain, end to end:

1. **Dam pond → flume → overshot water wheel** — water pours onto the paddles
   and the wheel turns (splash and all); the tailrace leads the water away.
2. **Crank + flatrod (stånggång)** — the wheel's crank drives the long
   jointed flatrod (a four-bar linkage, solved exactly each frame). Pendulum
   hangers (*svänghängsel*) on tall posts carry the rod.
3. **Rocking beam (vippbom) + lift chains** — at the mine end nothing
   rotates: the flatrod rocks a beam on the headframe, and the two pairs of
   hooked timber beams hang on chains from its opposite arms — one pair
   rises exactly as the other sinks, counterbalancing over the pivot.
4. **The hook relay** — pair A (light timber, hooks at levels −8,−6,−2,0,2 …)
   and pair B (Falu red, hooks offset by half a spacing). The ore barrel is
   handed from hook to hook, exactly one spacing per half-stroke, from the
   lantern-lit **loading gallery** underground up to the **hoist-house floor** —
   no ropes at all. A gold ring flashes at each hand-over.

The underground is an open pit around the shaft, viewable from all sides;
an **X-ray ground** toggle fades the earth so you can watch the climb from
any distance.

## Controls

- **Orbit / zoom** — mouse drag / wheel
- **Pause, Speed slider** — simulation speed 0.25×–2.5×
- **Labels** — toggle part labels; **X-ray ground** — ghost the earth
- **Camera buttons** — Overview / Mine shaft / Hoist tower / Water wheel / Water supply
- **🎬 Record video** — plays the scripted camera tour (2 min 26 s) and
  downloads it as `hakspelet.webm` (see below)
- **✕** — closes the info panel (reopen with the ⓘ pill)
- URL params for deep links: `?t=12` (fast-forward seconds), `?view=mine`,
  `?cam=x,y,z&tgt=x,y,z`, `?xray=1`

## Making the "how it works" video

No screen recording needed — the model records itself, either from the
browser or fully headless. The machinery lives in the shared, topic-agnostic
`../video-tour.js`; this page only defines the storyboard (`SCENES`).

**In-browser (best quality, real GPU):**

1. Serve from the project root (`cd .. && python3 -m http.server 8000`) and
   open `http://localhost:8000/hook-hoist/` in Chrome or Edge. Size the
   window to 1920×1080 for 1080p output.
2. Click **🎬 Record video**. The UI hides, a scripted 9-scene camera tour
   plays (2 min 26 s, following the power chain from dam pond to unload
   deck), and `hakspelet.webm` downloads when it ends. Press **Esc** or click
   the button again to stop early. `?tour=1` previews the tour without
   recording.

**Headless (no browser interaction, software GL):**

```bash
node ../tools/record-headless.mjs index.html hakspelet.webm   # from hook-hoist/
# or from the project root:
node tools/record-headless.mjs hook-hoist/index.html hakspelet.webm
```

**Voice-over and assembly:**

1. `VIDEO-NARRATION.md` has the narration script with timecodes matching the
   9 scenes — generate one TTS clip per scene (e.g. with Gemini TTS), then
   concatenate and mux (commands are in that file).
2. `.webm` uploads to YouTube directly; to get an `.mp4`:
   `ffmpeg -i hakspelet.webm -c:v libx264 -pix_fmt yuv420p hakspelet.mp4`.

The tour itself is the `SCENES` array in `index.html` — edit durations,
camera poses, sim speed, or x-ray flags there to re-cut the video (and adjust
the narration timecodes to match).

## Model notes

- **Kinematics are exact where it matters**: the four-bar (wheel crank →
  flatrod → rocker) is solved numerically each frame, and the rocker's swing
  is calibrated so one stroke equals exactly one hook spacing — the receiving
  hook and the carried barrel meet at the same height at every hand-over.
- The barrel transfer needs no sideways motion: the trunnion pin spans both
  beam pairs and the two ledge sets sit at different depths along the pin.
- Simplifications: hooks are plain ledges (historical ones were latch-shaped
  for tolerance), and workers (loading/unloading) are implied but not shown.
  The lift chains are real (as in the museum model); it is the barrel relay
  itself that uses no ropes.

## Tech

Plain [Three.js](https://threejs.org) (ES modules via CDN import map),
`OrbitControls`, `CSS2DRenderer` labels, `Sky` environment, procedural canvas
textures for grass and water. Everything lives in `index.html`.
