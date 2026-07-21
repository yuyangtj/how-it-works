# Video narration — "Hakspelet: Polhem's Hook Hoist"

Voice-over script for the 2 min 26 s scripted tour recorded with the
**🎬 Record video** button in `index.html`. Scene boundaries below match the
video timecodes exactly, so you can generate one TTS clip per scene and drop
the clips onto the timeline.

Reading pace is about 2.2 words per second — each block is sized to fill its
scene. If a clip runs long, trim a sentence rather than speeding up the voice.

---

## Scene 1 — 0:00–0:12 — Title / overview

> Around 1700, at the Falun copper mine in Sweden, Christopher Polhem built
> a remarkable hoisting machine: the Hakspelet, or hook hoist. This is how
> it worked.

## Scene 2 — 0:12–0:26 — Dam pond and flume

> It all starts with water. A dam pond on the hill holds the reserve. A wooden
> flume carries the water downhill, gaining speed, and pours it straight onto
> the paddles of the water wheel below.

## Scene 3 — 0:26–0:42 — Water wheel and crank

> Water fills the buckets near the top, and its weight turns the wheel. On
> the axle sits a crank, turning each revolution into one long push-and-pull
> stroke — the machine's heartbeat.

## Scene 4 — 0:42–0:58 — Flatrod and pendulum hangers

> That stroke travels along the flatrod — the stånggång — a jointed timber rod
> reaching across the works. It hangs from pendulum arms on tall posts, so the
> rod swings freely while the crank's push-pull passes through it, almost
> without loss.

## Scene 5 — 0:58–1:12 — Rocking beam, beams in counter-phase

> At the headframe, the flatrod drives a rocking beam — the vippbom. From its
> arms hang two pairs of hooked beams: when one pair rises, the other falls.
> Watch them trade places.

## Scene 6 — 1:12–1:28 — Mine shaft and loading gallery

> Now we go underground. In the lantern-lit loading gallery, miners fill a
> barrel with ore and hang it on the lowest hook, by its trunnion pin. Above
> it, the timber-lined shaft leads up to the daylight.

## Scene 7 — 1:28–1:58 — The hook relay (hero shot)

> Here is the clever part. There are no ropes at all. Each beam pair carries
> hooks at regular intervals, the two pairs offset by exactly half a spacing.
> At every half-stroke, the rising pair lifts the barrel off the falling pair's
> hook — and the gold ring flashes at each hand-over. Step by step, one hook
> spacing per half-stroke, the barrel climbs the entire shaft.

## Scene 8 — 1:58–2:14 — Unload deck and the cycle

> At the top, the barrel arrives level with the hoist-house deck. A worker
> tips it over, the ore rolls away, and the empty barrel goes back down for
> the next load. The cycle repeats, barrel after barrel, powered only by
> water.

## Scene 9 — 2:14–2:26 — Wrap-up overview

> Pond, flume, wheel, flatrod, and hooks — one chain of water power. Polhem's
> hook hoist, three centuries ahead of its time.

---

## Turning this into audio with Gemini TTS

Automated — parses the scene blocks above, synthesizes one clip per scene,
aligns each clip to its scene start, and muxes:

```bash
GEMINI_TTS_API_KEY=... node tools/generate-voiceover.mjs \
  hook-hoist/VIDEO-NARRATION.md --video hakspelet.webm
```

Outputs land in `hook-hoist/voiceover/` (`01.wav`…`09.wav`, `voice.wav`)
plus `hakspelet-narrated.mp4`. Clips are cached; pass `--force` after
editing a scene's text. If the log warns a clip runs longer than its scene,
trim that scene's prose rather than speeding up the voice.

## Publishing to YouTube

```bash
YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/upload-youtube.mjs \
  hook-hoist/hakspelet-narrated.mp4 \
  --title "Polhem's Hook Hoist (Hakspelet) — How It Works"
```

Uploads unlisted by default; the description links the live demo
(`https://yuyangtj.github.io/how-it-works/hook-hoist/`) and the repo.
See the header of `tools/upload-youtube.mjs` for the one-time OAuth setup.
