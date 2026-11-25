/* 特效：粒子、幽靈殘影、幽靈紀錄與回放 */
(function () {
  'use strict';
  const GK = window.GK;

  // ---------- 粒子 ----------
  class Particles {
    constructor(scene, max, opts) {
      this.max = max || 600;
      this.i = 0;
      this.pos = new Float32Array(this.max * 3);
      this.col = new Float32Array(this.max * 3);
      this.vel = new Float32Array(this.max * 3);
      this.life = new Float32Array(this.max);
      this.life0 = new Float32Array(this.max);
      this.base = new Float32Array(this.max * 3);
      this.grav = new Float32Array(this.max);
      for (let k = 0; k < this.max; k++) this.pos[k * 3 + 1] = -999;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      this.geo = g;
      this.points = new THREE.Points(g, new THREE.PointsMaterial({
        size: (opts && opts.size) || 0.9, map: Particles.sprite(), alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      this.points.frustumCulled = false;
      scene.add(this.points);
    }
    static sprite() {
      if (Particles._tex) return Particles._tex;
      const c = document.createElement("canvas"); c.width = c.height = 32;
      const x = c.getContext("2d");
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      return (Particles._tex = new THREE.CanvasTexture(c));
    }
    emit(x, y, z, vx, vy, vz, life, r, g, b, grav) {
      const k = this.i; this.i = (this.i + 1) % this.max;
      const p = k * 3;
      this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
      this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
      this.base[p] = r; this.base[p + 1] = g; this.base[p + 2] = b;
      this.life[k] = this.life0[k] = life;
      this.grav[k] = grav || 0;
    }
    burst(x, y, z, n, speed, life, r, g, b, grav) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, e = Math.random() * 3.14 - 1.57;
        const s = speed * (0.4 + Math.random() * 0.6);
        this.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + speed * 0.3, Math.sin(a) * Math.cos(e) * s,
          life * (0.6 + Math.random() * 0.4), r, g, b, grav);
      }
    }
    update(dt) {
      for (let k = 0; k < this.max; k++) {
        if (this.life[k] <= 0) continue;
        this.life[k] -= dt;
        const p = k * 3;
        if (this.life[k] <= 0) {
          this.pos[p + 1] = -999; this.col[p] = this.col[p + 1] = this.col[p + 2] = 0;
          continue;
        }
        this.vel[p + 1] -= this.grav[k] * dt;
        this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
        const f = this.life[k] / this.life0[k];
        this.col[p] = this.base[p] * f; this.col[p + 1] = this.base[p + 1] * f; this.col[p + 2] = this.base[p + 2] * f;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
    clear() {
      for (let k = 0; k < this.max; k++) { this.life[k] = 0; this.pos[k * 3 + 1] = -999; this.col[k * 3] = this.col[k * 3 + 1] = this.col[k * 3 + 2] = 0; }
    }
  }

  // ---------- 環境粒子（雪、螢火蟲、火星…，跟隨攝影機） ----------
  const AMB_TYPES = {
    neonrain: { n: 260, size: 0.55, vel: [0, -70, 0], jitter: 4, cols: [[0.2, 0.9, 1], [1, 0.25, 0.85]] },
    fireflies: { n: 130, size: 1.3, vel: [0, 0.5, 0], jitter: 3, cols: [[0.8, 1, 0.3], [0.4, 1, 0.8]] },
    snow: { n: 320, size: 0.8, vel: [-3, -7, 1], jitter: 2, cols: [[1, 1, 1]] },
    dust: { n: 200, size: 0.7, vel: [0, 0, 0], jitter: 1.5, cols: [[0.8, 0.8, 1], [0.7, 0.6, 1]] },
    sprinkles: { n: 220, size: 1.0, vel: [0, -5, 0], jitter: 1.5, cols: [[1, 0.5, 0.7], [1, 0.9, 0.4], [0.5, 1, 0.7], [0.5, 0.8, 1]] },
    embers: { n: 220, size: 1.0, vel: [0, 6, 0], jitter: 3, cols: [[1, 0.5, 0.1], [1, 0.8, 0.2], [1, 0.3, 0.1]] },
  };
  class AmbientFX {
    constructor(scene) {
      this.scene = scene; this.points = null; this.box = [70, 40, 70];
    }
    setType(name, quality) {
      if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); this.points = null; }
      const T = AMB_TYPES[name];
      if (!T) return;
      const n = Math.round(T.n * (quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1));
      this.T = T; this.n = n;
      this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        this.pos[i * 3] = (Math.random() - 0.5) * this.box[0] * 2; this.pos[i * 3 + 1] = Math.random() * this.box[1] * 1.4 - 4; this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box[2] * 2;
        this.vel[i * 3] = T.vel[0] + (Math.random() - 0.5) * T.jitter; this.vel[i * 3 + 1] = T.vel[1] + (Math.random() - 0.5) * T.jitter * 0.5; this.vel[i * 3 + 2] = T.vel[2] + (Math.random() - 0.5) * T.jitter;
        const c = T.cols[i % T.cols.length];
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: T.size, map: Particles.sprite(), alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
      this.points.frustumCulled = false;
      this.scene.add(this.points);
      this.rel = new Float32Array(n * 3); // 相對攝影機的位置
      for (let i = 0; i < n * 3; i++) this.rel[i] = this.pos[i];
    }
    update(dt, cam) {
      if (!this.points) return;
      const b = this.box, n = this.n, rel = this.rel, v = this.vel, p = this.pos;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        rel[k] += v[k] * dt; rel[k + 1] += v[k + 1] * dt; rel[k + 2] += v[k + 2] * dt;
        if (rel[k] > b[0]) rel[k] -= b[0] * 2; else if (rel[k] < -b[0]) rel[k] += b[0] * 2;
        if (rel[k + 1] > b[1] * 1.1) rel[k + 1] -= b[1] * 1.4; else if (rel[k + 1] < -6) rel[k + 1] += b[1] * 1.4;
        if (rel[k + 2] > b[2]) rel[k + 2] -= b[2] * 2; else if (rel[k + 2] < -b[2]) rel[k + 2] += b[2] * 2;
        p[k] = cam.x + rel[k]; p[k + 1] = cam.y - 4 + rel[k + 1]; p[k + 2] = cam.z + rel[k + 2];
      }
      this.points.geometry.attributes.position.needsUpdate = true;
    }
    clear() { if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); this.points = null; } }
  }

  // ---------- 幽靈殘影 ----------
  class Trails {
    constructor(scene, n) {
      this.items = [];
      this.timer = 0;
      const geo = GK.ghostGeometry();
      for (let i = 0; i < (n || 12); i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x7fe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.visible = false;
        scene.add(m);
        this.items.push({ mesh: m, life: 0 });
      }
      this.next = 0;
    }
    spawn(racer, color) {
      const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
      const src = racer.kart.ghostG;
      src.updateWorldMatrix(true, false);
      it.mesh.matrix.copy(src.matrixWorld);
      it.mesh.matrixAutoUpdate = false;
      it.mesh.matrixWorldNeedsUpdate = true;
      it.mesh.material.color.setHex(color || 0x7fe9ff);
      it.mesh.visible = true;
      it.life = it.life0 = 0.38;
    }
    update(dt) {
      for (const it of this.items) {
        if (it.life <= 0) continue;
        it.life -= dt;
        if (it.life <= 0) { it.mesh.visible = false; continue; }
        it.mesh.material.opacity = 0.5 * (it.life / it.life0);
      }
    }
    clear() { this.items.forEach((it) => { it.life = 0; it.mesh.visible = false; }); }
  }

  // ---------- 幽靈紀錄 ----------
  const DT = 0.1;
  class GhostRecorder {
    constructor() { this.d = []; this.next = 0; }
    update(t, s, lat) {
      while (t >= this.next) {
        this.d.push(+s.toFixed(2), +lat.toFixed(2));
        this.next += DT;
      }
    }
    result(time) { return { time, dt: DT, d: this.d }; }
  }

  class GhostPlayer {
    constructor(data) {
      this.data = data;
      this.s = 0; this.lat = 0; this.latVel = 0; this.speed = 0;
      this.end = (data.d.length / 2 - 1) * data.dt;
    }
    update(t) {
      const d = this.data.d, dt = this.data.dt;
      const n = d.length / 2;
      const f = Math.min(t, this.end) / dt;
      const i = Math.min(n - 2, Math.floor(f)), k = f - i;
      const s0 = d[i * 2], s1 = d[i * 2 + 2], l0 = d[i * 2 + 1], l1 = d[i * 2 + 3];
      this.s = s0 + (s1 - s0) * k;
      this.lat = l0 + (l1 - l0) * k;
      this.latVel = (l1 - l0) / dt;
      this.speed = (s1 - s0) / dt;
      this.done = t > this.end + 1;
    }
  }

  GK.Particles = Particles;
  GK.AmbientFX = AmbientFX;
  GK.Trails = Trails;
  GK.GhostRecorder = GhostRecorder;
  GK.GhostPlayer = GhostPlayer;
})();
