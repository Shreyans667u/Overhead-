'use strict';
/*
 * App — core tracking engine. No DOM rendering here (that's ui.js); this
 * module owns state + orbital/astronomical math and exposes it via
 * App.state and a small pub/sub so the UI layer can react.
 */
const App = (() => {

  const state = {
    obs: null,          // {lat, lon, alt}
    tracking: false,
    watchId: null,
    sats: [],            // {name, satrec}
    group: 'visual',
    results: [],          // last computed frame
    sunAltDeg: null,
    moon: null,           // {altDeg, azDeg, illumFraction, phaseLabel}
    cloudPct: null,
    bortle: 5,
    favorites: new Set(JSON.parse(localStorage.getItem('overhead_favs') || '[]')),
    notifiedVisible: new Set(),
    notifyEnabled: false,
    selected: null,       // selected satellite name
    scanning: false,
  };

  const listeners = {};
  function on(evt, fn){ (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload){ (listeners[evt] || []).forEach(fn => fn(payload)); }

  // ---------------- geolocation (continuous, ~1s cadence) ----------------
  function startTracking(){
    if(!navigator.geolocation){
      emit('error', 'Geolocation is not supported by this browser.');
      return;
    }
    state.watchId = navigator.geolocation.watchPosition(pos => {
      state.obs = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: (pos.coords.altitude || 0) / 1000
      };
      if(!state.tracking){
        state.tracking = true;
        emit('trackingStarted', state.obs);
        refreshWeather();
        setInterval(refreshWeather, 5 * 60 * 1000);
      }
      emit('position', state.obs);
    }, err => {
      stopTracking();
      emit('error', 'Could not get your location: ' + err.message);
    }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
  }

  function stopTracking(){
    if(state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    state.tracking = false;
    emit('trackingStopped');
  }

  // one ticker drives sun/moon + re-propagation every second
  setInterval(() => {
    if(!state.obs) return;
    updateSunMoon();
    if(state.sats.length) computeFrame();
  }, 1000);

  function updateSunMoon(){
    const now = new Date();
    const sunPos = SunCalc.getPosition(now, state.obs.lat, state.obs.lon);
    state.sunAltDeg = sunPos.altitude * 180 / Math.PI;

    const moonPos = SunCalc.getMoonPosition(now, state.obs.lat, state.obs.lon);
    const moonIllum = SunCalc.getMoonIllumination(now);
    state.moon = {
      altDeg: moonPos.altitude * 180 / Math.PI,
      azDeg: ((moonPos.azimuth * 180 / Math.PI) + 180) % 360, // SunCalc az is from south; normalize to from-north
      illumFraction: moonIllum.fraction,
      phaseLabel: moonPhaseLabel(moonIllum.phase)
    };
    emit('sunMoon', { sunAltDeg: state.sunAltDeg, moon: state.moon });
  }

  function moonPhaseLabel(phase){
    if(phase < 0.03 || phase > 0.97) return 'New Moon';
    if(phase < 0.22) return 'Waxing Crescent';
    if(phase < 0.28) return 'First Quarter';
    if(phase < 0.47) return 'Waxing Gibbous';
    if(phase < 0.53) return 'Full Moon';
    if(phase < 0.72) return 'Waning Gibbous';
    if(phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  }

  async function refreshWeather(){
    if(!state.obs) return;
    try{
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.obs.lat}&longitude=${state.obs.lon}&current=cloud_cover&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const cc = data.current && data.current.cloud_cover;
      if(cc !== undefined){ state.cloudPct = cc; emit('weather', cc); }
    }catch(e){ /* keep last known value on failure */ }
  }

  // ---------------- TLE fetch + parse (unchanged math) ----------------
  const GROUP_URLS = {
    visual:   'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
    stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
    starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle'
  };

  function parseTLE(text){
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    for(let i=0; i+2 < lines.length + 1; i += 3){
      const name = lines[i], l1 = lines[i+1], l2 = lines[i+2];
      if(!name || !l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
      try{ out.push({ name, satrec: satellite.twoline2satrec(l1, l2) }); }catch(e){}
    }
    return out;
  }

  async function scan(group){
    if(!state.obs) return;
    state.group = group;
    state.scanning = true;
    emit('scanStart');
    try{
      const res = await fetch(GROUP_URLS[group]);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      state.sats = parseTLE(text);
      if(state.sats.length === 0) throw new Error('No parsable TLE entries returned.');
      updateSunMoon();
      computeFrame();
      emit('scanDone', state.results);
    }catch(e){
      emit('scanError', e.message);
    }
    state.scanning = false;
  }

  // ---------------- sun ECI + eclipse (unchanged math) ----------------
  function sunEciUnitVector(date){
    const jd = (date.getTime() / 86400000) + 2440587.5;
    const d = jd - 2451545.0;
    const g = (357.529 + 0.98560028 * d) % 360;
    const q = (280.459 + 0.98564736 * d) % 360;
    const L = q + 1.915 * Math.sin(g*Math.PI/180) + 0.020 * Math.sin(2*g*Math.PI/180);
    const e = 23.439 - 0.00000036 * d;
    const Lr = L*Math.PI/180, er = e*Math.PI/180;
    return { x:Math.cos(Lr), y:Math.cos(er)*Math.sin(Lr), z:Math.sin(er)*Math.sin(Lr) };
  }

  function isEclipsed(satEciKm, sunUnit){
    const RE = 6371;
    const dot = satEciKm.x*sunUnit.x + satEciKm.y*sunUnit.y + satEciKm.z*sunUnit.z;
    if(dot > 0) return false;
    const magSq = satEciKm.x**2 + satEciKm.y**2 + satEciKm.z**2;
    const perpSq = magSq - dot*dot;
    return perpSq < RE*RE;
  }

  // orbit classification from mean motion (revs/day) via semi-major axis
  function classifyOrbit(satrec){
    const n = satrec.no * (1440 / (2*Math.PI)); // rev/day
    const mu = 398600.4418; // km^3/s^2
    const nRad = satrec.no / 60; // rad/min -> rad/s already? satrec.no is rad/min
    const nPerSec = satrec.no / 60;
    const a = Math.cbrt(mu / (nPerSec*nPerSec)); // km
    const altKm = a - 6371;
    if(altKm < 2000) return { type:'LEO', altKm };
    if(altKm < 35000) return { type:'MEO', altKm };
    if(altKm < 36500) return { type:'GEO', altKm };
    return { type:'HEO', altKm };
  }

  // lightweight forward simulation for a rough pass countdown
  function estimateCountdown(satrec, observerGd, currentlyUp){
    const now = new Date();
    const stepMin = 1;
    for(let m = 1; m <= 20; m++){
      const t = new Date(now.getTime() + m*stepMin*60000);
      let pv;
      try{ pv = satellite.propagate(satrec, t); }catch(e){ return null; }
      if(!pv || !pv.position) return null;
      const gmst = satellite.gstime(t);
      const ecf = satellite.eciToEcf(pv.position, gmst);
      const look = satellite.ecfToLookAngles(observerGd, ecf);
      const elev = look.elevation * 180/Math.PI;
      if(currentlyUp && elev < 0) return { minutes:m, kind:'sets' };
      if(!currentlyUp && elev >= 0) return { minutes:m, kind:'rises' };
    }
    return null;
  }

  // ---------------- main compute (unchanged core; visibility scoring layered on) ----------------
  function computeFrame(){
    const now = new Date();
    const gmst = satellite.gstime(now);
    const observerGd = {
      latitude: state.obs.lat * Math.PI/180,
      longitude: state.obs.lon * Math.PI/180,
      height: state.obs.alt || 0
    };
    const sunUnit = sunEciUnitVector(now);
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
      if(elevDeg < 0) continue;

      const eclipsed = isEclipsed(posEci, sunUnit);
      const orbit = classifyOrbit(s.satrec);

      const vis = Visibility.score({
        name: s.name, elevDeg, azDeg, rangeKm: look.rangeSat, eclipsed,
        sunAltDeg: state.sunAltDeg, cloudPct: state.cloudPct ?? 40, bortle: state.bortle,
        moonAltDeg: state.moon ? state.moon.altDeg : -90,
        moonIllumFraction: state.moon ? state.moon.illumFraction : 0,
        moonAzDeg: state.moon ? state.moon.azDeg : 0
      });

      results.push({
        name: s.name, satrec: s.satrec, elev: elevDeg, az: azDeg, rangeKm: look.rangeSat,
        eclipsed, orbit, visibility: vis, favorite: state.favorites.has(s.name)
      });
    }

    results.sort((a,b) => b.elev - a.elev);
    state.results = results;
    emit('frame', results);
    checkNotifications(results);
  }

  function checkNotifications(results){
    if(!state.notifyEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const currentlyVisible = new Set(results.filter(r => r.visibility.tier === 'visible').map(r => r.name));
    for(const name of currentlyVisible){
      if(!state.notifiedVisible.has(name)){
        const r = results.find(x => x.name === name);
        new Notification(`🛰 ${name} is visible now`, {
          body: `${r.visibility.label} · el ${r.elev.toFixed(0)}° · az ${r.az.toFixed(0)}°`,
          icon: 'icon.svg', tag: 'overhead-' + name
        });
        emit('becameVisible', r);
      }
    }
    state.notifiedVisible = currentlyVisible;
  }

  function toggleFavorite(name){
    if(state.favorites.has(name)) state.favorites.delete(name);
    else state.favorites.add(name);
    localStorage.setItem('overhead_favs', JSON.stringify([...state.favorites]));
    const r = state.results.find(x => x.name === name);
    if(r) r.favorite = state.favorites.has(name);
    emit('favoritesChanged', state.favorites);
  }

  function select(name){
    state.selected = name;
    emit('selected', state.results.find(r => r.name === name) || null);
  }

  function getObserverGd(){
    if(!state.obs) return null;
    return { latitude: state.obs.lat*Math.PI/180, longitude: state.obs.lon*Math.PI/180, height: state.obs.alt||0 };
  }

  return {
    state, on, emit, startTracking, stopTracking, scan, toggleFavorite, select,
    estimateCountdown, getObserverGd
  };
})();
