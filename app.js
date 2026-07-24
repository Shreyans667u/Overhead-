// app.js — wires everything together. Geolocation/TLE/propagation logic is
// unchanged from the original app (see state.js); everything here is either
// UI plumbing or the new features (visibility scoring, compass, guidance, AR).
import { state, GROUP_URLS, parseTLE, computeResults, saveBortle, saveSound, saveTheme } from './state.js';
import { scoreVisibility, getMoonContext, explainEmptySky } from './visibility.js';
import { requestCompassPermission, startCompass, compassState, cardinalFromHeading } from './compass.js';
import { computeGuidance, PROXIMITY_COLOR } from './guidance.js';
import { startAR, stopAR } from './ar.js';
import { initStarfield, animateValue, toast, renderSatList, createSkyplot } from './ui.js';

const $ = id => document.getElementById(id);
let skyplot;
let visCtx = null; // latest visibility context (sun/moon/cloud/etc)

// ---------- boot ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    const swUrl = new URL('../sw.js', import.meta.url); // this module lives in js/, sw.js lives at the site root
    navigator.serviceWorker.register(swUrl, { scope: swUrl.href.replace(/sw\.js$/, '') })
      .catch(() => {/* offline shell just won't be available */});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try{
    initStarfield();
    skyplot = createSkyplot($('skyplot'));
    skyplot.onSelect(selectSatellite);
    wireClock();
    wireLocation();
    wireCatalog();
    wireCompass();
    wireGuidance();
    wireAR();
    wirePalette();
    wireSettings();
    wireDock();
    wireDownload();
    applyTheme(state.theme);
  }catch(e){
    console.error('Overhead boot failed:', e);
    throw e; // surfaced on-screen by the inline handler in index.html
  }
});

function wireClock(){
  const tick = () => { $('navClock').textContent = new Date().toUTCString().slice(17,25)+' UTC'; };
  setInterval(tick, 1000); tick();
}

// ---------- geolocation: continuous live tracking (unchanged semantics) ----------
function wireLocation(){
  $('locateBtn').addEventListener('click', () => {
    if(state.tracking){ stopTracking(); return; }
    hideErr('locErr');
    if(!navigator.geolocation){ showErr('locErr', 'Geolocation is not supported by this browser.'); return; }
    $('locateBtn').textContent = 'Locating…';

    state.watchId = navigator.geolocation.watchPosition(pos => {
      state.OBS = { lat: pos.coords.latitude, lon: pos.coords.longitude, alt: (pos.coords.altitude||0)/1000 };
      if(!state.tracking){
        state.tracking = true;
        $('locateBtn').innerHTML = '⏹ Stop live tracking';
        $('liveDot').classList.add('live');
        $('heroStatusText').textContent = 'Tracking';
        $('heroStatusText2').textContent = 'Live tracking';
        show('skyPanelWrap'); show('catalogCard'); show('resultsCard'); show('compassCard');
        refreshWeather();
        setInterval(refreshWeather, 5*60*1000);
        toast('Live location tracking started', 'success');
      }
      animateValue($('posLat'), state.OBS.lat.toFixed(4)+'°');
      animateValue($('posLon'), state.OBS.lon.toFixed(4)+'°');
    }, err => {
      stopTracking();
      showErr('locErr', 'Could not get your location: '+err.message+'. Allow location access for this page.');
    }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
  });

  // one ticker drives sun/moon readout + re-propagation + sky plot, effectively every second
  setInterval(() => {
    if(!state.OBS) return;
    updateSunMoonReadout();
    if(state.sats.length) computeAndRender();
  }, 1000);
}

function stopTracking(){
  if(state.watchId!==null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId=null; state.tracking=false;
  $('locateBtn').innerHTML = '📍 Start live tracking';
  $('liveDot').classList.remove('live');
  $('heroStatusText').textContent = 'Idle';
  $('heroStatusText2').textContent = 'Awaiting location';
}

function showErr(id,msg){ const el=$(id); el.style.display='block'; el.textContent=msg; }
function hideErr(id){ $(id).style.display='none'; }
function show(id){ $(id).classList.remove('hidden'); }

async function refreshWeather(){
  if(!state.OBS) return;
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.OBS.lat}&longitude=${state.OBS.lon}&current=cloud_cover,weather_code&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const cc = data.current?.cloud_cover;
    if(cc !== undefined){
      animateValue($('cloudVal'), cc+'%');
      $('cloudVal').style.color = cc<30 ? 'var(--success)' : cc<70 ? 'var(--accent)' : 'var(--danger)';
      state.cloudPct = cc;
    }
  }catch(e){ /* keep last known value */ }
}

