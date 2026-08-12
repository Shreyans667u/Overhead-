'use strict';
/*
 * Intro — the cinematic scene sequence at the top of the page.
 *
 * Deliberately does NOT use real scroll position math. While the intro is
 * active, the page's actual scrollY never moves — #introScenes is a
 * position:fixed full-viewport overlay, and "moving between scenes" is
 * purely a JS state index (`current`) driving CSS class swaps
 * (transform/opacity only, per spec). This is simpler and more reliable
 * across browsers than trying to hijack native scroll, and it's what makes
 * the final "hand off to the dashboard" step trivial: we just hide the
 * overlay and the dashboard — already sitting normally in the document
 * below it — is revealed and scrolls exactly like any other webpage.
 *
 * All five input methods (wheel, buttons, swipe, keyboard, dot-click) funnel
 * through goTo()/next()/prev(), which are gated by a single `animating`
 * flag. That's what stops rapid scrolling from desyncing the animation
 * queue — during a transition, every other input is simply ignored, not
 * queued.
 */
const Intro = (() => {
  const root = document.getElementById('introScenes');
  if(!root) return { init(){} }; // safety: never crash the host page if markup is missing

  const scenes = Array.from(root.querySelectorAll('.intro-scene'));
  const track = document.getElementById('introTrack');
  const dotsWrap = document.getElementById('introDots');
  const progressFill = document.getElementById('introProgressFill');
  const prevLabel = document.getElementById('introPrevLabel');
  const nextLabel = document.getElementById('introNextLabel');
  const upBtn = document.getElementById('introUp');
  const downBtn = document.getElementById('introDown');
  const skipBtn = document.getElementById('introSkip');
  const liveRegion = document.getElementById('introLive');

  const N = scenes.length;
  let current = 0;
  let animating = false;
  let active = false; // whether intro is intercepting input at all (false once handed off)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TRANSITION_MS = reduceMotion ? 260 : 780; // matches CSS var(--intro-dur) + a small safety margin

  const SCENE_NAMES = ['Hero', 'Live Sky Plot', 'Compass & AR', 'Satellite Catalog', 'Get Started'];

  function buildDots(){
    scenes.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'intro-dot' + (i === 0 ? ' is-current' : '');
      b.setAttribute('aria-label', `Go to scene ${i+1}: ${SCENE_NAMES[i] || ''}`);
      b.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(b);
    });
  }

  function render(){
    scenes.forEach((el, i) => {
      el.classList.remove('is-active', 'is-prev', 'is-next');
      if(i === current) el.classList.add('is-active');
      else if(i < current) el.classList.add('is-prev');
      else el.classList.add('is-next');
      el.setAttribute('aria-hidden', i === current ? 'false' : 'true');
    });
    dotsWrap.querySelectorAll('.intro-dot').forEach((d,i) => d.classList.toggle('is-current', i===current));
    progressFill.style.width = `${((current+1)/N)*100}%`;

    prevLabel.textContent = current > 0 ? '← ' + SCENE_NAMES[current-1] : '';
    prevLabel.classList.toggle('is-empty', current === 0);
    nextLabel.textContent = current < N-1 ? SCENE_NAMES[current+1] + ' →' : '';
    nextLabel.classList.toggle('is-empty', current === N-1);

    upBtn.disabled = current === 0;
    downBtn.setAttribute('aria-label', current === N-1 ? 'Enter dashboard' : 'Next section');
    downBtn.textContent = current === N-1 ? '↵' : '▼';

    if(liveRegion) liveRegion.textContent = `Scene ${current+1} of ${N}: ${SCENE_NAMES[current]}`;
  }

  function goTo(index){
    if(!active || animating) return;
    if(index === current){ return; }
    if(index < 0){ return; }
    if(index >= N){ handoff(); return; }
    animating = true;
    current = index;
    render();
    window.setTimeout(() => { animating = false; }, TRANSITION_MS);
  }

  function next(){
    if(!active || animating) return;
    if(current === N-1){ handoff(); return; }
    goTo(current+1);
  }
  function prev(){ goTo(current-1); }

  function handoff(){
    if(!active) return;
    active = false;
    animating = true;
    root.style.transition = 'opacity 380ms ease';
    root.style.opacity = '0';
    window.setTimeout(() => {
      root.classList.add('intro-hidden');
      root.style.removeProperty('opacity');
      root.style.removeProperty('transition');
      document.body.classList.remove('intro-lock');
      try{ localStorage.setItem('overhead_intro_seen', '1'); }catch(e){}
      // land the user at the very top of the dashboard, then normal page scroll takes over
      window.scrollTo(0, 0);
      animating = false;
    }, 380);
  }

  function skipIntro(){
    active = false;
    root.classList.add('intro-hidden');
    document.body.classList.remove('intro-lock');
    try{ localStorage.setItem('overhead_intro_seen', '1'); }catch(e){}
  }

  // ---------------- input handlers ----------------
  let wheelCooldown = false;
  function onWheel(e){
    if(!active) return;
    e.preventDefault();
    if(wheelCooldown || animating) return;
    wheelCooldown = true;
    window.setTimeout(() => { wheelCooldown = false; }, TRANSITION_MS);
    if(e.deltaY > 12) next();
    else if(e.deltaY < -12) prev();
  }

  function onKeydown(e){
    if(!active) return;
    if(['ArrowDown','PageDown'].includes(e.key)){ e.preventDefault(); next(); }
    else if(['ArrowUp','PageUp'].includes(e.key)){ e.preventDefault(); prev(); }
    // Tab/Enter deliberately NOT intercepted — normal focus/activation still works
  }

  let touchStartY = null;
  const SWIPE_THRESHOLD = 45; // px — avoids accidental triggers from small taps/jitter
  function onTouchStart(e){ if(active) touchStartY = e.touches[0].clientY; }
  function onTouchEnd(e){
    if(!active || touchStartY === null) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if(Math.abs(dy) < SWIPE_THRESHOLD) return; // treat as a tap, not a swipe
    if(dy > 0) next(); else prev();
  }

  function init(){
    buildDots();
    render();

    const alreadySeen = (() => { try{ return localStorage.getItem('overhead_intro_seen') === '1'; }catch(e){ return false; } })();
    const isInstalledPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(alreadySeen || isInstalledPwa){
      root.classList.add('intro-hidden');
      return; // active stays false — nothing to wire up
    }

    active = true;
    document.body.classList.add('intro-lock');

    root.addEventListener('wheel', onWheel, { passive:false });
    document.addEventListener('keydown', onKeydown);
    root.addEventListener('touchstart', onTouchStart, { passive:true });
    root.addEventListener('touchend', onTouchEnd, { passive:true });
    upBtn.addEventListener('click', prev);
    downBtn.addEventListener('click', next);
    skipBtn.addEventListener('click', skipIntro);
    root.querySelectorAll('[data-goto="dashboard"]').forEach(btn => btn.addEventListener('click', handoff));

    initStarfield();
  }

  // continuous, independent-of-scene-transitions drifting starfield
  function initStarfield(){
    const canvas = document.getElementById('introStarfield');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [], raf = null, running = true;

    function size(){
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      const n = Math.floor((window.innerWidth*window.innerHeight)/7000);
      stars = Array.from({length:n}, () => ({
        x: Math.random()*canvas.width, y: Math.random()*canvas.height,
        r: Math.random()*1.4+0.3, vy: Math.random()*0.06+0.015, tw: Math.random()*Math.PI*2
      }));
    }
    size();
    window.addEventListener('resize', size);

    function loop(){
      if(!running){ raf = null; return; }
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for(const s of stars){
        s.y += s.vy; if(s.y > canvas.height) s.y = 0;
        s.tw += 0.015;
        ctx.globalAlpha = Math.max(0.15, 0.5+Math.sin(s.tw)*0.4);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if(running && !raf) raf = requestAnimationFrame(loop);
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Intro.init());
