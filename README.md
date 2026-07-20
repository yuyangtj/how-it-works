# Hakspelet — Polhem's Hook Hoist in 3D

An interactive 3D model of the **Hakspelet** ("hook hoist"), Christopher Polhem's
late-17th-century machine for hoisting ore barrels from the Falun copper mine —
built from photos of the museum exhibit. A single self-contained `index.html`,
no build step.

## Run it

Open `index.html` in any modern browser (needs internet access — Three.js is
loaded from a CDN). Or serve it:

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

## What it shows

The whole power chain, end to end:

1. **Dam pond → flume → overshot water wheel** — water pours onto the paddles
   and the wheel turns (splash and all); the tailrace leads the water away.
2. **Crank + flatrod (stånggång)** — a parallel-crank (parallelogram) linkage:
   equal cranks and rod length equal to the centre distance, so the rod stays
   parallel to the crank-centre line and the driven crank follows the wheel 1:1.
   Pendulum hangers (*svänghängsel*) on tall posts carry the rod.
3. **Crank shaft + connecting rods** — short slider-crank links drive two pairs
   of timber beams in exact counter-phase (one up, one down).
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
- **✕** — closes the info panel (reopen with the ⓘ pill)
- URL params for deep links: `?t=12` (fast-forward seconds), `?view=mine`,
  `?cam=x,y,z&tgt=x,y,z`, `?xray=1`

## Model notes

- **Kinematics are exact where it matters**: hook spacing equals one crank
  stroke, so the receiving hook and the carried barrel meet at the same height
  at every hand-over — the barrel's height is monotonically non-decreasing
  (verified numerically over full cycles).
- The barrel transfer needs no sideways motion: the trunnion pin spans both
  beam pairs and the two ledge sets sit at different depths along the pin.
- Simplifications: no rope/chain at all (as per the real machine), the
  parallel-crank linkage is idealised (real parallelogram drives duplicate the
  rod to survive the change-point), hooks are plain ledges (historical ones
  were latch-shaped for tolerance), and workers (loading/unloading) are implied
  but not shown.

## Tech

Plain [Three.js](https://threejs.org) (ES modules via CDN import map),
`OrbitControls`, `CSS2DRenderer` labels, `Sky` environment, procedural canvas
textures for grass and water. Everything lives in `index.html`.
