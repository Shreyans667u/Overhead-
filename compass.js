'use strict';
/*
 * Compass — wraps the DeviceOrientation API with circular smoothing (to
 * kill jitter) and a user-settable calibration offset. Exposes a simple
 * heading/pitch pair that compass.js/ar.js/ui.js consume.
 *
 * Honesty note: mapping "which way the phone is pointing" from raw
 * alpha/beta/gamma is inherently approximate without a full rotation-matrix
 * + screen-orientation solve, and drifts by device/OS. The calibration
 * offset lets a user zero it against a known bright object (e.g. the Moon).
 */
const Compass = (() => {
  const state = {
    supported: 'DeviceOrientationEvent' in window,
    active: false,
    heading: null,     // degrees, 0=N, clockwise, smoothed
    pitch: null,        // degrees, device tilt used as a pointing-elevation proxy
    calibrationOffset: parseFloat(localStorage.getItem('overhead_compass_cal') || '0'),
    permissionNeeded: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
  };

  let sinF = 0, cosF = 1, pitchF = 0;
  const SMOOTH = 0.15; // lower = smoother but laggier

  const listeners = [];
  function on(fn){ listeners.push(fn); }
  function emit(){ listeners.forEach(fn => fn({ heading: state.heading, pitch: state.pitch })); }

  function handleOrientation(e){
    let h;
    if(typeof e.webkitCompassHeading === 'number'){
      h = e.webkitCompassHeading; // iOS: already true compass heading
    } else if(e.absolute && e.alpha !== null){
      h = 360 - e.alpha; // Android absolute: alpha increases counter-clockwise from N
    } else if(e.alpha !== null){
      h = 360 - e.alpha; // best-effort fallback, may be relative not true north
    } else {
      return;
    }
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
    state.active = true;
    emit();
  }

  async function requestAccess(){
    if(!state.supported) return { ok:false, reason:'DeviceOrientation is not supported on this browser/device.' };
    if(state.permissionNeeded){
      try{
        const res = await DeviceOrientationEvent.requestPermission();
        if(res !== 'granted') return { ok:false, reason:'Permission was not granted.' };
      }catch(e){
        return { ok:false, reason:'Permission request failed: ' + e.message };
      }
    }
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return { ok:true };
  }

  function stop(){
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    state.active = false;
  }

  function calibrateTo(trueHeadingNow){
    if(state.heading === null) return;
    const delta = trueHeadingNow - (state.heading - state.calibrationOffset);
    state.calibrationOffset = ((delta % 360) + 360) % 360;
    localStorage.setItem('overhead_compass_cal', String(state.calibrationOffset));
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
