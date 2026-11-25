/* Kiro 幽靈賽車：賽車車身、八位幽靈角色與外觀改裝（純外觀，不影響成績） */
(function () {
  'use strict';
  const GK = window.GK;

  // 賽車車身（有數值差異）
  GK.KART_DEFS = [
    { id: 0, name: 'Kiro 經典', color: 0x4fd0ff, max: 62, accel: 30, handling: 1.0, cost: 0, desc: '均衡型，適合新手。' },
    { id: 1, name: '火箭粉紅', color: 0xff5fa8, max: 68, accel: 25, handling: 0.85, cost: 100, desc: '極速最高，但轉向較遲鈍。' },
    { id: 2, name: '薄荷漂移', color: 0x4dffb0, max: 60, accel: 34, handling: 1.25, cost: 250, desc: '加速快、轉向靈活，適合漂移。' },
  ];

  // 幽靈角色（純外觀；各角色的操控數值完全相同）
  GK.CHARS = [
    { id: 'kiro', name: 'Kiro', desc: '基本款白色幽靈，圓滾滾又可愛。', cost: 0, fx: [0.9, 0.95, 1], motif: [660, 880, 1100] },
    { id: 'fire', name: 'Fire Kiro', desc: '頭頂燃燒火苗的火焰幽靈。', cost: 0, fx: [1, 0.55, 0.1], motif: [330, 440, 660] },
    { id: 'ice', name: 'Ice Kiro', desc: '長著冰晶的冰雪幽靈。', cost: 0, fx: [0.6, 0.9, 1], motif: [1320, 1760, 1480] },
    { id: 'neon', name: 'Neon Kiro', desc: '頭上有光環的霓虹幽靈。', cost: 0, fx: [1, 0.3, 0.9], motif: [523, 784, 1047] },
    { id: 'shadow', name: 'Shadow Kiro', desc: '紅眼睛、身旁飄著暗影的幽靈。', cost: 120, fx: [0.55, 0.3, 0.8], motif: [196, 147, 110] },
    { id: 'cyber', name: 'Cyber Kiro', desc: '戴著護目鏡與天線的科技幽靈。', cost: 160, fx: [0.2, 1, 0.7], motif: [880, 660, 990, 1320] },
    { id: 'gold', name: 'Gold Kiro', desc: '戴著王冠的黃金幽靈。', cost: 250, fx: [1, 0.85, 0.3], motif: [784, 988, 1175, 1568] },
    { id: 'rainbow', name: 'Rainbow Kiro', desc: '身體會變色的彩虹幽靈。', cost: 350, fx: [1, 0.5, 0.9], motif: [523, 659, 784, 1047, 1319] },
  ];
  GK.getChar = (id) => GK.CHARS.find((c) => c.id === id) || GK.CHARS[0];

  // 外觀選項
  GK.BODY_COLORS = [null, 0xff5fa8, 0x4fd0ff, 0x4dffb0, 0xffd93d, 0xb48cff, 0xff7a3d, 0xf2f2ff];
  GK.TIRES = [
    { name: '標準', tire: 0x1d1b33, hub: 0xffd93d, glow: 0 },
    { name: '霓虹', tire: 0x15142a, hub: 0x3de6ff, glow: 1 },
    { name: '黃金', tire: 0x2a2018, hub: 0xffc83d, glow: 0 },
    { name: '白牆', tire: 0xeeeeee, hub: 0xff3d6e, glow: 0 },
    { name: '彩虹', tire: 0x1d1b33, hub: 0xffffff, glow: 2 },
  ];
  GK.FLAMES = [
    { name: '橘焰', color: 0xffa23d, rgb: [1, 0.55, 0.15] }, { name: '藍焰', color: 0x3dc6ff, rgb: [0.25, 0.75, 1] },
    { name: '紫焰', color: 0xb04dff, rgb: [0.7, 0.3, 1] }, { name: '綠焰', color: 0x4dff8a, rgb: [0.3, 1, 0.55] },
    { name: '粉焰', color: 0xff5fa8, rgb: [1, 0.37, 0.65] }, { name: '白焰', color: 0xffffff, rgb: [1, 1, 1] },
  ];
  GK.STICKERS = ['無', '⭐', '⚡', '👻', '🏁', '❤️'];
  GK.DRIFTS = ['標準（依蓄力變色）', '彩虹', '粉紅', '翠綠', '金色'];

  GK.defaultLook = () => ({ char: 'kiro', color: null, tire: 0, flame: 0, sticker: 0, drift: 0 });
  GK.randomLook = function () {
    return {
      char: GK.pick(GK.CHARS).id, color: Math.random() < 0.4 ? null : GK.pick(GK.BODY_COLORS.slice(1)),
      tire: Math.floor(Math.random() * GK.TIRES.length), flame: Math.floor(Math.random() * GK.FLAMES.length),
      sticker: Math.floor(Math.random() * GK.STICKERS.length), drift: Math.floor(Math.random() * GK.DRIFTS.length),
    };
  };
  GK.AI_NAMES = ['Boo', 'Wisp', 'Pixel', 'Nimbus', 'Echo', 'Zap', 'Mochi'];

  let sharedGhostGeo = null;
  // 幽靈身體：旋轉體 + 波浪裙擺
  GK.ghostGeometry = function () {
    if (sharedGhostGeo) return sharedGhostGeo;
    const prof = [
      [0.02, 0.0], [0.7, 0.0], [0.95, 0.12], [1.0, 0.45], [0.97, 0.95], [0.82, 1.45], [0.55, 1.8], [0.25, 1.96], [0.0, 2.0],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(prof, 28);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0.3) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setY(i, y + Math.sin(a * 5) * 0.14 * (1 - y / 0.3));
      }
    }
    g.computeVertexNormals();
    sharedGhostGeo = g;
    return g;
  };

  const stickerTex = {};
  function getStickerTex(i) {
    if (stickerTex[i]) return stickerTex[i];
    const t = GK.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, 60, 0, 6.3); g.fill();
      g.fillStyle = '#1b1744'; g.beginPath(); g.arc(w / 2, h / 2, 52, 0, 6.3); g.fill();
      g.font = '64px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(GK.STICKERS[i], w / 2, h / 2 + 4);
    });
    stickerTex[i] = t;
    return t;
  }

  // look: 外觀設定；def: 賽車車身定義
  GK.createKart = function (look, def) {
    look = Object.assign(GK.defaultLook(), look || {});
    def = def || GK.KART_DEFS[0];
    const ch = GK.getChar(look.char);
    const kartColor = look.color != null ? look.color : def.color;
    const tireDef = GK.TIRES[look.tire] || GK.TIRES[0];
    const flameDef = GK.FLAMES[look.flame] || GK.FLAMES[0];

    const root = new THREE.Group();   // 貼地，負責位置與朝向
    const body = new THREE.Group();   // 車體，負責跳躍、傾斜
    root.add(body);
    const mats = [];
    const lam = (c, extra) => {
      const m = new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
      mats.push(m); return m;
    };
    const bas = (c, extra) => {
      const m = new THREE.MeshBasicMaterial(Object.assign({ color: c }, extra || {}));
      mats.push(m); return m;
    };

    // 車體
    const chassisMat = lam(kartColor, { emissive: new THREE.Color(kartColor).multiplyScalar(0.18) });
    const dark = lam(0x2a2550);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 4.0), chassisMat);
    chassis.position.set(0, 0.75, 0); body.add(chassis);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.5), chassisMat);
    nose.position.set(0, 0.62, 2.4); body.add(nose);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 0.5), lam(0xffffff));
    bumper.position.set(0, 0.5, 3.2); body.add(bumper);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.4), dark);
    seat.position.set(0, 1.25, -1.3); body.add(seat);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 0.8), lam(0xffffff));
    wing.position.set(0, 2.0, -2.35); body.add(wing);
    [-1, 1].forEach((s) => {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.3), dark);
      st.position.set(s * 1.0, 1.55, -2.2); body.add(st);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.9), chassisMat);
      tip.position.set(s * 1.5, 2.05, -2.35); body.add(tip);
    });

    // 貼紙（引擎蓋與車側）
    if (look.sticker > 0) {
      const tex = getStickerTex(look.sticker);
      const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const hood = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), sm);
      hood.rotation.x = -Math.PI / 2; hood.position.set(0, 0.89, 2.4); body.add(hood);
      [-1, 1].forEach((s) => {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), sm);
        side.rotation.y = s * Math.PI / 2; side.position.set(s * 1.31, 0.8, 0.2); body.add(side);
      });
    }

    // 車輪
    const wheelG = new THREE.CylinderGeometry(0.7, 0.7, 0.6, 16);
    wheelG.rotateZ(Math.PI / 2);
    const hubG = new THREE.CylinderGeometry(0.32, 0.32, 0.64, 10);
    hubG.rotateZ(Math.PI / 2);
    const tire = lam(tireDef.tire);
    const hubMat = tireDef.glow ? bas(tireDef.hub) : lam(tireDef.hub, { emissive: new THREE.Color(tireDef.hub).multiplyScalar(0.3) });
    const wheels = [], pivots = [];
    [[-1.55, 1.7], [1.55, 1.7], [-1.55, -1.5], [1.55, -1.5]].forEach((p, idx) => {
      const piv = new THREE.Group();
      piv.position.set(p[0], 0.7, p[1]);
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wheelG, tire), new THREE.Mesh(hubG, hubMat));
      if (tireDef.glow === 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), bas(0x3de6ff));
        ring.rotation.y = Math.PI / 2; ring.position.x = p[0] > 0 ? 0.31 : -0.31; w.add(ring);
      }
      piv.add(w); body.add(piv);
      wheels.push(w);
      if (idx < 2) pivots.push(piv);
    });

    // 底部光暈
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.2), new THREE.MeshBasicMaterial({
      color: kartColor, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.12; root.add(glow);

    // 噴焰
    const flameG = new THREE.ConeGeometry(0.38, 1.6, 8); flameG.rotateX(-Math.PI / 2); flameG.translate(0, 0, -0.8);
    const flameMat = new THREE.MeshBasicMaterial({ color: flameDef.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames = [];
    [-0.7, 0.7].forEach((x) => {
      const f = new THREE.Mesh(flameG, flameMat);
      f.position.set(x, 0.85, -2.1); f.scale.set(1, 1, 0.01); body.add(f); flames.push(f);
    });

    // 幽靈角色
    const ghostG = new THREE.Group();
    ghostG.position.set(0, 1.0, -0.45);
    ghostG.scale.setScalar(0.9);
    body.add(ghostG);
    const gGeo = GK.ghostGeometry();
    const bodyCols = { kiro: [0xffffff, 0x4a4f80], fire: [0xff9a2e, 0x8a3000], ice: [0xcfeaff, 0x2a5a8a], neon: [0x8a7bff, 0x6a30e0],
      shadow: [0x4a3a6a, 0x1a0e3a], cyber: [0x3a4a6a, 0x0f3a6a], gold: [0xffd24a, 0x7a5a10], rainbow: [0xffffff, 0x4a4f80] }[ch.id];
    const gMat = lam(bodyCols[0], { emissive: bodyCols[1] });
    ghostG.add(new THREE.Mesh(gGeo, gMat));
    const outline = new THREE.Mesh(gGeo, bas(0x1b1744, { side: THREE.BackSide }));
    outline.scale.set(1.05, 1.03, 1.05);
    ghostG.add(outline);
    const eyeColor = ch.id === 'shadow' ? 0xff3d6e : ch.id === 'neon' ? 0xffffff : 0x14122e;
    const eyeMat = bas(eyeColor), hiMat = bas(0xffffff), cheekMat = bas(ch.id === 'shadow' ? 0x7a2a6a : 0xff8fb8);
    const eyeScale = ch.id === 'neon' ? 1.3 : 1;
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), eyeMat);
      eye.scale.set(0.85 * eyeScale, 1.55 * eyeScale, 0.6); eye.position.set(s * 0.34, 1.32, 0.84); ghostG.add(eye);
      if (ch.id !== 'neon' && ch.id !== 'shadow') {
        const hi = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), hiMat);
        hi.position.set(s * 0.34 + 0.03, 1.42, 0.94); ghostG.add(hi);
      }
      const chk = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), cheekMat);
      chk.scale.set(1.3, 0.7, 0.4); chk.position.set(s * 0.6, 1.08, 0.72); chk.rotation.y = s * 0.7; ghostG.add(chk);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), gMat);
      arm.position.set(s * 0.98, 0.9, 0.55); ghostG.add(arm);
    });

    // ---- 角色專屬外觀與動畫 ----
    const anim = [];
    const addBas = (geo, color, extra) => { const m = new THREE.Mesh(geo, bas(color, extra)); return m; };
    if (ch.id === 'fire') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.04, 0.9 + (i === 1 ? 0.4 : 0), 8), bas(i === 1 ? 0xffe066 : 0xff7a1f));
        c.position.set((i - 1) * 0.3, 2.1 + (i === 1 ? 0.25 : 0), 0); ghostG.add(c);
        anim.push((t) => { c.scale.y = 1 + Math.sin(t * 14 + i * 2) * 0.25; c.rotation.z = Math.sin(t * 9 + i) * 0.12; });
      }
    } else if (ch.id === 'ice') {
      const cm = bas(0xa8ecff, { transparent: true, opacity: 0.85 });
      const cg = new THREE.OctahedronGeometry(0.3, 0); cg.scale(0.7, 2, 0.7);
      const crystals = [];
      [[0, 2.05, 0, 1.3], [-0.45, 1.95, 0.1, 0.9], [0.45, 1.95, -0.1, 0.9], [-1.05, 1.0, 0, 0.8], [1.05, 1.0, 0, 0.8]].forEach((p, i) => {
        const c = new THREE.Mesh(cg, cm); c.position.set(p[0], p[1], p[2]); c.scale.setScalar(p[3]);
        c.rotation.z = i > 2 ? (i === 3 ? 1 : -1) * 0.9 : (p[0] * 0.6); ghostG.add(c); crystals.push(c);
      });
      anim.push((t) => { crystals.forEach((c, i) => { c.rotation.y = t * 0.8 + i; }); });
    } else if (ch.id === 'neon') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 28), bas(0x3de6ff));
      halo.rotation.x = Math.PI / 2; halo.position.y = 2.25; ghostG.add(halo);
      anim.push((t) => { halo.rotation.z = t * 3; halo.position.y = 2.25 + Math.sin(t * 4) * 0.05; gMat.emissive.setHSL(0.72 + Math.sin(t * 2) * 0.1, 1, 0.5); });
    } else if (ch.id === 'shadow') {
      const wm = bas(0x2a1a4a, { transparent: true, opacity: 0.7 });
      const wisps = [0, 1, 2].map(() => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), wm); ghostG.add(w); return w; });
      anim.push((t) => { wisps.forEach((w, i) => { const a = t * 2 + i * 2.1; w.position.set(Math.cos(a) * 1.25, 0.9 + Math.sin(t * 3 + i) * 0.35, Math.sin(a) * 1.25); }); });
    } else if (ch.id === 'gold') {
      const crown = new THREE.Group();
      const cm = lam(0xffe066, { emissive: 0x806010 });
      crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.28, 12, 1, true), cm));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), cm);
        sp.position.set(Math.cos(a) * 0.5, 0.28, Math.sin(a) * 0.5); crown.add(sp);
      }
      crown.position.y = 2.1; ghostG.add(crown);
      anim.push((t) => { crown.rotation.y = t * 1.5; });
    } else if (ch.id === 'cyber') {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 0.3), bas(0x0a1a2a));
      visor.position.set(0, 1.32, 0.86); visor.rotation.x = -0.05; ghostG.add(visor);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.05), bas(0x3dffd8));
      strip.position.set(0, 1.32, 1.03); ghostG.add(strip);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), bas(0x8a9ac0));
      ant.position.set(0.4, 2.2, 0); ghostG.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bas(0xff3d6e));
      tip.position.set(0.4, 2.6, 0); ghostG.add(tip);
      anim.push((t) => { tip.material.color.setHex(Math.sin(t * 8) > 0 ? 0xff3d6e : 0x551a2a); strip.scale.x = 0.85 + Math.sin(t * 3) * 0.15; });
    } else if (ch.id === 'rainbow') {
      anim.push((t) => { gMat.color.setHSL((t * 0.25) % 1, 0.75, 0.7); gMat.emissive.setHSL((t * 0.25) % 1, 0.6, 0.25); });
    }
    if (tireDef.glow === 2) anim.push((t) => { hubMat.color.setHSL((t * 0.5) % 1, 0.9, 0.6); });

    // 防護罩
    const shield = new THREE.Mesh(new THREE.SphereGeometry(3.0, 20, 14), new THREE.MeshBasicMaterial({
      color: 0x66e6ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    shield.position.y = 1.5; shield.visible = false; body.add(shield);

    // 陰影
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.09; root.add(shadow);

    let curOp = 1;
    function setOpacity(o) {
      if (Math.abs(o - curOp) < 0.001) return;
      curOp = o;
      mats.forEach((m) => { m.transparent = o < 1; m.opacity = o; });
    }
    function update(t) { for (let i = 0; i < anim.length; i++) anim[i](t); }

    return {
      root, body, ghostG, wheels, pivots, flames, shield, shadow, glow, mats, setOpacity, update,
      charId: ch.id, charFx: ch.fx, flameRgb: flameDef.rgb, driftMode: look.drift, look,
    };
  };
})();
