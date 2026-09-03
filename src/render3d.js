/*
 * Magnus — Three.js view of the grid.
 *
 * Purely presentational: it never decides what happens, it only animates the
 * events the engine produced. Grid (x, y) maps to world (x, 0, y); the camera
 * looks down the -z axis so row 0 is at the top of the screen.
 */
(function (root) {
  'use strict';

  const C = {
    bg: 0x0b0e14,
    floorA: 0x363c48, floorB: 0x2f3540,
    wall: 0x1d2230, wallTop: 0x222833,
    pit: 0x06090d, acid: 0x1d8f4a,
    glass: 0x9fe3ff,
    anchor: 0x8b95a5, anchorEdge: 0xc8d0dc,
    north: 0xe0483f, south: 0x3b82f6,
    iron: 0x6f7784, ironDark: 0x4a505b,
    plate: 0xf5c542, plateDown: 0xffe58a,
    door: 0xd97a2b, doorOpen: 0x3a2a1b,
    exit: 0x36d67b,
    attract: 0x5bf29a, repel: 0xff5fd2,
    skin: 0xd9c7b5, suit: 0x3a4250,
  };

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function labelTexture(THREE, text, bg, fg) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
    g.fillStyle = fg;
    g.font = `bold ${text.length > 1 ? 56 : 84}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

  class Renderer3D {
    constructor(THREE, canvas) {
      this.THREE = THREE;
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(C.bg);
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

      this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2420, 1.5));
      this.sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0008;
      this.scene.add(this.sun, this.sun.target);

      this.staticGroup = new THREE.Group();
      this.dynamicGroup = new THREE.Group();
      this.fxGroup = new THREE.Group();
      this.previewGroup = new THREE.Group();
      this.scene.add(this.staticGroup, this.dynamicGroup, this.fxGroup, this.previewGroup);

      this.tweens = [];
      this.objectMeshes = new Map();
      this.level = null;
      this.state = null;
      this.time = 0;
      this.materials = this._materials();
      this.geo = this._geometries();
      this.textures = {
        i: labelTexture(THREE, 'Fe', hex(C.iron), '#e6e9ee'),
        n: labelTexture(THREE, 'N', hex(C.north), '#ffffff'),
        s: labelTexture(THREE, 'S', hex(C.south), '#ffffff'),
      };
      this._buildPlayer();
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
    }

    _materials() {
      const { THREE } = this;
      const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.1 }, extra));
      return {
        floorA: std(C.floorA), floorB: std(C.floorB),
        wall: std(C.wall, { roughness: 0.95 }),
        acid: std(0x0f3a22, { emissive: C.acid, emissiveIntensity: 0.35, roughness: 0.25 }),
        pitWall: std(C.pit, { side: THREE.BackSide, roughness: 1 }),
        glass: new THREE.MeshPhysicalMaterial({ color: C.glass, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0, transmission: 0.2, side: THREE.DoubleSide }),
        anchor: std(C.anchor, { metalness: 0.75, roughness: 0.35 }),
        anchorEdge: std(C.anchorEdge, { metalness: 0.9, roughness: 0.25 }),
        north: std(C.north, { emissive: C.north, emissiveIntensity: 0.45 }),
        south: std(C.south, { emissive: C.south, emissiveIntensity: 0.45 }),
        iron: std(C.iron, { metalness: 0.6, roughness: 0.5 }),
        ironFill: std(C.ironDark, { metalness: 0.5, roughness: 0.7 }),
        plate: std(C.plate, { emissive: C.plate, emissiveIntensity: 0.15, metalness: 0.4 }),
        plateDown: std(C.plateDown, { emissive: C.plateDown, emissiveIntensity: 0.9, metalness: 0.4 }),
        door: std(C.door, { emissive: C.door, emissiveIntensity: 0.12, metalness: 0.5, roughness: 0.4 }),
        doorOpen: std(C.doorOpen, { metalness: 0.5 }),
        exit: std(C.exit, { emissive: C.exit, emissiveIntensity: 0.9 }),
        suit: std(C.suit, { metalness: 0.4, roughness: 0.5 }),
        skin: std(C.skin),
        visor: std(0x111318, { metalness: 0.8, roughness: 0.2 }),
      };
    }

    _geometries() {
      const { THREE } = this;
      return {
        floor: new THREE.BoxGeometry(0.98, 0.2, 0.98),
        wall: new THREE.BoxGeometry(1, 1, 1),
        glass: new THREE.BoxGeometry(0.9, 1, 0.9),
        acid: new THREE.BoxGeometry(1, 0.1, 1),
        pitWall: new THREE.BoxGeometry(1, 0.9, 1),
        anchor: new THREE.BoxGeometry(0.92, 1.05, 0.92),
        rivet: new THREE.SphereGeometry(0.06, 8, 8),
        pillar: new THREE.CylinderGeometry(0.34, 0.4, 1.1, 24),
        pillarCap: new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24),
        plate: new THREE.CylinderGeometry(0.34, 0.36, 0.08, 28),
        plateRing: new THREE.TorusGeometry(0.4, 0.035, 8, 40),
        door: new THREE.BoxGeometry(0.96, 1, 0.5),
        doorFrame: new THREE.BoxGeometry(0.96, 0.16, 0.5),
        exit: new THREE.CylinderGeometry(0.46, 0.46, 0.06, 32),
        beacon: new THREE.CylinderGeometry(0.06, 0.12, 1.2, 12, 1, true),
        crate: new THREE.BoxGeometry(0.76, 0.76, 0.76),
        target: new THREE.RingGeometry(0.3, 0.4, 32),
      };
    }

    _buildPlayer() {
      const { THREE } = this;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 6, 16), this.materials.suit);
      body.position.y = 0.52; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), this.materials.skin);
      head.position.y = 1.02; head.castShadow = true;
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), this.materials.visor);
      visor.position.y = 1.03; visor.rotation.x = Math.PI;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 10, 40), new THREE.MeshStandardMaterial({ color: C.north, emissive: C.north, emissiveIntensity: 1.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.16;
      const glow = new THREE.PointLight(C.north, 2.2, 3.2, 2);
      glow.position.y = 0.5;
      g.add(body, head, visor, ring, glow);
      g.userData = { ring, glow, body, head };
      this.player = g;
      this.dynamicGroup.add(g);
    }

    dispose() {
      window.removeEventListener('resize', this._onResize);
      this.renderer.dispose();
    }

    resize() {
      const parent = this.canvas.parentElement;
      const w = Math.max(320, parent.clientWidth);
      const h = Math.max(240, Math.round(Math.min(w * 0.68, window.innerHeight * 0.66)));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.level) this._frameCamera();
    }

    _frameCamera() {
      const L = this.level;
      const cx = (L.w - 1) / 2, cz = (L.h - 1) / 2;
      const fov = this.camera.fov * Math.PI / 180;
      const tilt = 0.95; // radians below horizontal
      const needH = (L.h + 1.2) / 2 / Math.tan(fov / 2);
      const needW = (L.w + 0.8) / 2 / Math.tan(fov / 2) / this.camera.aspect;
      const dist = Math.max(needH * 1.05, needW * 1.08);
      this.camera.position.set(cx, Math.sin(tilt) * dist, cz + Math.cos(tilt) * dist);
      this.camera.lookAt(cx, 0, cz);
      this.sun.position.set(cx - L.w * 0.45, Math.max(L.w, L.h) * 1.2, cz + L.h * 0.35);
      this.sun.target.position.set(cx, 0, cz);
      const s = this.sun.shadow.camera;
      const r = Math.max(L.w, L.h) * 0.8;
      s.left = -r; s.right = r; s.top = r; s.bottom = -r; s.near = 1; s.far = 80;
      s.updateProjectionMatrix();
    }

    // ---- level construction ---------------------------------------------------

    loadLevel(level, state) {
      const { THREE } = this;
      this.level = level;
      this.tweens = [];
      this._clear(this.staticGroup); this._clear(this.fxGroup); this._clear(this.previewGroup);
      for (const m of this.objectMeshes.values()) this.dynamicGroup.remove(m);
      this.objectMeshes.clear();
      this.doors = []; this.plates = []; this.pitFills = new Map(); this.acidTiles = [];

      const M = this.materials, G = this.geo;
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          const t = level.grid[y][x];
          if (t === '#') {
            const m = new THREE.Mesh(G.wall, M.wall);
            m.position.set(x, 0.5, y); m.receiveShadow = true; m.castShadow = true;
            this.staticGroup.add(m);
            continue;
          }
          if (t === '~') {
            // Inside-out box: we see the cavity's inner walls, so the trench reads as depth.
            const cavity = new THREE.Mesh(G.pitWall, M.pitWall);
            cavity.position.set(x, -0.45, y);
            const acid = new THREE.Mesh(G.acid, M.acid);
            acid.position.set(x, -0.82, y);
            this.staticGroup.add(cavity, acid);
            this.acidTiles.push(acid);
            const fill = new THREE.Mesh(G.floor, M.ironFill);
            fill.position.set(x, -0.1, y); fill.receiveShadow = true; fill.visible = false;
            this.staticGroup.add(fill);
            this.pitFills.set(x + ',' + y, fill);
            continue;
          }
          const floor = new THREE.Mesh(G.floor, (x + y) % 2 ? M.floorA : M.floorB);
          floor.position.set(x, -0.1, y); floor.receiveShadow = true;
          this.staticGroup.add(floor);

          if (t === '=') {
            const m = new THREE.Mesh(G.glass, M.glass);
            m.position.set(x, 0.5, y);
            this.staticGroup.add(m);
          } else if (t === 'A') {
            const m = new THREE.Mesh(G.anchor, M.anchor);
            m.position.set(x, 0.525, y); m.castShadow = true; m.receiveShadow = true;
            this.staticGroup.add(m);
            for (const [rx, rz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
              const r = new THREE.Mesh(G.rivet, M.anchorEdge);
              r.position.set(x + rx, 1.06, y + rz);
              this.staticGroup.add(r);
            }
          } else if (t === 'N' || t === 'S') {
            const mat = t === 'N' ? M.north : M.south;
            const m = new THREE.Mesh(G.pillar, mat);
            m.position.set(x, 0.55, y); m.castShadow = true;
            const cap = new THREE.Mesh(G.pillarCap, M.anchorEdge);
            cap.position.set(x, 1.12, y);
            const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: this.textures[t.toLowerCase()], transparent: true }));
            lbl.rotation.x = -Math.PI / 2; lbl.position.set(x, 1.17, y);
            this.staticGroup.add(m, cap, lbl);
          } else if (t === '_') {
            const ring = new THREE.Mesh(G.plateRing, M.plate);
            ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.02, y);
            const disc = new THREE.Mesh(G.plate, M.plate);
            disc.position.set(x, 0.04, y);
            this.staticGroup.add(ring, disc);
            this.plates.push({ x, y, ring, disc });
          } else if (t === 'D') {
            const m = new THREE.Mesh(G.door, M.door);
            m.position.set(x, 0.5, y); m.castShadow = true;
            const horizontal = level.grid[y][x - 1] === '#' && level.grid[y][x + 1] === '#';
            if (!horizontal) m.rotation.y = Math.PI / 2;
            this.staticGroup.add(m);
            this.doors.push({ x, y, mesh: m });
          } else if (t === 'X') {
            const m = new THREE.Mesh(G.exit, M.exit);
            m.position.set(x, 0.03, y);
            const beacon = new THREE.Mesh(G.beacon, new THREE.MeshBasicMaterial({ color: C.exit, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
            beacon.position.set(x, 0.65, y);
            this.staticGroup.add(m, beacon);
            this.exitBeacon = beacon;
          }
        }
      }

      for (const o of level.startObjects) this._makeObject(o);
      this.resize();
      this.syncState(state);
    }

    _makeObject(o) {
      const { THREE } = this;
      const mat = o.type === 'i' ? this.materials.iron : o.type === 'n' ? this.materials.north : this.materials.south;
      const mats = [mat, mat, new THREE.MeshStandardMaterial({ map: this.textures[o.type], roughness: 0.6, metalness: 0.3 }), mat, mat, mat];
      const m = new THREE.Mesh(this.geo.crate, mats);
      m.castShadow = true; m.receiveShadow = true;
      m.position.set(o.x, 0.38, o.y);
      m.userData = { id: o.id, type: o.type };
      this.dynamicGroup.add(m);
      this.objectMeshes.set(o.id, m);
      return m;
    }

    _clear(group) {
      while (group.children.length) {
        const c = group.children.pop();
        if (c.geometry && !Object.values(this.geo).includes(c.geometry)) c.geometry.dispose();
        if (c.material && !Array.isArray(c.material) && !Object.values(this.materials).includes(c.material)) c.material.dispose();
      }
    }

    // ---- state sync -----------------------------------------------------------

    // Snap everything to `state` with no animation (undo, restart, level load).
    syncState(state) {
      this.state = state;
      this.tweens = [];
      this._clear(this.fxGroup);
      this.player.position.set(state.px, 0, state.py);
      this.player.scale.setScalar(1);
      this.player.visible = true;
      this.player.traverse(o => { if (o.material && o.material.transparent) o.material.opacity = 1; });
      this._setPole(state.pole);
      const live = new Set(state.objects.map(o => o.id));
      for (const [id, m] of this.objectMeshes) {
        if (!live.has(id)) { m.visible = false; continue; }
        const o = state.objects.find(q => q.id === id);
        m.visible = true; m.position.set(o.x, 0.38, o.y); m.scale.setScalar(1);
      }
      this._syncTerrain(state);
    }

    _syncTerrain(state) {
      const E = root.MagnusEngine;
      for (const [k, fill] of this.pitFills) fill.visible = state.filled.includes(k);
      const open = E.doorsOpen(this.level, state, null);
      for (const d of this.doors) {
        d.mesh.material = open ? this.materials.doorOpen : this.materials.door;
        d.mesh.scale.y = open ? 0.16 : 1;
        d.mesh.position.y = open ? 0.08 : 0.5;
      }
      for (const p of this.plates) {
        const pressed = (state.px === p.x && state.py === p.y) || state.objects.some(o => o.x === p.x && o.y === p.y);
        p.disc.material = p.ring.material = pressed ? this.materials.plateDown : this.materials.plate;
        p.disc.position.y = pressed ? 0.0 : 0.04;
      }
    }

    _setPole(pole) {
      const col = pole === 'N' ? C.north : C.south;
      const { ring, glow } = this.player.userData;
      ring.material.color.setHex(col); ring.material.emissive.setHex(col);
      glow.color.setHex(col);
    }

    // Animate the transition described by next.events. Returns total duration (ms).
    animateStep(prev, next) {
      const { THREE } = this;
      this.state = next;
      this._clear(this.fxGroup);
      this.tweens = [];
      let t0 = 0, total = 0;
      const perTile = 75;

      for (const ev of next.events) {
        if (ev.type === 'toggle') {
          this._setPole(ev.pole);
          this._tween(this.player.scale, { x: 1.18, y: 0.86, z: 1.18 }, { x: 1, y: 1, z: 1 }, t0, 220, easeOut);
          total = Math.max(total, t0 + 220);
        } else if (ev.type === 'walk') {
          this._tween(this.player.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, 120, easeInOut, { hop: 0.12 });
          total = Math.max(total, t0 + 120);
        } else if (ev.type === 'bump') {
          this._tween(this.player.position, { x: next.px, z: next.py }, { x: next.px + ev.dx * 0.18, z: next.py + ev.dy * 0.18 }, 0, 70, easeOut, { yoyo: true });
          total = Math.max(total, 140);
        } else if (ev.type === 'pulse') {
          this._beam(ev, next);
          t0 = 90;
          total = Math.max(total, 260);
        } else if (ev.type === 'slide') {
          const m = this.objectMeshes.get(ev.id);
          const dist = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
          const dur = Math.min(420, 110 + dist * perTile);
          this._tween(m.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, dur, easeOut);
          if (ev.fell) {
            const k = ev.to.x + ',' + ev.to.y;
            this._tween(m.position, { y: 0.38 }, { y: -0.12 }, t0 + dur, 200, easeInOut, {
              onDone: () => { m.visible = false; const f = this.pitFills.get(k); if (f) f.visible = true; },
            });
            total = Math.max(total, t0 + dur + 200);
          } else total = Math.max(total, t0 + dur);
        } else if (ev.type === 'fly') {
          const dist = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
          const dur = Math.min(520, 140 + dist * perTile);
          this._tween(this.player.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, dur, easeOut, { hop: 0.55 });
          this.flyEnd = t0 + dur;
          total = Math.max(total, t0 + dur);
        } else if (ev.type === 'fell') {
          const start = this.flyEnd || 0;
          this._tween(this.player.position, { y: 0 }, { y: -1.6 }, start, 420, easeInOut);
          this._tween(this.player.scale, { x: 1, y: 1, z: 1 }, { x: 0.7, y: 0.7, z: 0.7 }, start, 420, easeInOut);
          total = Math.max(total, start + 420);
        }
      }
      // Terrain (doors, plates) reflects the final state once things have settled.
      this._at(total * 0.6, () => this._syncTerrain(next));
      return total;
    }

    _beam(ev, state) {
      const { THREE } = this;
      // The pulse leaves from where Magnus stands before anything in this step moves,
      // which is where his mesh still is.
      const from = new THREE.Vector3(this.player.position.x, 0.55, this.player.position.z);
      let len, color;
      if (ev.hit) {
        len = Math.abs(ev.hit.x - from.x) + Math.abs(ev.hit.y - from.z);
        color = ev.hit.mode === 'attract' ? C.attract : C.repel;
      } else {
        // Nothing to grab: show the field dying against the first wall.
        let x = Math.round(from.x) + ev.dx, y = Math.round(from.z) + ev.dy, n = 0;
        while (this.level.grid[y] && this.level.grid[y][x] && this.level.grid[y][x] !== '#' && this.level.grid[y][x] !== 'D') { x += ev.dx; y += ev.dy; n++; }
        len = Math.max(0.6, n + 0.5);
        color = 0x8891a3;
      }
      const geo = new THREE.BoxGeometry(len, 0.07, 0.07);
      geo.translate(len / 2, 0, 0);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
      const beam = new THREE.Mesh(geo, mat);
      beam.position.copy(from);
      beam.rotation.y = -Math.atan2(ev.dy, ev.dx);
      this.fxGroup.add(beam);
      this._tween(mat, { opacity: 0.95 }, { opacity: 0 }, 60, 240, easeOut);
      this._tween(beam.scale, { y: 1, z: 1 }, { y: 3.2, z: 3.2 }, 0, 300, easeOut);
    }

    _tween(target, from, to, delay, dur, ease, opts) {
      this.tweens.push({ target, from, to, start: this.time + delay, dur, ease, opts: opts || {}, done: false });
    }
    _at(delay, fn) { this.tweens.push({ target: null, start: this.time + delay, dur: 0, fn, done: false }); }

    // Dotted lines showing what each direction would hit right now.
    setPreview(targets) {
      const { THREE } = this;
      this._clear(this.previewGroup);
      for (const t of targets) {
        if (!t.hit) continue;
        const color = t.hit.mode === 'attract' ? C.attract : C.repel;
        const pts = [new THREE.Vector3(t.px, 0.5, t.py), new THREE.Vector3(t.hit.x, 0.5, t.hit.y)];
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.55 }));
        line.computeLineDistances();
        const ring = new THREE.Mesh(this.geo.target, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(t.hit.x, t.hit.kind === 'heavy' ? 1.2 : 0.8, t.hit.y);
        this.previewGroup.add(line, ring);
      }
    }

    // ---- frame ------------------------------------------------------------------

    render(now) {
      this.time = now;
      const keep = [];
      for (const tw of this.tweens) {
        if (now < tw.start) { keep.push(tw); continue; }
        if (tw.fn) { tw.fn(); continue; }
        const raw = tw.dur ? Math.min(1, (now - tw.start) / tw.dur) : 1;
        let k = tw.ease(raw);
        if (tw.opts.yoyo) k = Math.sin(raw * Math.PI);
        for (const p in tw.to) tw.target[p] = tw.from[p] + (tw.to[p] - tw.from[p]) * k;
        if (tw.opts.hop) tw.target.y = Math.sin(raw * Math.PI) * tw.opts.hop;
        if (raw < 1) keep.push(tw);
        else if (tw.opts.onDone) tw.opts.onDone();
      }
      this.tweens = keep;
      if (this.exitBeacon) { this.exitBeacon.material.opacity = 0.25 + 0.15 * Math.sin(now / 350); this.exitBeacon.rotation.y = now / 900; }
      this.materials.acid.emissiveIntensity = 0.3 + 0.1 * Math.sin(now / 420);
      this.player.userData.glow.intensity = 1.8 + 0.5 * Math.sin(now / 300);
      this.previewGroup.children.forEach((c, i) => { if (c.material && c.geometry.type === 'RingGeometry') c.material.opacity = 0.35 + 0.2 * Math.sin(now / 250 + i); });
      this.renderer.render(this.scene, this.camera);
    }

    get busy() { return this.tweens.some(t => !t.fn); }
  }

  root.MagnusRenderer3D = Renderer3D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
