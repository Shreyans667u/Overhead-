# 🛰️ Overhead — Satellite Mission Console

A live satellite-visibility dashboard: point it at the sky (literally) and
it tells you what's overhead, whether you can actually see it with your
eyes, and which direction to look. Runs entirely as static files — no
backend, no build step, deploys straight to GitHub Pages.

**[Live demo →](https://YOUR-USERNAME.github.io/YOUR-REPO/)** *(update this
link once published)*

<!--
  Screenshots: add 2–4 images here before publishing, e.g.
  ![Dashboard](docs/screenshot-dashboard.png)
  ![Sky plot](docs/screenshot-skyplot.png)
  ![AR mode](docs/screenshot-ar.png)
  A phone-frame mockup (screely.com or similar) reads better than a bare
  screenshot in a README.
-->

## Features

- **Live location tracking** — continuous GPS via `watchPosition`, refreshed
  roughly every second, no manual re-locating.
- **Real orbital mechanics** — SGP4 propagation of live TLE data
  (CelesTrak) for azimuth/elevation/range of every satellite in the chosen
  catalog (ISS & stations, the ~100 brightest objects, or all of Starlink).
- **Naked-eye visibility confidence score** (0–100%) per satellite, from
  sun altitude/twilight stage, elevation & atmospheric extinction, live
  cloud cover, a light-pollution (Bortle scale) setting, moon
  brightness/proximity, eclipse status, and an estimated apparent
  magnitude.
- **Visibility alerts** — opt-in push notifications the moment something
  becomes visible.
- **Live compass** with jitter smoothing and a manual calibration step.
- **Point Me To The Satellite** — a directional arrow with turn-left/right
  and raise/lower guidance, vibration + a chime when you're on target.
- **AR sky mode** — camera view with satellite markers overlaid based on
  your compass heading and device tilt.
- **Sky plot** — a polar radar-style view (zenith center, horizon edge),
  tap to select, zoom controls.
- Installable as a PWA (Add to Home Screen / native install prompt),
  works offline for the app shell once installed.

## Setup

No build tools, no `npm install` — it's plain HTML/CSS/JS.

**To run locally:**
```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
python3 -m http.server 8000
# open http://localhost:8000
```
(Geolocation/camera APIs require either `localhost` or HTTPS — a plain
`file://` open will fail silently on those permissions, so always serve it,
even locally.)

**To publish on GitHub Pages:**
1. Push all the files in this repo to the `main` branch (root, not a
   subfolder — see *Project-page paths* below).
2. Repo → **Settings → Pages → Source → Deploy from a branch** → `main` /
   `/ (root)` → Save.
3. Your app is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/` within
   a minute or two. GitHub Pages serves everything over HTTPS
   automatically, which is required for geolocation, camera, and
   notifications to work at all.

### Project-page paths (important)

GitHub Pages "project" sites are served from a subdirectory
(`username.github.io/repo-name/`), not the domain root. Every path in this
app is relative (`./styles.css`, `./ui.js`, `start_url: "./index.html"`,
etc.) specifically so it works unmodified at any subpath — don't change
any of them to root-absolute (`/styles.css`) or it'll break under a
project page.

## Files

```
index.html      structure
styles.css      design system (dark glass theme, animations, layout)
visibility.js   naked-eye visibility confidence scoring
app.js          tracking engine: geolocation, weather, TLE fetch, SGP4, sun/moon
compass.js      DeviceOrientation compass with smoothing + calibration
ar.js           camera AR overlay
ui.js           all rendering/interaction — cards, sky plot, guidance, palette
manifest.json   PWA manifest
sw.js           network-first service worker (offline fallback only)
icon.svg, icon-192.png, icon-512.png    app icons
```

## Permissions requested (each only on demand, never upfront)

| Permission | Used for | If denied |
|---|---|---|
| Location | all tracking | Clear error message with the specific reason (denied / no fix / timeout) and what to do about it |
| Notifications | visibility alerts | Button shows "Alerts blocked" with instructions if previously denied |
| Motion & Orientation | compass, point-me, AR | Status message explains no-signal vs. no-support vs. denied, with a retry path |
| Camera | AR mode only | Toast explains denied vs. no-camera-found vs. unsupported |

## Known limitations (read before a demo)

- **Apparent magnitude is a heuristic**, not a measured photometric value —
  there's no free, no-key brightness catalog, so it's estimated from
  object-class + range. Treat it as "worth a look," not gospel.
- **Light pollution is a manual Bortle slider**, not automatic
  lookup-by-coordinates — no reliable free API exists for that.
- **AR mode is a 2D field-of-view projection**, not full ARKit/ARCore 6DOF
  tracking — it assumes a fixed ~62°×46° camera FOV. Good for "point
  roughly at the sky and see it line up," not sub-degree anchoring.
- **Compass pitch-to-elevation mapping is approximate** and drifts by
  device — that's what the calibration button is for.
- **Pass-countdown is a short forward simulation** (up to 20 minutes
  ahead), not a full multi-orbit prediction engine.
- No build step means no React/Framer Motion — animation is hand-tuned
  CSS + small JS interpolation, aimed at the same 60fps feel.

## Performance / battery notes

- Continuous high-accuracy GPS (`watchPosition` + `enableHighAccuracy`) is
  inherently one of the more battery-hungry things a web page can do.
  There's no way around that for a tool whose whole premise is "where am I
  right now" — but the app does clean up its GPS watch, timers, and
  camera stream properly on stop/close so nothing keeps running in the
  background once you're done with it.
- AR mode stops the camera automatically if you switch away from the tab,
  rather than leaving it running.
- The service worker is network-first for app files (always fetches the
  latest version when online) and only serves from cache when offline —
  so it never masks a fresh deploy behind a stale cached copy.
