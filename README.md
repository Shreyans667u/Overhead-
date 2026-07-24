# Overhead — Satellite Mission Console

A complete UI/UX redesign of the original tracker, plus five new feature sets:
naked-eye visibility confidence scoring, a live compass, "point me to the
satellite" guidance, an AR sky overlay, and a guided-lock mode.

**The orbital mechanics are untouched.** SGP4 propagation, the sun-position
math, the Earth-shadow eclipse test, TLE parsing, and the geolocation/weather
calls are the same functions from the original build, just moved into
`js/state.js` with no logic changes. Everything else here is new UI or new
(clearly-labeled) features layered on top.

## File structure

```
index.html          structure only
styles.css           design system — colors, type, components, animation
js/state.js          [unchanged] orbital math, TLE parsing, app state
js/visibility.js      [new] naked-eye confidence scoring + moon geometry
js/compass.js         [new] device heading via DeviceOrientation
js/guidance.js        [new] pointing math (turn left/right, raise/lower)
js/ar.js              [new] camera overlay projection
js/ui.js              [new] rendering: cards, sky plot, toasts, starfield
js/app.js             wires it all together, owns the location/scan loop
manifest.json, sw.js, icon.svg   PWA shell (updated for the new file list)
```

## What's new

**Naked-eye visibility confidence** — every satellite now gets a 🟢/🟡/🔴
tier and 0–100% score from: sun altitude (twilight depth), moon altitude and
illuminated fraction, cloud cover, an estimated apparent magnitude, low
-elevation atmospheric extinction, and a light-pollution slider (Bortle
1–9). When nothing's visible, the app tells you the dominant blocking
reason instead of just showing an empty list.

**Live compass** — tap "Enable" on the compass card to grant sensor
permission (required on iOS 13+); shows heading in degrees and cardinal
direction, smoothed to cut sensor jitter.

**Point Me** — tap it on any satellite card for a full-screen reticle that
turns green and vibrates when you're aimed at it, with live "turn left/turn
right/raise/lower" instructions.

**AR sky mode** — the camera icon on the sky plot opens your rear camera
with satellite dots and labels overlaid in real time, projected from your
current heading/tilt. Tap a dot for details.

**Also added:** command palette (`Ctrl/Cmd+K`), favorites, search/filter
chips, CSV export, sound toggle, high-contrast theme toggle, fullscreen sky
plot, starfield/aurora background, toasts, skeleton loading states.

## Honest scoping notes — read before you trust these numbers

- **Estimated magnitude is a rough proxy, not photometry.** TLEs carry no
  brightness data. The app estimates it from catalog type + range. Real
  brightness varies a lot with solar phase angle, which isn't modeled.
- **Light pollution is user-supplied**, not auto-detected — there's no
  reliable browser API for local sky brightness. Set the Bortle slider from
  your own knowledge of your sky.
- **Compass heading/tilt accuracy varies by phone.** The elevation figure
  used for "raise/lower phone" comes from a simplified tilt reading (`beta -
  90°`), which assumes you're holding the phone roughly upright and facing
  forward. Treat guidance as approximate, not survey-grade.
- **AR mode is a 2D projection** using an assumed ~60°×46° camera field of
  view, not a full 6-DoF AR engine — good for pointing at something like the
  ISS, not frame-accurate through a zoomed lens.
- Sun position is still the same low-precision approximation as before
  (fine for day/night and eclipse checks, not observatory-grade).

## Hosting it on GitHub Pages

1. In your repo, replace the old files with this entire set — keep the
   folder structure (`js/` stays a subfolder).
2. Commit and push.
3. Pages settings are unchanged — same repo, same branch, same root.
4. Because this now uses ES modules (`<script type="module">`), it **must**
   be served over http(s) — GitHub Pages does this automatically. Local
   testing still needs a local server (see below), not a `file://` URL.

```bash
cd overhead
python3 -m http.server 8000
# open http://localhost:8000
```

## Permissions you'll be asked for

- **Location** — required, same as before.
- **Notifications** — optional, for visibility alerts.
- **Motion & orientation** (compass) — iOS asks explicitly the first time
  you tap "Enable" on the compass card; Android generally doesn't prompt.
- **Camera** — only requested when you open AR mode.

None of these are requested until you interact with the relevant control.
