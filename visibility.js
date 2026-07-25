'use strict';
/*
 * Visibility scoring module.
 * This is purely additive analysis layered on top of the existing SGP4
 * az/el/eclipse output — it does NOT touch orbital propagation, TLE parsing,
 * or any of the existing tracking math. It estimates how likely a satellite
 * is to be seen with the naked eye right now, as a 0-100 confidence score.
 *
 * Honesty note: without a licensed photometric catalog, apparent magnitude
 * is a *heuristic estimate* based on common object classes + range, not a
 * measured brightness. Treat the score as "worth looking up", not gospel.
 */
const Visibility = (() => {

  // Rough "standard magnitude" (brightness at 1000km range, fully lit) by
  // object class. These are ballpark figures used by amateur tracking
  // communities for common object types — not per-satellite measurements.
  function standardMagnitude(name){
    const n = name.toUpperCase();
    if(n.includes('ISS') || n.includes('ZARYA')) return -1.8;
    if(n.includes('TIANGONG') || n.includes('CSS')) return 0.5;
    if(n.includes('STARLINK')) return 4.4;
    if(n.includes('HST') || n.includes('HUBBLE')) return 1.5;
    if(n.includes('ENVISAT') || n.includes('COSMOS') || n.includes('R/B') || n.includes('ROCKET')) return 4.2;
    if(n.includes('IRIDIUM')) return 3.5;
    return 5.5; // generic default for unclassified catalog objects
  }

  function apparentMagnitude(name, rangeKm){
    const std = standardMagnitude(name);
    const range = Math.max(rangeKm, 200);
    return std + 5 * Math.log10(range / 1000);
  }

  function angularSeparationDeg(az1, el1, az2, el2){
    const toRad = d => d * Math.PI / 180;
    const a1 = toRad(el1), a2 = toRad(el2);
    const dAz = toRad(az1 - az2);
    const cosC = Math.sin(a1)*Math.sin(a2) + Math.cos(a1)*Math.cos(a2)*Math.cos(dAz);
    return Math.acos(Math.max(-1, Math.min(1, cosC))) * 180 / Math.PI;
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  /**
   * @param {object} p
   *  name, elevDeg, azDeg, rangeKm, eclipsed,
   *  sunAltDeg, cloudPct, bortle (1-9),
   *  moonAltDeg, moonIllumFraction (0-1), moonAzDeg
   */
  function score(p){
    const mag = apparentMagnitude(p.name, p.rangeKm);

    if(p.eclipsed){
      return { score:0, tier:'not-visible', label:'Not Visible', magnitude:mag,
        reason:"In Earth's shadow — not sunlit", moonFactor:1, cloudFactor:1 };
    }
    if(p.elevDeg < 0){
      return { score:0, tier:'not-visible', label:'Below Horizon', magnitude:mag,
        reason:'Below the horizon', moonFactor:1, cloudFactor:1 };
    }

    // 1. Sky darkness (sun altitude)
    let skyDark;
    if(p.sunAltDeg > -0.5) skyDark = 0.04;          // daylight
    else if(p.sunAltDeg > -6) skyDark = 0.45;        // civil twilight
    else if(p.sunAltDeg > -12) skyDark = 0.8;        // nautical twilight
    else if(p.sunAltDeg > -18) skyDark = 0.95;       // astronomical twilight
    else skyDark = 1.0;                              // full dark

    // 2. Elevation / atmospheric extinction (thicker air near horizon)
    const elevFactor = clamp(0.15 + (p.elevDeg / 35), 0.15, 1.0);

    // 3. Cloud cover
    const cloudFactor = 1 - clamp(p.cloudPct, 0, 100) / 100 * 0.85;

    // 4. Light pollution (Bortle 1 pristine .. 9 inner-city)
    const bortle = clamp(p.bortle || 5, 1, 9);
    const lpFactor = 1 - ((bortle - 1) / 8) * 0.3;

    // 5. Moon interference — bright moon near the satellite washes it out
    let moonFactor = 1;
    if(p.moonAltDeg > 0 && p.moonIllumFraction > 0.1){
      const sep = angularSeparationDeg(p.azDeg, p.elevDeg, p.moonAzDeg, p.moonAltDeg);
      const proximity = clamp(1 - sep / 90, 0, 1); // closer than 90° starts to matter
      moonFactor = 1 - (p.moonIllumFraction * proximity * 0.55);
    }

    // 6. Apparent brightness factor
    let magFactor;
    if(mag <= 1) magFactor = 1.0;
    else if(mag <= 3) magFactor = 0.85;
    else if(mag <= 4.5) magFactor = 0.6;
    else if(mag <= 6) magFactor = 0.32;
    else if(mag <= 7.2) magFactor = 0.14; // binocular range
    else magFactor = 0.03;

    const raw = elevFactor * skyDark * cloudFactor * lpFactor * moonFactor * magFactor;
    const pct = Math.round(clamp(raw, 0, 1) * 100);

    let tier, label;
    if(pct >= 80){ tier='visible'; label='Visible'; }
    else if(pct >= 55){ tier='visible'; label='Probably Visible'; }
    else if(mag > 5.8 && mag <= 7.5 && skyDark > 0.7 && p.cloudPct < 60){ tier='binoculars'; label='Possible with Binoculars'; }
    else if(pct >= 25){ tier='binoculars'; label='Very Difficult'; }
    else { tier='not-visible'; label='Not Visible'; }

    let reason = null;
    if(tier === 'not-visible'){
      if(skyDark < 0.4) reason = 'Sky too bright — wait for darker twilight';
      else if(p.cloudPct >= 70) reason = `Heavy cloud cover (${Math.round(p.cloudPct)}%)`;
      else if(mag > 7.2) reason = 'Too dim for the naked eye';
      else reason = 'Combined conditions too poor';
    }

    return { score:pct, tier, label, magnitude:mag, reason, moonFactor, cloudFactor };
  }

  return { score, apparentMagnitude, angularSeparationDeg };
})();
