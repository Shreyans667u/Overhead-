# Overhead — Satellite Mission Console

A complete visual + UX rebuild of the tracker: glass-panel dashboard,
animated sky plot, AR sky mode, live compass, and directional guidance —
still zero-build, plain files, deploys straight to GitHub Pages.

## Files (all required)

```
index.html      structure
styles.css      design system (dark glass theme, animations, responsive layout)
visibility.js   naked-eye visibility confidence scoring (New Feature 1)
app.js          tracking engine: geolocation, weather, TLE fetch, SGP4, sun/moon
compass.js      DeviceOrientation compass with smoothing + calibration (Feature 2)
ar.js           camera AR overlay (Feature 4)
ui.js           all rendering/interaction — cards, sky plot, guidance, palette
manifest.json   PWA manifest
sw.js           offline app-shell caching
icon.svg        app icon
```

Architecture note: the old single-file version is now split by concern
(tracking math / visibility scoring / compass / AR / rendering) so each
piece is independently readable and testable, without introducing a build
step. I did **not** move this to React + Framer Motion — that would need a
bundler (Vite/webpack) and a different hosting flow than "push files to
GitHub Pages." If you'd rather have the React/Motion version with a proper
component tree, say so and I'll set up that build separately — happy to,
just didn't want to silently change your deploy process.

## What's genuinely new and working

- **Full visual rebuild**: glass cards, gradient buttons with ripple/glow,
  starfield + aurora background, count-up numbers, skeleton loaders,
  fade/slide-in animations, mobile bottom dock + desktop sidebar, command
  palette (press `/`), toasts, favorites (saved locally), filter chips.
- **Sky plot**: now zoomable/pannable, tap-to-select, glow + trail styling
  for visible objects, shows your live compass heading as a bearing line.
- **Naked-eye visibility scoring** (feature 1): every satellite gets a
  0–100% confidence score and a tier (Visible / Probably Visible / Possible
  with Binoculars / Not Visible), built from sun altitude, twilight stage,
  elevation/atmospheric extinction, cloud cover, a Bortle light-pollution
  slider (Settings panel — see caveat below), moon altitude/phase/angular
  proximity, eclipse status, and an estimated apparent magnitude.
- **Live compass** (feature 2): DeviceOrientation-based heading with
  circular smoothing to kill jitter, iOS permission handling, calibration
  button, N/E/S/W dial.
- **Point Me To The Satellite** (feature 3): big rotating arrow, turn
  left/right + raise/lower phone guidance, green "on target" state with
  vibration + a chime, driven by your live compass bearing vs. the
  satellite's azimuth/elevation.
- **AR sky mode** (feature 4): opens your camera, overlays satellites
  within a simulated field of view as glowing labeled markers, tap a
  marker for details.
- **Guidance reticle**: red → orange → yellow → green as your aim closes
  in, used inside the Point-Me overlay.
- Orbit classification (LEO/MEO/GEO/HEO) from mean motion, and a rough
  rise/set countdown via short forward time-stepping — both new, both
  genuine calculations, not placeholders.
- Sound toggle (Web Audio beeps, no external audio files), theme toggle
  (cyan/amber accent swap), reduced-motion respected automatically.

## Where I simplified, and why — read this before relying on it

- **Apparent magnitude is a heuristic**, not a measured/catalog value.
  There's no free, no-key photometric database of every object's real
  reflectivity, so brightness is estimated from object-class patterns
  (ISS, Starlink, etc.) scaled by range. Treat the badge as "worth a look,"
  not a guaranteed number.
- **Light pollution uses a manual Bortle slider** (Settings panel), not
  automatic lookup — there's no reliable free API for that by coordinates.
  You set it once for where you're observing from.
- **AR mode is 2D FOV-projection**, not full ARKit/ARCore 6DOF tracking.
  It assumes a fixed ~62°×46° camera field of view and maps compass
  heading + device tilt to screen position. It works for "point roughly at
  the sky and see it line up," not sub-degree AR anchoring.
- **Compass pitch-to-elevation mapping is approximate** and can drift
  between devices/OSes — that's why there's a calibration button. Face a
  known direction (north, or a landmark) and tap "Calibrate to North" in
  Settings if the arrow feels off.
- **Framer Motion wasn't used** — see the architecture note above. All
  animation is hand-tuned CSS transitions/keyframes plus small JS
  interpolation (count-up numbers, ripple), targeting the same 60fps feel
  without a build step.
- A few "nice extras" from the brief (satellite history log, orbit-preview
  3D, constellation overlay, mini radar, resizable panel, full keyboard
  shortcut set) aren't included — the list was large and I prioritized the
  functional core (visibility science, compass, point-me, AR) over the
  decorative extras. Tell me which of those matter most and I'll add them
  next.

## All original tracking math is unchanged

SGP4 propagation, TLE parsing, eclipse/shadow geometry, sun altitude, and
the CelesTrak/Open-Meteo API calls are byte-for-byte the same logic as
before — just reorganized into `app.js` and layered with the new
`visibility.js` scoring on top. Nothing about how positions are computed
changed.

## Hosting it on GitHub Pages

1. In your existing repo, replace **all** files with the ones in this
   folder (old `index.html`/`sw.js`/`manifest.json` get overwritten; the
   others — `styles.css`, `visibility.js`, `app.js`, `compass.js`, `ar.js`,
   `ui.js` — are new additions).
2. Commit and push. GitHub Pages redeploys automatically at your existing
   URL within a minute or two.
3. Re-open on your phone. If it's already installed via "Add to Home
   Screen," force-refresh once (or reinstall) so the new service worker
   cache takes over from `overhead-v1`.

## Permissions you'll be asked for

- **Location** — for tracking (same as before).
- **Notifications** — optional, for visibility alerts.
- **Motion & Orientation** (iOS prompts explicitly; Android usually
  doesn't) — needed for the compass, point-me, and AR features.
- **Camera** — only when you open AR mode.

None of these are requested until you tap the corresponding button.
