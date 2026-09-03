/*
 * Magnus — game controller: input, undo history, level progression, HUD.
 * Rules live in engine.js; visuals in render3d.js.
 */
(function () {
  'use strict';

  const E = window.MagnusEngine;
  const LEVELS = window.MAGNUS_LEVELS.map(E.parseLevel);
  const STORAGE = 'magnus.chapter1';

  const $ = id => document.getElementById(id);
  const ui = {
    canvas: $('game'), select: $('levelSelect'), prev: $('prev'), next: $('next'),
    name: $('levelName'), story: $('story'), teaches: $('teaches'), hint: $('hintText'),
    pole: $('poleBadge'), moves: $('moves'), msg: $('msg'), best: $('best'),
    nextBtn: $('nextLevel'), pulseMode: $('pulseMode'), loading: $('loading'),
  };

  let progress = { best: {}, unlocked: 1 };
  try { Object.assign(progress, JSON.parse(localStorage.getItem(STORAGE) || '{}')); } catch (e) { /* fresh start */ }
  const save = () => { try { localStorage.setItem(STORAGE, JSON.stringify(progress)); } catch (e) { /* private mode */ } };

  let R = null;           // renderer
  let idx = 0;            // current level index
  let level, state, history, moves;
  let queue = [];         // actions waiting for the current animation
  let settleAt = 0;       // timestamp when the current animation finishes
  let pulseMode = false;  // touch controls: d-pad pulses instead of walking

  // ---- HUD ----------------------------------------------------------------------

  function refreshHud() {
    ui.name.textContent = level.name;
    ui.story.textContent = level.story;
    ui.teaches.textContent = level.teaches;
    ui.hint.textContent = level.hint;
    ui.pole.textContent = state.pole === 'N' ? 'N  north' : 'S  south';
    ui.pole.className = 'badge ' + (state.pole === 'N' ? 'north' : 'south');
    ui.moves.textContent = `Moves ${moves} · Par ${level.par}`;
    const best = progress.best[idx];
    ui.best.textContent = best ? `Best ${best}` : '';
    ui.select.value = String(idx);
    ui.prev.disabled = idx === 0;
    ui.next.disabled = idx >= LEVELS.length - 1;
    ui.nextBtn.classList.toggle('hidden', !state.won || idx >= LEVELS.length - 1);
  }

  function say(text, cls) {
    ui.msg.textContent = text || '';
    ui.msg.className = 'msg ' + (cls || '');
  }

  function refreshPreview() {
    if (!R || state.dead || state.won) { R && R.setPreview([]); return; }
    const t = [];
    for (const d of E.MOVES) {
      const [dx, dy] = E.DIRS[d];
      t.push({ px: state.px, py: state.py, hit: E.target(level, state, dx, dy) });
    }
    R.setPreview(t);
  }

  // ---- level flow -----------------------------------------------------------------

  function loadLevel(i) {
    idx = Math.max(0, Math.min(LEVELS.length - 1, i));
    level = LEVELS[idx];
    state = E.initialState(level);
    history = []; moves = 0; queue = []; settleAt = 0;
    progress.current = idx; save();
    R.loadLevel(level, state);
    ui.hint.classList.add('hidden');
    say('');
    refreshHud();
    refreshPreview();
  }

  function restart() { loadLevel(idx); }

  function undo() {
    if (!history.length) return;
    const h = history.pop();
    state = h.state; moves = h.moves;
    queue = []; settleAt = 0;
    R.syncState(state);
    say('');
    refreshHud();
    refreshPreview();
  }

  function act(action) {
    if (state.dead || state.won) return;
    if (performance.now() < settleAt) { if (queue.length < 2) queue.push(action); return; }
    const next = E.step(level, state, action);
    const changed = E.key(next) !== E.key(state);
    if (changed) { history.push({ state, moves }); moves++; }
    const prev = state;
    state = next;
    R.setPreview([]);
    const dur = R.animateStep(prev, next);
    settleAt = performance.now() + dur;
    refreshHud();

    if (next.dead) {
      say('Magnus fell into the trench. Rewinding…', 'bad');
      setTimeout(() => { if (state === next) undo(); }, dur + 500);
      return;
    }
    if (next.won) {
      const best = progress.best[idx];
      if (!best || moves < best) progress.best[idx] = moves;
      progress.unlocked = Math.max(progress.unlocked, idx + 2);
      save();
      const verdict = moves <= level.par ? 'Par. Clean rigging.' : `Par is ${level.par}.`;
      say(`Bay section clear in ${moves} moves. ${verdict}`, 'good');
      refreshHud();
      return;
    }
    setTimeout(() => {
      if (state === next) refreshPreview();
      if (queue.length) act(queue.shift());
    }, dur);
  }

  // ---- input ----------------------------------------------------------------------

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };

  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'SELECT') return;
    const dir = KEYS[ev.key];
    if (dir) {
      ev.preventDefault();
      act(ev.shiftKey || pulseMode ? 'pulse:' + dir : dir);
      return;
    }
    switch (ev.key) {
      case ' ': case 'Tab': case 'f': case 'F': ev.preventDefault(); act('toggle'); break;
      case 'z': case 'Z': case 'Backspace': ev.preventDefault(); undo(); break;
      case 'r': case 'R': restart(); break;
      case 'h': case 'H': ui.hint.classList.toggle('hidden'); break;
      case 'Enter': case 'n': case 'N': if (state.won && idx < LEVELS.length - 1) loadLevel(idx + 1); break;
      case ']': if (idx < LEVELS.length - 1) loadLevel(idx + 1); break;
      case '[': if (idx > 0) loadLevel(idx - 1); break;
      case 'Shift': ui.canvas.classList.add('pulsing'); break;
    }
  });
  window.addEventListener('keyup', ev => { if (ev.key === 'Shift') ui.canvas.classList.remove('pulsing'); });

  // Clicking a tile in Magnus's row or column pulses that way.
  ui.canvas.addEventListener('pointerdown', ev => {
    if (!R) return;
    const rect = ui.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, R.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4), hit)) return;
    const tx = Math.round(hit.x), ty = Math.round(hit.z);
    const dx = Math.sign(tx - state.px), dy = Math.sign(ty - state.py);
    if ((dx !== 0) === (dy !== 0)) return; // not on a straight line, or on Magnus himself
    const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
    act('pulse:' + dir);
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'undo') return undo();
      if (a === 'restart') return restart();
      if (a === 'hint') return ui.hint.classList.toggle('hidden');
      if (E.MOVES.includes(a)) return act(pulseMode ? 'pulse:' + a : a);
      act(a);
    });
  });
  ui.pulseMode.addEventListener('click', () => {
    pulseMode = !pulseMode;
    ui.pulseMode.classList.toggle('on', pulseMode);
    ui.pulseMode.setAttribute('aria-pressed', String(pulseMode));
  });
  ui.nextBtn.addEventListener('click', () => loadLevel(idx + 1));
  ui.prev.addEventListener('click', () => loadLevel(idx - 1));
  ui.next.addEventListener('click', () => loadLevel(idx + 1));
  ui.select.addEventListener('change', () => { loadLevel(Number(ui.select.value)); ui.select.blur(); });

  LEVELS.forEach((L, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = L.name;
    ui.select.appendChild(o);
  });

  // ---- boot -------------------------------------------------------------------------

  function boot() {
    R = new window.MagnusRenderer3D(window.THREE, ui.canvas);
    ui.loading.classList.add('hidden');
    const fromUrl = Number(new URLSearchParams(location.search).get('level'));
    loadLevel(fromUrl >= 1 ? fromUrl - 1 : Number.isInteger(progress.current) ? progress.current : 0);
    const frame = now => { R.render(now); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }

  if (window.THREE) boot();
  else {
    window.addEventListener('three-ready', boot, { once: true });
    setTimeout(() => {
      if (!window.THREE) ui.loading.textContent = 'Could not load Three.js from the CDN. Check your connection and reload.';
    }, 8000);
  }
})();
