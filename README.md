# Overhead - Satellite Mission Console

A live satellite-visibility dashboard: point it at the sky and it tells you
what is overhead, whether you can actually see it with your eyes, and which
direction to look. Runs entirely as static files. No backend, no build step,
deploys straight to GitHub Pages.

**[Live demo](https://shreyans667u.github.io/Overhead-/)**

<!--
  Screenshots: add 2 to 4 real screenshots here before publishing, e.g.
  ![Dashboard](docs/screenshot-dashboard.png)
  Use actual captures of the running app. Do not use stock or generated
  imagery.
-->

## Features

- **Live location tracking.** Continuous GPS via `watchPosition`, refreshed
  roughly every second, no manual re-locating.
- **Real orbital mechanics.** SGP4 propagation of live TLE data from
  CelesTrak for azimuth, elevation, and range of every satellite in the
  chosen catalog (ISS and stations, the brightest objects, or all of
  Starlink).
- **Naked-eye visibility confidence score** (0 to 100%) per satellite, from
  sun altitude and twilight stage, elevation and atmospheric extinction,
  live cloud cover, a light-pollution (Bortle scale) setting, moon
  brightness and proximity, eclipse status, and an estimated apparent
  magnitude.
- **Visibility alerts.** Opt-in notifications the moment something becomes
  visible.
- **Live compass** with jitter smoothing and a manual calibration step.
- **Point Me To The Satellite.** A directional arrow with turn and raise
  guidance, vibration and a chime when you are on target.
- **AR sky mode.** Camera view with satellite markers overlaid from your
  compass heading and device tilt.
- **Sky plot.** A polar radar-style view (zenith center, horizon edge), tap
  to select, with zoom controls.
- Installable as a PWA, works offline for the app shell once installed.

## Intro sequence

On load the app plays a fixed 5-second title sequence, then fades out and
hands off to the dashboard.

- Runtime is controlled by one constant: `INTRO_MS` in `intro.js`. It is
  pushed into the CSS custom property `--intro-total` at init, so the
  progress bar and the actual handoff cannot drift apart. Change that one
  number to change the length.
- It does not touch scroll. No wheel interception, no scroll-linked
  transforms, no parallax. The overlay is `position:fixed` and the body is
  locked while it plays, so the real scroll position never moves.
- Reveals are opacity plus a 12px vertical lift. No scale-up, no blur.
- Skip button is always present, and Escape also exits immediately.
- Under `prefers-reduced-motion: reduce` it becomes a plain crossfade with a
  static starfield.

`media/overhead-intro-5s.mp4` is a standalone 1920x1080 render of the same
sequence, for use as a repo preview, social card, or demo clip. It is not
loaded by the site.

## Setup

No build tools and no `npm install`. It is plain HTML, CSS, and JS.

**To run locally:**
```bash
git clone https://github.com/shreyans667u/Overhead-.git
cd Overhead-
python3 -m http.server 8000
# open http://localhost:8000
```
Geolocation and camera APIs require either `localhost` or HTTPS. Opening the
files over `file://` fails silently on those permissions, so always serve it,
even locally.

**To publish on GitHub Pages:**
1. Push all the files in this repo to the `main` branch, at the root rather
   than in a subfolder. See *Project-page paths* below.
2. Repo, then **Settings > Pages > Source > Deploy from a branch**, then
   `main` / `/ (root)`, then Save.
3. The app is live at `https://shreyans667u.github.io/Overhead-/` within a
   minute or two. GitHub Pages serves over HTTPS automatically, which is
   required for geolocation, camera, and notifications to work at all.

### Project-page paths (important)

GitHub Pages project sites are served from a subdirectory
(`username.github.io/repo-name/`), not the domain root. Every path in this
app is relative (`./styles.css`, `./ui.js`, `start_url: "./index.html"`) so
it works unmodified at any subpath. Do not change them to root-absolute
(`/styles.css`) or it will break under a project page.

## Launch checklist

| Item | Status |
|---|---|
| Favicon | Done. `icon.svg` is linked from `index.html`, `privacy.html`, and `terms.html`, with `icon-192.png` and `icon-512.png` in `manifest.json`. |
| Privacy policy page | Done. `privacy.html`, dated, with a real contact address. |
| Terms page | Done. `terms.html`, dated, with a real contact address. |
| "Made with AI" style badge | None present. There is no generator badge, watermark, or attribution widget anywhere in the source. |
| No fake metrics, reviews, or counters | Verified. Every number the UI shows is computed from live GPS, TLE, and weather data, or is a labelled estimate. |
| Custom domain | **Not done. Requires your registrar and DNS access.** Steps below. |

The legal pages are plain-language developer documents, not lawyer-reviewed
text. If the app will be used somewhere with specific disclosure rules such
as GDPR or CCPA, get them reviewed before relying on them.

### Connecting a custom domain

This step needs your own domain and DNS access. It cannot be done from
inside the repo.

1. Buy or own the domain or subdomain you want to use.
2. At your DNS provider, add one of:
   - **Apex domain** (`example.com`): four `A` records pointing to
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and
     `185.199.111.153`.
   - **Subdomain** (`sky.example.com`): one `CNAME` record pointing to
     `shreyans667u.github.io`.
3. In the repo: **Settings > Pages > Custom domain**, enter the domain, and
   save. GitHub creates the `CNAME` file in the repo for you. Do not
   hand-write one with a placeholder domain, because Pages will then try to
   serve that literal value.
4. Wait for DNS to propagate, which takes minutes to a few hours. Then tick
   **Enforce HTTPS** in the same Pages settings once GitHub shows the
   certificate as issued. Geolocation, camera, and notifications all require
   HTTPS, so do not skip it.

## Files

```
index.html      structure + inline SVG icon sprite (no emoji anywhere in the app)
styles.css      design system (dark theme, layout)
intro.css       5-second intro title sequence styles
intro.js        5-second intro timeline + starfield
icons.js        helper (ic()) for using sprite icons from JS-generated markup
visibility.js   naked-eye visibility confidence scoring
app.js          tracking engine: geolocation, weather, TLE fetch, SGP4, sun/moon
compass.js      DeviceOrientation compass with smoothing + calibration
ar.js           camera AR overlay
ui.js           rendering and interaction: cards, sky plot, guidance, palette
manifest.json   PWA manifest
sw.js           network-first service worker (offline fallback only)
privacy.html    privacy policy
terms.html      terms of use
media/          standalone 5-second intro render (mp4)
icon.svg, icon-192.png, icon-512.png    app icons and favicon
```

## Permissions requested (each only on demand, never upfront)

| Permission | Used for | If denied |
|---|---|---|
| Location | all tracking | Clear error message with the specific reason (denied, no fix, or timeout) and what to do about it |
| Notifications | visibility alerts | Button shows "Alerts blocked" with instructions if previously denied |
| Motion and orientation | compass, Point Me, AR | Status message separates no-signal, no-support, and denied, with a retry path |
| Camera | AR mode only | Toast separates denied, no camera found, and unsupported |

## Known limitations (read before a demo)

- **Apparent magnitude is a heuristic**, not a measured photometric value.
  There is no free, no-key brightness catalog, so it is estimated from
  object class and range. Treat it as "worth a look", not gospel.
- **Light pollution is a manual Bortle slider**, not automatic lookup by
  coordinates, because no reliable free API exists for that.
- **AR mode is a 2D field-of-view projection**, not full ARKit or ARCore
  6DOF tracking. It assumes a fixed camera FOV of roughly 62 by 46 degrees.
  Good for pointing roughly at the sky and seeing it line up, not for
  sub-degree anchoring.
- **Compass pitch-to-elevation mapping is approximate** and drifts by
  device. That is what the calibration button is for.
- **Pass countdown is a short forward simulation**, up to 20 minutes ahead,
  not a full multi-orbit prediction engine.
- No build step means no React and no animation library. Animation is
  hand-tuned CSS plus small JS interpolation.

## Performance and battery notes

- Continuous high-accuracy GPS (`watchPosition` with `enableHighAccuracy`)
  is inherently one of the more battery-hungry things a web page can do.
  There is no way around that for a tool whose whole premise is "where am I
  right now". The app does clean up its GPS watch, timers, and camera stream
  on stop and close, so nothing keeps running once you are done.
- AR mode stops the camera automatically if you switch away from the tab.
- The intro tears down its starfield animation loop at handoff rather than
  leaving it running behind the dashboard.
- The service worker is network-first for app files, so it always fetches
  the latest version when online and only serves from cache when offline. It
  never masks a fresh deploy behind a stale copy.
