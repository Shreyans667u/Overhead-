// ui.js — pure(ish) rendering helpers. No orbital math lives here.
import { state, saveFavorites } from './state.js';
import { scoreVisibility } from './visibility.js';

const $ = id => document.getElementById(id);

// ---------- starfield background ----------
export function initStarfield(){
  const canvas = $('starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  function resize(){
    canvas.width = innerWidth; canvas.height = innerHeight;
    const count = Math.min(160, Math.floor((innerWidth*innerHeight)/9000));
    stars = Array.from({length:count}, () => ({
      x: Math.random()*canvas.width, y: Math.random()*canvas.height,
      r: Math.random()*1.3 + 0.2, tw: Math.random()*Math.PI*2, speed: Math.random()*0.015+0.005
    }));
  }
  resize();
  window.addEventListener('resize', resize);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const s of stars){
      if(!reduceMotion) s.tw += s.speed;
      const a = 0.35 + Math.sin(s.tw)*0.35 + 0.3;
      ctx.beginPath();
      ctx.fillStyle = `rgba(248,250,252,${Math.max(0.15,a)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ---------- count-up number animation ----------
export function animateValue(el, newText){
  if(el.textContent === newText) return;
  el.textContent = newText;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ---------- toasts ----------
export function toast(message, kind='info'){
  const stack = $('toastStack');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'success' ? ' success' : '');
  el.innerHTML = `<span>${kind==='success'?'🛰':'ℹ️'}</span><span>${message}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(-8px)'; setTimeout(()=>el.remove(), 300); }, 4200);
}

// ---------- satellite cards ----------
const ORBIT_TYPE = (rangeKm) => rangeKm < 2000 ? 'LEO' : rangeKm < 35786 ? 'MEO' : 'GEO';

