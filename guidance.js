// guidance.js — NEW: "point me to the satellite" math.
// Pure functions only; DOM wiring lives in app.js.

export function angleDiff(target, current){
  // shortest signed difference target-current, range -180..180
  return ((target - current + 540) % 360) - 180;
}

/**
 * Computes turn/elevation guidance toward a satellite given the device's
 * current compass heading and approximate tilt-derived elevation.
 */
export function computeGuidance(satAz, satElev, heading, deviceElev, tolerance = 8){
  const azDiff = angleDiff(satAz, heading);   // +ve = satellite is to the right
  const elevDiff = satElev - deviceElev;       // +ve = satellite is higher, raise phone

  const azLocked = Math.abs(azDiff) <= tolerance;
  const elevLocked = Math.abs(elevDiff) <= tolerance;
  const locked = azLocked && elevLocked;

  let azText = azLocked ? 'On heading' : (azDiff > 0 ? `Turn right ${Math.round(Math.abs(azDiff))}°` : `Turn left ${Math.round(Math.abs(azDiff))}°`);
  let elText = elevLocked ? 'On elevation' : (elevDiff > 0 ? `Raise phone ${Math.round(Math.abs(elevDiff))}°` : `Lower phone ${Math.round(Math.abs(elevDiff))}°`);

  const maxOff = Math.max(Math.abs(azDiff), Math.abs(elevDiff));
  let proximity; // for reticle color
  if(maxOff <= tolerance) proximity = 'locked';
  else if(maxOff <= 20) proximity = 'close';
  else if(maxOff <= 45) proximity = 'near';
  else proximity = 'far';

  return { azDiff, elevDiff, azLocked, elevLocked, locked, azText, elText, proximity };
}

export const PROXIMITY_COLOR = {
  locked: '#22C55E',
  close: '#FBBF24',
  near: '#F59E0B',
  far: '#EF4444',
};
