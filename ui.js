'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  let currentFilter = 'all';
  let searchTerm = '';
  let soundOn = localStorage.getItem('overhead_sound') === '1';
  let pointmeOpen = false;
  let audioCtx = null;

  // ================= starfield =================
  function initStarfield(){
    const c = $('starfield'), ctx = c.getContext('2d');
    let stars = [];
    function size(){
      c.width = innerWidth; c.height = innerHeight;
      const n = Math.floor((innerWidth*innerHeight)/9000);
      stars = Array.from({length:n}, () => ({
        x: Math.random()*c.width, y: Math.random()*c.height,
        r: Math.random()*1.3 + 0.2, tw: Math.random()*Math.PI*2, sp: Math.random()*0.02+0.005
      }));
    }
    size();
    window.addEventListener('resize', size);
    (function loop(){
      ctx.clearRect(0,0,c.width,c.height);
      for(const s of stars){
        s.tw += s.sp;
        const a = 0.35 + Math.sin(s.tw)*0.35 + 0.3;
        ctx.globalAlpha = Math.max(0.15, Math.min(1, a));
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(loop);
    })();
  }

  // ================= ripple + button helpers =================
  function attachRipples(){
    document.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.btn, .icon-btn, .filter-chip, .dock-item');
      if(!btn) return;
      const rect = btn.getBoundingClientRect();
      const r = document.createElement('span');
      const size = Math.max(rect.width, rect.height) * 1.4;
      r.className = 'ripple';
      r.style.width = r.style.height = size+'px';
      r.style.left = (e.clientX - rect.left - size/2)+'px';
      r.style.top = (e.clientY - rect.top - size/2)+'px';
      btn.style.position = btn.style.position || 'relative';
      btn.appendChild(r);
      setTimeout(() => r.remove(), 650);
    });
  }

  function setBtnLoading(btn, loading, labelWhenDone){
    if(loading){
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Working…';
      btn.disabled = true;
    } else {
      btn.innerHTML = labelWhenDone ?? btn.dataset.label ?? btn.innerHTML;
      btn.disabled = false;
    }
  }

  function countUp(el, to, suffix=''){
    const from = parseFloat(el.dataset.val || '0');
    const dur = 500, start = performance.now();
    el.dataset.val = to;
    function step(t){
      const p = Math.min(1, (t-start)/dur);
      const eased = 1 - Math.pow(1-p, 3);
      el.textContent = (from + (to-from)*eased).toFixed(0) + suffix;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function flashValue(el, text){
    el.textContent = text;
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
  }

  function toast(msg){
    const t = document.createElement('div');
    t.className = 'toast glass';
    t.textContent = msg;
    $('toastStack').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function beep(freq=880, dur=0.12){
    if(!soundOn) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }catch(e){}
  }

  // ================= clock =================
  setInterval(() => { $('clock').textContent = new Date().toUTCString().slice(17,25) + ' UTC'; }, 1000);

  // ================= section nav (sidebar + dock) =================
  function goSection(name){
    document.querySelectorAll('[data-section]').forEach(el => el.classList.toggle('active', el.dataset.section === name));
    const target = $(name);
    if(target) target.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-section]');
    if(el) goSection(el.dataset.section);
  });

  // ================= hero / observer card =================
  App.on('trackingStarted', () => {
    $('locateBtn').textContent = '🛑 Stop live tracking';
    $('liveDot').classList.add('live');
  });
  App.on('trackingStopped', () => {
    $('locateBtn').textContent = '🛰️ Start live tracking';
    $('liveDot').classList.remove('live');
  });
  App.on('error', msg => { $('locErr').style.display='block'; $('locErr').textContent = msg; toast(msg); });
  App.on('position', obs => {
    flashValue($('latVal'), obs.lat.toFixed(4)+'°');
    flashValue($('lonVal'), obs.lon.toFixed(4)+'°');
  });
  App.on('sunMoon', ({sunAltDeg, moon}) => {
    flashValue($('sunVal'), sunAltDeg.toFixed(1)+'°');
    let label, cls;
    if(sunAltDeg > -0.5){ label='Daylight'; cls='color:var(--accent); background:rgba(251,191,36,.1);'; }
    else if(sunAltDeg > -6){ label='Civil twilight'; cls='color:var(--accent); background:rgba(251,191,36,.1);'; }
    else if(sunAltDeg > -18){ label='Twilight'; cls='color:var(--primary); background:rgba(94,234,212,.1);'; }
    else { label='Astronomical dark'; cls='color:var(--success); background:rgba(34,197,94,.1);'; }
    $('skyVal').textContent = label;
    $('skyBadge').textContent = label;
    $('skyBadge').style.cssText = cls;
    $('moonVal').textContent = `${moon.phaseLabel} · ${Math.round(moon.illumFraction*100)}%`;
  });
  App.on('weather', cc => {
    flashValue($('cloudVal'), cc + '%');
    $('cloudVal').style.color = cc < 30 ? 'var(--success)' : cc < 70 ? 'var(--accent)' : 'var(--danger)';
  });

  $('locateBtn').addEventListener('click', () => {
    $('locErr').style.display = 'none';
    if(App.state.tracking) App.stopTracking();
    else App.startTracking();
  });

  $('notifyBtn').addEventListener('click', async () => {
    if(!('Notification' in window)){
      toast('This browser does not support notifications. On iPhone, install via "Add to Home Screen" first.');
      return;
    }
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){
      App.state.notifyEnabled = true;
      $('notifyBtn').textContent = '🔔 Alerts on';
      $('notifyBtn').disabled = true;
      new Notification('Overhead alerts enabled', { body: "You'll be notified the moment a satellite becomes visible.", icon:'icon.svg' });
    } else {
      toast('Notification permission was not granted.');
    }
  });

  App.on('becameVisible', r => { beep(1046, 0.15); toast(`🛰 ${r.name} just became visible!`); });

  // ================= scan =================
  $('scanBtn').addEventListener('click', () => {
    setBtnLoading($('scanBtn'), true);
    App.scan($('groupSelect').value);
  });
  $('groupSelect').addEventListener('change', e => { if(App.state.tracking) { setBtnLoading($('scanBtn'), true); App.scan(e.target.value); } });
  App.on('scanDone', () => { setBtnLoading($('scanBtn'), false, 'Scan sky'); });
  App.on('scanError', msg => { setBtnLoading($('scanBtn'), false, 'Scan sky'); toast('Scan failed: ' + msg); });

  // ================= stats + list rendering =================
  App.on('frame', results => {
    const visible = results.filter(r => r.visibility.tier === 'visible').length;
    countUp($('statVisible'), visible);
    countUp($('statAbove'), results.length);
    countUp($('statTracking'), App.state.sats.length);
    countUp($('statFav'), App.state.favorites.size);
    renderList(results);
    drawSkyplot(results);
  });

  function filteredResults(){
    let list = App.state.results;
    if(currentFilter === 'visible') list = list.filter(r => r.visibility.tier === 'visible');
    if(currentFilter === 'above') list = list;
    if(currentFilter === 'favorites') list = list.filter(r => r.favorite);
    if(searchTerm) list = list.filter(r => r.name.toLowerCase().includes(searchTerm));
    return list;
  }

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderList(App.state.results);
    });
  });

  function tierBadge(v){
    if(v.tier === 'visible') return `<span class="badge visible">🟢 ${v.label}</span>`;
    if(v.tier === 'binoculars') return `<span class="badge binoculars">🟡 ${v.label}</span>`;
    return `<span class="badge notvisible">🔴 ${v.label}</span>`;
  }

  function confColor(pct){
    if(pct >= 80) return 'var(--success)';
    if(pct >= 55) return 'var(--primary)';
    if(pct >= 25) return 'var(--accent)';
    return 'var(--text-dim)';
  }

  function renderList(all){
    const grid = $('satGrid');
    const list = filteredResults();
    if(!App.state.tracking){
      grid.innerHTML = emptyState('🛰️', 'Not tracking yet', 'Tap "Start live tracking" above to begin.');
      return;
    }
    if(App.state.scanning){
      grid.innerHTML = Array.from({length:4}).map(() => `<div class="skeleton" style="height:150px;"></div>`).join('');
      return;
    }
    if(!list.length){
      grid.innerHTML = explainEmpty();
      return;
    }
    grid.innerHTML = list.slice(0,80).map(r => satCard(r)).join('');
  }

  function explainEmpty(){
    const reasons = [];
    if(!App.state.sats.length) reasons.push(['📡','Run a scan to load the satellite catalog.']);
    else{
      const allEclipsed = App.state.results.length && App.state.results.every(r => r.eclipsed);
      if(App.state.sunAltDeg !== null && App.state.sunAltDeg > -0.5) reasons.push(['☀️','Sky too bright — full daylight.']);
      else if(App.state.sunAltDeg !== null && App.state.sunAltDeg > -6) reasons.push(['🌆','Civil twilight — sky not fully dark yet.']);
      if(allEclipsed) reasons.push(['🌑',"All tracked objects are currently in Earth's shadow."]);
      if(App.state.cloudPct !== null && App.state.cloudPct >= 70) reasons.push(['☁️', `Heavy cloud cover (${Math.round(App.state.cloudPct)}%).`]);
      if(!App.state.results.length) reasons.push(['📉','Nothing from this catalog is above your horizon right now.']);
    }
    if(!reasons.length) reasons.push(['🔎','No objects match the current filter.']);
    return `<div class="empty-state">
      <div class="big">🌌</div><h3>Nothing visible right now</h3>
      <div class="reason-list">${reasons.map(([e,t]) => `<div>${e} ${t}</div>`).join('')}</div>
    </div>`;
  }

  function emptyState(icon, title, sub){
    return `<div class="empty-state"><div class="big">${icon}</div><h3>${title}</h3><p class="small">${sub}</p></div>`;
  }

  function orbitEmoji(type){ return { LEO:'🛰️', MEO:'🧭', GEO:'📡', HEO:'☄️' }[type] || '🛰️'; }

  function satCard(r){
    const v = r.visibility;
    const selected = App.state.selected === r.name ? 'selected' : '';
    const visNow = v.tier === 'visible' ? 'visible-now' : '';
    return `<article class="glass sat-card ${selected} ${visNow}" data-name="${escAttr(r.name)}" tabindex="0" role="button" aria-label="${escAttr(r.name)} details">
      <div class="sat-head">
        <div class="sat-id">
          <span class="sat-emoji">${orbitEmoji(r.orbit.type)}</span>
          <div style="min-width:0;">
            <div class="sat-name">${esc(r.name)}</div>
            <div class="sat-orbit">${r.orbit.type} · ${Math.round(r.orbit.altKm)} km alt</div>
          </div>
        </div>
        <div class="row" style="gap:6px;">
          ${v.tier==='visible' ? '<span class="now-badge">VISIBLE NOW</span>' : ''}
          <button class="fav-btn ${r.favorite?'on':''}" data-fav="${escAttr(r.name)}" aria-label="Toggle favorite">${r.favorite?'★':'☆'}</button>
        </div>
      </div>

      <div class="sat-meta-grid">
        <div class="meta-mini"><div class="l">Elevation</div><div class="v">${r.elev.toFixed(0)}°</div></div>
        <div class="meta-mini"><div class="l">Azimuth</div><div class="v">${r.az.toFixed(0)}°</div></div>
        <div class="meta-mini"><div class="l">Distance</div><div class="v">${Math.round(r.rangeKm)}km</div></div>
        <div class="meta-mini"><div class="l">⭐ Mag (est.)</div><div class="v">${v.magnitude.toFixed(1)}</div></div>
        <div class="meta-mini"><div class="l">☀ Sunlit</div><div class="v">${r.eclipsed?'No':'Yes'}</div></div>
        <div class="meta-mini"><div class="l">🌙 Moon impact</div><div class="v">${v.moonFactor<0.85?'High':v.moonFactor<0.97?'Some':'Low'}</div></div>
      </div>

      <div class="sat-conf">
        <div class="conf-bar"><div class="conf-fill" style="width:${v.score}%; background:${confColor(v.score)};"></div></div>
        <div class="conf-label" style="color:${confColor(v.score)};">${v.score}%</div>
      </div>
      <div style="margin-top:8px;">${tierBadge(v)} ${v.reason ? `<span class="small">· ${esc(v.reason)}</span>` : ''}</div>

      <div class="sat-actions">
        <button class="btn ghost sm" data-track="${escAttr(r.name)}">🎯 Track</button>
        <button class="btn ghost sm" data-center="${escAttr(r.name)}">⌖ Center</button>
        <button class="btn ghost sm" data-details="${escAttr(r.name)}">ℹ️ Details</button>
      </div>
    </article>`;
  }

  function esc(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }

  document.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]');
    if(fav){ App.toggleFavorite(fav.dataset.fav); renderList(App.state.results); return; }
    const center = e.target.closest('[data-center]');
    if(center){ App.select(center.dataset.center); skyplotView.centerOn = center.dataset.center; renderList(App.state.results); return; }
    const details = e.target.closest('[data-details]');
    if(details){ openDetails(details.dataset.details); return; }
    const track = e.target.closest('[data-track]');
    if(track){ App.select(track.dataset.track); openPointMe(); return; }
    const card = e.target.closest('.sat-card');
    if(card && !e.target.closest('button')){ App.select(card.dataset.name); renderList(App.state.results); }
  });

  function openDetails(name){
    const r = App.state.results.find(x => x.name === name);
    if(!r) return;
    const v = r.visibility;
    $('detailsBody').innerHTML = `
      <div class="row between"><div class="section-title" style="margin:0;">${orbitEmoji(r.orbit.type)} ${esc(r.name)}</div>
      <button class="icon-btn" onclick="document.getElementById('detailsOverlay').classList.remove('open')">✕</button></div>
      <div class="sat-meta-grid" style="margin-top:16px; grid-template-columns:repeat(2,1fr);">
        <div class="meta-mini"><div class="l">Orbit type</div><div class="v">${r.orbit.type}</div></div>
        <div class="meta-mini"><div class="l">Altitude</div><div class="v">${Math.round(r.orbit.altKm)} km</div></div>
        <div class="meta-mini"><div class="l">Elevation</div><div class="v">${r.elev.toFixed(1)}°</div></div>
        <div class="meta-mini"><div class="l">Azimuth</div><div class="v">${r.az.toFixed(1)}°</div></div>
        <div class="meta-mini"><div class="l">Range</div><div class="v">${Math.round(r.rangeKm)} km</div></div>
        <div class="meta-mini"><div class="l">Est. magnitude</div><div class="v">${v.magnitude.toFixed(2)}</div></div>
        <div class="meta-mini"><div class="l">Sunlit</div><div class="v">${r.eclipsed?'No — in shadow':'Yes'}</div></div>
        <div class="meta-mini"><div class="l">Confidence</div><div class="v" style="color:${confColor(v.score)};">${v.score}%</div></div>
      </div>
      <div style="margin-top:14px;">${tierBadge(v)}</div>
      <p class="small" style="margin-top:12px; line-height:1.6;">Naked-eye confidence accounts for sun altitude, elevation/extinction, cloud cover, light pollution, moon brightness/proximity, and an estimated apparent magnitude. It's a heuristic guide, not a guarantee.</p>
      <button class="btn full" style="margin-top:16px;" onclick="document.getElementById('detailsOverlay').classList.remove('open'); UI.openPointMeFor('${escAttr(name)}')">🎯 Point me to it</button>
    `;
    $('detailsOverlay').classList.add('open');
  }

  // ================= sky plot: zoom/pan/tap =================
  const skyplotView = { zoom:1 };
  function initSkyplotInteraction(){
    const wrap = $('skyplotWrap'), canvas = $('skyplot');
    wrap.addEventListener('click', handleTap);
    $('zoomIn').addEventListener('click', () => { skyplotView.zoom = Math.min(2.2, skyplotView.zoom*1.2); drawSkyplot(App.state.results); });
    $('zoomOut').addEventListener('click', () => { skyplotView.zoom = Math.max(0.7, skyplotView.zoom/1.2); drawSkyplot(App.state.results); });
    $('zoomReset').addEventListener('click', () => { skyplotView.zoom = 1; drawSkyplot(App.state.results); });

    function handleTap(e){
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width/rect.width, scaleY = canvas.height/rect.height;
      const tx = (e.clientX-rect.left)*scaleX, ty = (e.clientY-rect.top)*scaleY;
      let best=null, bestDist=32*scaleX;
      for(const m of lastPlotPoints){
        const d = Math.hypot(m.x-tx, m.y-ty);
        if(d<bestDist){ bestDist=d; best=m; }
      }
      if(best){ App.select(best.r.name); renderList(App.state.results); rippleAt(canvas, e); }
    }
  }
  function rippleAt(canvas, e){
    const rect = canvas.getBoundingClientRect();
    const r = document.createElement('span');
    r.className='ripple'; r.style.width=r.style.height='60px';
    r.style.left=(e.clientX-rect.left-30)+'px'; r.style.top=(e.clientY-rect.top-30)+'px';
    canvas.parentElement.style.position='relative';
    canvas.parentElement.appendChild(r);
    setTimeout(()=>r.remove(),650);
  }

  let lastPlotPoints = [];
  let plotPulse = 0;
  function drawSkyplot(results){
    const canvas = $('skyplot'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    const cx = W/2, cy = H/2;
    const R = W*0.4*skyplotView.zoom;
    plotPulse += 0.06;

    ctx.clearRect(0,0,W,H);

    // subtle radial vignette for depth
    const vg = ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.15);
    vg.addColorStop(0, 'rgba(94,234,212,0.05)');
    vg.addColorStop(1, 'rgba(94,234,212,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,W,H);

    // elevation rings, finer + tick labels
    ctx.lineWidth = 1;
    [0,30,60].forEach(elev => {
      const r=R*(1-elev/90);
      ctx.strokeStyle = elev===0 ? 'rgba(94,234,212,0.3)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      if(elev>0){
        ctx.fillStyle='rgba(148,163,184,0.55)'; ctx.font='500 9px "IBM Plex Mono", monospace';
        ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillText(elev+'°', cx+4, cy-r+2);
      }
    });

    // cardinal spokes + labels
    ctx.font='700 14px Inter, sans-serif'; ctx.fillStyle='#CBD5E1'; ctx.textAlign='center'; ctx.textBaseline='middle';
    [['N',0],['E',90],['S',180],['W',270]].forEach(([label,az]) => {
      const rad=(az-90)*Math.PI/180;
      ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+R*Math.cos(rad), cy+R*Math.sin(rad)); ctx.stroke();
      ctx.fillText(label, cx+(R+20)*Math.cos(rad), cy+(R+20)*Math.sin(rad));
    });

    // device heading arrow (if compass active)
    if(Compass.state.heading !== null){
      const rad=(Compass.state.heading-90)*Math.PI/180;
      ctx.strokeStyle='rgba(251,191,36,0.75)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+R*Math.cos(rad), cy+R*Math.sin(rad)); ctx.stroke();
    }

    lastPlotPoints = [];
    for(const r of results){
      const rad=(r.az-90)*Math.PI/180;
      const rr=R*(1-r.elev/90);
      const px=cx+rr*Math.cos(rad), py=cy+rr*Math.sin(rad);
      const isVisible = r.visibility.tier==='visible';
      const isSelected = App.state.selected === r.name;
      const color = isVisible ? '#22C55E' : (r.visibility.tier==='binoculars' ? '#FBBF24' : '#5EEAD4');

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = isVisible ? 18 : 7;
      ctx.globalAlpha = isVisible ? 1 : 0.75;
      ctx.arc(px,py, isSelected?7:(isVisible?6:4), 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.globalAlpha=1;

      if(isSelected){
        const pulseR = 12 + Math.sin(plotPulse)*2.5;
        ctx.strokeStyle = 'rgba(248,250,252,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px,py,pulseR,0,Math.PI*2); ctx.stroke();
      }
      lastPlotPoints.push({x:px,y:py,r});
    }
    ctx.fillStyle='#FBBF24'; ctx.beginPath(); ctx.arc(cx,cy,2.5,0,Math.PI*2); ctx.fill();
  }

  // ================= command palette (search) =================
  function openPalette(){ $('paletteOverlay').classList.add('open'); $('paletteInput').value=''; $('paletteInput').focus(); renderPaletteResults(''); }
  function closePalette(){ $('paletteOverlay').classList.remove('open'); }
  $('searchBtn').addEventListener('click', openPalette);
  $('paletteOverlay').addEventListener('click', e => { if(e.target.id==='paletteOverlay') closePalette(); });
  document.addEventListener('keydown', e => {
    if(e.key === '/' && document.activeElement.tagName !== 'INPUT'){ e.preventDefault(); openPalette(); }
    if(e.key === 'Escape'){ closePalette(); $('settingsOverlay').classList.remove('open'); $('detailsOverlay').classList.remove('open'); closePointMe(); }
  });
  $('paletteInput').addEventListener('input', e => renderPaletteResults(e.target.value));
  function renderPaletteResults(q){
    const term = q.toLowerCase();
    const list = App.state.results.filter(r => r.name.toLowerCase().includes(term)).slice(0,20);
    $('paletteResults').innerHTML = list.map(r => `<div class="palette-item" data-pick="${escAttr(r.name)}"><span>${esc(r.name)}</span>${tierBadge(r.visibility)}</div>`).join('') || `<div class="small" style="padding:10px;">No matches.</div>`;
  }
  $('paletteResults').addEventListener('click', e => {
    const item = e.target.closest('[data-pick]');
    if(item){ App.select(item.dataset.pick); searchTerm=''; renderList(App.state.results); closePalette(); }
  });

  // ================= settings =================
  $('settingsBtn').addEventListener('click', () => $('settingsOverlay').classList.add('open'));
  $('settingsClose').addEventListener('click', () => $('settingsOverlay').classList.remove('open'));
  $('bortleSlider').addEventListener('input', e => { App.state.bortle = +e.target.value; $('bortleVal').textContent = e.target.value; if(App.state.sats.length) App.emit('frame', App.state.results); });
  $('calibrateBtn').addEventListener('click', () => { Compass.calibrateTo(0); toast('Calibrated — facing direction set as North.'); });

  // ================= theme + sound toggles =================
  $('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'amber' ? '' : 'amber');
  });
  $('soundBtn').addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('overhead_sound', soundOn?'1':'0');
    $('soundBtn').classList.toggle('icon-toggle'); $('soundBtn').classList.toggle('on', soundOn);
    $('soundBtn').textContent = soundOn ? '🔊' : '🔔';
    toast(soundOn ? 'Sound effects on' : 'Sound effects off');
    if(soundOn) beep(880,0.1);
  });

  // ================= compass wiring =================
  $('compassBtn').addEventListener('click', async () => {
    const res = await Compass.requestAccess();
    if(!res.ok){ toast(res.reason); return; }
    $('compassBtn').textContent = 'Compass active';
    $('compassBtn').disabled = true;
    $('headingLabel').textContent = 'Live';
  });
  Compass.on(({heading, pitch}) => {
    if(heading === null) return;
    $('compassRose').style.transform = `rotate(${-heading}deg)`;
    $('compassNeedle').style.transform = `rotate(${heading}deg)`;
    $('headingReadout').textContent = `${Math.round(heading)}°`;
    $('headingLabel').textContent = `Facing ${Compass.headingLabel(heading)} · ${Math.round(heading)}°`;
    if(pointmeOpen) updatePointMe();
  });

  // ================= point-me-to-satellite =================
  function openPointMe(){
    if(!App.state.selected){ toast('Select a satellite first.'); return; }
    if(Compass.state.heading === null){ toast('Enable the compass first (Compass panel).'); goSection('compass'); return; }
    pointmeOpen = true;
    $('pointme').classList.add('open');
    updatePointMe();
  }
  function closePointMe(){ pointmeOpen=false; $('pointme').classList.remove('open'); $('pointme').classList.remove('locked'); }
  $('pointmeClose').addEventListener('click', closePointMe);
  function openPointMeFor(name){ App.select(name); openPointMe(); }

  let lastLockState = false;
  function updatePointMe(){
    const r = App.state.results.find(x => x.name === App.state.selected);
    if(!r){ $('pointmeStatus').textContent='Satellite no longer above horizon.'; return; }
    const dAz = Compass.bearingDelta(r.az);
    const dEl = Compass.pitchDelta(r.elev);
    if(dAz === null){ return; }

    const arrowRot = dAz; // rotate arrow toward target relative to "up"
    $('pointmeArrow').style.transform = `rotate(${arrowRot}deg)`;

    const azOk = Math.abs(dAz) < 8;
    const elOk = dEl === null ? true : Math.abs(dEl) < 8;
    const locked = azOk && elOk;

    const reticle = $('reticle');
    const dist = Math.hypot(dAz, dEl ?? 0);
    reticle.classList.remove('near','hot','locked');
    if(locked) reticle.classList.add('locked');
    else if(dist < 20) reticle.classList.add('hot');
    else if(dist < 45) reticle.classList.add('near');

    let statusText;
    if(locked){ statusText = "🎯 You're on target!"; }
    else {
      const parts = [];
      if(Math.abs(dAz) >= 8) parts.push(dAz > 0 ? `➡ Turn Right ${Math.abs(dAz).toFixed(0)}°` : `⬅ Turn Left ${Math.abs(dAz).toFixed(0)}°`);
      if(dEl !== null && Math.abs(dEl) >= 8) parts.push(dEl > 0 ? `⬆ Raise phone ${Math.abs(dEl).toFixed(0)}°` : `⬇ Lower phone ${Math.abs(dEl).toFixed(0)}°`);
      statusText = parts.join(' · ') || 'Almost there…';
    }
    $('pointmeStatus').textContent = statusText;
    $('pointmeDetail').textContent = `${r.name} · el ${r.elev.toFixed(0)}° · az ${r.az.toFixed(0)}°`;
    $('pointme').classList.toggle('locked', locked);

    if(locked && !lastLockState){
      if(navigator.vibrate) navigator.vibrate(120);
      beep(1318, 0.18);
    }
    lastLockState = locked;
  }

  // ================= AR =================
  $('arBtnSidebar').addEventListener('click', () => AR.open());
  $('arBtnDock').addEventListener('click', () => AR.open());
  $('arClose').addEventListener('click', () => AR.close());

  // ================= installability =================
  let deferredInstallPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if(!isStandalone()) $('installBtn').classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    $('installBtn').classList.add('hidden');
    deferredInstallPrompt = null;
    toast('Installed — find Overhead on your home screen / app list.');
  });

  $('installBtn').addEventListener('click', async () => {
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if(outcome === 'accepted') $('installBtn').classList.add('hidden');
      return;
    }
    if(isIOS()){
      toast('On iPhone/iPad: tap the Share icon in Safari, then "Add to Home Screen."');
      return;
    }
    toast('Open this page in Chrome, Edge, or another installable browser to get a one-tap install button.');
  });

  // Safari/iOS never fires beforeinstallprompt — show the button anyway with instructions,
  // as long as it's not already running standalone.
  if(isIOS() && !isStandalone()) $('installBtn').classList.remove('hidden');

  // ================= init =================
  function init(){
    initStarfield();
    attachRipples();
    initSkyplotInteraction();
    renderList([]);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    (function pulseLoop(){
      if(App.state.tracking && App.state.selected) drawSkyplot(App.state.results);
      requestAnimationFrame(pulseLoop);
    })();
  }

  return { toast, openDetails, openPointMeFor, init };
})();

document.addEventListener('DOMContentLoaded', UI.init);