export function renderSatList(results, ctx, onSelect, onGuide){
  const list = $('satList');
  let filtered = results;
  if(state.filterMode === 'visible') filtered = filtered.filter(r => scoreVisibility(r, ctx).tier !== 'hidden');
  if(state.filterMode === 'favorites') filtered = filtered.filter(r => state.favorites.has(r.name));
  if(state.searchQuery) filtered = filtered.filter(r => r.name.toLowerCase().includes(state.searchQuery.toLowerCase()));

  if(filtered.length === 0){
    list.innerHTML = `<div class="empty-state"><div class="icon">🔭</div><div>${results.length===0 ? 'Run a scan to see satellites here.' : 'Nothing matches this filter.'}</div></div>`;
    return;
  }

  list.innerHTML = filtered.slice(0,80).map((r, i) => {
    const v = scoreVisibility(r, ctx);
    const orbit = ORBIT_TYPE(r.rangeKm);
    const isFav = state.favorites.has(r.name);
    const isSelected = state.selectedSat === r.name;
    return `
    <div class="sat-card ${isSelected?'selected':''} ${v.tier==='visible'?'pulse-highlight':''}" style="animation-delay:${i*25}ms" data-name="${escAttr(r.name)}" tabindex="0" role="button" aria-label="${escAttr(r.name)} satellite card">
      <div class="sat-head">
        <div class="sat-id">
          <span class="sat-icon">🛰️</span>
          <div style="min-width:0;">
            <div class="sat-name">${esc(r.name)}</div>
            <div class="sat-orbit-tag">${orbit} · ${Math.round(r.rangeKm).toLocaleString()} km</div>
          </div>
        </div>
        <button class="fav-btn ${isFav?'active':''}" data-fav="${escAttr(r.name)}" aria-label="Toggle favorite">${isFav?'★':'☆'}</button>
      </div>

      <div class="sat-visibility-row">
        <span class="badge ${v.tier}">${v.emoji} ${v.label} (${v.score}%)</span>
        ${r.eclipsed ? '<span class="badge hidden">☀ eclipsed</span>' : '<span class="badge visible">☀ sunlit</span>'}
        ${isSelected ? '<span class="badge selected">selected</span>' : ''}
      </div>

      <div class="sat-metrics">
        <div class="metric"><div class="metric-label">Elevation</div><div class="metric-value">${r.elev.toFixed(0)}°</div></div>
        <div class="metric"><div class="metric-label">Azimuth</div><div class="metric-value">${r.az.toFixed(0)}°</div></div>
        <div class="metric"><div class="metric-label">Est. mag</div><div class="metric-value">${v.estMag.toFixed(1)}</div></div>
      </div>

      <div class="sat-detail-line">
        🌙 Moon: ${ctx.moonAltDeg>0 ? Math.round(ctx.moonFraction*100)+'% lit, up' : 'below horizon'} ·
        ☁ Cloud impact: ${ctx.cloudPct}% ·
        💡 Sky brightness (Bortle ${ctx.lightPollution})
        ${v.reasons.length ? '· ' + esc(v.reasons[0]) : ''}
      </div>

      <div class="sat-actions">
        <button class="btn sm ghost" data-guide="${escAttr(r.name)}">🧭 Point me</button>
        <button class="btn sm ghost" data-center="${escAttr(r.name)}">🎯 Center</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-name]').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('[data-fav],[data-guide],[data-center]')) return;
      onSelect(card.dataset.name);
    });
  });
  list.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.fav;
      state.favorites.has(name) ? state.favorites.delete(name) : state.favorites.add(name);
      saveFavorites();
      renderSatList(results, ctx, onSelect, onGuide);
    });
  });
  list.querySelectorAll('[data-center]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); onSelect(btn.dataset.center); }));
  list.querySelectorAll('[data-guide]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); onGuide(btn.dataset.guide); }));
}

function esc(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s){ return esc(s).replace(/`/g,'&#96;'); }

// ---------- sky plot (zoom + pan + tap) ----------
export function createSkyplot(canvas){
  const ctx = canvas.getContext('2d');
  let scale = 1, offX = 0, offY = 0;
  let dragging = false, lastX = 0, lastY = 0, pinchDist = null;
  let lastResults = [], lastCtx = null, onSelectCb = null, selectedName = null;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.width * dpr; // square
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function toScreen(az, elev, W, H){
    const cx = W/2 + offX, cy = H/2 + offY, R = W*0.42*scale;
    const rad = (az - 90) * Math.PI/180;
    const rr = R * (1 - elev/90);
    return { x: cx + rr*Math.cos(rad), y: cy + rr*Math.sin(rad), R, cx, cy };
  }

  function draw(results, ctxData){
    lastResults = results; lastCtx = ctxData;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const cx = W/2 + offX, cy = H/2 + offY, R = W*0.42*scale;

    // animated grid rings
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1.2*dpr;
    [0,30,60].forEach(elev => {
      const r = R*(1-elev/90);
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    });
    // horizon ring glow
    ctx.save();
    ctx.shadowColor = 'rgba(94,234,212,.5)'; ctx.shadowBlur = 14*dpr;
    ctx.strokeStyle = 'rgba(94,234,212,.55)'; ctx.lineWidth = 2*dpr;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
    ctx.restore();

    // cardinal lines + labels
    ctx.font = `${13*dpr}px JetBrains Mono, monospace`;
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['N',0],['E',90],['S',180],['W',270]].forEach(([label,az]) => {
      const rad = (az-90)*Math.PI/180;
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1*dpr;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+R*Math.cos(rad), cy+R*Math.sin(rad)); ctx.stroke();
      const lx = cx+(R+18*dpr)*Math.cos(rad), ly = cy+(R+18*dpr)*Math.sin(rad);
      ctx.fillStyle = label==='N' ? '#5EEAD4' : '#94A3B8';
      ctx.fillText(label, lx, ly);
    });

    // satellites
    for(const r of results){
      const v = ctxData ? scoreVisibility(r, ctxData) : { tier:'up' };
      const p = toScreen(r.az, r.elev, W, H);
      const isVisible = v.tier === 'visible';
      const isSelected = r.name === selectedName;
      const color = isVisible ? '#22C55E' : (v.tier==='binoculars' ? '#FBBF24' : '#5EEAD4');

      if(isVisible){
        ctx.beginPath(); ctx.fillStyle = color; ctx.globalAlpha = .18;
        ctx.arc(p.x,p.y,16*dpr,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, (isVisible?6:4)*dpr, 0, Math.PI*2);
      ctx.fill();
      if(isSelected){
        ctx.beginPath(); ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 2*dpr;
        ctx.arc(p.x,p.y,10*dpr,0,Math.PI*2); ctx.stroke();
      }
      r._screen = p; // stash for hit-testing
    }

    // zenith marker
    ctx.beginPath(); ctx.fillStyle = '#FBBF24'; ctx.arc(cx,cy,2.5*dpr,0,Math.PI*2); ctx.fill();
  }

  function redraw(){ if(lastResults) draw(lastResults, lastCtx); }

  // pointer interactions: drag to pan, wheel/pinch to zoom, tap to select
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    offX += (e.clientX - lastX) * dpr; offY += (e.clientY - lastY) * dpr;
    lastX = e.clientX; lastY = e.clientY;
    redraw();
  });
  canvas.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX-lastX, e.clientY-lastY) > 3;
    dragging = false;
    if(!moved && onSelectCb){
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX-rect.left)*dpr, py = (e.clientY-rect.top)*dpr;
      let best=null, bd=22*dpr;
      for(const r of lastResults){
        if(!r._screen) continue;
        const d = Math.hypot(r._screen.x-px, r._screen.y-py);
        if(d<bd){ bd=d; best=r; }
      }
      if(best) onSelectCb(best.name);
    }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(3, Math.max(0.6, scale - e.deltaY*0.001));
    redraw();
  }, { passive:false });

  return {
    draw,
    setSelected: (name) => { selectedName = name; redraw(); },
    onSelect: (cb) => { onSelectCb = cb; },
    resetView: () => { scale=1; offX=0; offY=0; redraw(); },
  };
}
