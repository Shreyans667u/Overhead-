'use strict';
/*
 * AR — simplified augmented-reality overlay. This is a 2D FOV-projection
 * (heading/pitch -> screen x/y), not a full 6DOF ARKit/ARCore scene graph —
 * that would need a native layer or a heavy WebXR-only path with poor
 * cross-device support. For "point roughly at the sky and see labels
 * line up," this is the standard technique lightweight sky apps use.
 */
const AR = (() => {
  let video, canvas, ctx, stream, raf, isOpen = false;
  const FOV_H = 62;  // assumed horizontal field of view, degrees (typical rear camera)
  const FOV_V = 46;  // assumed vertical field of view, degrees

  function els(){
    video = document.getElementById('arVideo');
    canvas = document.getElementById('arCanvas');
    ctx = canvas.getContext('2d');
  }

  async function open(){
    if(isOpen) return; // guard against double-tap opening two camera streams at once
    isOpen = true;
    els();
    document.getElementById('arView').classList.add('open');
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio:false });
      video.srcObject = stream;
    }catch(e){
      const reason = (e.name === 'NotFoundError') ? 'No camera was found on this device.'
        : (e.name === 'NotAllowedError') ? 'Camera access was denied — enable it for this site in your browser settings.'
        : 'Camera access is unavailable: ' + e.message;
      UI.toast(reason);
      isOpen = false;
      close();
      return;
    }
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('click', onTap);
    loop();
  }

  function onVisibilityChange(){
    // don't leave the camera running (battery + a lit camera indicator) if the tab is backgrounded
    if(document.hidden && isOpen) close();
  }

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function close(){
    document.getElementById('arView').classList.remove('open');
    if(stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if(raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if(canvas) canvas.removeEventListener('click', onTap);
    isOpen = false;
  }

  let lastMarkers = [];

  function loop(){
    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw(){
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width, canvas.height);
    const heading = Compass.state.heading, pitch = Compass.state.pitch;
    lastMarkers = [];

    if(heading === null){
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Enable the compass first for AR alignment', canvas.width/2, 40);
      return;
    }

    for(const r of App.state.results){
      let dAz = r.az - heading;
      while(dAz > 180) dAz -= 360;
      while(dAz < -180) dAz += 360;
      if(Math.abs(dAz) > FOV_H/2) continue;
      const dEl = r.elev - (pitch ?? 0);
      if(Math.abs(dEl) > FOV_V/2) continue;

      const x = canvas.width/2 + (dAz / (FOV_H/2)) * (canvas.width/2);
      const y = canvas.height/2 - (dEl / (FOV_V/2)) * (canvas.height/2);

      const isVisible = r.visibility.tier === 'visible';
      ctx.beginPath();
      ctx.fillStyle = isVisible ? '#22C55E' : '#5EEAD4';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = isVisible ? 18 : 8;
      ctx.arc(x, y, isVisible ? 8 : 5, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(r.name, x + 12, y - 10);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(`el ${r.elev.toFixed(0)}° · ${Math.round(r.rangeKm)}km`, x + 12, y + 6);

      lastMarkers.push({ x, y, r });
    }

    // center reticle showing where the camera is pointed
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(canvas.width/2 - 12, canvas.height/2);
    ctx.lineTo(canvas.width/2 + 12, canvas.height/2);
    ctx.moveTo(canvas.width/2, canvas.height/2 - 12);
    ctx.lineTo(canvas.width/2, canvas.height/2 + 12);
    ctx.stroke();
  }

  function onTap(e){
    const rect = canvas.getBoundingClientRect();
    const tx = e.clientX - rect.left, ty = e.clientY - rect.top;
    let best = null, bestDist = 40;
    for(const m of lastMarkers){
      const d = Math.hypot(m.x - tx, m.y - ty);
      if(d < bestDist){ bestDist = d; best = m; }
    }
    if(best){ App.select(best.r.name); UI.openDetails(best.r.name); }
  }

  return { open, close };
})();
