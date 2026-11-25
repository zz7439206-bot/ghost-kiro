/* 介面：畫面切換、HUD、小地圖、設定、紀錄、結算 */
(function () {
  'use strict';
  const GK = window.GK;
  const $ = (id) => document.getElementById(id);
  const ui = (GK.ui = {});
  let game = null;
  const cache = {};
  let toastTimer = null, mini = null, miniCtx = null, miniBase = null, miniFrame = 0;
  const ITEM_KEYS = Object.keys(GK.ITEMS || {});

  function setText(id, v) {
    if (cache[id] === v) return;
    cache[id] = v;
    $(id).textContent = v;
  }
  function setHtml(id, v) {
    if (cache[id] === v) return;
    cache[id] = v;
    $(id).innerHTML = v;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- 畫面切換 ----------
  ui.show = function (id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const el = $(id);
    if (el) el.classList.remove('hidden');
    if (id === 'screen-home') $('home-coins').textContent = GK.save.data.coins;
    if (id === 'screen-modes') renderModes();
    if (id === 'screen-maps') GK.menus.renderMaps();
    if (id === 'screen-garage') GK.menus.renderGarage();
    if (id === 'screen-online' && GK.lobby) GK.lobby.onShowOnline();
    if (game) game.garageView = id === 'screen-garage';
    if (id === 'screen-settings') renderSettings();
    if (id === 'screen-records') GK.menus.renderRecords();
  };
  ui.hideScreens = function () {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  };

  ui.showHud = function (on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !on);
    if (on) {
      const m = game.mode;
      const solo = m.endless || m.timed;
      $('hud-rank-label').textContent = m.endless ? '分數' : m.timed ? '距離 m' : '名次';
      $('hud-rank-total').style.display = solo ? 'none' : '';
      $('hud-board').style.display = solo || game.racers.length < 2 ? 'none' : '';
      cache['hud-board'] = null; cache['hud-ghost'] = '';
      $('hud-ghost').textContent = '';
      buildMinimap();
    }
  };

  ui.toast = function (msg, ms) {
    const t = $('hud').classList.contains('hidden') ? $('menu-toast') : $('toast');
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1200);
  };

  ui.countdown = function (txt) {
    const c = $('countdown');
    c.textContent = txt;
    c.classList.remove('pop'); void c.offsetWidth;
    if (txt) c.classList.add('pop');
  };

  ui.flash = function () {
    const f = $('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  };

  // ---------- 各畫面內容 ----------
  function renderModes() {
    const box = $('mode-list');
    box.innerHTML = '';
    GK.MODE_ORDER.forEach((id) => {
      const m = GK.MODES[id];
      const b = document.createElement('button');
      b.className = 'card mode';
      b.innerHTML = '<div class="ico">' + m.icon + '</div><h3>' + m.name + '</h3><p>' + m.desc + '</p>';
      b.addEventListener('click', () => { GK.audio.sfx('click'); GK.menus.pendingMode = id; ui.show('screen-maps'); });
      box.appendChild(b);
    });
  }

  const QUALITY = { low: '低', medium: '中', high: '高' };
  const DIFFN = { easy: '簡單', normal: '普通', hard: '困難' };
  function renderSettings() {
    const s = GK.save.data.settings;
    $('set-sound').textContent = s.sound ? '開' : '關';
    $('set-quality').textContent = QUALITY[s.quality];
    $('set-diff').textContent = DIFFN[s.difficulty];
    $('set-racers').textContent = s.racers + ' 位（AI ' + (s.racers - 1) + ' 位）';
  }

  ui.showResults = function (res) {
    $('res-title').textContent = res.title;
    let h = '';
    if (res.timed) {
      h += '<div class="big-stat"><span>前進距離</span><b>' + res.distance + ' m</b></div>';
      h += '<div class="kv"><span>跑完圈數</span><b>' + res.laps.toFixed(2) + ' 圈</b></div>';
      h += '<div class="kv"><span>最遠紀錄</span><b>' + (res.newBest ? res.distance + ' m　🎉 新紀錄！' : (res.best == null ? '--' : res.best + ' m')) + '</b></div>';
    } else if (res.mode.endless) {
      h += '<div class="big-stat"><span>分數</span><b>' + res.score + '</b></div>';
      h += '<div class="kv"><span>前進距離</span><b>' + res.distance + ' m</b></div>';
      h += '<div class="kv"><span>歷史最高分</span><b>' + (res.newBest ? res.score + '　🎉 新紀錄！' : res.best) + '</b></div>';
    } else {
      if (res.success) {
        h += '<div class="big-stat"><span>比賽時間</span><b>' + GK.fmtTime(res.time) + '</b></div>';
        h += '<div class="kv"><span>最佳紀錄</span><b>' + (res.newBest ? '🎉 新紀錄！' : GK.fmtTime(res.best)) + '</b></div>';
        if (res.lapTimes) h += '<div class="kv"><span>每圈時間</span><b>' + res.lapTimes.map(GK.fmtTime).join('　') + '</b></div>';
      } else {
        h += '<div class="kv"><span>最佳紀錄</span><b>' + GK.fmtTime(res.best) + '</b></div>';
      }
      if (res.rows.length > 1) {
        h += '<table class="table results">';
        res.rows.forEach((r) => {
          h += '<tr class="' + (r.me ? 'me' : '') + '"><td>' + r.rank + '</td><td><i class="dot" style="background:' + r.color + '"></i>' + esc(r.name) + '</td><td>' + (r.time != null ? GK.fmtTime(r.time) : '未完賽') + '</td></tr>';
        });
        h += '</table>';
      }
    }
    res.notes.forEach((n) => { h += '<div class="note">' + esc(n) + '</div>'; });
    h += '<div class="reward">獲得獎勵　🪙 +' + res.coins + '　（共 ' + res.totalCoins + '）</div>';
    $('res-body').innerHTML = h;
    ui.show('screen-results');
  };

  // ---------- 小地圖 ----------
  function buildMinimap() {
    const T = game.track;
    mini = $('minimap'); miniCtx = mini.getContext('2d');
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < T.N; i++) {
      minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]);
      minZ = Math.min(minZ, T.pz[i]); maxZ = Math.max(maxZ, T.pz[i]);
    }
    const size = mini.width, pad = 18;
    const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (size - (maxX - minX) * sc) / 2, oz = (size - (maxZ - minZ) * sc) / 2;
    mini.map = (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
    miniBase = document.createElement('canvas');
    miniBase.width = miniBase.height = size;
    const g = miniBase.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      for (let i = 0; i <= T.N; i += 3) {
        const p = mini.map(T.px[i % T.N], T.pz[i % T.N]);
        if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
      }
      g.closePath();
    };
    g.strokeStyle = 'rgba(20,10,60,.9)'; g.lineWidth = 14; path(); g.stroke();
    g.strokeStyle = '#8f86ff'; g.lineWidth = 9; path(); g.stroke();
    const s = mini.map(T.px[0], T.pz[0]);
    g.fillStyle = '#fff'; g.fillRect(s[0] - 6, s[1] - 2, 12, 4);
  }

  function drawMinimap() {
    if (!miniCtx) return;
    const T = game.track, g = miniCtx, p = {};
    g.clearRect(0, 0, mini.width, mini.height);
    g.drawImage(miniBase, 0, 0);
    const dot = (s, lat, color, r) => {
      T.place(s, lat, p);
      const q = mini.map(p.x, p.z);
      g.fillStyle = color; g.beginPath(); g.arc(q[0], q[1], r, 0, 6.283); g.fill();
    };
    if (game.ghostPlayer && !game.ghostPlayer.done) dot(game.ghostPlayer.s, 0, 'rgba(150,240,255,.9)', 5);
    game.racers.forEach((r) => { if (!r.isPlayer) dot(r.s, 0, r.dot, 5); });
    const me = game.player;
    dot(me.s, 0, '#ffffff', 8); dot(me.s, 0, '#ff3d8a', 5);
  }

  // ---------- 速度線 ----------
  let sl = null, slCtx = null, slW = 0, slH = 0;
  function drawSpeedLines(p, g) {
    if (!sl) { sl = $('speedlines'); slCtx = sl.getContext('2d'); }
    const w = window.innerWidth >> 1, h = window.innerHeight >> 1;
    if (w !== slW || h !== slH) { sl.width = slW = w; sl.height = slH = h; }
    slCtx.clearRect(0, 0, w, h);
    const boosted = p.boostT > 0 || p.padT > 0 || p.gboost || p.driftBoostT > 0;
    const k = GK.clamp((p.speed / p.def.max - 0.85) / 0.5, 0, 1) + (boosted ? 0.4 : 0);
    if (k <= 0.02) return;
    const cx = w / 2, cy = h * 0.46, n = Math.round(14 + k * 26);
    slCtx.strokeStyle = boosted ? 'rgba(255,220,150,' + Math.min(0.5, 0.2 + k * 0.3) + ')' : 'rgba(255,255,255,' + Math.min(0.4, 0.1 + k * 0.25) + ')';
    slCtx.lineWidth = 1.5;
    slCtx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r0 = Math.max(w, h) * (0.25 + Math.random() * 0.25);
      const r1 = r0 + Math.max(w, h) * (0.12 + Math.random() * 0.25) * Math.min(1, k);
      slCtx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8);
      slCtx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8);
    }
    slCtx.stroke();
  }

  // ---------- HUD 更新 ----------
  ui.updateHud = function (g) {
    const p = g.player, m = g.mode;
    if (!p || $('hud').classList.contains('hidden')) return;
    const total = g.racers.length;
    if (m.endless || m.timed) setText('hud-rank', String(g.score));
    else { setText('hud-rank', String(p.rank)); setText('hud-rank-total', '/' + total); }

    const kmh = Math.round(p.speed * 3.2);
    setText('hud-speed', String(kmh));
    const ratio = GK.clamp(p.speed / (p.def.max * 1.5), 0, 1);
    const sb = $('hud-speedbar');
    sb.style.width = (ratio * 100).toFixed(0) + '%';
    sb.classList.toggle('boost', p.boostT > 0 || p.padT > 0 || p.gboost || p.driftBoostT > 0);

    const t = Math.max(0, g.t);
    if (m.timed) {
      setText('hud-lap', '圈數 ' + Math.max(1, Math.floor(Math.max(0, p.s) / g.track.length) + 1));
      setText('hud-time', GK.fmtTime(Math.max(0, g.timeLimit - t)));
      setText('hud-extra', '60 秒挑戰');
      $('hud-extra').classList.toggle('danger', g.timeLimit - t < 10);
    } else if (m.endless) {
      setText('hud-lap', '距離 ' + Math.max(0, Math.round(p.s)) + ' m');
      setText('hud-time', GK.fmtTime(t));
      setText('hud-extra', '❤️'.repeat(Math.max(0, g.lives)) + (g.lives < 3 ? '🖤'.repeat(3 - Math.max(0, g.lives)) : ''));
    } else {
      setText('hud-lap', '圈數 ' + Math.min(p.lap, g.laps) + '/' + g.laps);
      setText('hud-time', GK.fmtTime(p.finished ? p.finishTime : t));
      if (m.timeLimit) {
        const left = Math.max(0, g.timeLimit - t);
        setText('hud-extra', '剩餘 ' + GK.fmtTime(left));
        $('hud-extra').classList.toggle('danger', left < 15);
      } else setText('hud-extra', '');
    }

    // 漂移蓄力指示
    const dr = $('hud-drift');
    if (p.drifting) {
      const st = p.driftStage();
      dr.className = 'on s' + st;
      setText('hud-drift', st === 0 ? '漂移中…' : '漂移蓄力 ' + '■'.repeat(st) + '□'.repeat(3 - st));
    } else if (dr.className) dr.className = '';
    drawSpeedLines(p, g);

    // 道具欄
    let itemHtml;
    if (p.itemRoll > 0) itemHtml = GK.ITEMS[ITEM_KEYS[Math.floor(g.time * 14) % ITEM_KEYS.length]].icon;
    else if (p.item) itemHtml = GK.ITEMS[p.item].icon + '<small>' + GK.ITEMS[p.item].name + '</small>';
    else itemHtml = '—';
    setHtml('hud-item', itemHtml);
    $('hud-item').classList.toggle('has', !!p.item);

    $('hud-energy').style.width = p.energy.toFixed(0) + '%';
    $('ab-phase').classList.toggle('ready', p.energy >= 35 && p.phaseT <= 0);
    $('ab-boost').classList.toggle('ready', p.energy > 5);

    // 排行榜
    if (!m.endless && total > 1 && g.order) {
      const top = g.order.slice(0, 6);
      let key = top.map((r) => r.name + r.rank).join('|');
      if (key !== cache['hud-board-key']) {
        cache['hud-board-key'] = key;
        $('hud-board').innerHTML = top.map((r) => '<li class="' + (r.isPlayer ? 'me' : '') + '"><i class="dot" style="background:' + r.dot + '"></i>' + esc(r.name) + '</li>').join('');
      }
    }
    // 幽靈差距
    if (g.ghostPlayer && !g.ghostPlayer.done) {
      const gap = (g.ghostPlayer.s - p.s) / Math.max(p.speed, 25);
      setText('hud-ghost', gap > 0 ? '👻 幽靈領先 ' + gap.toFixed(1) + ' 秒' : '👻 你領先幽靈 ' + (-gap).toFixed(1) + ' 秒');
      $('hud-ghost').classList.toggle('behind', gap > 0);
    } else setText('hud-ghost', '');

    if ((miniFrame++ & 1) === 0) drawMinimap();
  };

  // ---------- 初始化事件 ----------
  ui.init = function (g) {
    game = g;
    const S = GK.save.data;
    $('home-coins').textContent = S.coins;

    // 觸控裝置顯示按鈕
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');

    document.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => { GK.audio.init(); GK.audio.music(GK.save.data.settings.sound); GK.audio.sfx('click'); if (b.dataset.go === 'screen-maps') GK.menus.pendingMode = null; ui.show(b.dataset.go); });
    });

    $('set-sound').addEventListener('click', () => {
      S.settings.sound = !S.settings.sound; GK.save.commit(); renderSettings();
      GK.audio.init(); GK.audio.music(S.settings.sound); GK.audio.sfx('click');
    });
    $('set-quality').addEventListener('click', () => {
      const o = ['low', 'medium', 'high'];
      S.settings.quality = o[(o.indexOf(S.settings.quality) + 1) % 3];
      GK.save.commit(); renderSettings(); game.applyQuality(); GK.audio.sfx('click');
    });
    $('set-diff').addEventListener('click', () => {
      const o = ['easy', 'normal', 'hard'];
      S.settings.difficulty = o[(o.indexOf(S.settings.difficulty) + 1) % 3];
      GK.save.commit(); renderSettings(); GK.audio.sfx('click');
    });
    $('set-racers').addEventListener('click', () => {
      const o = [6, 7, 8];
      S.settings.racers = o[(o.indexOf(S.settings.racers) + 1) % 3];
      GK.save.commit(); renderSettings(); GK.audio.sfx('click');
    });
    $('btn-reset').addEventListener('click', () => {
      if (window.confirm('確定要清除所有紀錄、金幣與解鎖內容嗎？')) {
        GK.save.reset();
        game.setMenuKart();
        renderSettings();
        ui.toast('已清除紀錄', 1200);
      }
    });

    $('btn-map-go').addEventListener('click', () => {
      GK.audio.sfx('click');
      if (GK.menus.pendingMode) game.startRace(GK.menus.pendingMode); else ui.show('screen-home');
    });
    document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.addEventListener('click', () => { GK.audio.sfx('click'); GK.menus.garageTab = t.dataset.tab; GK.menus.renderGarage(); }));
    $('btn-pause').addEventListener('click', () => game.pause());
    $('btn-resume').addEventListener('click', () => game.resume());
    $('btn-restart').addEventListener('click', () => game.restart());
    $('btn-quit').addEventListener('click', () => game.quitToMenu());
    $('btn-again').addEventListener('click', () => game.restart());
    $('btn-next').addEventListener('click', () => game.nextMode());
    $('btn-menu').addEventListener('click', () => game.quitToMenu());

    // 首次互動時啟用音訊
    const unlock = () => { GK.audio.init(); GK.audio.music(GK.save.data.settings.sound); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    ui.show('screen-home');
  };
})();
