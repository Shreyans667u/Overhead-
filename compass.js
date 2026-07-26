'use strict';
/*
 * Compass — wraps the DeviceOrientation API with circular smoothing (to
 * kill jitter) and a user-settable calibration offset. Exposes a simple
 * heading/pitch pair that ui.js/ar.js consume, plus a status string so the
 * UI can explain *why* nothing is happening instead of sitting silent.
 *
 * Honesty note: mapping "which way the phone is pointing" from raw
 * alpha/beta/gamma is inherently approximate without a full rotation-matrix
 * + screen-orientation solve, and drifts by device/OS. The calibration
 * offset lets a user zero it against a known reference direction.
 */
const Compass = (() => {
  const state = {
    supported: 'DeviceOrientationEvent' in window,
    active: false,
    heading: null,      // degrees, 0=N, clockwise, smoothed
    pitch: null,         // degrees, device tilt used as a pointing-elevation proxy
    calibrationOffset: parseFloat(localStorage.getItem('overhead_compass_cal') || '0'),
    permissionNeeded: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function',
    // status: idle | requesting | active | no-support | denied | no-signal
    status: 'idle',
    message: ''
  };

  let sinF = 0, cosF = 1, pitchF = 0;
  let usingAbsolute = false;   // once a true-heading source appears, ignore lower-quality relative events
  let watchdog = null;
  const SMOOTH = 0.15;         // lower = smoother but laggier
  const WATCHDOG_MS = 4000;

  const listeners = [];
  function on(fn){ listeners.push(fn); }
  function emit(){ listeners.forEach(fn => fn({ heading: state.heading, pitch: state.pitch, status: state.status, message: state.message })); }

  function setStatus(status, message=''){
    state.status = status;
    state.message = message;
    emit();
  }

  function handleOrientation(e){
    let h = null;
    let sourceIsHighQuality = false;

    if(typeof e.webkitCompassHeading === 'number'){
      h = e.webkitCompassHeading; // iOS: already a true compass heading
      sourceIsHighQuality = true;
    } else if(e.absolute === true && e.alpha !== null){
      h = 360 - e.alpha; // true-north-referenced
      sourceIsHighQuality = true;
    } else if(e.alpha !== null && !usingAbsolute){
      h = 360 - e.alpha; // best-effort fallback; may drift from true north
    } else {
      return; // a higher-quality stream is already active — ignore this noisier one
    }

    if(sourceIsHighQuality) usingAbsolute = true;
    h = (h + state.calibrationOffset + 360) % 360;

    const rad = h * Math.PI / 180;
    sinF += SMOOTH * (Math.sin(rad) - sinF);
    cosF += SMOOTH * (Math.cos(rad) - cosF);
    state.heading = (Math.atan2(sinF, cosF) * 180 / Math.PI + 360) % 360;

    // beta: front-back tilt. ~90 = phone upright ("wand" pointing at horizon).
    if(typeof e.beta === 'number'){
      const rawPitch = 90 - e.beta; // 0 = horizon, +up, -down (approximate)
      pitchF += SMOOTH * (rawPitch - pitchF);
      state.pitch = pitchF;
    }

    if(!state.active){
      state.active = true;
      clearTimeout(watchdog);
      setStatus('active');
    } else {
      emit();
    }
  }

  async function requestAccess(){
    if(!state.supported){
      setStatus('no-support', "This browser doesn't expose device orientation — try Chrome or Safari on a phone.");
      return { ok:false, reason: state.message };
    }
    setStatus('requesting', 'Waiting for permission…');

    if(state.permissionNeeded){
      try{
        const res = await DeviceOrientationEvent.requestPermission();
        if(res !== 'granted'){
          setStatus('denied', 'Permission was denied. Enable Motion & Orientation access for this site in Settings → Safari, then retry.');
          return { ok:false, reason: state.message };
        }
      }catch(e){
        setStatus('denied', 'Permission request failed: ' + e.message);
        return { ok:false, reason: state.message };
      }
    }

    usingAbsolute = false;
    state.active = false;
    sinF = 0; cosF = 1; pitchF = 0;
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);

    setStatus('requesting', 'Waiting for first compass reading…');
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if(!state.active){
        setStatus('no-signal', "No compass signal after a few seconds — this device may lack a magnetometer, or the browser is blocking sensor access. Try moving the phone in a figure-8, or reload and grant permission again.");
      }
    }, WATCHDOG_MS);

    return { ok:true };
  }

  function stop(){
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    clearTimeout(watchdog);
    state.active = false;
    setStatus('idle');
  }

  function calibrateTo(trueHeadingNow){
    if(state.heading === null) return false;
    const delta = trueHeadingNow - (state.heading - state.calibrationOffset);
    state.calibrationOffset = ((delta % 360) + 360) % 360;
    localStorage.setItem('overhead_compass_cal', String(state.calibrationOffset));
    return true;
  }

  function headingLabel(h){
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(h / 45) % 8];
  }

  // relative bearing from current heading to a target azimuth: negative = turn left
  function bearingDelta(targetAz){
    if(state.heading === null) return null;
    let d = targetAz - state.heading;
    while(d > 180) d -= 360;
    while(d < -180) d += 360;
    return d;
  }

  function pitchDelta(targetElev){
    if(state.pitch === null) return null;
    return targetElev - state.pitch;
  }

  return { state, on, requestAccess, stop, calibrateTo, headingLabel, bearingDelta, pitchDelta };
})();
