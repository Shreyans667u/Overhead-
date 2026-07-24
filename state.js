// state.js — shared app state + orbital mechanics.
// IMPORTANT: the math in this file (SGP4 propagation, sun position, eclipse
// test, look-angle conversion) is unchanged from the original app. Only the
// UI around it was redesigned.

export const state = {
  OBS: null,            // { lat, lon, alt }
  sats: [],              // [{ name, satrec }]
  lastResults: [],        // most recent computed pass of all satellites
  tracking: false,
  watchId: null,
  notifiedVisible: new Set(),
  favorites: new Set(JSON.parse(localStorage.getItem('overhead-favs') || '[]')),
  lightPollution: Number(localStorage.getItem('overhead-bortle') || 4), // Bortle 1-9, user-supplied
  selectedGroup: 'visual',
  selectedSat: null,      // name of satellite selected for guidance/detail
  soundOn: localStorage.getItem('overhead-sound') !== 'off',
  theme: localStorage.getItem('overhead-theme') || 'dark',
  searchQuery: '',
  filterMode: 'all',      // all | visible | favorites
};

export function saveFavorites(){
  localStorage.setItem('overhead-favs', JSON.stringify([...state.favorites]));
}
export function saveBortle(v){
  state.lightPollution = v;
  localStorage.setItem('overhead-bortle', String(v));
}
export function saveSound(v){
  state.soundOn = v;
  localStorage.setItem('overhead-sound', v ? 'on' : 'off');
}
export function saveTheme(v){
  state.theme = v;
  localStorage.setItem('overhead-theme', v);
}

// ---------- TLE catalogs (unchanged source) ----------
export const GROUP_URLS = {
  visual:   'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle'
};

export function parseTLE(text){
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  for(let i=0; i+2 < lines.length + 1; i += 3){
    const name = lines[i];
    const l1 = lines[i+1];
    const l2 = lines[i+2];
    if(!name || !l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
    try{
      const satrec = satellite.twoline2satrec(l1, l2);
      out.push({ name, satrec });
    }catch(e){ /* skip malformed */ }
  }
  return out;
}

// ---------- low-precision solar ECI position (Meeus-style approximation) ----------
export function sunEciUnitVector(date){
  const jd = jday(date);
  const d = jd - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) % 360; // mean anomaly, deg
  const q = (280.459 + 0.98564736 * d) % 360; // mean longitude, deg
  const L = q + 1.915 * Math.sin(g*Math.PI/180) + 0.020 * Math.sin(2*g*Math.PI/180); // ecliptic longitude
  const e = 23.439 - 0.00000036 * d; // obliquity
  const Lr = L*Math.PI/180, er = e*Math.PI/180;
  return {
    x: Math.cos(Lr),
    y: Math.cos(er)*Math.sin(Lr),
    z: Math.sin(er)*Math.sin(Lr)
  };
}
export function jday(date){
  return (date.getTime() / 86400000) + 2440587.5;
}

export function isEclipsed(satEciKm, sunUnit){
  // Cylindrical shadow model: satellite is eclipsed if it's on the night side
  // of Earth and within Earth's radius of the Earth-Sun line.
  const RE = 6371; // km, mean Earth radius
  const dot = satEciKm.x*sunUnit.x + satEciKm.y*sunUnit.y + satEciKm.z*sunUnit.z;
  if(dot > 0) return false; // on the sunlit side
  const magSq = satEciKm.x**2 + satEciKm.y**2 + satEciKm.z**2;
  const perpSq = magSq - dot*dot;
  return perpSq < RE*RE;
}

// ---------- main compute pass (pure — returns results, no DOM) ----------
export function computeResults(now){
  const gmst = satellite.gstime(now);
  const observerGd = {
    latitude: state.OBS.lat * Math.PI/180,
    longitude: state.OBS.lon * Math.PI/180,
    height: state.OBS.alt || 0
  };
  const sunUnit = sunEciUnitVector(now);
  const sunAltDeg = SunCalc.getPosition(now, state.OBS.lat, state.OBS.lon).altitude * 180/Math.PI;
  const observerDark = sunAltDeg < -6;

  const results = [];
  for(const s of state.sats){
    let pv;
    try{ pv = satellite.propagate(s.satrec, now); }catch(e){ continue; }
    if(!pv || !pv.position) continue;
    const posEci = pv.position;
    const posEcf = satellite.eciToEcf(posEci, gmst);
    const look = satellite.ecfToLookAngles(observerGd, posEcf);
    const elevDeg = look.elevation * 180/Math.PI;
    const azDeg = look.azimuth * 180/Math.PI;
    if(elevDeg < 0) continue; // below horizon, skip entirely

    const eclipsed = isEclipsed(posEci, sunUnit);
    const basicVisible = observerDark && !eclipsed && elevDeg >= 10;

    results.push({
      name: s.name,
      elev: elevDeg,
      az: azDeg,
      rangeKm: look.rangeSat,
      eclipsed,
      basicVisible,
      posEci
    });
  }
  results.sort((a,b) => b.elev - a.elev);
  return { results, sunAltDeg, observerDark };
}
