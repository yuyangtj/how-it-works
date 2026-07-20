# Video narration — "Hakspelet: Polhem's Hook Hoist"

Voice-over script for the 2 min 26 s scripted tour recorded with the
**🎬 Record video** button in `index.html`. Scene boundaries below match the
video timecodes exactly, so you can generate one TTS clip per scene and drop
the clips onto the timeline.

Reading pace is about 2.2 words per second — each block is sized to fill its
scene. If a clip runs long, trim a sentence rather than speeding up the voice.

---

## Scene 1 — 0:00–0:12 — Title / overview

> Around the year 1700, at the Falun copper mine in Sweden, engineer
> Christopher Polhem built a remarkable hoisting machine: the Hakspelet, or
> hook hoist. This is how it worked.

## Scene 2 — 0:12–0:26 — Dam pond and flume

> It all starts with water. A dam pond on the hill holds the reserve. A wooden
> flume carries the water downhill, gaining speed, and pours it straight onto
> the paddles of the water wheel below.

## Scene 3 — 0:26–0:42 — Water wheel and crank

> The wheel is overshot: water fills the buckets near the top, and its weight
> turns the wheel. On the axle sits a crank. Every revolution of the wheel
> becomes one long push-and-pull stroke — the heartbeat of the whole machine.

## Scene 4 — 0:42–0:58 — Flatrod and pendulum hangers

> That stroke travels along the flatrod — the stånggång — a jointed timber rod
> reaching across the works. It hangs from pendulum arms on tall posts, so the
> rod swings freely while the crank's push-pull passes through it, almost
> without loss.

## Scene 5 — 0:58–1:12 — Rocking beam, beams in counter-phase

> At the headframe, the flatrod drives a rocking beam — the vippbom. From its
> opposite arms, the two pairs of hooked timber beams hang on chains,
> counterbalancing each other: when one pair rises, the other falls. Watch
> them trade places.

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

> Pond, flume, wheel, flatrod, rocking beam, and hooks — one continuous chain
> of water power, lifting ore from deep underground. Polhem's hook hoist,
> three hundred years ahead of its time.

---

## Turning this into audio with Gemini TTS

1. Generate one clip per scene (9 clips). Plain prose only — strip the
   `Scene …` headers, `>` quotes, and this section before pasting.
2. Name the clips `01.wav` … `09.wav` and concatenate with silence trimmed:

   ```bash
   ffmpeg -i 01.wav -i 02.wav -i 03.wav -i 04.wav -i 05.wav -i 06.wav \
          -i 07.wav -i 08.wav -i 09.wav \
          -filter_complex "concat=n=9:v=0:a=1" voice.wav
   ```

3. Mux voice-over with the recorded video:

   ```bash
   ffmpeg -i hakspelet.webm -i voice.wav -c:v copy -c:a aac -shortest \
          hakspelet-narrated.mp4
   ```

   (`-shortest` cuts whichever stream runs long; the video is exactly
   146 s, so trim the audio to fit if needed.)