function updateSunMoonReadout(){
  if(!state.OBS) return;
  const now = new Date();
  const sunAltDeg = SunCalc.getPosition(now, state.OBS.lat, state.OBS.lon).altitude*180/Math.PI;
  const moon = getMoonContext(now, state.OBS.lat, state.OBS.lon);
  animateValue($('sunAltVal'), sunAltDeg.toFixed(1)+'°');
  let label = sunAltDeg>0?'Daylight':sunAltDeg>-6?'Civil twilight':sunAltDeg>-18?'Twilight':'Astro dark';
  animateValue($('skyCondVal'), label);
  visCtx = {
    sunAltDeg, moonAltDeg: moon.altDeg, moonFraction: moon.fraction,
    cloudPct: state.cloudPct ?? 0, lightPollution: state.lightPollution, group: state.selectedGroup
  };
}

// ---------- catalog / scan ----------
function wireCatalog(){
  $('groupSelect').addEventListener('change', (e) => { state.selectedGroup = e.target.value; });
  $('refreshBtn').addEventListener('click', runScan);
  $('searchInput').addEventListener('input', (e) => { state.searchQuery = e.target.value; renderList(); });
  $('filterChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]'); if(!chip) return;
    state.filterMode = chip.dataset.filter;
    $('filterChips').querySelectorAll('.chip').forEach(c=>c.classList.toggle('active', c===chip));
    renderList();
  });
}

