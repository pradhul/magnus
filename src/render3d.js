/*
 * Magnus — Three.js view of the grid.
 *
 * Purely presentational: it never decides what happens, it only animates the
 * events the engine produced. Grid (x, y) maps to world (x, 0, y). An
 * orthographic camera looks nearly straight down so tiles stay axis-aligned.
 */
(function (root) {
  'use strict';

  const C = {
    sky: 0x8ec6e3,
    fog: 0x9dcee6,
    grassA: 0x4f9a4a, grassB: 0x428742, dirt: 0x8a6a42, meadow: 0x3d7a3a,
    water: 0x2a7a96, waterDeep: 0x16384a,
    rock: 0x8a8376, rockDark: 0x6a645a, moss: 0x3a6b38,
    bark: 0x4a3426, leaf: 0x2f6b32, leaf2: 0x4a8c3c,
    wood: 0x8b5a32, woodDark: 0x5c3a1e,
    crystal: 0xa8e4ff,
    iron: 0x6f7784, ironDark: 0x4a505b, ironBand: 0xc8d0dc,
    north: 0xe0483f, south: 0x3b82f6,
    plate: 0xc4a35a, plateDown: 0xe8d07a,
    door: 0x6b4228, doorOpen: 0x3d2818,
    exit: 0x36d67b,
    attract: 0x5bf29a, repel: 0xff5fd2,
    skin: 0xd4b89a, shirt: 0x4a5c3a, pants: 0x3a4534, visor: 0x1a2228,
  };

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function mulberry32(a) {
    return function () {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function labelTexture(THREE, text, bg, fg) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
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
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(C.sky);
      this.scene.fog = new THREE.Fog(C.fog, 44, 72);
      this.camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 120);

      this.hemi = new THREE.HemisphereLight(0xd7eef8, 0x3d5c32, 1.35);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff1c8, 2.4);
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
      this.pose = { mode: 'idle', t0: 0, dur: 1 };
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
      this._ro = (typeof ResizeObserver !== 'undefined')
        ? new ResizeObserver(() => this.resize())
        : null;
      if (this._ro) this._ro.observe(canvas.parentElement || canvas);
    }

    _materials() {
      const { THREE } = this;
      const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05 }, extra));
      return {
        grassA: std(C.grassA, { roughness: 0.95 }),
        grassB: std(C.grassB, { roughness: 0.95 }),
        dirt: std(C.dirt, { roughness: 1 }),
        meadow: std(C.meadow, { roughness: 1 }),
        water: std(C.water, { emissive: C.water, emissiveIntensity: 0.7, roughness: 0.18, metalness: 0.25 }),
        pitWall: std(C.dirt, { side: THREE.BackSide, roughness: 1 }),
        rock: std(C.rock, { roughness: 0.92 }),
        rockDark: std(C.rockDark, { roughness: 0.95 }),
        moss: std(C.moss, { roughness: 1 }),
        bark: std(C.bark, { roughness: 0.95 }),
        leaf: std(C.leaf, { roughness: 0.9 }),
        leaf2: std(C.leaf2, { roughness: 0.9 }),
        wood: std(C.wood, { roughness: 0.8 }),
        woodDark: std(C.woodDark, { roughness: 0.85 }),
        crystal: new THREE.MeshPhysicalMaterial({
          color: C.crystal, transparent: true, opacity: 0.38, roughness: 0.08,
          metalness: 0, transmission: 0.35, side: THREE.DoubleSide,
        }),
        iron: std(C.iron, { metalness: 0.65, roughness: 0.45 }),
        ironFill: std(C.ironDark, { metalness: 0.35, roughness: 0.7 }),
        ironBand: std(C.ironBand, { metalness: 0.85, roughness: 0.3 }),
        north: std(C.north, { emissive: C.north, emissiveIntensity: 0.45 }),
        south: std(C.south, { emissive: C.south, emissiveIntensity: 0.45 }),
        plate: std(C.plate, { emissive: C.plate, emissiveIntensity: 0.12, metalness: 0.2 }),
        plateDown: std(C.plateDown, { emissive: C.plateDown, emissiveIntensity: 0.55, metalness: 0.2 }),
        door: std(C.door, { roughness: 0.75 }),
        doorOpen: std(C.doorOpen, { roughness: 0.8 }),
        exit: std(C.exit, { emissive: C.exit, emissiveIntensity: 0.85 }),
        shirt: std(C.shirt, { roughness: 0.7 }),
        pants: std(C.pants, { roughness: 0.75 }),
        skin: std(C.skin, { roughness: 0.65 }),
        visor: std(C.visor, { metalness: 0.7, roughness: 0.25 }),
      };
    }

    _geometries() {
      const { THREE } = this;
      return {
        floor: new THREE.BoxGeometry(0.96, 0.16, 0.96),
        tuft: new THREE.ConeGeometry(0.08, 0.16, 5),
        rock: new THREE.DodecahedronGeometry(0.42, 0),
        log: new THREE.CylinderGeometry(0.16, 0.18, 0.95, 8),
        hedge: new THREE.BoxGeometry(0.92, 0.7, 0.92),
        water: new THREE.BoxGeometry(0.98, 0.06, 0.98),
        pitWall: new THREE.BoxGeometry(1, 0.9, 1),
        crystal: new THREE.BoxGeometry(0.72, 0.95, 0.18),
        boulder: new THREE.DodecahedronGeometry(0.48, 0),
        band: new THREE.TorusGeometry(0.38, 0.05, 8, 24),
        pillar: new THREE.CylinderGeometry(0.28, 0.36, 1.15, 7),
        pillarCap: new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8),
        plate: new THREE.CylinderGeometry(0.34, 0.36, 0.08, 20),
        plateRing: new THREE.TorusGeometry(0.4, 0.03, 6, 28),
        door: new THREE.BoxGeometry(0.92, 0.95, 0.16),
        slat: new THREE.BoxGeometry(0.08, 0.9, 0.05),
        exit: new THREE.TorusGeometry(0.38, 0.05, 8, 24),
        lantern: new THREE.SphereGeometry(0.12, 12, 10),
        pole: new THREE.CylinderGeometry(0.03, 0.04, 0.7, 8),
        crate: new THREE.BoxGeometry(0.7, 0.7, 0.7),
        target: new THREE.RingGeometry(0.3, 0.4, 28),
        trunk: new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8),
        canopy: new THREE.SphereGeometry(0.55, 10, 8),
        canopy2: new THREE.SphereGeometry(0.38, 8, 6),
      };
    }

    _cast(mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    _buildPlayer() {
      const { THREE } = this;
      const g = new THREE.Group();
      const hip = new THREE.Group();
      hip.position.y = 0.42;

      const pelvis = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.18), this.materials.pants));
      pelvis.position.y = 0.02;
      hip.add(pelvis);

      const torso = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.2), this.materials.shirt));
      torso.position.y = 0.24;
      const shoulders = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.2), this.materials.shirt));
      shoulders.position.y = 0.38;
      hip.add(torso, shoulders);

      const head = this._cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), this.materials.skin));
      head.position.y = 0.56;
      const visor = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.1), this.materials.visor));
      visor.position.set(0, 0.57, 0.12);
      hip.add(head, visor);

      const mkArm = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.26, 0.36, 0);
        const mesh = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), this.materials.shirt));
        mesh.position.y = -0.16;
        pivot.add(mesh);
        hip.add(pivot);
        return pivot;
      };
      const mkLeg = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.08, 0, 0);
        const mesh = this._cast(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), this.materials.pants));
        mesh.position.y = -0.21;
        pivot.add(mesh);
        hip.add(pivot);
        return pivot;
      };

      const leftArm = mkArm(-1), rightArm = mkArm(1);
      const leftLeg = mkLeg(-1), rightLeg = mkLeg(1);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.28, 0.045, 10, 28),
        new THREE.MeshStandardMaterial({ color: C.north, emissive: C.north, emissiveIntensity: 1.15, metalness: 0.4, roughness: 0.35 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      const glow = new THREE.PointLight(C.north, 1.6, 3.4, 2);
      glow.position.y = 0.45;

      g.add(hip, ring, glow);
      g.userData = { ring, glow, hip, torso, head, visor, leftArm, rightArm, leftLeg, rightLeg };
      this.player = g;
      this.dynamicGroup.add(g);
    }

    _resetLimbs() {
      const u = this.player.userData;
      u.leftArm.rotation.set(0, 0, 0);
      u.rightArm.rotation.set(0, 0, 0);
      u.leftLeg.rotation.set(0, 0, 0);
      u.rightLeg.rotation.set(0, 0, 0);
      u.hip.position.y = 0.42;
      u.torso.scale.set(1, 1, 1);
    }

    _face(dx, dy) {
      if (!dx && !dy) return;
      this.player.rotation.y = Math.atan2(dx, dy);
    }

    _tickPose(now) {
      const u = this.player.userData;
      const pose = this.pose;
      if (pose.mode === 'walk') {
        const raw = pose.dur ? Math.min(1, Math.max(0, (now - pose.t0) / pose.dur)) : 1;
        const swing = Math.sin(raw * Math.PI) * 0.7;
        u.leftLeg.rotation.x = swing;
        u.rightLeg.rotation.x = -swing;
        u.leftArm.rotation.x = -swing * 0.75;
        u.rightArm.rotation.x = swing * 0.75;
        u.hip.position.y = 0.42 + Math.abs(Math.sin(raw * Math.PI)) * 0.05;
      } else if (pose.mode === 'jump') {
        const raw = pose.dur ? Math.min(1, Math.max(0, (now - pose.t0) / pose.dur)) : 1;
        const tuck = Math.sin(raw * Math.PI);
        u.leftLeg.rotation.x = 1.05 * tuck;
        u.rightLeg.rotation.x = 1.05 * tuck;
        u.leftArm.rotation.x = -0.85 * tuck;
        u.rightArm.rotation.x = -0.85 * tuck;
        u.leftArm.rotation.z = 0.45 * tuck;
        u.rightArm.rotation.z = -0.45 * tuck;
        u.hip.position.y = 0.42;
      } else if (pose.mode === 'fall') {
        u.leftArm.rotation.z = 0.6;
        u.rightArm.rotation.z = -0.6;
        u.leftLeg.rotation.x = 0.4;
        u.rightLeg.rotation.x = -0.15;
      } else {
        const b = Math.sin(now / 720) * 0.012;
        u.hip.position.y = 0.42 + b;
        u.leftArm.rotation.set(0.08, 0, 0.05);
        u.rightArm.rotation.set(-0.06, 0, -0.05);
        u.leftLeg.rotation.set(0, 0, 0);
        u.rightLeg.rotation.set(0, 0, 0);
      }
    }

    dispose() {
      window.removeEventListener('resize', this._onResize);
      if (this._ro) this._ro.disconnect();
      this.renderer.dispose();
    }

    resize() {
      const parent = this.canvas.parentElement;
      const w = Math.max(1, parent ? parent.clientWidth : this.canvas.clientWidth);
      const h = Math.max(1, parent ? parent.clientHeight : this.canvas.clientHeight);
      this.renderer.setSize(w, h, false);
      this.viewW = w;
      this.viewH = h;
      if (this.level) this._frameCamera();
    }

    _frameCamera() {
      const L = this.level;
      const cx = (L.w - 1) / 2, cz = (L.h - 1) / 2;
      const tilt = 13 * Math.PI / 180;
      const dist = 36;
      this.camera.position.set(cx, Math.cos(tilt) * dist, cz + Math.sin(tilt) * dist);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(cx, 0, cz);

      const w = this.viewW || 1, h = this.viewH || 1;
      const aspect = w / h;
      const pad = 3.4;
      let halfW = (L.w + pad) / 2;
      let halfH = (L.h + pad) / 2;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;
      halfW *= 1.06;
      halfH *= 1.14;
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.near = 0.1;
      this.camera.far = 100;
      this.camera.updateProjectionMatrix();

      this.sun.position.set(cx - L.w * 0.55, Math.max(L.w, L.h) * 1.4, cz + L.h * 0.2);
      this.sun.target.position.set(cx, 0, cz);
      const s = this.sun.shadow.camera;
      const r = Math.max(L.w, L.h) * 0.95 + 4;
      s.left = -r; s.right = r; s.top = r; s.bottom = -r; s.near = 1; s.far = 90;
      s.updateProjectionMatrix();
    }

    // ---- level construction ---------------------------------------------------

    loadLevel(level, state) {
      const { THREE } = this;
      this.level = level;
      this.tweens = [];
      this.pose = { mode: 'idle', t0: 0, dur: 1 };
      this._clear(this.staticGroup); this._clear(this.fxGroup); this._clear(this.previewGroup);
      for (const m of this.objectMeshes.values()) this.dynamicGroup.remove(m);
      this.objectMeshes.clear();
      this.doors = []; this.plates = []; this.pitFills = new Map(); this.waterTiles = [];
      this.exitBeacon = null;

      const rand = mulberry32(hashStr(level.name || 'room'));
      const M = this.materials, G = this.geo;
      const cx = (level.w - 1) / 2, cz = (level.h - 1) / 2;

      const meadow = new THREE.Mesh(new THREE.CircleGeometry(Math.max(level.w, level.h) * 1.15 + 7, 40), M.meadow);
      meadow.rotation.x = -Math.PI / 2;
      meadow.position.set(cx, -0.22, cz);
      meadow.receiveShadow = true;
      this.staticGroup.add(meadow);

      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          const t = level.grid[y][x];
          if (t === '#') {
            this._addWall(x, y, rand);
            continue;
          }
          if (t === '~') {
            const bank = new THREE.Mesh(G.floor, M.dirt);
            bank.position.set(x, -0.12, y); bank.receiveShadow = true;
            const water = new THREE.Mesh(G.water, M.water);
            water.position.set(x, -0.02, y);
            this.staticGroup.add(bank, water);
            this.waterTiles.push(water);
            const fill = new THREE.Mesh(G.floor, M.dirt);
            fill.position.set(x, 0.02, y); fill.receiveShadow = true; fill.visible = false;
            this.staticGroup.add(fill);
            this.pitFills.set(x + ',' + y, fill);
            continue;
          }

          const grass = new THREE.Mesh(G.floor, (x + y) % 2 ? M.grassA : M.grassB);
          grass.position.set(x, -0.08, y); grass.receiveShadow = true;
          this.staticGroup.add(grass);
          if (t === '.' && rand() > 0.72) {
            const tuft = new THREE.Mesh(G.tuft, rand() > 0.5 ? M.leaf : M.leaf2);
            tuft.position.set(x + (rand() - 0.5) * 0.35, 0.04, y + (rand() - 0.5) * 0.35);
            tuft.rotation.y = rand() * Math.PI;
            this.staticGroup.add(tuft);
          }

          if (t === '=') {
            const m = new THREE.Mesh(G.crystal, M.crystal);
            m.position.set(x, 0.48, y);
            m.rotation.y = (rand() - 0.5) * 0.25;
            this.staticGroup.add(m);
          } else if (t === 'A') {
            const b = this._cast(new THREE.Mesh(G.boulder, M.rock));
            b.position.set(x, 0.42, y);
            b.rotation.set(rand(), rand(), rand());
            b.scale.set(1.05, 0.9 + rand() * 0.2, 1.0);
            const band = new THREE.Mesh(G.band, M.ironBand);
            band.position.set(x, 0.46, y);
            band.rotation.x = Math.PI / 2;
            this.staticGroup.add(b, band);
          } else if (t === 'N' || t === 'S') {
            const mat = t === 'N' ? M.north : M.south;
            const m = this._cast(new THREE.Mesh(G.pillar, mat));
            m.position.set(x, 0.58, y);
            const cap = new THREE.Mesh(G.pillarCap, M.rockDark);
            cap.position.set(x, 1.16, y);
            const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: this.textures[t.toLowerCase()], transparent: true }));
            lbl.rotation.x = -Math.PI / 2; lbl.position.set(x, 1.22, y);
            this.staticGroup.add(m, cap, lbl);
          } else if (t === '_') {
            const ring = new THREE.Mesh(G.plateRing, M.plate);
            ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.02, y);
            const disc = new THREE.Mesh(G.plate, M.plate);
            disc.position.set(x, 0.04, y);
            this.staticGroup.add(ring, disc);
            this.plates.push({ x, y, ring, disc });
          } else if (t === 'D') {
            const gate = this._cast(new THREE.Mesh(G.door, M.door));
            gate.position.set(x, 0.48, y);
            const horizontal = level.grid[y][x - 1] === '#' && level.grid[y][x + 1] === '#';
            if (!horizontal) gate.rotation.y = Math.PI / 2;
            this.staticGroup.add(gate);
            this.doors.push({ x, y, mesh: gate });
          } else if (t === 'X') {
            const ring = new THREE.Mesh(G.exit, new THREE.MeshBasicMaterial({ color: C.exit }));
            ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.04, y);
            const pole = new THREE.Mesh(G.pole, M.woodDark);
            pole.position.set(x, 0.38, y);
            const lantern = new THREE.Mesh(G.lantern, new THREE.MeshBasicMaterial({ color: C.exit, transparent: true, opacity: 0.7 }));
            lantern.position.set(x, 0.78, y);
            this.staticGroup.add(ring, pole, lantern);
            this.exitBeacon = lantern;
          }
        }
      }

      this._scatterNature(level, rand, cx, cz);
      for (const o of level.startObjects) this._makeObject(o);
      this.resize();
      this.syncState(state);
    }

    _addWall(x, y, rand) {
      const M = this.materials, G = this.geo;
      const kind = rand();
      if (kind < 0.35) {
        const h = this._cast(new THREE.Mesh(G.hedge, M.moss));
        h.position.set(x, 0.32, y);
        h.scale.set(1, 0.85 + rand() * 0.4, 1);
        this.staticGroup.add(h);
      } else if (kind < 0.55) {
        const log = this._cast(new THREE.Mesh(G.log, M.bark));
        log.position.set(x, 0.18, y);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = rand() * Math.PI;
        this.staticGroup.add(log);
      } else {
        const rock = this._cast(new THREE.Mesh(G.rock, rand() > 0.5 ? M.rock : M.rockDark));
        rock.position.set(x, 0.28 + rand() * 0.1, y);
        rock.rotation.set(rand() * 2, rand() * 2, rand() * 2);
        rock.scale.set(0.85 + rand() * 0.45, 0.7 + rand() * 0.5, 0.85 + rand() * 0.4);
        this.staticGroup.add(rock);
      }
    }

    _addTree(x, z, rand) {
      const M = this.materials, G = this.geo;
      const trunk = this._cast(new THREE.Mesh(G.trunk, M.bark));
      const h = 0.9 + rand() * 0.7;
      trunk.position.set(x, h / 2, z);
      trunk.scale.set(0.8 + rand() * 0.5, h / 1.1, 0.8 + rand() * 0.5);
      const canopy = this._cast(new THREE.Mesh(rand() > 0.5 ? G.canopy : G.canopy2, rand() > 0.4 ? M.leaf : M.leaf2));
      canopy.position.set(x, h + 0.15, z);
      canopy.scale.setScalar(0.85 + rand() * 0.55);
      this.staticGroup.add(trunk, canopy);
    }

    _scatterNature(level, rand, cx, cz) {
      const count = 14 + Math.floor(rand() * 10);
      for (let i = 0; i < count; i++) {
        const side = Math.floor(rand() * 4);
        let x, z;
        if (side === 0) { x = -1.4 - rand() * 3.2; z = rand() * level.h; }
        else if (side === 1) { x = level.w + 0.4 + rand() * 3.2; z = rand() * level.h; }
        else if (side === 2) { x = rand() * level.w; z = -1.4 - rand() * 3.2; }
        else { x = rand() * level.w; z = level.h + 0.4 + rand() * 3.2; }
        this._addTree(x, z, rand);
      }
      for (let i = 0; i < 8; i++) {
        const rock = this._cast(new THREE.Mesh(this.geo.rock, this.materials.rock));
        const ang = rand() * Math.PI * 2;
        const rad = Math.max(level.w, level.h) * 0.55 + 1.5 + rand() * 2;
        rock.position.set(cx + Math.cos(ang) * rad, 0.12, cz + Math.sin(ang) * rad);
        rock.scale.setScalar(0.4 + rand() * 0.7);
        rock.rotation.set(rand(), rand(), rand());
        this.staticGroup.add(rock);
      }
    }

    _makeObject(o) {
      const mat = o.type === 'i' ? this.materials.wood : o.type === 'n' ? this.materials.north : this.materials.south;
      const top = new this.THREE.MeshStandardMaterial({ map: this.textures[o.type], roughness: 0.55, metalness: 0.15 });
      const m = new this.THREE.Mesh(this.geo.crate, [mat, mat, top, mat, mat, mat]);
      m.castShadow = true; m.receiveShadow = true;
      m.position.set(o.x, 0.36, o.y);
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

    syncState(state) {
      this.state = state;
      this.tweens = [];
      this.pose = { mode: 'idle', t0: 0, dur: 1 };
      this._resetLimbs();
      this._clear(this.fxGroup);
      this.player.position.set(state.px, 0, state.py);
      this.player.scale.setScalar(1);
      this.player.visible = true;
      this._setPole(state.pole);
      const live = new Set(state.objects.map(o => o.id));
      for (const [id, m] of this.objectMeshes) {
        if (!live.has(id)) { m.visible = false; continue; }
        const o = state.objects.find(q => q.id === id);
        m.visible = true; m.position.set(o.x, 0.36, o.y); m.scale.setScalar(1);
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
        d.mesh.position.y = open ? 0.08 : 0.48;
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

    animateStep(prev, next) {
      this.state = next;
      this._clear(this.fxGroup);
      this.tweens = [];
      let t0 = 0, total = 0;
      const perTile = 75;
      const now = this.time;

      for (const ev of next.events) {
        if (ev.type === 'toggle') {
          this._setPole(ev.pole);
          this._tween(this.player.scale, { x: 1.18, y: 0.86, z: 1.18 }, { x: 1, y: 1, z: 1 }, t0, 220, easeOut);
          total = Math.max(total, t0 + 220);
        } else if (ev.type === 'walk') {
          this._face(ev.to.x - ev.from.x, ev.to.y - ev.from.y);
          this.pose = { mode: 'walk', t0: now + t0, dur: 320 };
          this._tween(this.player.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, 320, easeInOut);
          this._at(t0 + 320, () => { if (this.pose.mode === 'walk') this.pose = { mode: 'idle', t0: 0, dur: 1 }; });
          total = Math.max(total, t0 + 320);
        } else if (ev.type === 'bump') {
          this._face(ev.dx, ev.dy);
          this._tween(this.player.position, { x: next.px, z: next.py }, { x: next.px + ev.dx * 0.18, z: next.py + ev.dy * 0.18 }, 0, 70, easeOut, { yoyo: true });
          total = Math.max(total, 140);
        } else if (ev.type === 'pulse') {
          this._face(ev.dx, ev.dy);
          this._beam(ev);
          t0 = 90;
          total = Math.max(total, 260);
        } else if (ev.type === 'slide') {
          const m = this.objectMeshes.get(ev.id);
          const dist = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
          const dur = Math.min(420, 110 + dist * perTile);
          this._tween(m.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, dur, easeOut);
          if (ev.fell) {
            const k = ev.to.x + ',' + ev.to.y;
            this._tween(m.position, { y: 0.36 }, { y: -0.12 }, t0 + dur, 200, easeInOut, {
              onDone: () => { m.visible = false; const f = this.pitFills.get(k); if (f) f.visible = true; },
            });
            total = Math.max(total, t0 + dur + 200);
          } else total = Math.max(total, t0 + dur);
        } else if (ev.type === 'fly') {
          this._face(ev.to.x - ev.from.x, ev.to.y - ev.from.y);
          const dist = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
          const dur = Math.min(560, 180 + dist * perTile);
          this.pose = { mode: 'jump', t0: now + t0, dur };
          this._tween(this.player.position, { x: ev.from.x, z: ev.from.y }, { x: ev.to.x, z: ev.to.y }, t0, dur, easeOut, { hop: 0.7 });
          this._at(t0 + dur, () => { if (this.pose.mode === 'jump') this.pose = { mode: 'idle', t0: 0, dur: 1 }; this._resetLimbs(); });
          this.flyEnd = t0 + dur;
          total = Math.max(total, t0 + dur);
        } else if (ev.type === 'fell') {
          const start = this.flyEnd || 0;
          this.pose = { mode: 'fall', t0: now + start, dur: 420 };
          this._tween(this.player.position, { y: 0 }, { y: -1.6 }, start, 420, easeInOut);
          this._tween(this.player.scale, { x: 1, y: 1, z: 1 }, { x: 0.7, y: 0.7, z: 0.7 }, start, 420, easeInOut);
          total = Math.max(total, start + 420);
        }
      }
      this._at(total * 0.6, () => this._syncTerrain(next));
      return total;
    }

    _beam(ev) {
      const { THREE } = this;
      const from = new THREE.Vector3(this.player.position.x, 0.55, this.player.position.z);
      let len, color;
      if (ev.hit) {
        len = Math.abs(ev.hit.x - from.x) + Math.abs(ev.hit.y - from.z);
        color = ev.hit.mode === 'attract' ? C.attract : C.repel;
      } else {
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
      this._tickPose(now);
      if (this.exitBeacon) {
        this.exitBeacon.material.opacity = 0.45 + 0.25 * Math.sin(now / 350);
        this.exitBeacon.scale.setScalar(1 + 0.08 * Math.sin(now / 280));
      }
      if (this.materials.water) this.materials.water.emissiveIntensity = 0.4 + 0.12 * Math.sin(now / 480);
      this.player.userData.glow.intensity = 1.3 + 0.4 * Math.sin(now / 300);
      this.previewGroup.children.forEach((c, i) => {
        if (c.material && c.geometry && c.geometry.type === 'RingGeometry') {
          c.material.opacity = 0.35 + 0.2 * Math.sin(now / 250 + i);
        }
      });
      this.renderer.render(this.scene, this.camera);
    }

    get busy() { return this.tweens.some(t => !t.fn); }
  }

  root.MagnusRenderer3D = Renderer3D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
