// ar.js — NEW: lightweight AR overlay (camera + canvas projection).
//
// Scope note: this is a 2D pinhole-style projection using the device's
// compass heading/tilt as the camera's optical axis, not a full 6-DoF AR
// engine. Assumes an approximate 60°(h) x 46°(v) rear-camera field of view.
// Good enough to point you at bright, easy targets like the ISS; not frame
// -accurate for a telephoto lens.

import { angleDiff } from './guidance.js';

const FOV_H = 60, FOV_V = 46;
let stream = null;
let rafId = null;

export async function startAR(video, canvas, getResults, getHeadingElev, onTap){
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  await video.play();

  function resize(){
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  resize();
  window.addEventListener('resize', resize);

  const ctx = canvas.getContext('2d');
  const projected = []; // last-frame projected points, for tap hit-testing

  function frame(){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    const { heading, elevation } = getHeadingElev();
    const results = getResults();
    projected.length = 0;

    for(const r of results){
      const dAz = angleDiff(r.az, heading);
      const dEl = r.elev - elevation;
      if(Math.abs(dAz) > FOV_H/2 || Math.abs(dEl) > FOV_V/2) continue;
      const x = W/2 + (dAz / (FOV_H/2)) * (W/2);
      const y = H/2 - (dEl / (FOV_V/2)) * (H/2);

      const color = r.visible ? '#22C55E' : '#5EEAD4';
      ctx.beginPath();
      ctx.arc(x, y, r.visible ? 9 : 6, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      if(r.visible){
        ctx.beginPath(); ctx.arc(x,y,16,0,Math.PI*2);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.font = `${12 * devicePixelRatio}px JetBrains Mono, monospace`;
      ctx.fillStyle = 'rgba(5,7,12,.75)';
      const label = `${r.name}  ${Math.round(r.elev)}°/${Math.round(r.az)}°`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x - tw/2 - 6, y - 34*devicePixelRatio, tw + 12, 20*devicePixelRatio);
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - 18*devicePixelRatio);

      projected.push({ x: x/devicePixelRatio, y: y/devicePixelRatio, name: r.name });
    }

    // center reticle = camera optical axis
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(W/2, H/2, 20, 0, Math.PI*2); ctx.stroke();

    rafId = requestAnimationFrame(frame);
  }
  frame();

  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
    let best = null, bestD = 34;
    for(const p of projected){
      const d = Math.hypot(p.x - cx, p.y - cy);
      if(d < bestD){ bestD = d; best = p; }
    }
    if(best && onTap) onTap(best.name);
  };

  return () => window.removeEventListener('resize', resize);
}

export function stopAR(){
  if(rafId) cancelAnimationFrame(rafId);
  if(stream) stream.getTracks().forEach(t => t.stop());
  stream = null; rafId = null;
}
