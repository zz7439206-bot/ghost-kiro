/* Ghost Kiro 核心工具：命名空間、數學函式、存檔、音效 */
(function () {
  'use strict';
  const GK = (window.GK = window.GK || {});

  // ---------- 數學工具 ----------
  GK.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  GK.lerp = (a, b, t) => a + (b - a) * t;
  GK.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  GK.rand = (a, b) => a + Math.random() * (b - a);
  GK.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  GK.mod = (a, L) => ((a % L) + L) % L;
  // 環形賽道上 a 相對於 b 的有號距離，範圍 (-L/2, L/2]
  GK.wrapDiff = (a, b, L) => {
    let d = (a - b) % L;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return d;
  };
  GK.fmtTime = (sec) => {
    if (sec == null || !isFinite(sec)) return '--:--.--';
    const m = Math.floor(sec / 60);
    const s = Math.min(59.99, sec - m * 60);
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  };

  // ---------- 模式定義 ----------
  GK.MODES = {
    quick: { id: 'quick', name: '快速競速', icon: '🏁', laps: 3, ai: true, ghostPlay: false, timeLimit: false, endless: false,
      desc: '立即開始 3 圈競速，與 AI 車手爭奪冠軍。' },
    ghost: { id: 'ghost', name: '幽靈挑戰', icon: '👻', laps: 3, ai: true, ghostPlay: true, timeLimit: false, endless: false,
      desc: '挑戰自己的最佳幽靈殘影，同時對抗 AI 車手。' },
    time: { id: 'time', name: '60 秒計時挑戰', icon: '⏱️', laps: 0, ai: false, ghostPlay: false, timeLimit: true, timed: true, endless: false,
      desc: '60 秒內盡可能跑得更遠，挑戰最長距離。' },
    endless: { id: 'endless', name: '無盡競速', icon: '♾️', laps: 0, ai: false, ghostPlay: false, timeLimit: false, endless: true,
      desc: '速度越來越快，閃避障礙，挑戰最高分。' },
  };
  GK.MODE_ORDER = ['quick', 'ghost', 'time', 'endless'];

  // ---------- 存檔（LocalStorage，失敗時退回記憶體） ----------
  const KEY = 'ghostkiro.save.v1';
  const defaults = () => ({
    coins: 0,
    unlocked: [0],                                   // 已解鎖賽車車身
    chars: ['kiro', 'fire', 'ice', 'neon'],          // 已解鎖幽靈角色
    kart: 0,
    look: null,                                      // 外觀設定（載入後補上預設值）
    map: 'neon',
    laps: 3,
    settings: { sound: true, quality: 'high', difficulty: 'normal', racers: 6 },
    records: {},                                     // 依地圖分開的最佳紀錄
    ghosts: {},                                      // 依地圖與圈數分開的幽靈軌跡
    best: { quick: null, ghost: null, time: null, time60: null }, // 舊版（第一、二階段）資料，保留不刪除
    bestLap: null,
    endless: 0,
    ghost: null,
  });
  GK.save = {
    data: defaults(),
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const o = JSON.parse(raw);
          const d = defaults();
          this.data = Object.assign(d, o);
          this.data.settings = Object.assign(d.settings, o.settings || {});
          this.data.best = Object.assign(d.best, o.best || {});
          if (!Array.isArray(this.data.unlocked) || !this.data.unlocked.length) this.data.unlocked = [0];
          if (!Array.isArray(this.data.chars) || !this.data.chars.length) this.data.chars = d.chars;
          if (!this.data.records || typeof this.data.records !== 'object') this.data.records = {};
          if (!this.data.ghosts || typeof this.data.ghosts !== 'object') this.data.ghosts = {};
          // 舊版資料搬到「霓虹城市」（原本的賽道就是現在的霓虹城市）
          if (!o.records) {
            const b = this.data.best;
            this.data.records.neon = { quick_3: b.quick, ghost_3: b.ghost, time60: b.time60, endless: this.data.endless || 0, lap: this.data.bestLap };
            if (this.data.ghost) this.data.ghosts['neon_3'] = this.data.ghost;
          }
        }
      } catch (e) { /* 忽略損毀的存檔 */ }
      this.sanitize();
    },
    // 修正舊版或損毀存檔的欄位
    sanitize() {
      const d = this.data, s = d.settings;
      if ([6, 7, 8].indexOf(s.racers) < 0) s.racers = 6;
      if (!d.look || typeof d.look !== 'object') d.look = GK.defaultLook();
      d.look = Object.assign(GK.defaultLook(), d.look);
      if (d.chars.indexOf(d.look.char) < 0) d.look.char = 'kiro';
      if (!GK.MAPS.some((m) => m.id === d.map)) d.map = 'neon';
      if ([2, 3, 5].indexOf(d.laps) < 0) d.laps = 3;
    },
    // 取得（必要時建立）某地圖的紀錄物件
    rec(mapId) {
      if (!this.data.records[mapId]) this.data.records[mapId] = {};
      return this.data.records[mapId];
    },
    commit() {
      try { window.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 無法寫入時略過 */ }
    },
    reset() {
      const s = this.data.settings;
      this.data = defaults();
      this.data.settings = s;
      this.sanitize();
      this.commit();
    },
  };

  // ---------- 音效（WebAudio 合成，不需外部檔案） ----------
  GK.audio = (function () {
    let ctx = null, master = null, noiseBuf = null;
    let eng = null, musicTimer = null, step = 0, musicWanted = false;

    function enabled() { return !!ctx && GK.save.data.settings.sound; }

    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        if (musicWanted) music(true);
      } catch (e) { ctx = null; }
    }

    function tone(f, dur, type, vol, slide, delay) {
      if (!enabled()) return;
      const t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }

    function noise(dur, vol, freq, delay) {
      if (!enabled()) return;
      const t = ctx.currentTime + (delay || 0);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.03);
    }

    function sfx(name) {
      if (!enabled()) return;
      switch (name) {
        case 'click': tone(660, 0.07, 'square', 0.07); break;
        case 'count': tone(440, 0.18, 'square', 0.12); break;
        case 'go': tone(880, 0.45, 'square', 0.14); tone(1320, 0.45, 'triangle', 0.1); break;
        case 'item': tone(700, 0.08, 'triangle', 0.15); tone(1050, 0.1, 'triangle', 0.15, 0, 0.07); tone(1400, 0.14, 'triangle', 0.15, 0, 0.14); break;
        case 'itemready': tone(900, 0.12, 'square', 0.09, 1500); break;
        case 'rocket': noise(0.7, 0.25, 1800); tone(180, 0.7, 'sawtooth', 0.12, 700); break;
        case 'boost': tone(300, 0.35, 'sawtooth', 0.1, 900); break;
        case 'pad': tone(400, 0.3, 'sawtooth', 0.1, 1000); noise(0.3, 0.12, 2500); break;
        case 'bomb': tone(500, 0.25, 'triangle', 0.14, 200); break;
        case 'explode': noise(0.5, 0.35, 500); tone(140, 0.4, 'sawtooth', 0.18, 40); break;
        case 'shield': tone(600, 0.3, 'sine', 0.15, 1200); break;
        case 'shieldbreak': noise(0.25, 0.2, 3000); tone(900, 0.2, 'triangle', 0.1, 300); break;
        case 'lightning': noise(0.5, 0.3, 4000); tone(1200, 0.4, 'sawtooth', 0.1, 150); break;
        case 'magnet': tone(300, 0.5, 'sine', 0.15, 900); tone(450, 0.5, 'sine', 0.1, 1200); break;
        case 'phase': tone(900, 0.5, 'sine', 0.13, 300); tone(1350, 0.5, 'sine', 0.08, 450); break;
        case 'jump': tone(260, 0.35, 'square', 0.1, 700); break;
        case 'land': noise(0.18, 0.25, 300); break;
        case 'bump': noise(0.12, 0.2, 700); tone(120, 0.12, 'square', 0.1, 70); break;
        case 'hit': noise(0.35, 0.3, 600); tone(200, 0.35, 'sawtooth', 0.15, 60); break;
        case 'lap': tone(660, 0.12, 'triangle', 0.15); tone(880, 0.2, 'triangle', 0.15, 0, 0.12); break;
        case 'finish': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, 0, i * 0.12)); break;
        case 'lose': [400, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.11, 0, i * 0.18)); break;
        default: break;
      }
    }

    // 引擎聲：依速度改變音高
    function engine(ratio, on) {
      if (!enabled()) { if (eng) eng.gain.gain.value = 0; return; }
      if (!eng) {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator();
        const f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o2.type = 'square';
        f.type = 'lowpass'; f.frequency.value = 520;
        g.gain.value = 0;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o.start(); o2.start();
        eng = { o, o2, gain: g };
      }
      const t = ctx.currentTime;
      eng.o.frequency.setTargetAtTime(48 + ratio * 120, t, 0.05);
      eng.o2.frequency.setTargetAtTime(24 + ratio * 60, t, 0.05);
      eng.gain.gain.setTargetAtTime(on ? 0.035 + ratio * 0.03 : 0, t, 0.08);
    }

    // ---------- 背景音樂與環境音（依地圖主題改變） ----------
    const THEMES = {
      city: { tempo: 118, bass: [55, 55, 82.41, 55, 73.42, 73.42, 98, 73.42], lead: [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63], wave: 'square', mult: 1.5 },
      forest: { tempo: 160, bass: [49, 49, 58.27, 49, 55, 55, 65.41, 55], lead: [196, 233.08, 293.66, 349.23, 293.66, 233.08], wave: 'triangle', mult: 1.25 },
      ice: { tempo: 135, bass: [65.41, 65.41, 98, 65.41, 87.31, 87.31, 110, 87.31], lead: [523.25, 659.25, 783.99, 987.77, 783.99, 659.25], wave: 'sine', mult: 1.5 },
      space: { tempo: 150, bass: [41.2, 41.2, 55, 41.2, 49, 49, 61.74, 49], lead: [329.63, 392, 493.88, 587.33, 659.25, 587.33, 493.88, 392], wave: 'triangle', mult: 2 },
      candy: { tempo: 100, bass: [65.41, 82.41, 98, 82.41, 73.42, 87.31, 110, 87.31], lead: [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33], wave: 'square', mult: 1.5 },
      lava: { tempo: 105, bass: [36.71, 36.71, 43.65, 36.71, 41.2, 41.2, 49, 41.2], lead: [146.83, 174.61, 196, 233.08, 196, 174.61], wave: 'sawtooth', mult: 1.5 },
    };
    let theme = THEMES.city, themeName = 'city', ambTimer = null, amb = null;

    function musicStep() {
      if (!enabled()) return;
      const i = step++, T = theme;
      const b = T.bass[Math.floor(i / 2) % T.bass.length];
      if (i % 2 === 0) tone(b, 0.2, themeName === 'lava' ? 'sawtooth' : 'triangle', themeName === 'lava' ? 0.05 : 0.07);
      tone(T.lead[(i * 3) % T.lead.length] * (i % 16 < 8 ? 1 : T.mult), 0.12, T.wave, 0.025);
      if (i % 4 === 2) noise(0.05, 0.04, 6000);
    }
    function restartMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (musicWanted && ctx) musicTimer = setInterval(musicStep, theme.tempo);
    }
    function music(on) {
      musicWanted = on;
      if (!ctx) return;
      if (on && !musicTimer) musicTimer = setInterval(musicStep, theme.tempo);
      if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      ambient(on);
    }

    // 環境音：持續的底噪（風、低頻）+ 隨機事件（蟲鳴、風鈴、火花聲…）
    const AMB = {
      city: { f: 180, q: 0.7, g: 0.03, hum: 55 },
      forest: { f: 500, q: 1.2, g: 0.035, lfo: 0.15 },
      ice: { f: 900, q: 2, g: 0.05, lfo: 0.2 },
      space: { f: 120, q: 0.5, g: 0.03, hum: 41 },
      candy: { f: 2500, q: 0.4, g: 0.008 },
      lava: { f: 90, q: 0.8, g: 0.07, lfo: 0.4 },
    };
    function ambient(on) {
      if (amb) { try { amb.src.stop(); amb.hum && amb.hum.stop(); } catch (e) { /* 已停止 */ } amb = null; }
      if (ambTimer) { clearInterval(ambTimer); ambTimer = null; }
      if (!on || !ctx || !GK.save.data.settings.sound) return;
      const P = AMB[themeName] || AMB.city;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = themeName === 'lava' || themeName === 'city' || themeName === 'space' ? 'lowpass' : 'bandpass';
      f.frequency.value = P.f; f.Q.value = P.q;
      const g = ctx.createGain(); g.gain.value = P.g;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      amb = { src };
      if (P.lfo) {
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.frequency.value = P.lfo; lg.gain.value = P.g * 0.8;
        l.connect(lg); lg.connect(g.gain); l.start(); amb.hum = l;
      } else if (P.hum) {
        const h = ctx.createOscillator(), hg = ctx.createGain();
        h.type = 'sine'; h.frequency.value = P.hum; hg.gain.value = 0.03;
        h.connect(hg); hg.connect(master); h.start(); amb.hum = h;
      }
      ambTimer = setInterval(() => {
        if (!enabled() || Math.random() > 0.5) return;
        switch (themeName) {
          case 'forest': tone(3200 + Math.random() * 600, 0.06, 'sine', 0.012); tone(3400 + Math.random() * 400, 0.06, 'sine', 0.01, 0, 0.09); break;
          case 'candy': tone([1047, 1319, 1568, 1760][Math.floor(Math.random() * 4)], 0.5, 'sine', 0.025); break;
          case 'city': noise(0.8, 0.03, 1500 + Math.random() * 1500); break;
          case 'space': tone(1500 + Math.random() * 1500, 0.4, 'sine', 0.012, 400); break;
          case 'lava': noise(0.08, 0.08, 800 + Math.random() * 600); break;
          case 'ice': tone(2200 + Math.random() * 800, 0.3, 'triangle', 0.01); break;
          default: break;
        }
      }, 700);
    }
    function setTheme(name) {
      themeName = THEMES[name] ? name : 'city';
      theme = THEMES[themeName];
      step = 0;
      restartMusic();
      if (ctx && musicWanted) ambient(true);
    }
    // 角色專屬短旋律
    function motif(notes) {
      if (!enabled() || !notes) return;
      notes.forEach((f, i) => tone(f, 0.16, 'triangle', 0.11, 0, i * 0.09));
    }

    return { init, sfx, engine, music, setTheme, motif };
  })();
})();
