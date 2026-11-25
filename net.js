/* 多人連線：Socket.IO 連線管理、房間狀態與請求/回覆封裝 */
(function () {
  'use strict';
  const GK = window.GK;
  const listeners = {};
  const net = (GK.net = { socket: null, status: 'idle', room: null, me: null, offset: 0, base: '', error: '' });
  let connecting = null;

  function fire(ev, data) { (listeners[ev] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }
  net.on = function (ev, fn) {
    (listeners[ev] = listeners[ev] || []).push(fn);
    return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); };
  };
  function setStatus(s, err) { net.status = s; net.error = err || ''; fire('status', s); }

  // 伺服器位址：http(s) 頁面使用同一個網域；直接開啟 file:// 時使用 localhost:3000（可用 ?server= 覆寫）
  function baseUrl() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) { try { localStorage.setItem('gk.server', q); } catch (e) { /* 略過 */ } return q.replace(/\/$/, ''); }
    if (/^https?:/.test(location.protocol)) return location.origin;
    let s = null;
    try { s = localStorage.getItem('gk.server'); } catch (e) { /* 略過 */ }
    return (s || 'http://localhost:3000').replace(/\/$/, '');
  }

  // 每個瀏覽器分頁使用自己的 token（sessionStorage），重新整理可恢復座位，同一瀏覽器的兩個分頁則是兩位玩家
  function token() {
    let t = null;
    try { t = sessionStorage.getItem('gk.token'); } catch (e) { /* 略過 */ }
    if (!t) {
      const a = new Uint8Array(24);
      (window.crypto || window.msCrypto).getRandomValues(a);
      t = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40);
      try { sessionStorage.setItem('gk.token', t); } catch (e) { /* 略過 */ }
    }
    return t;
  }

  net.name = function () {
    let n = null;
    try { n = localStorage.getItem('gk.name'); } catch (e) { /* 略過 */ }
    if (!n) { n = '玩家' + (1000 + Math.floor(Math.random() * 9000)); net.setName(n); }
    return n;
  };
  net.setName = function (n) {
    n = String(n || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 12);
    if (!n) return net.name();
    try { localStorage.setItem('gk.name', n); } catch (e) { /* 略過 */ }
    return n;
  };
  net.look = function () { return Object.assign({}, GK.save.data.look, { kart: GK.save.data.kart }); };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.io) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('NO_CLIENT_LIB'));
      document.head.appendChild(s);
    });
  }

  net.connect = function () {
    if (net.socket && net.socket.connected) return Promise.resolve();
    if (connecting) return connecting;
    connecting = (async () => {
      setStatus('connecting');
      net.base = baseUrl();
      try { await loadScript(net.base + '/socket.io/socket.io.js'); } catch (e) {
        setStatus('error', '找不到多人伺服器（' + net.base + '）。請先啟動伺服器，或確認網址是否正確。');
        throw new Error(net.error);
      }
      if (!net.socket) {
        const sock = window.io(net.base, {
          auth: (cb) => cb({ token: token(), name: net.name(), look: net.look() }),
          transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 8000,
        });
        net.socket = sock;
        sock.on('welcome', (d) => {
          net.me = d.id; net.room = d.room || null;
          net.syncTime().then(() => {});
          setStatus('online');
          fire('welcome', d);
          fire('room', net.room);
        });
        sock.on('room:state', (r) => { net.room = r; fire('room', r); });
        sock.on('room:closed', (d) => { net.room = null; fire('closed', d); fire('room', null); });
        sock.on('disconnect', () => setStatus('offline', '與伺服器的連線中斷，正在嘗試重新連線…'));
        sock.on('connect_error', (e) => {
          if (net.status === 'online') return;
          setStatus(net.status === 'offline' ? 'offline' : 'error', e && e.message === 'BAD_TOKEN' ? '連線驗證失敗，請重新整理頁面。' : '無法連線到伺服器（' + net.base + '）。');
        });
      } else {
        net.socket.connect();
      }
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => { off(); reject(new Error(net.error || '連線逾時')); }, 10000);
        const off = net.on('status', (s) => {
          if (s === 'online') { clearTimeout(to); off(); resolve(); }
          else if (s === 'error') { clearTimeout(to); off(); reject(new Error(net.error)); }
        });
        if (net.status === 'online') { clearTimeout(to); off(); resolve(); }
      });
    })();
    connecting.then(() => { connecting = null; }, () => { connecting = null; });
    return connecting;
  };

  net.disconnect = function () {
    if (net.socket) { net.socket.close(); net.socket = null; }
    net.room = null; net.me = null; setStatus('idle');
  };

  // 傳送請求並等待伺服器回覆
  net.request = function (ev, payload) {
    return new Promise((resolve) => {
      if (!net.socket || !net.socket.connected) return resolve({ ok: false, error: 'OFFLINE', message: '尚未連線到伺服器。' });
      net.socket.timeout(8000).emit(ev, payload || {}, (err, res) => {
        if (err) resolve({ ok: false, error: 'TIMEOUT', message: '伺服器沒有回應，請稍後再試。' });
        else resolve(res);
      });
    });
  };

  // 時間同步：取 5 次量測中來回時間最短的一次
  net.syncTime = async function () {
    let best = null;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await net.request('time:sync');
      const t1 = Date.now();
      if (!r.ok) continue;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: r.serverNow + rtt / 2 - t1 };
    }
    if (best) { net.offset = best.offset; net.rtt = best.rtt; }
  };
  net.serverNow = () => Date.now() + net.offset;

  net.createRoom = () => net.request('room:create');
  net.joinRoom = (code) => net.request('room:join', { code: String(code || '').trim() });
  net.leaveRoom = () => net.request('room:leave').then((r) => { if (r.ok) { net.room = null; fire('room', null); } return r; });
  net.setReady = (ready) => net.request('room:ready', { ready });
  net.setProfile = () => net.request('room:profile', { name: net.name(), look: net.look() });
  net.setSettings = (s) => net.request('room:settings', s);
  net.startRace = () => net.request('room:start');
  net.resetRoom = () => net.request('room:reset');
  net.inviteLink = (code) => net.base + '/?room=' + code;
})();
