// compass.js — NEW: live heading from the device's orientation sensors.
//
// Honesty note: raw DeviceOrientation heading/tilt accuracy varies a lot by
// phone and browser. We smooth with an exponential moving average to cut
// jitter, but this is best-effort guidance, not survey-grade bearing.

export const compassState = {
  available: false,
  permissionNeeded: false,
  heading: 0,       // degrees, 0 = north, clockwise
  elevation: 0,      // approximate device tilt from horizontal, degrees
  calibrated: false,
};

let smoothedHeading = null;
let smoothedElev = null;
const ALPHA = 0.18; // EMA smoothing factor

function shortestAngleLerp(from, to, alpha){
  let diff = ((to - from + 540) % 360) - 180;
  return (from + diff * alpha + 360) % 360;
}

function handleOrientation(e, onUpdate){
  let heading;
  if(typeof e.webkitCompassHeading === 'number'){
    heading = e.webkitCompassHeading; // iOS Safari: already a true compass heading
  } else if(e.absolute && e.alpha != null){
    heading = 360 - e.alpha;
  } else if(e.alpha != null){
    heading = 360 - e.alpha; // best effort without absolute flag
  } else {
    return;
  }
  heading = (heading + 360) % 360;

  // beta: front-back tilt. Treat ~90deg (phone vertical, screen facing user) as
  // pointing at the horizon; deviation above/below that is elevation.
  let elev = 0;
  if(e.beta != null) elev = e.beta - 90;

  smoothedHeading = smoothedHeading == null ? heading : shortestAngleLerp(smoothedHeading, heading, ALPHA);
  smoothedElev = smoothedElev == null ? elev : smoothedElev + (elev - smoothedElev) * ALPHA;

  compassState.heading = smoothedHeading;
  compassState.elevation = smoothedElev;
  compassState.available = true;
  compassState.calibrated = true;
  onUpdate(compassState);
}

export async function requestCompassPermission(){
  const DOE = window.DeviceOrientationEvent;
  if(!DOE) return { ok:false, reason:'unsupported' };
  if(typeof DOE.requestPermission === 'function'){
    try{
      const res = await DOE.requestPermission();
      return { ok: res === 'granted', reason: res };
    }catch(e){
      return { ok:false, reason:'denied' };
    }
  }
  return { ok:true, reason:'not-required' }; // Android / non-iOS-13+
}

export function startCompass(onUpdate){
  const DOE = window.DeviceOrientationEvent;
  if(!DOE){
    compassState.available = false;
    return false;
  }
  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(eventName, (e) => handleOrientation(e, onUpdate));
  return true;
}

export function cardinalFromHeading(h){
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(h/45) % 8];
}