async function runScan(){
  if(!state.OBS){ toast('Start live tracking first.'); return; }
  const btn = $('refreshBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Scanning…';
  $('satList').innerHTML = Array.from({length:4}).map(()=>'<div class="skeleton"></div>').join('');
  try{
    const res = await fetch(GROUP_URLS[state.selectedGroup]);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    state.sats = parseTLE(text);
    if(state.sats.length===0) throw new Error('No parsable TLE entries returned.');
    computeAndRender();
    toast(`Loaded ${state.sats.length} objects`, 'success');
  }catch(e){
    $('satList').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>Could not fetch catalog data (${e.message}). CelesTrak may be rate-limiting — try again shortly.</div>`;
  }
  btn.disabled = false; btn.innerHTML = '🛰 Scan sky';
}

function computeAndRender(){
  const now = new Date();
  const { results, sunAltDeg, observerDark } = computeResults(now);
  updateSunMoonReadout();
  const moon = getMoonContext(now, state.OBS.lat, state.OBS.lon);
  visCtx = { sunAltDeg, moonAltDeg: moon.altDeg, moonFraction: moon.fraction, cloudPct: state.cloudPct ?? 0, lightPollution: state.lightPollution, group: state.selectedGroup };

  const scored = results.map(r => ({ ...r, visible: scoreVisibility(r, visCtx).tier === 'visible' }));
  state.lastResults = scored;
  renderList();
  skyplot.draw(scored, visCtx);
  skyplot.setSelected(state.selectedSat);
  notifyNewlyVisible(scored);
  updateResultsHeading(scored);
}

function renderList(){
  renderSatList(state.lastResults, visCtx || {sunAltDeg:-90,moonAltDeg:-90,moonFraction:0,cloudPct:0,lightPollution:state.lightPollution,group:state.selectedGroup}, selectSatellite, openGuidanceFor);
}

function updateResultsHeading(results){
  const visibleCount = results.filter(r=>r.visible).length;
  $('resultsHeading').textContent = `Overhead now — ${visibleCount} visible, ${results.length} above horizon`;
  if(results.length && visibleCount===0){
    $('emptyExplain').textContent = explainEmptySky(results, visCtx);
    show('emptyExplainWrap');
  } else {
    $('emptyExplainWrap').classList.add('hidden');
  }
}

function selectSatellite(name){
  state.selectedSat = state.selectedSat === name ? null : name;
  skyplot.setSelected(state.selectedSat);
  renderList();
}

// ---------- notifications ----------
function notifyNewlyVisible(results){
  const currentlyVisible = new Set(results.filter(r=>r.visible).map(r=>r.name));
  for(const name of currentlyVisible){
    if(!state.notifiedVisible.has(name)){
      const r = results.find(x=>x.name===name);
      if('Notification' in window && Notification.permission==='granted'){
        new Notification(`🛰 ${name} is visible now`, {
          body: `elevation ${r.elev.toFixed(0)}° · azimuth ${r.az.toFixed(0)}°`,
          icon: 'icon.svg', tag: 'overhead-'+name
        });
      }
      toast(`${name} is now naked-eye visible`, 'success');
      if(state.soundOn) playChime();
    }
  }
  state.notifiedVisible = currentlyVisible;
}

let audioCtx;
function playChime(){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type='sine'; o.frequency.value=880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.5);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime+0.5);
  }catch(e){}
}

// ---------- compass ----------
function wireCompass(){
  $('compassEnableBtn').addEventListener('click', async () => {
    const perm = await requestCompassPermission();
    if(!perm.ok){ toast('Compass permission was not granted.'); return; }
    startCompass(onHeadingUpdate);
    $('compassEnableBtn').classList.add('hidden');
  });
}
function onHeadingUpdate(cs){
  $('compassHeadingDeg').textContent = `${Math.round(cs.heading)}°`;
  $('compassCardinal').textContent = `Facing ${cardinalFromHeading(cs.heading)}`;
  $('compassNeedle').style.transform = `translate(-50%,-100%) rotate(${cs.heading}deg)`;
  updateGuidanceIfOpen();
}

// ---------- guidance overlay ("point me to the satellite") ----------
function wireGuidance(){
  $('guideCloseBtn').addEventListener('click', closeGuidance);
}
function openGuidanceFor(name){
  state.selectedSat = name;
  if(!compassState.available){
    toast('Enable the compass first (Observer card) to use Point Me.');
    return;
  }
  $('guideOverlay').classList.add('open');
  updateGuidanceIfOpen();
}
function closeGuidance(){ $('guideOverlay').classList.remove('open'); }

let lastLocked = false;
function updateGuidanceIfOpen(){
  if(!$('guideOverlay').classList.contains('open') || !state.selectedSat) return;
  const r = state.lastResults.find(x => x.name === state.selectedSat);
  if(!r){ $('guideInstruction').textContent = 'Satellite not currently above horizon'; return; }
  const g = computeGuidance(r.az, r.elev, compassState.heading, compassState.elevation);
  const reticle = $('reticle');
  reticle.style.borderColor = PROXIMITY_COLOR[g.proximity];
  reticle.classList.toggle('locked', g.locked);
  $('reticleArrow').style.transform = `rotate(${g.azDiff}deg)`;
  $('guideInstruction').textContent = g.locked ? "🎯 Target Locked — you're on target!" : (Math.abs(g.azDiff) > Math.abs(g.elevDiff) ? g.azText : g.elText);
  $('guideSub').textContent = `${state.selectedSat} · az ${g.azText} · el ${g.elText}`;
  if(g.locked && !lastLocked){
    if(navigator.vibrate) navigator.vibrate(200);
    if(state.soundOn) playChime();
  }
  lastLocked = g.locked;
}
setInterval(updateGuidanceIfOpen, 150);

// ---------- AR mode ----------
let arStopFn = null;
function wireAR(){
  $('arOpenBtn').addEventListener('click', async () => {
    if(!compassState.available){ toast('Enable the compass first to use AR mode.'); return; }
    $('arOverlay').classList.add('open');
    try{
      arStopFn = await startAR($('arVideo'), $('arCanvas'),
        () => state.lastResults,
        () => ({ heading: compassState.heading, elevation: compassState.elevation }),
        (name) => { selectSatellite(name); toast(name); }
      );
    }catch(e){
      toast('Camera access denied or unavailable.');
      closeAR();
    }
  });
  $('arCloseBtn').addEventListener('click', closeAR);
}
function closeAR(){
  $('arOverlay').classList.remove('open');
  stopAR();
  if(arStopFn) arStopFn();
}

// ---------- command palette ----------
function wirePalette(){
  const overlay = $('paletteOverlay'), input = $('paletteInput');
  function open(){ overlay.classList.add('open'); input.value=''; renderPaletteResults(''); setTimeout(()=>input.focus(),10); }
  function close(){ overlay.classList.remove('open'); }
  $('searchTriggerBtn')?.addEventListener('click', open);
  overlay.addEventListener('click', (e) => { if(e.target===overlay) close(); });
  window.addEventListener('keydown', (e) => {
    if((e.metaKey||e.ctrlKey) && e.key==='k'){ e.preventDefault(); overlay.classList.contains('open') ? close() : open(); }
    if(e.key==='Escape') close();
  });
  input.addEventListener('input', () => renderPaletteResults(input.value));
  function renderPaletteResults(q){
    const results = state.lastResults.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).slice(0,20);
    $('paletteResults').innerHTML = results.length ? results.map(r=>`<div class="palette-item" data-name="${r.name}"><span>${r.name}</span><span class="text-dim mono">el ${r.elev.toFixed(0)}°</span></div>`).join('')
      : `<div class="palette-item text-dim">No matches — run a scan first?</div>`;
    $('paletteResults').querySelectorAll('[data-name]').forEach(el => el.addEventListener('click', () => { selectSatellite(el.dataset.name); close(); }));
  }
}

// ---------- settings: theme, sound, bortle, fullscreen ----------
function wireSettings(){
  $('themeToggleBtn').addEventListener('click', () => applyTheme(state.theme==='dark' ? 'contrast' : 'dark'));
  $('soundToggleBtn').addEventListener('click', () => { saveSound(!state.soundOn); updateSoundBtn(); });
  updateSoundBtn();
  $('bortleRange').addEventListener('input', (e) => {
    saveBortle(Number(e.target.value));
    $('bortleVal').textContent = e.target.value;
  });
  $('bortleRange').value = state.lightPollution;
  $('bortleVal').textContent = state.lightPollution;
  $('fullscreenBtn').addEventListener('click', () => {
    const stage = $('skyplotStage');
    if(!document.fullscreenElement) stage.requestFullscreen?.(); else document.exitFullscreen?.();
  });
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t==='contrast' ? 'contrast' : '');
  saveTheme(t);
  $('themeToggleBtn').textContent = t==='contrast' ? '🌗' : '🌘';
}
function updateSoundBtn(){ $('soundToggleBtn').textContent = state.soundOn ? '🔔' : '🔕'; }

// ---------- mobile bottom dock ----------
function wireDock(){
  $('dock').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-panel]'); if(!btn) return;
    document.querySelectorAll('.dock-btn').forEach(b=>b.classList.toggle('active', b===btn));
    document.querySelectorAll('.panel-section').forEach(p => p.classList.toggle('active', p.dataset.panel===btn.dataset.panel));
    window.scrollTo({ top: 0, behavior:'smooth' });
  });
}

// ---------- CSV download (unchanged behaviour) ----------
function wireDownload(){
  $('downloadBtn').addEventListener('click', () => {
    if(!state.lastResults.length){ toast('Run "Scan sky" first.'); return; }
    const rows = [['name','elevation_deg','azimuth_deg','range_km','naked_eye_confidence_pct','tier','in_earth_shadow']];
    for(const r of state.lastResults){
      const v = scoreVisibility(r, visCtx);
      rows.push([r.name, r.elev.toFixed(2), r.az.toFixed(2), Math.round(r.rangeKm), v.score, v.tier, r.eclipsed]);
    }
    const csv = rows.map(row => row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `overhead-scan-${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
}

// ---------- notification permission button lives in Observer card ----------
document.addEventListener('DOMContentLoaded', () => {
  $('notifyBtn').addEventListener('click', async () => {
    if(!('Notification' in window)){ toast('This browser does not support notifications.'); return; }
    const perm = await Notification.requestPermission();
    if(perm==='granted'){ $('notifyBtn').textContent='🔔 Alerts on'; $('notifyBtn').disabled=true; toast('Visibility alerts enabled','success'); }
    else toast('Notification permission was not granted.');
  });
});

// ---------- button ripple (event delegation) ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn, .icon-btn, .chip, .dock-btn');
  if(!btn) return;
  const rect = btn.getBoundingClientRect();
  const r = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  r.className = 'ripple';
  r.style.width = r.style.height = size+'px';
  r.style.left = (e.clientX-rect.left-size/2)+'px';
  r.style.top = (e.clientY-rect.top-size/2)+'px';
  btn.style.position = btn.style.position || 'relative';
  btn.appendChild(r);
  setTimeout(()=>r.remove(), 650);
});
