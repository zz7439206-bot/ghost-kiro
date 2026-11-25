/* 選單畫面：地圖選擇、車庫（角色、賽車、外觀）、最佳紀錄 */
(function () {
  'use strict';
  const GK = window.GK;
  const $ = (id) => document.getElementById(id);
  const hex = (n) => '#' + new THREE.Color(n).getHexString();
  const menus = (GK.menus = { pendingMode: null, garageTab: 'char' });
  const thumbs = {};

  // ---------- 地圖縮圖（依地圖配色即時繪製） ----------
  function makeThumb(map) {
    if (thumbs[map.id]) return thumbs[map.id];
    const w = 240, h = 136, P = map.pal;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h * 0.62);
    gr.addColorStop(0, P.skyTop); gr.addColorStop(0.55, P.skyMid); gr.addColorStop(1, P.skyLow);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const hz = h * 0.58;
    const rng = GK.mulberry32(map.id.length * 13 + 7);
    if (P.stars) { g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) g.fillRect(rng() * w, rng() * hz * 0.8, 1.5, 1.5); }
    // 地面
    g.fillStyle = P.ground ? P.ground[0] : '#070716'; g.fillRect(0, hz, w, h - hz);
    // 主題剪影
    const th = map.theme;
    if (th === 'city') {
      for (let i = 0; i < 16; i++) {
        const bw = 10 + rng() * 14, bh = 20 + rng() * 52, x = i * 15 + rng() * 6;
        g.fillStyle = '#1b1050'; g.fillRect(x, hz - bh, bw, bh);
        g.fillStyle = rng() < 0.5 ? '#3de6ff' : '#ff3fd8';
        for (let k = 0; k < 6; k++) g.fillRect(x + 2 + rng() * (bw - 5), hz - bh + 4 + rng() * (bh - 8), 2, 2);
      }
    } else if (th === 'forest') {
      for (let i = 0; i < 22; i++) {
        const x = i * 11 + rng() * 6, bh = 18 + rng() * 30;
        g.fillStyle = '#0a2a2a'; g.beginPath(); g.moveTo(x, hz); g.lineTo(x + 8, hz - bh); g.lineTo(x + 16, hz); g.fill();
      }
      for (let i = 0; i < 12; i++) { g.fillStyle = ['#3de6ff', '#7affc8', '#b48cff'][i % 3]; g.beginPath(); g.arc(rng() * w, hz - 2 - rng() * 8, 3, 0, 6.3); g.fill(); }
      g.fillStyle = '#cfe0ff'; g.beginPath(); g.arc(w * 0.78, hz * 0.35, 12, 0, 6.3); g.fill();
    } else if (th === 'ice') {
      for (let i = 0; i < 6; i++) {
        const x = i * 46 - 10 + rng() * 14, bh = 34 + rng() * 40;
        g.fillStyle = '#eaf4ff'; g.beginPath(); g.moveTo(x, hz); g.lineTo(x + 30, hz - bh); g.lineTo(x + 70, hz); g.fill();
        g.fillStyle = '#9fc0e8'; g.beginPath(); g.moveTo(x + 30, hz - bh); g.lineTo(x + 70, hz); g.lineTo(x + 40, hz); g.fill();
      }
    } else if (th === 'space') {
      g.fillStyle = '#ff9a4a'; g.beginPath(); g.arc(w * 0.75, hz * 0.45, 24, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(255,216,160,.8)'; g.lineWidth = 3; g.beginPath(); g.ellipse(w * 0.75, hz * 0.45, 40, 9, -0.35, 0, 6.3); g.stroke();
      g.fillStyle = '#4a8cff'; g.beginPath(); g.arc(w * 0.2, hz * 0.3, 10, 0, 6.3); g.fill();
    } else if (th === 'candy') {
      const cols = ['#ff7aa8', '#ffe066', '#7aeaa0', '#66c8ff'];
      for (let i = 0; i < 8; i++) {
        const x = 10 + i * 30 + rng() * 10, bh = 20 + rng() * 22;
        g.fillStyle = '#fff'; g.fillRect(x, hz - bh, 2, bh);
        g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(x + 1, hz - bh, 8 + rng() * 4, 0, 6.3); g.fill();
      }
    } else if (th === 'lava') {
      for (let i = 0; i < 3; i++) {
        const x = 20 + i * 90, bh = 50 + rng() * 25;
        g.fillStyle = '#2a1618'; g.beginPath(); g.moveTo(x - 50, hz); g.lineTo(x, hz - bh); g.lineTo(x + 50, hz); g.fill();
        g.fillStyle = '#ff7a1f'; g.beginPath(); g.moveTo(x - 8, hz - bh + 8); g.lineTo(x, hz - bh); g.lineTo(x + 8, hz - bh + 8); g.fill();
      }
      g.fillStyle = 'rgba(255,110,20,.55)'; g.fillRect(0, hz, w, 5);
    }
    // 透視賽道
    const rc = Array.isArray(P.road) ? P.road[0] : 0x333355;
    g.fillStyle = hex(P.rainbow ? 0x8a7acc : rc); g.beginPath();
    g.moveTo(w * 0.47, hz); g.lineTo(w * 0.53, hz); g.lineTo(w * 0.92, h); g.lineTo(w * 0.08, h); g.closePath(); g.fill();
    g.strokeStyle = hex(P.edge); g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.47, hz); g.lineTo(w * 0.08, h); g.stroke();
    g.strokeStyle = hex(P.edge2);
    g.beginPath(); g.moveTo(w * 0.53, hz); g.lineTo(w * 0.92, h); g.stroke();
    g.strokeStyle = '#fff'; g.setLineDash([6, 8]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(w / 2, hz); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);
    // 特殊地面標示
    const sf = (map.surfaces[0] || {}).type;
    if (sf) { g.fillStyle = hex(GK.SURFACES[sf].c1); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(w * 0.48, hz + 6); g.lineTo(w * 0.52, hz + 6); g.lineTo(w * 0.62, hz + 36); g.lineTo(w * 0.38, hz + 36); g.fill(); g.globalAlpha = 1; }
    thumbs[map.id] = c.toDataURL();
    return thumbs[map.id];
  }

  // ---------- 地圖選擇 ----------
  menus.renderMaps = function () {
    const S = GK.save.data, box = $('map-list');
    const m = menus.pendingMode ? GK.MODES[menus.pendingMode] : null;
    $('maps-title').textContent = m ? '選擇地圖　' + m.icon + ' ' + m.name : '選擇地圖';
    box.innerHTML = '';
    GK.MAPS.forEach((map) => {
      const b = document.createElement('button');
      b.className = 'card map' + (S.map === map.id ? ' selected' : '');
      b.innerHTML = '<img alt="' + map.name + '" src="' + makeThumb(map) + '"><h3>' + map.name + '</h3><div class="en">' + map.en + '</div>' +
        '<div class="diff">難度 ' + '★'.repeat(map.difficulty) + '☆'.repeat(3 - map.difficulty) + '</div><p>' + map.desc + '</p>';
      b.addEventListener('click', () => {
        GK.audio.sfx('click');
        S.map = map.id; GK.save.commit();
        game().loadMap(map.id);
        menus.renderMaps();
      });
      box.appendChild(b);
    });
    // 圈數（只有競速模式需要）
    const needLaps = !m || m.laps > 0;
    $('laps-row').classList.toggle('hidden', !needLaps);
    const lr = $('laps-btns'); lr.innerHTML = '';
    [2, 3, 5].forEach((n) => {
      const b = document.createElement('button');
      b.className = 'chip' + (S.laps === n ? ' on' : '');
      b.textContent = n + ' 圈';
      b.addEventListener('click', () => { GK.audio.sfx('click'); S.laps = n; GK.save.commit(); menus.renderMaps(); });
      lr.appendChild(b);
    });
    $('btn-map-go').textContent = m ? '▶ 出發' : '✔ 確定';
    $('maps-note').textContent = m ? '' : '選好的地圖會用在之後所有模式。';
  };
  const game = () => GK.game;

  // ---------- 車庫 ----------
  function stat(label, v, max) {
    return '<div class="stat"><span>' + label + '</span><i><u style="width:' + Math.round((v / max) * 100) + '%"></u></i></div>';
  }
  function chip(parent, text, on, fn, style) {
    const b = document.createElement('button');
    b.className = 'chip' + (on ? ' on' : '');
    b.innerHTML = text;
    if (style) b.style.cssText = style;
    b.addEventListener('click', () => { GK.audio.sfx('click'); fn(); });
    parent.appendChild(b);
    return b;
  }
  function section(parent, title) {
    const d = document.createElement('div');
    d.className = 'opt-sec';
    d.innerHTML = '<h4>' + title + '</h4><div class="chips"></div>';
    parent.appendChild(d);
    return d.querySelector('.chips');
  }
  function applyLook(patch) {
    const S = GK.save.data;
    Object.assign(S.look, patch);
    GK.save.commit();
    game().setMenuKart();
    menus.renderGarage();
  }

  menus.renderGarage = function () {
    const S = GK.save.data, box = $('garage-body');
    $('garage-coins').textContent = S.coins;
    document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === menus.garageTab));
    box.innerHTML = '';
    if (menus.garageTab === 'char') {
      const wrap = document.createElement('div'); wrap.className = 'cards row';
      GK.CHARS.forEach((c) => {
        const owned = S.chars.indexOf(c.id) >= 0, sel = S.look.char === c.id;
        const card = document.createElement('div');
        card.className = 'card char' + (sel ? ' selected' : '');
        card.innerHTML = '<h3>' + c.name + '</h3><p>' + c.desc + '</p>';
        const b = document.createElement('button');
        b.className = 'btn small' + (sel ? '' : ' primary');
        if (sel) { b.textContent = '✔ 使用中'; b.disabled = true; } else if (owned) b.textContent = '選擇';
        else { b.textContent = '解鎖 🪙' + c.cost; b.disabled = S.coins < c.cost; }
        b.addEventListener('click', () => {
          GK.audio.init();
          if (!owned) { if (S.coins < c.cost) return; S.coins -= c.cost; S.chars.push(c.id); }
          GK.audio.motif(c.motif);
          applyLook({ char: c.id });
        });
        card.appendChild(b);
        wrap.appendChild(card);
      });
      box.appendChild(wrap);
      const n = document.createElement('p'); n.className = 'note2'; n.textContent = '所有角色只有外觀、動畫、粒子與音效不同，不影響速度與操控。';
      box.appendChild(n);
    } else if (menus.garageTab === 'kart') {
      const wrap = document.createElement('div'); wrap.className = 'cards row';
      GK.KART_DEFS.forEach((k) => {
        const owned = S.unlocked.indexOf(k.id) >= 0, sel = S.kart === k.id;
        const card = document.createElement('div');
        card.className = 'card kart' + (sel ? ' selected' : '');
        card.innerHTML = '<div class="swatch" style="background:' + hex(k.color) + '"></div><h3>' + k.name + '</h3><p>' + k.desc + '</p>' +
          stat('極速', k.max, 70) + stat('加速', k.accel, 36) + stat('操控', k.handling, 1.3);
        const b = document.createElement('button');
        b.className = 'btn small' + (sel ? '' : ' primary');
        if (sel) { b.textContent = '✔ 使用中'; b.disabled = true; } else if (owned) b.textContent = '選擇';
        else { b.textContent = '解鎖 🪙' + k.cost; b.disabled = S.coins < k.cost; }
        b.addEventListener('click', () => {
          if (!owned) { if (S.coins < k.cost) return; S.coins -= k.cost; S.unlocked.push(k.id); }
          S.kart = k.id; applyLook({});
        });
        card.appendChild(b);
        wrap.appendChild(card);
      });
      box.appendChild(wrap);
    } else {
      const L = S.look;
      let c = section(box, '車身顏色');
      GK.BODY_COLORS.forEach((col, i) => chip(c, col == null ? '原色' : '', L.color === col, () => applyLook({ color: col }), col == null ? '' : 'background:' + hex(col) + ';min-width:40px;height:34px'));
      c = section(box, '輪胎');
      GK.TIRES.forEach((t, i) => chip(c, t.name, L.tire === i, () => applyLook({ tire: i })));
      c = section(box, '尾焰顏色');
      GK.FLAMES.forEach((f, i) => chip(c, f.name, L.flame === i, () => applyLook({ flame: i }), 'border-color:' + hex(f.color)));
      c = section(box, '車輛貼紙');
      GK.STICKERS.forEach((t, i) => chip(c, t, L.sticker === i, () => applyLook({ sticker: i })));
      c = section(box, '漂移特效');
      GK.DRIFTS.forEach((t, i) => chip(c, t, L.drift === i, () => applyLook({ drift: i })));
    }
  };

  // ---------- 最佳紀錄 ----------
  menus.renderRecords = function () {
    const S = GK.save.data;
    const f = GK.fmtTime;
    let h = '<tr><th>地圖</th><th>快速 ' + S.laps + ' 圈</th><th>幽靈 ' + S.laps + ' 圈</th><th>60 秒距離</th><th>無盡</th><th>單圈</th></tr>';
    GK.MAPS.forEach((m) => {
      const r = S.records[m.id] || {};
      h += '<tr><td>' + m.name + '</td><td>' + f(r["quick_" + S.laps]) + '</td><td>' + f(r["ghost_" + S.laps]) + '</td><td>' + (r.time60 == null ? '--' : r.time60 + ' m') + '</td><td>' + (r.endless || '--') + '</td><td>' + f(r.lap) + '</td></tr>';
    });
    h += '<tr><td colspan="6" class="coin-row">🪙 金幣 ' + S.coins + '　已解鎖角色 ' + S.chars.length + '/' + GK.CHARS.length + '</td></tr>';
    $('records-table').innerHTML = h;
  };
})();
