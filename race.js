/* 遊戲主控：場景、模式流程、車手更新、排名、計分、結算 */
(function () {
  'use strict';
  const GK = window.GK;
  const STEP = 1 / 60;
  const DIFF = {
    easy: { scale: 0.86, rubber: 0.04, distract: 1.2 },
    normal: { scale: 0.94, rubber: 0.06, distract: 0.7 },
    hard: { scale: 1.0, rubber: 0.08, distract: 0.3 },
  };
  const RANK_COINS = [60, 40, 30, 20, 15, 10, 10, 10];
  const F = {}, F2 = {}, TMP = {};

  class Game {
    constructor() {
      this.state = 'menu';       // menu | countdown | racing | paused | results
      this.prevState = 'menu';
      this.time = 0;             // 場景動畫時間
      this.t = 0;                // 比賽時間
      this.acc = 0;
      this.last = 0;
      this.racers = [];
      this.player = null;
      this.shake = 0;
      this.menuKart = null;
      this.mode = GK.MODES.quick;
      this.modeId = 'quick';
      this.camPos = new THREE.Vector3();
      this.camLook = new THREE.Vector3();
      this.difficulty = DIFF.normal;
      this.bonus = 0; this.lives = 3; this.score = 0;
      this.ghostPlayer = null; this.ghostKart = null; this.recorder = null;
      this.finishTimer = 0; this.finishOrder = [];
      this.timeLimit = 0;
      this.countdown = 0; this.cdNum = 0; this.goTimer = 0;
      this.frameCount = 0;
      this.garageView = false;
    }

    init() {
      const set = GK.save.data.settings;
      const canvas = document.getElementById('game');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: set.quality !== 'low', powerPreference: 'high-performance' });
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xf0a8ee, 200, 1050);
      this.camera = new THREE.PerspectiveCamera(68, 1, 0.5, 2600);
      this.hemi = new THREE.HemisphereLight(0xdde4ff, 0x4a3a8a, 1.0);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xffffff, 0.75);
      this.sun.position.set(120, 220, 60);
      this.scene.add(this.sun);
      this._buildSky();
      this.ambientFx = new GK.AmbientFX(this.scene);

      this.loadMap(GK.save.data.map);
      this.fx = new GK.Particles(this.scene, 700);
      this.smoke = new GK.Particles(this.scene, 360, { size: 2.8 });
      this.rings = [];
      this.trails = new GK.Trails(this.scene, 14);
      this.items = new GK.Items(this);

      this.applyQuality();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
      window.addEventListener('blur', () => this.autoPause());
      this.resize();
      this.setMenuKart();
      this.last = performance.now() / 1000;
      const loop = (ts) => { requestAnimationFrame(loop); this.loop(ts / 1000); };
      requestAnimationFrame(loop);
    }
    _buildSky() {
      this.skyCanvas = document.createElement('canvas');
      this.skyCanvas.width = 4; this.skyCanvas.height = 256;
      this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
      this.skyGroup = new THREE.Group();
      this.scene.add(this.skyGroup);
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 24, 16),
        new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
      this.sky.renderOrder = -10;
      this.skyGroup.add(this.sky);
      // 星星
      const n = 450, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, e = 0.12 + Math.random() * 1.35, r = 1900;
        pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
      this.skyGroup.add(this.stars);
      this.skyExtraObjs = [];
    }

    // 載入地圖：重建賽道與場景，並套用該地圖的天空、霧、光線、粒子與音樂
    loadMap(id) {
      const map = GK.getMap(id);
      if (this.track && this.mapId === map.id) return;
      const q = GK.save.data.settings.quality;
      if (this.track) this.track.dispose(this.scene);
      this.mapId = map.id;
      this.track = new GK.Track(map);
      this.track.build(this.scene, q);
      this.applyTheme(map);
      if (this.menuKart) this.setMenuKart();
    }

    applyTheme(map) {
      const P = map.pal, g = this.skyCanvas.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, P.skyTop); gr.addColorStop(0.32, P.skyMid); gr.addColorStop(0.47, P.skyLow);
      gr.addColorStop(0.5, P.skyLow); gr.addColorStop(1, P.skyLow);
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      this.skyTex.needsUpdate = true;
      this.scene.fog.color.setHex(P.fog); this.scene.fog.near = P.fogNear; this.scene.fog.far = P.fogFar;
      this.hemi.color.setHex(P.hemi[0]); this.hemi.groundColor.setHex(P.hemi[1]); this.hemi.intensity = P.hemi[2];
      this.sun.color.setHex(P.sun[0]); this.sun.intensity = P.sun[1];
      this.stars.visible = !!P.stars;
      this.skyExtraObjs.forEach((o) => this.skyGroup.remove(o));
      this.skyExtraObjs = this.track.skyExtras.slice();
      this.skyExtraObjs.forEach((o) => this.skyGroup.add(o));
      this.ambientFx.setType(map.particles, GK.save.data.settings.quality);
      GK.audio.setTheme(map.ambient);
    }

    applyQuality() {
      const q = GK.save.data.settings.quality;
      const cap = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // ---------- 選單展示車 ----------
    setMenuKart() {
      const S = GK.save.data;
      const def = GK.KART_DEFS[S.kart] || GK.KART_DEFS[0];
      if (this.menuKart) this.scene.remove(this.menuKart.root);
      this.menuKart = GK.createKart(S.look, def);
      const p = this.track.place(14, 0, {});
      this.menuKart.root.position.set(p.x, 0, p.z);
      this.menuKart.root.rotation.y = Math.atan2(p.fx, p.fz);
      this.menuKart.flames.forEach((f) => f.scale.set(1, 1, 0.4));
      this.menuKart.root.visible = this.state === 'menu';
      this.scene.add(this.menuKart.root);
      this.menuPos = p;
    }


    // ---------- 開始 / 結束比賽 ----------
    clearRace() {
      this.racers.forEach((r) => r.destroy());
      this.racers = []; this.player = null;
      if (this.ghostKart) { this.scene.remove(this.ghostKart.root); this.ghostKart = null; }
      this.ghostPlayer = null;
      if (this.items) this.items.clear();
      if (this.fx) this.fx.clear();
      if (this.smoke) this.smoke.clear();
      if (this.rings) this.rings.forEach((r) => { r.mesh.visible = false; r.life = 0; });
      if (this.trails) this.trails.clear();
    }

    startRace(modeId) {
      GK.audio.init();
      GK.audio.music(GK.save.data.settings.sound);
      this.clearRace();
      GK.input.clearEdges();
      const mode = GK.MODES[modeId];
      this.mode = mode; this.modeId = modeId;
      this.loadMap(GK.save.data.map);
      this.laps = (mode.endless || mode.timed) ? 0 : GK.save.data.laps;
      const set = GK.save.data.settings;
      this.difficulty = DIFF[set.difficulty] || DIFF.normal;
      const T = this.track;
      T.resetObjects(mode.endless);
      if (this.menuKart) this.menuKart.root.visible = false;

      const racerN = GK.clamp(set.racers || 6, 6, 8);
      const nAI = mode.ai ? (mode.ghostPlay ? Math.min(5, racerN - 1) : racerN - 1) : 0;
      const total = nAI + 1;
      const slot = (i) => (total === 1 ? { s: -6, lat: 0 } : { s: -(8 + Math.floor(i / 2) * 9), lat: i % 2 ? 5.5 : -5.5 });
      for (let i = 0; i < nAI; i++) {
        const sl = slot(i);
        this.racers.push(new GK.Racer(this, {
          id: i + 1, name: GK.AI_NAMES[i % GK.AI_NAMES.length], def: GK.KART_DEFS[Math.floor(Math.random() * 3)],
          look: GK.randomLook(), skill: GK.rand(0.96, 1.04), s0: sl.s, lat0: sl.lat,
        }));
      }
      const ps = slot(nAI);
      const def = GK.KART_DEFS[GK.save.data.kart] || GK.KART_DEFS[0];
      this.player = new GK.Racer(this, { id: 0, name: '你', isPlayer: true, def, look: GK.save.data.look, s0: ps.s, lat0: ps.lat });
      this.racers.push(this.player);

      // 幽靈紀錄回放
      const sv = GK.save.data.ghosts[this.mapId + '_' + this.laps];
      this.ghostNote = '';
      if (mode.ghostPlay) {
        if (sv && sv.d && sv.d.length > 4) {
          this.ghostPlayer = new GK.GhostPlayer(sv);
          this.ghostKart = GK.createKart({ char: 'kiro', color: 0x7fe9ff }, GK.KART_DEFS[0]);
          this.ghostKart.setOpacity(0.42);
          this.ghostKart.shield.visible = false;
          this.ghostKart.shadow.visible = false;
          this.ghostKart.flames.forEach((f) => f.scale.set(1, 1, 0.01));
          this.scene.add(this.ghostKart.root);
        } else {
          this.ghostNote = '尚無幽靈紀錄，完成一場 3 圈比賽後就會留下你的幽靈！';
        }
      }
      this.recorder = mode.endless ? null : new GK.GhostRecorder();

      this.t = 0; this.bonus = 0; this.lives = 3; this.score = 0;
      this.finishTimer = 0; this.finishOrder = []; this.over = false;
      this.timeLimit = mode.timed ? 60 : 0;
      this.countdown = 3; this.cdNum = 4; this.goTimer = 0;
      this.state = 'countdown';
      this.shake = 0; this.acc = 0;
      this.racers.forEach((r) => { r.syncVisual(0, this.time); });
      this.computeRanks();
      this.snapCamera();
      GK.input.active = true;
      GK.ui.showHud(true, mode);
      GK.ui.hideScreens();
      if (this.ghostNote) GK.ui.toast(this.ghostNote, 4000);
    }

    restart() { this.startRace(this.modeId); }

    nextMode() {
      const i = GK.MODE_ORDER.indexOf(this.modeId);
      this.startRace(GK.MODE_ORDER[(i + 1) % GK.MODE_ORDER.length]);
    }

    quitToMenu() {
      this.clearRace();
      this.state = 'menu';
      GK.input.active = false;
      GK.audio.engine(0, false);
      GK.ui.showHud(false);
      GK.ui.countdown('');
      if (this.menuKart) this.menuKart.root.visible = true;
      GK.ui.show('screen-home');
    }

    autoPause() {
      if (this.state === 'racing' || this.state === 'countdown') this.pause();
    }
    pause() {
      if (this.state !== 'racing' && this.state !== 'countdown') return;
      this.prevState = this.state; this.state = 'paused';
      GK.audio.engine(0, false);
      GK.ui.show('screen-pause');
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = this.prevState;
      GK.input.clearEdges();
      GK.ui.hideScreens();
    }

    // ---------- 事件（音效、特效、提示） ----------
    flash() { GK.ui.flash(); }
    emit(type, r, d) {
      const me = r && r.isPlayer, A = GK.audio, ui = GK.ui, fx = this.fx;
      switch (type) {
        case 'pad':
          if (me) { A.sfx('pad'); this.shake = Math.max(this.shake, 0.3); }
          fx.burst(r.wx, 0.6, r.wz, 12, 12, 0.5, 0.7, 1, 0.2, 0); break;
        case 'jump': if (me) A.sfx('jump'); break;
        case 'bounce': if (me) { A.sfx('jump'); this.shake = Math.max(this.shake, 0.3); } fx.burst(r.wx, 0.6, r.wz, 10, 10, 0.5, 1, 0.5, 0.9, 6); break;
        case 'land':
          if (me) { A.sfx('land'); this.shake = Math.max(this.shake, 0.5); }
          fx.burst(r.wx, 0.4, r.wz, 14, 8, 0.5, 0.9, 0.9, 1, 8); break;
        case 'hit':
          fx.burst(r.wx, 1.5, r.wz, 20, 14, 0.6, 1, 0.6, 0.15, 10);
          if (me) {
            A.sfx('hit'); this.shake = Math.max(this.shake, 1.3);
            if (this.mode.endless) {
              this.lives--; ui.toast('💥 撞到障礙！剩餘生命 ' + Math.max(0, this.lives), 1500);
              if (this.lives <= 0) this.endEndless();
            }
          }
          break;
        case 'wall':
          if (me) { A.sfx('bump'); this.shake = Math.max(this.shake, 0.5); }
          fx.burst(r.wx + (d ? d.side * 1.2 : 0) * (-r.fdz), 0.8, r.wz + (d ? d.side * 1.2 : 0) * r.fdx, 8, 10, 0.4, 1, 0.9, 0.5, 14); break;
        case 'bump': if (me) { A.sfx('bump'); this.shake = Math.max(this.shake, 0.4); } break;
        case 'driftBoost': if (me) { A.sfx('boost'); ui.toast(['', '🔹 漂移加速', '🔶 漂移加速 II', '🟣 漂移加速 III'][d.stage] || '漂移加速', 900); this.shake = Math.max(this.shake, 0.3 * d.stage); } fx.burst(r.wx, 0.8, r.wz, 10 * d.stage, 12, 0.4, 0.5, 0.9, 1, 0); break;
        case 'pickup': if (me) A.sfx('item'); fx.burst(r.wx, 1.5, r.wz, 14, 9, 0.5, 1, 0.9, 0.4, 0); break;
        case 'coin': if (me) { A.sfx('item'); } break;
        case 'itemReady': if (me) A.sfx('itemready'); break;
        case 'shieldBreak': if (me) { A.sfx('shieldbreak'); ui.toast('🛡️ 防護罩抵擋了一次攻擊！', 1400); } fx.burst(r.wx, 1.5, r.wz, 20, 12, 0.5, 0.4, 0.9, 1, 0); break;
        case 'phase': if (me) { A.sfx('phase'); ui.toast('👻 幽靈穿越！', 900); } break;
        case 'item:nitro': if (me) { A.sfx('rocket'); ui.toast('🔥 氮氣加速！', 900); } break;
        case 'item:missile': if (me) { A.sfx('bomb'); ui.toast('🚀 幽靈火箭發射！', 900); } break;
        case 'item:trap': if (me) { A.sfx('bomb'); ui.toast('💣 已放置幽靈炸彈', 900); } break;
        case 'item:stealth': if (me) { A.sfx('phase'); ui.toast('🫥 幽靈隱身！', 900); } break;
        case 'item:shield': if (me) { A.sfx('shield'); ui.toast('🛡️ 防護罩啟動', 900); } break;
        case 'item:lightning': if (me) { A.sfx('lightning'); ui.toast('⚡ 閃電！對手減速', 1200); } break;
        case 'item:magnet': if (me) { A.sfx('magnet'); ui.toast('🧲 磁力吸引！', 900); } break;
        case 'lightningHit': if (me) { A.sfx('lightning'); this.shake = Math.max(this.shake, 0.6); ui.toast('⚡ 被閃電擊中，速度下降！', 1500); } break;
        case 'explode': {
          const x = d.x, z = d.z;
          fx.burst(x, 1.5, z, 50, 20, 0.9, 1, 0.55, 0.2, 8);
          fx.burst(x, 1.5, z, 30, 14, 0.8, 0.7, 0.3, 1, 8);
          this.addRing(x, z, 0xff8fe8);
          this.smoke.burst(x, 1.2, z, 16, 6, 1.0, 0.5, 0.45, 0.5, 0);
          if (me || (this.player && Math.hypot(this.player.wx - x, this.player.wz - z) < 90)) A.sfx('explode');
          break;
        }
        case 'attackHit': if (me) { this.shake = Math.max(this.shake, 1.5); ui.toast('💥 被攻擊命中！', 1500); } break;
        default: break;
      }
    }

    // ---------- 爆炸衝擊波 ----------
    addRing(x, z, color) {
      let r = this.rings.find((q) => q.life <= 0);
      if (!r) {
        if (this.rings.length >= 6) return;
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        this.scene.add(mesh);
        r = { mesh, life: 0 };
        this.rings.push(r);
      }
      r.life = 0.5; r.mesh.material.color.setHex(color);
      r.mesh.position.set(x, 0.5, z); r.mesh.visible = true; r.mesh.scale.setScalar(1);
    }
    updateRings(dt) {
      for (const r of this.rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        const k = 1 - r.life / 0.5;
        r.mesh.scale.setScalar(1 + k * 14);
        r.mesh.material.opacity = 0.8 * (1 - k);
      }
    }

    // ---------- 主迴圈 ----------
    loop(now) {
      const delta = GK.clamp(now - this.last, 0, 0.1);
      this.last = now;
      this.time += delta;
      this.frameCount++;
      const st = this.state;

      if (GK.input.takePause()) {
        if (st === 'racing' || st === 'countdown') this.pause();
        else if (st === 'paused') this.resume();
      }

      if (this.state === 'countdown' || this.state === 'racing' || this.state === 'results') {
        this.acc += delta;
        let n = 0;
        while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; }
        if (n === 5) this.acc = 0;
      }
      this.updateCamera(delta);
      this.skyGroup.position.copy(this.camera.position);
      this.ambientFx.update(delta, this.camera.position);
      this.updateAudio();
      if (this.state !== 'menu') GK.ui.updateHud(this);
      this.renderer.render(this.scene, this.camera);
    }

    updateAudio() {
      const p = this.player;
      if (this.state === 'racing' || this.state === 'results') {
        GK.audio.engine(GK.clamp(p.speed / (p.def.max * 1.4), 0, 1), this.state === 'racing');
      }
    }

    speedScale(r) {
      const p = this.player;
      if (r.isPlayer) return this.mode.endless ? 1 + Math.min(0.3, this.t / 240 * 0.3) : 1;
      const d = this.difficulty;
      let sc = d.scale * r.ai.skill;
      const gap = r.s - p.s;
      if (gap < -40) sc *= 1 + d.rubber * Math.min(1, (-gap - 40) / 150);
      else if (gap > 60) sc *= 1 - d.rubber * 0.8 * Math.min(1, (gap - 60) / 150);
      return sc;
    }

    playerControl(out) {
      const I = GK.input;
      out.steer = I.steer(); out.brake = I.brake(); out.boost = I.boost();
      out.phase = I.takePhase(); out.item = I.takeItem();
      return out;
    }

    step(dt) {
      const T = this.track, mode = this.mode, L = T.length;
      T.update(dt, this.time);
      this.fx.update(dt);
      this.smoke.update(dt);
      this.updateRings(dt);
      this.trails.update(dt);
      this.shake *= Math.exp(-6 * dt);

      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.max(1, Math.ceil(this.countdown));
        if (this.countdown > 0 && n !== this.cdNum) { this.cdNum = n; GK.ui.countdown(String(n)); GK.audio.sfx('count'); }
        if (this.countdown <= 0) {
          this.state = 'racing'; this.goTimer = 0.9;
          GK.ui.countdown('GO!'); GK.audio.sfx('go');
          GK.audio.motif(GK.getChar(this.player.look.char).motif);
          // 起跑火箭：倒數結束瞬間按住幽靈加速可獲得起步加速
          if (GK.input.boost()) { this.player.padT = 1.0; }
        }
        this.racers.forEach((r) => r.syncVisual(dt, this.time));
        return;
      }
      if (this.goTimer > 0) { this.goTimer -= dt; if (this.goTimer <= 0) GK.ui.countdown(''); }

      const racing = this.state === 'racing';
      if (racing) this.t += dt;
      const p = this.player;

      // 控制與物理
      for (const r of this.racers) {
        let c;
        if (r.isPlayer && !r.finished && !this.over) {
          c = this._pc || (this._pc = {});
          this.playerControl(c);
        } else if (r.isPlayer && this.over) {
          c = { steer: 0, brake: true, boost: false };
        } else {
          if (!r.ai) r.ai = { skill: 1, bias: 0, biasT: 99, distractT: 0, nextDistract: 99, itemT: 99 };
          c = r._c || (r._c = {});
          GK.aiControl(r, this, dt, c);
        }
        r.scale = this.speedScale(r);
        r.update(dt, c);
      }
      this.collide();
      this.items.update(dt);
      if (mode.endless) T.recycleObstacles(p.s);

      for (const r of this.racers) {
        r.syncVisual(dt, this.time);
        r.emitFx(dt);
      }
      // 玩家殘影
      p.fxT -= dt;
      if (p.fxT <= 0 && (p.gboost || p.boostT > 0 || p.padT > 0 || p.speed > p.def.max * 1.02)) {
        this.trails.spawn(p, p.boostT > 0 ? 0xffb347 : 0x7fe9ff); p.fxT = 0.055;
      }

      if (racing) {
        this.updateProgress();
        if (this.recorder && !p.finished) this.recorder.update(this.t, p.s, p.lat);
        this.updateGhost();
        if (mode.endless) this.score = Math.floor(Math.max(0, p.s) / 8) + this.bonus;
        if (mode.timed) {
          this.score = Math.max(0, Math.floor(p.s));
          if (this.t >= this.timeLimit) this.showResults(true);
        }
        if (this.finishTimer > 0) {
          this.finishTimer -= dt;
          if (this.finishTimer <= 0) this.showResults(true);
        }
      }
      this.computeRanks();
    }

    collide() {
      const L = this.track.length, R = this.racers;
      for (let i = 0; i < R.length; i++) {
        for (let j = i + 1; j < R.length; j++) {
          const a = R[i], b = R[j];
          if (a.phaseT > 0 || b.phaseT > 0) continue;
          const ds = GK.wrapDiff(b.s, a.s, L);
          if (Math.abs(ds) > 4.4) continue;
          const dl = b.lat - a.lat;
          if (Math.abs(dl) > 2.7) continue;
          if (Math.abs(a.y - b.y) > 1.5) continue;
          const sg = dl >= 0 ? 1 : -1, ov = 2.7 - Math.abs(dl);
          a.lat -= sg * ov * 0.5; b.lat += sg * ov * 0.5;
          a.latVel -= sg * 3; b.latVel += sg * 3;
          const lim = this.track.limit;
          a.lat = GK.clamp(a.lat, -lim, lim); b.lat = GK.clamp(b.lat, -lim, lim);
          const front = ds > 0 ? b : a, rear = ds > 0 ? a : b;
          if (Math.abs(ds) > 1.5) rear.speed = GK.lerp(rear.speed, Math.min(rear.speed, front.speed * 0.97), 0.2);
          if (a.bumpCd <= 0 && b.bumpCd <= 0) {
            const rel = Math.abs(a.speed - b.speed) + Math.abs(a.latVel - b.latVel);
            if (rel > 8) { a.speed *= 0.94; b.speed *= 0.94; }
            a.bumpCd = b.bumpCd = 0.35;
            if (a.isPlayer || b.isPlayer) this.emit('bump', a.isPlayer ? a : b);
            this.fx.burst((a.wx + b.wx) / 2, 1, (a.wz + b.wz) / 2, 8, 9, 0.35, 1, 0.9, 0.6, 10);
          }
        }
      }
    }

    computeRanks() {
      const arr = this.racers.slice();
      arr.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.s - a.s;
      });
      arr.forEach((r, i) => { r.rank = i + 1; });
      this.order = arr;
    }

    updateProgress() {
      const L = this.track.length, laps = this.laps;
      if (this.mode.endless) return;
      const timed = this.mode.timed;
      for (const r of this.racers) {
        if (r.finished) continue;
        const lap = timed ? Math.max(1, Math.floor(r.s / L) + 1) : GK.clamp(Math.floor(r.s / L) + 1, 1, laps);
        if (lap > r.lap) {
          if (r.isPlayer) {
            r.lapTimes.push(this.t - r.lapStart); r.lapStart = this.t;
            GK.audio.sfx('lap');
            GK.ui.toast(!timed && lap === laps ? '🏁 最後一圈！' : '第 ' + lap + ' 圈', 1400);
          }
          r.lap = lap;
        }
        if (!timed && r.s >= laps * L) {
          r.finished = true;
          r.finishTime = this.t - (r.s - laps * L) / Math.max(r.speed, 1);
          this.finishOrder.push(r);
          if (r.isPlayer) this.onPlayerFinish();
        }
      }
    }

    onPlayerFinish() {
      const p = this.player;
      p.lapTimes.push(p.finishTime - p.lapStart);
      this.finishTimer = 3;
      GK.audio.sfx('finish');
      GK.ui.toast('🏁 FINISH！', 2600);
      this.computeRanks();
      for (let i = 0; i < 4; i++) {
        this.fx.burst(p.wx, 6, p.wz, 40, 22, 1.4, Math.random(), Math.random(), Math.random() + 0.4, 14);
      }
    }

    updateGhost() {
      const gp = this.ghostPlayer;
      if (!gp) return;
      gp.update(this.t);
      const T = this.track, k = this.ghostKart;
      T.frame(gp.s, F2);
      const x = F2.x + F2.rx * gp.lat, z = F2.z + F2.rz * gp.lat;
      const yaw = GK.clamp(gp.latVel / Math.max(gp.speed, 12), -0.6, 0.6);
      k.root.position.set(x, 0, z);
      k.root.rotation.y = Math.atan2(F2.fx + F2.rx * yaw, F2.fz + F2.rz * yaw);
      k.ghostG.position.y = 1.0 + Math.sin(this.time * 5) * 0.07;
      k.wheels.forEach((w) => { w.rotation.x += gp.speed * STEP * 0.7; });
      k.root.visible = !gp.done;
    }

    endEndless() {
      this.over = true;
      this.finishTimer = 1.4;
      GK.audio.sfx('lose');
    }

    // ---------- 結算 ----------
    showResults(success) {
      if (this.state === 'results') return;
      this.state = 'results';
      GK.input.active = false;
      const p = this.player, mode = this.mode, S = GK.save.data;
      if (!success) this.over = true;
      this.computeRanks();
      const res = { mode, success, rows: [], notes: [], coins: 0, newBest: false, time: null, best: null };

      if (mode.endless) {
        const score = this.score;
        res.score = score;
        const rc = GK.save.rec(this.mapId);
        res.best = rc.endless || 0;
        if (score > res.best) { rc.endless = score; res.newBest = true; }
        res.coins = Math.floor(score / 100);
        res.title = '🏁 挑戰結束';
        res.rank = 0;
        res.distance = Math.max(0, Math.round(p.s));
      } else if (mode.timed) {
        const dist = Math.max(0, Math.round(p.s));
        res.timed = true; res.distance = dist; res.laps = p.s / this.track.length;
        const rc = GK.save.rec(this.mapId);
        res.best = rc.time60 == null ? null : rc.time60;
        if (res.best == null || dist > res.best) { rc.time60 = dist; res.newBest = true; }
        res.coins = Math.floor(dist / 60) + (res.newBest ? 30 : 0);
        res.title = '⏱️ 時間到！';
        res.rank = 0;
      } else {
        const order = this.order;
        res.rank = p.rank;
        order.forEach((r) => {
          res.rows.push({ rank: r.rank, name: r.name, me: r.isPlayer, color: r.dot, time: r.finished ? r.finishTime : null });
        });
        if (success) {
          res.time = p.finishTime;
          res.lapTimes = p.lapTimes.slice();
          const rc = GK.save.rec(this.mapId);
          const key = mode.id + '_' + this.laps;
          const prev = rc[key] == null ? null : rc[key];
          res.best = prev;
          if (prev == null || p.finishTime < prev) { rc[key] = p.finishTime; res.newBest = true; }
          const bl = Math.min.apply(null, p.lapTimes);
          if (rc.lap == null || bl < rc.lap) { rc.lap = bl; res.notes.push('刷新單圈最佳 ' + GK.fmtTime(bl)); }
          const gk = this.mapId + '_' + this.laps;
          if (!S.ghosts[gk] || p.finishTime < S.ghosts[gk].time) {
            S.ghosts[gk] = this.recorder.result(p.finishTime);
            res.notes.push('👻 已儲存新的幽靈紀錄');
          }
          if (this.ghostPlayer) {
            const beat = p.finishTime < this.ghostPlayer.data.time;
            res.notes.push(beat ? '🏆 你擊敗了自己的幽靈！' : '幽靈贏了，再接再厲！');
            if (beat) res.coins += 40;
          }
          if (mode.timeLimit) res.coins += 50; else res.coins += RANK_COINS[Math.min(p.rank - 1, 7)];
          if (res.newBest) res.coins += 30;
          res.title = mode.timeLimit ? '🏆 挑戰成功！' : (p.rank === 1 ? '🏆 冠軍！' : '第 ' + p.rank + ' 名');
        } else {
          res.title = '⏰ 時間到，挑戰失敗';
          res.coins = 5;
          res.best = null;
          GK.audio.sfx('lose');
        }
      }
      S.coins += res.coins;
      res.totalCoins = S.coins;
      GK.save.commit();
      GK.ui.showHud(false);
      GK.ui.showResults(res);
    }

    // ---------- 攝影機 ----------
    snapCamera() {
      const p = this.player;
      if (!p) return;
      this.followTarget(p, 0, true);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }

    followTarget(p, dt, snap) {
      const T = this.track;
      T.frame(p.s, F);
      const ratio = GK.clamp(p.speed / (p.def.max * 1.3), 0, 1.2);
      const back = 10.5 + ratio * 2.5, up = 5.2 + ratio * 0.5 + p.y * 0.5;
      const lat = p.lat * 0.85;
      const bx = F.x + F.rx * lat, bz = F.z + F.rz * lat;
      const dx = bx - F.fx * back, dy = up, dz = bz - F.fz * back;
      const lx = bx + F.fx * 15, ly = 1.8 + p.y * 0.6, lz = bz + F.fz * 15;
      if (snap) {
        this.camPos.set(dx, dy, dz); this.camLook.set(lx, ly, lz);
      } else {
        const k1 = 1 - Math.exp(-9 * dt), k2 = 1 - Math.exp(-13 * dt);
        this.camPos.x += (dx - this.camPos.x) * k1; this.camPos.y += (dy - this.camPos.y) * k1; this.camPos.z += (dz - this.camPos.z) * k1;
        this.camLook.x += (lx - this.camLook.x) * k2; this.camLook.y += (ly - this.camLook.y) * k2; this.camLook.z += (lz - this.camLook.z) * k2;
      }
      return ratio;
    }

    updateCamera(dt) {
      const cam = this.camera;
      let baseFov = 68, ratio = 0;
      if (this.player && this.state !== 'menu') {
        ratio = this.followTarget(this.player, dt, false);
        const sh = this.shake * 0.35;
        cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
        cam.lookAt(this.camLook);
        baseFov = 66 + ratio * 12 + (this.player.boostT > 0 || this.player.padT > 0 ? 6 : 0);
      } else if (this.menuPos) {
        const a = this.time * 0.35 + 0.8, r = this.garageView ? 8 : 10.5;
        const m = this.menuPos;
        cam.position.set(m.x + Math.sin(a) * r, this.garageView ? 2.6 : 4.2, m.z + Math.cos(a) * r);
        cam.lookAt(m.x, this.garageView ? -0.6 : 1.6, m.z);
        if (this.menuKart) {
          this.menuKart.ghostG.position.y = 1.0 + Math.sin(this.time * 2.5) * 0.12;
          this.menuKart.wheels.forEach((w) => { w.rotation.x += dt * 2; });
        }
      }
      const asp = cam.aspect;
      const fov = baseFov * (asp < 1.2 ? 1 + (1.2 - asp) * 0.5 : 1);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    }
  }

  GK.Game = Game;
})();
