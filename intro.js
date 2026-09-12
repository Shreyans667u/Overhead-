'use strict';
/*
 * Intro - the 5-second autoplaying title sequence.
 *
 * Runtime is fixed: INTRO_MS below is the single source of truth, and it is
 * pushed into the CSS custom property --intro-total on init so the progress
 * bar and the actual handoff can never drift apart.
 *
 * What this deliberately does NOT do:
 *   - It never intercepts wheel, touchmove, or keyboard scrolling, and it
 *     never reads scrollY. There is no scroll-linked animation of any kind.
 *     The overlay is position:fixed and the body is locked while it plays,
 *     so the real scroll position simply never moves.
 *   - It never scales content up or blurs it. Reveals are opacity plus a
 *     12px vertical lift, both compositor-friendly.
 *
 * Handoff: at INTRO_MS we fade the overlay out and unlock the body. The
 * dashboard is already sitting in the document underneath, so it is simply
 * revealed and scrolls like any normal page from then on.
 */
const Intro = (() => {
  const root = document.getElementById('introScenes');
  if(!root) return { init(){} }; // never break the host page if markup is absent

  const INTRO_MS = 5000;   // total intro runtime
  const FADE_MS  = 420;    // overlay fade-out on handoff
  const PHASE_2  = 1700;   // description line appears
  const PHASE_3  = 3450;   // handoff status line appears

  const skipBtn = document.getElementById('introSkip');
  const liveRegion = document.getElementById('introLive');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let finished = false;
  const timers = [];
  let starfieldStop = null;

  function later(fn, ms){ timers.push(window.setTimeout(fn, ms)); }
  function clearTimers(){ while(timers.length) window.clearTimeout(timers.pop()); }

  function phase(n){
    root.classList.remove('is-p1', 'is-p2', 'is-p3');
    root.classList.add('is-p' + n);
  }

  function finish(reason){
    if(finished) return;
    finished = true;
    clearTimers();

    root.style.transition = `opacity ${FADE_MS}ms ease`;
    root.style.opacity = '0';

    window.setTimeout(() => {
      root.classList.add('intro-hidden');
      root.style.removeProperty('opacity');
      root.style.removeProperty('transition');
      document.body.classList.remove('intro-lock');
      window.scrollTo(0, 0);
      if(starfieldStop) starfieldStop();
      if(liveRegion) liveRegion.textContent = 'Intro finished. Dashboard ready.';
      // let the rest of the app know the viewport is theirs now
      document.dispatchEvent(new CustomEvent('intro:done', { detail:{ reason } }));
    }, FADE_MS);
  }

  function init(){
    root.style.setProperty('--intro-total', INTRO_MS + 'ms');

    document.body.classList.add('intro-lock');
    if(liveRegion) liveRegion.textContent = 'Overhead intro playing. Five seconds. Press the skip button to go straight to the dashboard.';

    if(skipBtn) skipBtn.addEventListener('click', () => finish('skipped'));

    // Escape is the conventional "get me out of this" key for a full-screen
    // overlay. It is the only key this intro listens for.
    document.addEventListener('keydown', function onEsc(e){
      if(e.key === 'Escape' && !finished){ finish('escape'); }
      if(finished) document.removeEventListener('keydown', onEsc);
    });

    startStarfield();

    // kick the timeline on the next frame so the initial hidden state is
    // painted first and the first transition actually runs
    requestAnimationFrame(() => {
      root.classList.add('is-running');
      phase(1);
      later(() => phase(2), PHASE_2);
      later(() => phase(3), PHASE_3);
      later(() => finish('completed'), INTRO_MS);
    });
  }

  /* Drifting starfield. Pauses itself when the tab is hidden and is torn
     down completely at handoff so it is not burning frames behind the
     dashboard. */
  function startStarfield(){
    const canvas = document.getElementById('introStarfield');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars = [], raf = null, running = true, stopped = false;

    function size(){
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      const n = Math.floor((window.innerWidth * window.innerHeight) / 7000);
      stars = Array.from({ length:n }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.3 + 0.3) * dpr,
        vy: (Math.random() * 0.05 + 0.012) * dpr,
        tw: Math.random() * Math.PI * 2
      }));
    }
    size();
    window.addEventListener('resize', size);

    function loop(){
      if(!running || stopped){ raf = null; return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      for(const s of stars){
        s.y += s.vy; if(s.y > canvas.height) s.y = 0;
        s.tw += 0.014;
        ctx.globalAlpha = Math.max(0.15, 0.5 + Math.sin(s.tw) * 0.38);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }

    if(reduceMotion){
      // draw one static frame instead of animating
      running = false;
      ctx.fillStyle = '#fff';
      for(const s of stars){ ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else {
      raf = requestAnimationFrame(loop);
    }

    document.addEventListener('visibilitychange', () => {
      if(stopped || reduceMotion) return;
      running = !document.hidden;
      if(running && !raf) raf = requestAnimationFrame(loop);
    });

    starfieldStop = () => {
      stopped = true; running = false;
      if(raf) cancelAnimationFrame(raf);
      raf = null;
      window.removeEventListener('resize', size);
    };
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Intro.init());
