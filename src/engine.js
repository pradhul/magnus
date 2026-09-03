/*
 * Magnus — grid magnet-puzzle rules.
 *
 * Pure logic, no DOM. Loads in the browser via <script> (globalThis.MagnusEngine)
 * and in Node via require(), so the same file drives the game and the solver.
 *
 * The world is a turn-based grid. Every action produces a new state, so the
 * game has perfect undo and the levels can be proven solvable by search.
 *
 * Tile legend (static terrain):
 *   #  concrete wall     blocks bodies and the field
 *   .  floor
 *   ~  pit               bodies fall in; a fallen block fills it into floor
 *   =  glass             blocks bodies, lets the field through
 *   A  steel anchor      heavy iron: fixed, pulls Magnus to it
 *   N  north pillar      heavy magnet: fixed, pulls or launches Magnus
 *   S  south pillar
 *   _  pressure plate    doors open only while every plate is held down
 *   D  blast door        wall while closed, floor while open; blocks the field while closed
 *   X  exit
 *   @  Magnus start
 * Light (movable) bodies, drawn on top of floor:
 *   i  iron crate        no pole of its own — always attracted, never repelled
 *   n  north block       repelled by a north Magnus, attracted by a south one
 *   s  south block
 */
(function (root) {
  'use strict';

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const MOVES = ['up', 'down', 'left', 'right'];
  const ACTIONS = MOVES.concat(MOVES.map(d => 'pulse:' + d), ['toggle']);

  const LIGHT_POLE = { i: null, n: 'N', s: 'S' };
  const HEAVY_POLE = { A: null, N: 'N', S: 'S' };

  function parseLevel(def) {
    const rows = def.map;
    const h = rows.length;
    const w = Math.max.apply(null, rows.map(r => r.length));
    const grid = [];
    const objects = [];
    const plates = [];
    let start = null;
    let exit = null;
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        let c = rows[y][x] === undefined ? '#' : rows[y][x];
        if (c === '@') { start = { x, y }; c = '.'; }
        else if (c in LIGHT_POLE) { objects.push({ id: objects.length, type: c, x, y }); c = '.'; }
        if (c === '_') plates.push({ x, y });
        if (c === 'X') exit = { x, y };
        row.push(c);
      }
      grid.push(row);
    }
    if (!start) throw new Error('Level "' + def.name + '" has no start (@)');
    if (!exit) throw new Error('Level "' + def.name + '" has no exit (X)');
    return Object.assign({}, def, {
      w, h, grid, plates, start, exit,
      startObjects: objects,
      startPole: def.pole || 'N',
    });
  }

  function initialState(level) {
    return {
      px: level.start.x, py: level.start.y, pole: level.startPole,
      objects: level.startObjects.map(o => Object.assign({}, o)),
      filled: [], dead: false, won: false, events: [],
    };
  }

  function clone(s) {
    return {
      px: s.px, py: s.py, pole: s.pole,
      objects: s.objects.map(o => Object.assign({}, o)),
      filled: s.filled.slice(), dead: false, won: false, events: [],
    };
  }

  // Canonical key: blocks of the same type are interchangeable.
  function key(s) {
    const objs = s.objects.map(o => o.type + o.x + ',' + o.y).sort().join(';');
    const filled = s.filled.slice().sort().join(';');
    return s.px + ',' + s.py + ',' + s.pole + '|' + objs + '|' + filled;
  }

  const inBounds = (L, x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h;
  const isFilled = (s, x, y) => s.filled.indexOf(x + ',' + y) !== -1;

  // Static tile with filled pits resolved to floor.
  function terrain(L, s, x, y) {
    const t = L.grid[y][x];
    return t === '~' && isFilled(s, x, y) ? '.' : t;
  }

  function objectAt(s, x, y) {
    for (let i = 0; i < s.objects.length; i++) {
      const o = s.objects[i];
      if (o.x === x && o.y === y) return o;
    }
    return null;
  }

  // Doors are open only while every plate is held down. `mover` is the body about
  // to occupy (nx, ny); its previous position no longer counts, so stepping off a
  // plate straight into the door you were holding open is not possible.
  function doorsOpen(L, s, mover, nx, ny) {
    if (L.plates.length === 0) return false;
    return L.plates.every(p => {
      if (nx === p.x && ny === p.y) return true;
      if (mover !== 'player' && s.px === p.x && s.py === p.y) return true;
      return s.objects.some(o => o !== mover && o.x === p.x && o.y === p.y);
    });
  }

  // Can `mover` occupy (x, y)?
  //   true   yes
  //   false  no
  //   'fall' a block would drop into a pit here
  //   'pass' a flying Magnus crosses a pit here (and dies if he stops on it)
  function canEnter(L, s, mover, x, y, flying) {
    if (!inBounds(L, x, y)) return false;
    const t = terrain(L, s, x, y);
    if (t === '#' || t === '=' || t in HEAVY_POLE) return false;
    if (t === 'D' && !doorsOpen(L, s, mover, x, y)) return false;
    if (objectAt(s, x, y)) return false;
    if (mover !== 'player' && s.px === x && s.py === y) return false;
    if (t === '~') {
      if (mover === 'player') return flying ? 'pass' : false;
      return 'fall';
    }
    return true;
  }

  function slideObject(L, s, obj, dx, dy) {
    const from = { x: obj.x, y: obj.y };
    let moved = false;
    for (;;) {
      const nx = obj.x + dx, ny = obj.y + dy;
      const r = canEnter(L, s, obj, nx, ny, false);
      if (r === true) { obj.x = nx; obj.y = ny; moved = true; continue; }
      if (r === 'fall') {
        s.filled.push(nx + ',' + ny);
        s.objects = s.objects.filter(o => o !== obj);
        s.events.push({ type: 'slide', id: obj.id, objType: obj.type, from, to: { x: nx, y: ny }, fell: true });
        return true;
      }
      break;
    }
    if (moved) s.events.push({ type: 'slide', id: obj.id, objType: obj.type, from, to: { x: obj.x, y: obj.y } });
    return moved;
  }

  function flyPlayer(L, s, dx, dy, why) {
    const from = { x: s.px, y: s.py };
    let moved = false;
    for (;;) {
      const nx = s.px + dx, ny = s.py + dy;
      const r = canEnter(L, s, 'player', nx, ny, true);
      if (r === true || r === 'pass') { s.px = nx; s.py = ny; moved = true; continue; }
      break;
    }
    if (moved) {
      s.events.push({ type: 'fly', why, from, to: { x: s.px, y: s.py } });
      if (terrain(L, s, s.px, s.py) === '~') {
        s.dead = true;
        s.events.push({ type: 'fell', x: s.px, y: s.py });
      }
    }
    return moved;
  }

  // First body the field meets in direction (dx, dy), and how it would react.
  // Floor, pits, plates, the exit, open doors and glass all let the field through.
  function target(L, s, dx, dy) {
    let x = s.px + dx, y = s.py + dy;
    while (inBounds(L, x, y)) {
      const t = terrain(L, s, x, y);
      if (t === '#') return null;
      if (t === 'D' && !doorsOpen(L, s, null)) return null;
      const obj = objectAt(s, x, y);
      if (obj) {
        const pole = LIGHT_POLE[obj.type];
        return { x, y, kind: 'light', obj, mode: pole && pole === s.pole ? 'repel' : 'attract' };
      }
      if (t in HEAVY_POLE) {
        const pole = HEAVY_POLE[t];
        return { x, y, kind: 'heavy', tile: t, mode: pole && pole === s.pole ? 'repel' : 'attract' };
      }
      x += dx; y += dy;
    }
    return null;
  }

  function pulse(L, s, dx, dy) {
    const hit = target(L, s, dx, dy);
    s.events.push({ type: 'pulse', dx, dy, hit: hit && { x: hit.x, y: hit.y, mode: hit.mode, kind: hit.kind } });
    if (!hit) return;
    if (hit.kind === 'heavy') {
      // Force is mutual, and the heavy body wins: Magnus is the one who moves.
      if (hit.mode === 'attract') flyPlayer(L, s, dx, dy, 'zip');
      else flyPlayer(L, s, -dx, -dy, 'launch');
      return;
    }
    if (hit.mode === 'attract') { slideObject(L, s, hit.obj, -dx, -dy); return; }
    // Repel: the block flies away. If it is braced and cannot move, the push
    // comes back on Magnus instead.
    if (!slideObject(L, s, hit.obj, dx, dy)) flyPlayer(L, s, -dx, -dy, 'recoil');
  }

  function step(L, s0, action) {
    if (s0.dead || s0.won) return s0;
    const s = clone(s0);
    if (action === 'toggle') {
      s.pole = s.pole === 'N' ? 'S' : 'N';
      s.events.push({ type: 'toggle', pole: s.pole });
    } else if (DIRS[action]) {
      const dx = DIRS[action][0], dy = DIRS[action][1];
      if (canEnter(L, s, 'player', s.px + dx, s.py + dy, false) === true) {
        s.events.push({ type: 'walk', from: { x: s.px, y: s.py }, to: { x: s.px + dx, y: s.py + dy } });
        s.px += dx; s.py += dy;
      } else {
        s.events.push({ type: 'bump', dx, dy });
      }
    } else if (action.indexOf('pulse:') === 0) {
      const d = DIRS[action.slice(6)];
      pulse(L, s, d[0], d[1]);
    } else {
      throw new Error('Unknown action ' + action);
    }
    if (!s.dead && L.grid[s.py][s.px] === 'X') s.won = true;
    return s;
  }

  // Breadth-first search for the shortest action sequence to the exit.
  function solve(L, maxStates) {
    maxStates = maxStates || 3000000;
    const start = initialState(L);
    const seen = new Map();
    seen.set(key(start), null);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const s = queue[head++];
      const sk = key(s);
      for (let i = 0; i < ACTIONS.length; i++) {
        const a = ACTIONS[i];
        const n = step(L, s, a);
        if (n.dead) continue;
        const k = key(n);
        if (seen.has(k)) continue;
        seen.set(k, { prev: sk, action: a });
        if (n.won) {
          const path = [];
          let cur = k;
          while (seen.get(cur)) { path.push(seen.get(cur).action); cur = seen.get(cur).prev; }
          return { solution: path.reverse(), explored: seen.size };
        }
        queue.push(n);
        if (seen.size > maxStates) return { solution: null, explored: seen.size, aborted: true };
      }
    }
    return { solution: null, explored: seen.size };
  }

  const api = {
    DIRS, MOVES, ACTIONS, LIGHT_POLE, HEAVY_POLE,
    parseLevel, initialState, step, key, target, terrain, objectAt, doorsOpen, canEnter, solve,
  };
  root.MagnusEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
