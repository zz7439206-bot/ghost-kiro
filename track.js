/* 賽道：依地圖設定建立幾何、取樣、加速區、跳台、障礙物、道具箱與場景 */
(function () {
  'use strict';
  const GK = window.GK;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  GK.mulberry32 = mulberry32;

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  GK.canvasTex = canvasTex;

  class Track {
    constructor(map) {
      this.map = map;
      this.width = map.width || 26;
      this.half = this.width / 2;
      this.limit = this.half + 1.2; // 車輛可行駛的最大橫向位置（碰到護欄）
      this.sc = this.width / 26;
      const ctrl = map.ctrl || GK.genCtrl(map.gen);
      const pts = ctrl.map((p) => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      this.length = curve.getLength();
      const N = (this.N = Math.round(this.length / 1.8));
      this.ds = this.length / N;
      const sp = curve.getSpacedPoints(N);
      this.px = new Float32Array(N); this.pz = new Float32Array(N);
      this.fx = new Float32Array(N); this.fz = new Float32Array(N);
      this.kap = new Float32Array(N);
      for (let i = 0; i < N; i++) { this.px[i] = sp[i].x; this.pz[i] = sp[i].z; }
      for (let i = 0; i < N; i++) {
        const a = sp[(i + N - 1) % N], b = sp[(i + 1) % N];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        this.fx[i] = dx / l; this.fz[i] = dz / l;
      }
      // 曲率（左轉為正），再做平滑
      const raw = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = (i + N - 1) % N, b = (i + 1) % N;
        raw[i] = (this.fz[a] * this.fx[b] - this.fx[a] * this.fz[b]) / (2 * this.ds);
      }
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -6; k <= 6; k++) s += raw[(i + k + N) % N];
        this.kap[i] = s / 13;
      }
      this.pads = []; this.ramps = []; this.obstacles = []; this.boxes = []; this.surfaces = [];
      this.skyExtras = [];
      this._f = {};
    }

    // 取得賽道上 s 位置的座標框架，結果寫入 o
    frame(s, o) {
      const N = this.N;
      const u = GK.mod(s, this.length) / this.ds;
      let i0 = Math.floor(u);
      const t = u - i0;
      i0 %= N;
      const i1 = (i0 + 1) % N;
      o.x = this.px[i0] + (this.px[i1] - this.px[i0]) * t;
      o.z = this.pz[i0] + (this.pz[i1] - this.pz[i0]) * t;
      const fx = this.fx[i0] + (this.fx[i1] - this.fx[i0]) * t;
      const fz = this.fz[i0] + (this.fz[i1] - this.fz[i0]) * t;
      const l = Math.hypot(fx, fz) || 1;
      o.fx = fx / l; o.fz = fz / l;
      o.rx = -o.fz; o.rz = o.fx; // 右方向
      o.k = this.kap[i0] + (this.kap[i1] - this.kap[i0]) * t;
      return o;
    }

    kappaAt(s) {
      const i = Math.floor(GK.mod(s, this.length) / this.ds) % this.N;
      return this.kap[i];
    }

    // 世界座標：賽道位置 s 與橫向偏移 lat
    place(s, lat, out) {
      const f = this.frame(s, this._f);
      out.x = f.x + f.rx * lat;
      out.z = f.z + f.rz * lat;
      out.fx = f.fx; out.fz = f.fz;
      return out;
    }

    // 地面材質：回傳該位置的速度、抓地係數與重力係數（共用物件，請勿保存）
    surfaceAt(s, lat) {
      const o = this._surf || (this._surf = { speed: 1, grip: 1, grav: 1, type: '' });
      o.speed = 1; o.grip = 1; o.grav = 1; o.type = '';
      const m = GK.mod(s, this.length);
      for (const f of this.surfaces) {
        if (m >= f.s0 && m <= f.s1 && lat >= f.l0 && lat <= f.l1) { o.speed = f.speed; o.grip = f.grip; o.grav = f.grav; o.type = f.type; return o; }
      }
      if (Math.abs(lat) > this.half) { o.speed = 0.9; o.grip = 0.85; o.type = 'curb'; }
      return o;
    }

    // ---------- 賽道物件資料 ----------
    layoutFixed() {
      const L = this.length, m = this.map, sc = this.sc;
      this.padDefs = m.pads.map((a) => ({ s: L * a[0], lat: a[1] * sc, len: 12, wid: 9 }));
      this.rampDefs = m.ramps.map((a) => ({ s: L * a[0], lat: a[1] * sc, len: 9, wid: 10, h: 2.4 }));
      this.pads = this.padDefs;
      this.ramps = this.rampDefs;
      this.surfaces = m.surfaces.map((f) => Object.assign({ type: f.type, s0: L * f.s[0], s1: L * f.s[1], l0: f.l[0], l1: f.l[1] }, GK.SURFACES[f.type]));
      this.boxDefs = [];
      m.boxes.forEach((f) => [-7, 0, 7].forEach((lat) => this.boxDefs.push({ s: L * f, lat: lat * sc })));
    }

    // 重新佈置障礙物與道具箱
    resetObjects(endless) {
      const L = this.length, m = this.map;
      const rng = endless ? Math.random : mulberry32(11 + m.id.length * 7);
      const count = endless ? m.obst.endless : m.obst.count;
      const types = m.obst.types;
      const placed = [];
      this.obstacles.forEach((o, i) => {
        o.enabled = i < count;
        o.hit = false; o.mv = null;
        o.mesh.visible = o.enabled;
        if (!o.enabled) return;
        for (let tries = 0; tries < 30; tries++) {
          const s = L * (0.06 + rng() * 0.9);
          const lat = (rng() * 2 - 1) * (this.half - 3);
          let ok = true;
          for (const p of this.pads) if (Math.abs(s - p.s) < 22) ok = false;
          for (const p of this.ramps) if (Math.abs(s - p.s) < 26) ok = false;
          for (const q of placed) if (Math.abs(s - q.s) < 14 && Math.abs(lat - q.lat) < 6) ok = false;
          if (ok || tries === 29) { this.setObstacle(o, s, lat, types[Math.floor(rng() * types.length)]); break; }
        }
        placed.push(o);
      });
      // 動態障礙物：左右來回移動
      if (!endless && m.obst.movers) {
        let k = 0;
        for (let i = 1; i < count && k < m.obst.movers; i += Math.max(2, Math.floor(count / m.obst.movers))) {
          const o = this.obstacles[i];
          if (o.type === 'bounce') continue;
          o.mv = { base: 0, amp: 3.5 + rng() * 2.5, spd: 1 + rng() * 0.8, ph: rng() * 6 };
          k++;
        }
      }
      this.boxes.forEach((b) => {
        b.active = true; b.respawn = 0; b.flyT = 0; b.flyTo = null;
        b.mesh.visible = true; b.mesh.scale.setScalar(1);
        b.mesh.position.set(b.x, 1.9, b.z);
      });
    }

    setObstacle(o, s, lat, type) {
      o.s = GK.mod(s, this.length); o.lat = lat; o.type = type; o.mv = null;
      o.r = type === 'cone' ? 1.2 : type === 'barrel' ? 1.35 : type === 'bounce' ? 1.5 : 1.55;
      o.h = type === 'cone' ? 2.4 : 2.3;
      o.hit = false; o.hitT = 0;
      const p = this.place(o.s, lat, {});
      o.x = p.x; o.z = p.z;
      o.mesh.position.set(p.x, 0, p.z);
      o.mesh.rotation.set(0, Math.atan2(p.fx, p.fz), 0);
      ['cone', 'barrel', 'crate', 'bounce'].forEach((k) => { o.parts[k].visible = type === k; });
      o.mesh.visible = true;
    }

    knock(o, dir) {
      o.hit = true; o.hitT = 0;
      o.vx = (Math.random() - 0.5) * 14 + dir * 8; o.vz = (Math.random() - 0.5) * 14; o.vy = 13;
    }

    // 無盡模式：把落在後方的障礙物搬到前方
    recycleObstacles(P) {
      const L = this.length, types = this.map.obst.types;
      for (const o of this.obstacles) {
        if (!o.enabled) continue;
        const d = GK.wrapDiff(o.s, P, L);
        if (d < -70) {
          this.setObstacle(o, P + GK.rand(240, 620), (Math.random() * 2 - 1) * (this.half - 3), GK.pick(types));
        }
      }
    }

    // 每格更新：道具箱旋轉、障礙物移動與被撞飛動畫、熔岩流動
    update(dt, time) {
      for (const b of this.boxes) {
        if (!b.active) {
          if (b.flyT > 0 && b.flyTo) {
            b.flyT -= dt;
            const tp = b.flyTo.kart.root.position;
            b.mesh.position.x += (tp.x - b.mesh.position.x) * Math.min(1, dt * 14);
            b.mesh.position.z += (tp.z - b.mesh.position.z) * Math.min(1, dt * 14);
            b.mesh.position.y += (1.5 - b.mesh.position.y) * Math.min(1, dt * 10);
            b.mesh.scale.setScalar(Math.max(0.05, b.flyT / 0.35));
            if (b.flyT <= 0) { b.mesh.visible = false; b.flyTo = null; }
          }
          b.respawn -= dt;
          if (b.respawn <= 0 && b.flyT <= 0) {
            b.active = true; b.mesh.visible = true;
            b.mesh.scale.setScalar(1);
            b.mesh.position.set(b.x, 1.9, b.z);
          }
          continue;
        }
        b.mesh.rotation.y += dt * 2.2;
        b.mesh.rotation.x = Math.sin(time * 2 + b.s) * 0.2;
        b.mesh.position.y = 1.9 + Math.sin(time * 3 + b.s) * 0.28;
      }
      const tmp = this._tmpP || (this._tmpP = {});
      const lim = this.half - 3;
      for (const o of this.obstacles) {
        if (!o.enabled) continue;
        if (o.mv && !o.hit) {
          if (!o.mv.init) { o.mv.base = GK.clamp(o.lat, -lim + o.mv.amp, lim - o.mv.amp); o.mv.init = true; }
          o.lat = o.mv.base + Math.sin(time * o.mv.spd + o.mv.ph) * o.mv.amp;
          this.place(o.s, o.lat, tmp);
          o.mesh.position.set(tmp.x, 0, tmp.z);
        }
        if (o.type === 'bounce' && !o.hit) o.mesh.scale.y = 1 + Math.sin(time * 6 + o.s) * 0.08;
        if (!o.hit) continue;
        o.hitT += dt;
        const m = o.mesh;
        m.position.x += o.vx * dt; m.position.z += o.vz * dt; m.position.y += o.vy * dt;
        o.vy -= 32 * dt;
        m.rotation.x += dt * 9; m.rotation.z += dt * 6;
        if (o.hitT > 1.1) m.visible = false;
        if (o.hitT > 7) this.setObstacle(o, o.s, o.lat, o.type);
      }
      if (this.lavaTex) { this.lavaTex.offset.x = time * 0.004; this.lavaTex.offset.y = time * 0.003; }
    }

    // ---------- 建立 3D 場景 ----------
    _ribbon(latA, latB, yA, yB, colorFn, mat) {
      const N = this.N, pos = [], col = [], nor = [];
      const A = (i, lat, y) => {
        const k = i % N;
        return [this.px[k] - this.fz[k] * lat, y, this.pz[k] + this.fx[k] * lat];
      };
      for (let i = 0; i < N; i++) {
        const c = colorFn(i);
        if (!c) continue;
        const a0 = A(i, latA, yA), b0 = A(i, latB, yB), a1 = A(i + 1, latA, yA), b1 = A(i + 1, latB, yB);
        [a0, b0, a1, b0, b1, a1].forEach((v) => {
          pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); nor.push(0, 1, 0);
        });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      return m;
    }

    build(scene, quality) {
      this.layoutFixed();
      this.root = new THREE.Group();
      scene.add(this.root);
      const half = this.half, P = this.map.pal;
      const C = (h) => new THREE.Color(h);
      const sf = this.N / 900; // 取樣密度換算（以 900 點為基準）
      const seg = (n) => Math.max(1, Math.round(n * sf));

      // 路面
      const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const rc = P.road.map(C);
      const roadFn = P.rainbow
        ? (i) => rc[Math.floor(i / seg(6)) % rc.length]
        : (i) => rc[Math.floor(i / seg(5)) % 2];
      this.root.add(this._ribbon(-half, half, 0.02, 0.02, roadFn, roadMat));

      // 標線
      const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const white = C(0xf4f7ff), e1 = C(P.edge), e2 = C(P.edge2);
      this.root.add(this._ribbon(-0.3, 0.3, 0.03, 0.03, (i) => (Math.floor(i / seg(4)) % 2 ? white : null), lineMat));
      this.root.add(this._ribbon(-half + 0.5, -half + 1.1, 0.03, 0.03, () => e1, lineMat));
      this.root.add(this._ribbon(half - 1.1, half - 0.5, 0.03, 0.03, () => e2, lineMat));
      const lane = C(0x8d92d8);
      [-half / 3, half / 3].forEach((l) => this.root.add(this._ribbon(l - 0.12, l + 0.12, 0.03, 0.03, (i) => (Math.floor(i / seg(3)) % 3 === 0 ? lane : null), lineMat)));

      // 特殊地面
      this.surfaces.forEach((f) => {
        const i0 = Math.floor(f.s0 / this.ds), i1 = Math.ceil(f.s1 / this.ds);
        const c = C(f.c1), alt = C(f.c2);
        this.root.add(this._ribbon(f.l0, f.l1, 0.034, 0.034, (i) => (i >= i0 && i < i1 ? (Math.floor(i / seg(2)) % 2 ? c : alt) : null), lineMat));
      });

      // 路肩
      const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const cu = P.curb.map(C);
      const curbCol = (i) => cu[Math.floor(i / seg(3)) % 2];
      this.root.add(this._ribbon(half, half + 2.4, 0.05, 0.05, curbCol, curbMat));
      this.root.add(this._ribbon(-half - 2.4, -half, 0.05, 0.05, curbCol, curbMat));

      // 護欄
      const wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false });
      const wc = C(P.wall[0]), wc2 = C(P.wall[1]);
      const wallCol = (i) => (Math.floor(i / seg(30)) % 2 ? wc : wc2);
      const wl = half + 2.4;
      this.root.add(this._ribbon(wl, wl, 0, 1.7, wallCol, wallMat));
      this.root.add(this._ribbon(-wl, -wl, 0, 1.7, wallCol, wallMat));
      const topMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const topC = C(0xffffff);
      this.root.add(this._ribbon(wl - 0.25, wl + 0.25, 1.7, 1.7, () => topC, topMat));
      this.root.add(this._ribbon(-wl - 0.25, -wl + 0.25, 1.7, 1.7, () => topC, topMat));

      // 地面（太空沒有地面）
      if (P.ground) {
        const isLava = this.map.theme === 'lava';
        const tex = canvasTex(256, 256, (g, w, h) => {
          g.fillStyle = P.ground[0]; g.fillRect(0, 0, w, h);
          if (isLava) {
            const rng = mulberry32(3);
            g.fillStyle = P.ground[1]; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 46; i++) {
              g.fillStyle = 'rgba(40,12,10,' + (0.6 + rng() * 0.3) + ')';
              g.beginPath(); g.ellipse(rng() * w, rng() * h, 10 + rng() * 26, 6 + rng() * 16, rng() * 3, 0, 6.3); g.fill();
            }
          } else if (P.gridLine) {
            g.strokeStyle = P.gridLine; g.lineWidth = 3; g.globalAlpha = 0.7;
            g.strokeRect(0, 0, w, h); g.globalAlpha = 1;
          } else {
            g.fillStyle = P.ground[1]; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
          }
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(isLava ? 90 : 160, isLava ? 90 : 160);
        const gm = isLava ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), gm);
        ground.rotation.x = -Math.PI / 2; ground.position.y = -0.3;
        this.root.add(ground);
        if (isLava) this.lavaTex = tex;
      }

      this._buildStartLine();
      this._buildPads();
      this._buildRamps();
      this._buildBoxes();
      this._buildObstacles();
      this.skyExtras = GK.buildScenery(this, quality) || [];
      this.resetObjects(false);
    }

    dispose(scene) {
      scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }

    _alignedGroup(s, lat) {
      const g = new THREE.Group();
      const p = this.place(s, lat, {});
      g.position.set(p.x, 0, p.z);
      g.rotation.y = Math.atan2(p.fx, p.fz);
      this.root.add(g);
      return g;
    }

    _buildStartLine() {
      const P = this.map.pal;
      const tex = canvasTex(256, 64, (g, w, h) => {
        const n = 16, cw = w / n, ch = h / 4;
        for (let y = 0; y < 4; y++) for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * cw, y * ch, cw, ch);
        }
      });
      const g = this._alignedGroup(0, 0);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(this.width, 4), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      line.rotation.x = -Math.PI / 2; line.position.y = 0.06;
      g.add(line);
      const pillarMat = new THREE.MeshLambertMaterial({ color: 0x5a4fd6, emissive: 0x1b1566 });
      [-1, 1].forEach((sd) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 11, 10), pillarMat);
        p.position.set(sd * (this.half + 3.4), 5.5, 0); g.add(p);
      });
      const c1 = '#' + new THREE.Color(P.wall[0]).getHexString(), c2 = '#' + new THREE.Color(P.wall[1]).getHexString();
      const bannerTex = canvasTex(512, 96, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, '#6a3df0'); gr.addColorStop(0.5, c2); gr.addColorStop(1, c1);
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.font = 'italic 900 52px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('GHOST KIRO', w / 2, h / 2 + 3);
      });
      const bm = new THREE.MeshBasicMaterial({ map: bannerTex });
      const plain = new THREE.MeshLambertMaterial({ color: 0x2a2470 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(this.width + 8, 4, 1.2), [plain, plain, plain, plain, bm, bm]);
      beam.position.set(0, 11, 0); g.add(beam);
    }

    _buildPads() {
      const tex = canvasTex(128, 192, (g, w, h) => {
        g.fillStyle = '#0b2a3a'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#b6ff3d'; g.lineWidth = 16; g.lineJoin = 'miter';
        for (let i = 0; i < 3; i++) {
          const y = 22 + i * 56;
          g.beginPath(); g.moveTo(14, y); g.lineTo(w / 2, y + 36); g.lineTo(w - 14, y); g.stroke();
        }
      });
      this.pads.forEach((p) => {
        const g = this._alignedGroup(p.s, p.lat);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(p.wid, p.len), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.07;
        g.add(m);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(p.wid + 1.6, p.len + 1.6), new THREE.MeshBasicMaterial({ color: 0xb6ff3d, transparent: true, opacity: 0.25, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2; glow.position.y = 0.065;
        g.add(glow);
      });
    }

    _buildRamps() {
      const mat = new THREE.MeshLambertMaterial({ color: 0xff9a2e, emissive: 0x552200 });
      const stripe = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const supMat = new THREE.MeshLambertMaterial({ color: 0x7a3d00 });
      this.ramps.forEach((r) => {
        const g = this._alignedGroup(r.s, r.lat);
        const ang = Math.atan2(r.h, r.len);
        const slabLen = Math.hypot(r.h, r.len);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(r.wid, 0.4, slabLen), mat);
        slab.position.set(0, r.h / 2 - 0.2, 0);
        slab.rotation.x = -ang;
        g.add(slab);
        for (let i = -1; i <= 1; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(r.wid * 0.9, 0.06, 0.7), stripe);
          const k = i * 0.28;
          st.position.set(0, r.h / 2 + k * r.h + 0.02, k * r.len);
          st.rotation.x = -ang;
          g.add(st);
        }
        const side = new THREE.Shape();
        side.moveTo(-r.len / 2, 0); side.lineTo(r.len / 2, 0); side.lineTo(r.len / 2, r.h); side.lineTo(-r.len / 2, 0);
        const sg = new THREE.ExtrudeGeometry(side, { depth: 0.4, bevelEnabled: false });
        [-1, 1].forEach((sd) => {
          const m = new THREE.Mesh(sg, supMat);
          m.rotation.y = -Math.PI / 2;
          m.position.set(sd * (r.wid / 2) + (sd > 0 ? 0 : 0.4), 0, 0);
          g.add(m);
        });
      });
    }

    _buildBoxes() {
      const tex = canvasTex(128, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#ff5fd0'); gr.addColorStop(0.5, '#ffd93d'); gr.addColorStop(1, '#3dd6ff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
        g.fillStyle = '#fff'; g.font = '900 86px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8;
        g.fillText('?', w / 2, h / 2 + 6);
      });
      const geo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const outMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.35 });
      this.boxes = this.boxDefs.map((d) => {
        const p = this.place(d.s, d.lat, {});
        const mesh = new THREE.Mesh(geo, mat);
        const outline = new THREE.Mesh(geo, outMat);
        outline.scale.setScalar(1.25);
        mesh.add(outline);
        mesh.position.set(p.x, 1.9, p.z);
        this.root.add(mesh);
        return { s: d.s, lat: d.lat, x: p.x, z: p.z, mesh, active: true, respawn: 0, flyT: 0, flyTo: null };
      });
    }

    _buildObstacles() {
      const sk = this.map.skin, theme = this.map.theme;
      const em = (c, k) => new THREE.Color(c).multiplyScalar(k);
      const lam = (c, k) => new THREE.MeshLambertMaterial({ color: c, emissive: em(c, k == null ? 0.25 : k) });
      const coneG = (theme === 'ice' || theme === 'space') ? new THREE.OctahedronGeometry(1.25, 0) : new THREE.ConeGeometry(1.15, 2.4, theme === 'lava' ? 5 : 14);
      if (theme === 'ice' || theme === 'space') { coneG.scale(0.9, 1.5, 0.9); coneG.translate(0, 1.6, 0); } else coneG.translate(0, 1.2, 0);
      const ringG = new THREE.CylinderGeometry(0.72, 0.8, 0.45, 14); ringG.translate(0, 1.15, 0);
      const baseG = new THREE.BoxGeometry(2.5, 0.2, 2.5); baseG.translate(0, 0.1, 0);
      const barG = new THREE.CylinderGeometry(1.3, 1.3, 2.3, 16); barG.translate(0, 1.15, 0);
      const bandG = new THREE.CylinderGeometry(1.34, 1.34, 0.35, 16); bandG.translate(0, 1.15, 0);
      const crateG = new THREE.BoxGeometry(2.8, 2.5, 2.8); crateG.translate(0, 1.25, 0);
      const bounceG = new THREE.SphereGeometry(1.5, 16, 12); bounceG.translate(0, 1.5, 0);
      const springG = new THREE.CylinderGeometry(0.6, 1.1, 0.5, 12); springG.translate(0, 0.25, 0);
      const mCone = lam(sk.cone[0], theme === 'lava' ? 0.5 : 0.25), mRing = new THREE.MeshBasicMaterial({ color: sk.cone[1] });
      const mBar = lam(sk.barrel[0]), mBand = new THREE.MeshBasicMaterial({ color: sk.barrel[1] });
      const mCrate = lam(sk.crate[0]), mEdge = lam(sk.crate[1], 0.4);
      const mDark = new THREE.MeshLambertMaterial({ color: 0x3b2a66 });
      const mBounce = lam(sk.bounce[0], 0.45), mSpring = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
      for (let i = 0; i < 44; i++) {
        const mesh = new THREE.Group();
        const cone = new THREE.Group();
        cone.add(new THREE.Mesh(coneG, mCone));
        if (theme !== 'ice' && theme !== 'space') cone.add(new THREE.Mesh(ringG, mRing));
        cone.add(new THREE.Mesh(baseG, mDark));
        const barrel = new THREE.Group();
        barrel.add(new THREE.Mesh(barG, mBar), new THREE.Mesh(bandG, mBand));
        const crate = new THREE.Group();
        crate.add(new THREE.Mesh(crateG, mCrate));
        const edge = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, 2.9), mEdge); edge.position.y = 1.25; crate.add(edge);
        const bounce = new THREE.Group();
        bounce.add(new THREE.Mesh(bounceG, mBounce), new THREE.Mesh(springG, mSpring));
        mesh.add(cone, barrel, crate, bounce);
        this.root.add(mesh);
        this.obstacles.push({ s: 0, lat: 0, r: 1.3, h: 2.3, type: 'cone', enabled: false, hit: false, hitT: 0, vx: 0, vy: 0, vz: 0, x: 0, z: 0, mv: null, mesh, parts: { cone, barrel, crate, bounce } });
      }
    }

    nearTrack(x, z) {
      let best = 1e9;
      for (let i = 0; i < this.N; i += 3) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    }
  }

  GK.Track = Track;
})();
