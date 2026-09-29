/*
 * Magnus — splash screen animation.
 * Traces magnetic field lines between two poles on a 2D canvas: each line
 * grows head-first from the north pole to the south pole, then the poles
 * flip and the lines are retraced. Pure canvas; no dependency on Three.js.
 */
(function () {
  'use strict';

  const LINES = 34;
  const STEP = 6;
  const MAX_STEPS = 420;
  const SEED_R = 22;
  const HOLD = 2600;
  const NORTH = [224, 72, 63];
  const SOUTH = [59, 130, 246];

  function startSplash(canvas) {
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1;
    let poles = [];
    let lines = [];
    let motes = [];
    let polarity = 1;
    let phase = 'grow';       // grow | hold | flash
    let phaseAt = 0;
    let flipped = false;
    let raf = 0;
    let stopped = false;
    let lastT = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Poles flank the title so the lines arc around the text, not under it:
      // side by side in landscape, above and below in portrait.
      if (h > w * 1.1) {
        poles = [{ x: w / 2, y: h * 0.14, q: 1 }, { x: w / 2, y: h * 0.86, q: -1 }];
      } else {
        const cy = h * 0.44;
        const d = Math.min(w * 0.78, 980);
        poles = [{ x: w / 2 - d / 2, y: cy, q: 1 }, { x: w / 2 + d / 2, y: cy, q: -1 }];
      }
      reseed();
    }

    function field(x, y) {
      let fx = 0, fy = 0;
      for (const p of poles) {
        const dx = x - p.x, dy = y - p.y;
        const r2 = dx * dx + dy * dy + 60;
        const inv = (p.q * polarity) / (r2 * Math.sqrt(r2));
        fx += dx * inv; fy += dy * inv;
      }
      return [fx, fy];
    }

    // Second-order (midpoint) streamline from the source pole to the sink.
    function trace(angle) {
      const src = poles.find(p => p.q * polarity > 0);
      const sink = poles.find(p => p.q * polarity < 0);
      const pts = [];
      let x = src.x + Math.cos(angle) * SEED_R, y = src.y + Math.sin(angle) * SEED_R;
      for (let i = 0; i < MAX_STEPS; i++) {
        pts.push(x, y);
        let [fx, fy] = field(x, y);
        let m = Math.hypot(fx, fy) || 1e-9;
        const mx = x + (fx / m) * STEP * 0.5, my = y + (fy / m) * STEP * 0.5;
        [fx, fy] = field(mx, my);
        m = Math.hypot(fx, fy) || 1e-9;
        x += (fx / m) * STEP; y += (fy / m) * STEP;
        if (Math.hypot(x - sink.x, y - sink.y) < SEED_R) { pts.push(sink.x, sink.y); break; }
        if (x < -w * 0.5 || x > w * 1.5 || y < -h * 0.5 || y > h * 1.5) break;
      }
      return pts;
    }

    function reseed() {
      lines = [];
      for (let i = 0; i < LINES; i++) {
        const a = (i / LINES) * Math.PI * 2 + 0.03;
        const pts = trace(a);
        lines.push({ pts, n: pts.length / 2, head: reduced ? pts.length / 2 : 0, speed: 0.55 + Math.random() * 0.5 });
      }
      if (!motes.length) {
        for (let i = 0; i < 40; i++) {
          motes.push({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.4, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 8, a: 0.2 + Math.random() * 0.5 });
        }
      }
    }

    function poleColor(t) {
      // Lines always run from the current source (north) to the sink (south).
      const c = NORTH.map((v, i) => Math.round(v + (SOUTH[i] - v) * t));
      return c;
    }

    function drawLine(line, dt) {
      if (!reduced) line.head = Math.min(line.n, line.head + dt * 0.42 * line.speed * line.n);
      const upto = Math.floor(line.head);
      if (upto < 2) return;
      const { pts } = line;
      const grad = ctx.createLinearGradient(pts[0], pts[1], pts[(line.n - 1) * 2], pts[(line.n - 1) * 2 + 1]);
      const c0 = poleColor(0), c1 = poleColor(1);
      grad.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},0.9)`);
      grad.addColorStop(1, `rgba(${c1[0]},${c1[1]},${c1[2]},0.9)`);

      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 1; i < upto; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      if (!reduced && upto < line.n) {
        const hx = pts[(upto - 1) * 2], hy = pts[(upto - 1) * 2 + 1];
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawPoles() {
      for (const p of poles) {
        const isN = p.q * polarity > 0;
        const c = isN ? NORTH : SOUTH;
        const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
        glow.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
        glow.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '700 14px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(isN ? 'N' : 'S', p.x, p.y + 1);
      }
    }

    function drawMotes(dt) {
      ctx.fillStyle = '#fff';
      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
          if (m.x < -4) m.x = w + 4; else if (m.x > w + 4) m.x = -4;
        }
        ctx.globalAlpha = m.a;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function frame(t) {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      if (!phaseAt) phaseAt = t;

      ctx.clearRect(0, 0, w, h);
      drawMotes(dt);
      let allDone = true;
      for (const line of lines) { drawLine(line, dt); if (line.head < line.n) allDone = false; }
      drawPoles();

      if (reduced) return;
      if (phase === 'grow' && allDone) { phase = 'hold'; phaseAt = t; }
      else if (phase === 'hold' && t - phaseAt > HOLD) { phase = 'flash'; phaseAt = t; flipped = false; }
      else if (phase === 'flash') {
        const k = (t - phaseAt) / 420;
        if (k < 1) {
          ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
          ctx.fillRect(0, 0, w, h);
          if (k > 0.12 && !flipped) { polarity = -polarity; reseed(); flipped = true; }
        } else { phase = 'grow'; phaseAt = t; }
      }
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);

    return function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }

  window.startSplash = startSplash;
})();
