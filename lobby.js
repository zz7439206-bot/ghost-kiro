/* 線上多人大廳：連線畫面、房間畫面、同步倒數 */
(function () {
  'use strict';
  const GK = window.GK;
  const $ = (id) => document.getElementById(id);
  const net = GK.net;
  const lobby = (GK.lobby = {});
  let cdTimer = null, pendingInvite = null;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mapName = (id) => (GK.MAPS.find((m) => m.id === id) || {}).name || id;
  const isMenu = () => GK.game && GK.game.state === 'menu';
  const meInRoom = () => (net.room ? net.room.players.find((p) => p.id === net.me) : null);

  function setError(msg) { $('net-error').textContent = msg || ''; }
  function toast(msg) { GK.ui.toast(msg, 1800); }

  // ---------- 連線畫面 ----------
  function renderStatus() {
    const el = $('net-status'), rc = $('room-conn');
    const map = {
      idle: ['⚪ 尚未連線', ''], connecting: ['🟡 連線中…', ''], online: ['🟢 已連線', 'ok'],
      offline: ['🟠 ' + (net.error || '連線中斷，重新連線中…'), 'warn'], error: ['🔴 ' + (net.error || '無法連線'), 'bad'],
    };
    const [txt, cls] = map[net.status] || map.idle;
    [el, rc].forEach((e) => { e.textContent = txt; e.className = 'net-status ' + cls; });
    const online = net.status === 'online';
    $('btn-room-create').disabled = !online;
    $('btn-room-join').disabled = !online;
  }

  lobby.onShowOnline = async function () {
    $('net-name').value = net.name();
    setError('');
    renderStatus();
    if (pendingInvite) { $('net-code').value = pendingInvite; }
    if (net.status !== 'online') {
      try { await net.connect(); } catch (e) { setError(e.message); }
    }
    renderStatus();
  };

  async function saveName() {
    const n = net.setName($('net-name').value);
    $('net-name').value = n;
    if (net.status === 'online') net.setProfile();
    return n;
  }

  async function doCreate() {
    await saveName();
    setError('');
    const r = await net.createRoom();
    if (!r.ok) return setError(r.message || '建立房間失敗。');
    net.room = r.room; GK.audio.sfx('item');
    render();
  }

  async function doJoin() {
    await saveName();
    setError('');
    const code = $('net-code').value.trim();
    const r = await net.joinRoom(code);
    if (!r.ok) return setError(r.message || '加入房間失敗。');
    net.room = r.room; pendingInvite = null; GK.audio.sfx('item');
    render();
  }

  // ---------- 房間畫面 ----------
  function charName(id) { return GK.getChar(id).name; }

  function renderRoom() {
    const room = net.room;
    if (!room) return;
    const me = meInRoom();
    const amHost = !!me && me.host;
    $('room-code').textContent = room.code;
    $('room-count').textContent = '（' + room.players.length + '/' + room.max + '）';

    $('room-list').innerHTML = room.players.map((p) => {
      const kc = '#' + new THREE.Color(GK.KART_DEFS[p.look.kart || 0].color).getHexString();
      const badges = [
        p.host ? '<b class="badge host">👑 房主</b>' : (p.ready ? '<b class="badge ok">✔ 已準備</b>' : '<b class="badge wait">⏳ 未準備</b>'),
        !p.connected ? '<b class="badge off">離線</b>' : '',
        p.id === net.me ? '<b class="badge me">你</b>' : '',
      ].join('');
      return '<li class="' + (p.connected ? '' : 'off') + '"><i class="dot" style="background:' + kc + '"></i><span class="pn">' + esc(p.name) +
        '</span><span class="pc">' + esc(charName(p.look.char)) + '</span>' + badges + '</li>';
    }).join('');

    // 規則
    const s = room.settings;
    const selMap = $('room-map'), selLaps = $('room-laps'), ai = $('room-ai');
    if (!selMap.options.length) selMap.innerHTML = GK.MAPS.map((m) => '<option value="' + m.id + '">' + m.name + '</option>').join('');
    selMap.value = s.map; selLaps.value = String(s.laps); ai.checked = s.fillAI;
    [selMap, selLaps, ai].forEach((e) => { e.disabled = !amHost; });
    $('room-rules-note').textContent = amHost ? '你是房主，可以調整比賽規則。' : '只有房主可以調整規則。';

    // 我的角色
    const box = $('room-chars');
    box.innerHTML = '';
    GK.CHARS.filter((c) => GK.save.data.chars.indexOf(c.id) >= 0).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (me && me.look.char === c.id ? ' on' : '');
      b.textContent = c.name;
      b.addEventListener('click', async () => {
        GK.save.data.look.char = c.id; GK.save.commit();
        const r = await net.setProfile();
        if (!r.ok) toast(r.message);
      });
      box.appendChild(b);
    });

    // 按鈕
    const ready = !!me && me.ready;
    $('btn-ready').classList.toggle('hidden', amHost);
    $('btn-ready').textContent = ready ? '取消準備' : '✔ 準備';
    $('btn-ready').classList.toggle('primary', !ready);
    $('btn-start').classList.toggle('hidden', !amHost);
    const others = room.players.filter((p) => !p.host && p.connected);
    const allReady = others.every((p) => p.ready);
    $('btn-start').disabled = !allReady;
    $('btn-start').textContent = allReady ? '▶ 開始比賽（同步倒數）' : '等待玩家準備…';
  }

  function stopCountdown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }

  // 比賽狀態畫面：倒數與（尚未實作的）即時賽車
  function renderMp() {
    const room = net.room, amHost = (meInRoom() || {}).host;
    $('mp-info').innerHTML = esc(mapName(room.settings.map)) + '　' + room.settings.laps + ' 圈　玩家：' + room.players.map((p) => esc(p.name)).join('、');
    $('btn-mp-reset').classList.toggle('hidden', !amHost);
    $('mp-wait').classList.toggle('hidden', !!amHost);
    stopCountdown();
    if (room.state === 'countdown') {
      $('mp-title').textContent = '比賽即將開始';
      const tick = () => {
        const left = room.startAt - net.serverNow();
        $('mp-count').textContent = left > 0 ? String(Math.ceil(left / 1000)) : 'GO!';
        if (left > -300 && left <= 0 && !tick.go) { tick.go = true; GK.audio.sfx('go'); }
        else if (left > 0) { const n = Math.ceil(left / 1000); if (tick.n !== n) { tick.n = n; GK.audio.sfx('count'); } }
      };
      tick(); cdTimer = setInterval(tick, 100);
    } else {
      $('mp-title').textContent = '比賽進行中（測試畫面）';
      $('mp-count').textContent = 'GO!';
    }
  }

  // 依房間狀態切換畫面
  function render() {
    const room = net.room;
    if (!isMenu()) return;                                   // 單機比賽中不打斷
    const cur = document.querySelector('.screen:not(.hidden)');
    const curId = cur ? cur.id : '';
    if (!room) {
      stopCountdown();
      if (curId === 'screen-room' || curId === 'screen-mpstart') GK.ui.show('screen-online');
      return;
    }
    const online = ['screen-online', 'screen-room', 'screen-mpstart'];
    if (online.indexOf(curId) < 0 && curId !== '') return;    // 使用者在別的選單，不強制切換
    if (room.state === 'lobby') {
      stopCountdown();
      if (curId !== 'screen-room') GK.ui.show('screen-room');
      renderRoom();
    } else {
      if (curId !== 'screen-mpstart') GK.ui.show('screen-mpstart');
      renderMp();
    }
  }

  // ---------- 分享 ----------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(t);
      return ok;
    }
  }

  lobby.init = function () {
    net.on('status', renderStatus);
    net.on('room', render);
    net.on('closed', () => { if (isMenu()) { setError('房間已關閉。'); toast('房間已關閉'); } });
    net.on('welcome', (d) => { if (d.resumed && d.room) toast('已重新連線，回到房間 ' + d.room.code); });

    $('btn-room-create').addEventListener('click', doCreate);
    $('btn-room-join').addEventListener('click', doJoin);
    $('net-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    $('net-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
    $('net-name').addEventListener('change', saveName);

    $('btn-ready').addEventListener('click', async () => {
      const me = meInRoom();
      const r = await net.setReady(!(me && me.ready));
      if (!r.ok) toast(r.message);
    });
    $('btn-start').addEventListener('click', async () => {
      const r = await net.startRace();
      if (!r.ok) toast(r.message);
    });
    $('btn-leave').addEventListener('click', async () => { await net.leaveRoom(); render(); GK.ui.show('screen-online'); });
    $('btn-mp-leave').addEventListener('click', async () => { stopCountdown(); await net.leaveRoom(); GK.ui.show('screen-online'); });
    $('btn-mp-reset').addEventListener('click', async () => {
      const r = await net.resetRoom();
      if (!r.ok) toast(r.message);
    });

    const apply = async () => {
      const r = await net.setSettings({ map: $('room-map').value, laps: Number($('room-laps').value), fillAI: $('room-ai').checked });
      if (!r.ok) { toast(r.message); renderRoom(); }
    };
    ['room-map', 'room-laps', 'room-ai'].forEach((id) => $(id).addEventListener('change', apply));

    $('btn-copy-code').addEventListener('click', async () => toast((await copyText(net.room.code)) ? '已複製房號 ' + net.room.code : '複製失敗，請手動記下房號'));
    $('btn-copy-link').addEventListener('click', async () => toast((await copyText(net.inviteLink(net.room.code))) ? '已複製邀請連結' : '複製失敗'));
    $('btn-line').addEventListener('click', () => {
      const code = net.room.code;
      const text = '來玩 GHOST KIRO 幽靈競速！房號 ' + code + '\n' + net.inviteLink(code);
      window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text), '_blank', 'noopener');
    });
  };

  // 邀請連結：?room=123456
  lobby.handleInvite = function () {
    const code = new URLSearchParams(location.search).get('room');
    if (code && /^\d{6}$/.test(code)) {
      pendingInvite = code;
      GK.ui.show('screen-online');
      GK.ui.toast('你被邀請加入房間 ' + code + '，確認暱稱後按「加入」', 4000);
    }
  };
})();
