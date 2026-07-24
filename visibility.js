// visibility.js — NEW: naked-eye visibility confidence scoring.
//
// Honesty note: TLE data carries no true visual-magnitude value, so
// `estMag` here is a rough proxy (catalog-type baseline + range falloff),
// not a photometric measurement. Light pollution is user-supplied (Bortle
// scale) since there's no reliable browser API for it. Treat the confidence
// score as a planning aid, not a guarantee.

const GROUP_BASE_MAG = { visual: 3.0, stations: -1.5, starlink: 4.3 };

export function getMoonContext(date, lat, lon){
  const illum = SunCalc.getMoonIllumination(date);
  const pos = SunCalc.getMoonPosition(date, lat, lon);
  return {
    fraction: illum.fraction,               // 0..1 illuminated
    altDeg: pos.altitude * 180/Math.PI
  };
}

export function estimateMagnitude(rangeKm, group){
  const base = GROUP_BASE_MAG[group] ?? 3.5;
  const rangeAdj = 5 * Math.log10(Math.max(rangeKm, 200) / 1000);
  return base + rangeAdj;
}

/**
 * Returns a 0-100 confidence score plus tier/label/reasons for a satellite.
 */
export function scoreVisibility(result, ctx){
  const { sunAltDeg, moonAltDeg, moonFraction, cloudPct, lightPollution, group } = ctx;
  const estMag = estimateMagnitude(result.rangeKm, group);
  const reasons = [];
  let score = 100;

  if(result.eclipsed){
    reasons.push("in Earth's shadow — not illuminated by the Sun");
    return finalize(2, estMag, reasons);
  }

  // sky brightness from sun altitude
  if(sunAltDeg > -6){
    score -= 90;
    reasons.push('sky too bright (daylight / civil twilight)');
  } else if(sunAltDeg > -18){
    score -= 30;
    reasons.push('partial twilight glow');
  }

  // moonlight interference
  if(moonAltDeg > 0){
    const moonPenalty = moonFraction * (moonAltDeg > 10 ? 20 : 8);
    if(moonPenalty > 4){ score -= moonPenalty; reasons.push('bright moon nearby'); }
  }

  // cloud cover
  if(cloudPct > 10){
    score -= cloudPct * 0.6;
    if(cloudPct > 50) reasons.push('cloud cover too high');
  }

  // light pollution (Bortle 1 = pristine, 9 = inner city)
  score -= (lightPollution - 1) * 4;
  if(lightPollution >= 7) reasons.push('significant light pollution');

  // estimated brightness
  if(estMag > 2){
    const magPenalty = (estMag - 2) * 15;
    score -= magPenalty;
    if(estMag > 4) reasons.push('object likely too dim for the naked eye');
  }

  // atmospheric extinction near the horizon
  if(result.elev < 20){
    score -= (20 - result.elev) * 1.4;
    if(result.elev < 12) reasons.push('low elevation — atmospheric extinction');
  }

  return finalize(score, estMag, reasons);
}

function finalize(rawScore, estMag, reasons){
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  let tier, emoji, label;
  if(score >= 70){ tier = 'visible'; emoji = '🟢'; label = score >= 85 ? 'Visible' : 'Probably Visible'; }
  else if(score >= 35){ tier = 'binoculars'; emoji = '🟡'; label = 'Very Difficult'; }
  else { tier = 'hidden'; emoji = '🔴'; label = 'Not Visible'; }
  if(reasons.length === 0 && tier !== 'visible') reasons.push('below naked-eye brightness threshold');
  return { score, tier, emoji, label, estMag, reasons };
}

/** Aggregate a global explanation when nothing is visible right now. */
export function explainEmptySky(results, ctx){
  if(results.length === 0) return 'Nothing from this catalog is currently above your horizon.';
  const tally = {};
  for(const r of results){
    const v = scoreVisibility(r, ctx);
    for(const reason of v.reasons) tally[reason] = (tally[reason]||0) + 1;
  }
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  if(!top) return 'No naked-eye visible objects right now — check back later.';
  return `Most objects overhead are currently blocked: ${top[0]}.`;
}
