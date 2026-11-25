/* 各主題地圖的場景裝飾：建築、樹木、水晶、星球、糖果、火山等 */
(function () {
  'use strict';
  const GK = window.GK;
  const dummy = new THREE.Object3D();
  const col = (h) => new THREE.Color(h);

  function inst(root, geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.frustumCulled = false;
    m._n = 0; // 自行計數；setColorAt 需要 count 等於容量，結束時才設定實際數量
    root.add(m);
    return m;
  }
  // 依序加入實例；回傳是否成功
  function add(m, x, y, z, ry, sx, sy, sz, color) {
    const i = m._n;
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    if (color != null) m.setColorAt(i, color);
    m._n = i + 1;
  }
  function done(...ms) {
    ms.forEach((m) => { m.count = m._n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
  function spot(track, rng, minD, maxR, minR) {
    for (let t = 0; t < 40; t++) {
      const a = rng() * Math.PI * 2, r = (minR || 30) + Math.sqrt(rng()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (track.nearTrack(x, z) > minD) return [x, z];
    }
    return null;
  }
  // 賽道外圍的遠景環形位置
  function farRing(track, rng, rMin, rMax) {
    let maxR = 0;
    for (let i = 0; i < track.N; i += 10) maxR = Math.max(maxR, Math.hypot(track.px[i], track.pz[i]));
    const a = rng() * Math.PI * 2, r = maxR + rMin + rng() * (rMax - rMin);
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  const THEMES = {
    city(track, q, rng, root) {
      const win = GK.canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = '#05030f'; g.fillRect(0, 0, w, h);
        const cols = ['#3de6ff', '#ff3fd8', '#ffd93d', '#ffffff', '#7a5cff'];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 7; x++) {
          if (rng() < 0.55) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(8 + x * 16, 6 + y * 15, 9, 9); }
        }
      });
      const bm = new THREE.MeshLambertMaterial({ map: win, emissiveMap: win, emissive: 0xffffff, color: 0xffffff });
      const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
      const n = Math.round(170 * q);
      const b = inst(root, bg, bm, n);
      const tints = [0x2a1f6a, 0x3a1f7a, 0x1f2f7a, 0x4a1f6a].map(col);
      for (let i = 0; i < n; i++) {
        const sp = spot(track, rng, track.half + 20, 650);
        if (!sp) break;
        const h = 30 + rng() * 120;
        add(b, sp[0], -0.3, sp[1], rng() * 3, 16 + rng() * 16, h, 16 + rng() * 16, tints[Math.floor(rng() * tints.length)]);
      }
      done(b);
      // 發光看板
      const texts = ['NEON', 'GHOST', 'KIRO', 'RACE'];
      const bgs = ['#ff3fd8', '#3de6ff', '#ffd93d', '#7a5cff'];
      texts.forEach((t, k) => {
        const tex = GK.canvasTex(256, 128, (g, w, h) => {
          g.fillStyle = bgs[k]; g.fillRect(0, 0, w, h);
          g.fillStyle = '#fff'; g.font = 'italic 900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(t, w / 2, h / 2 + 4);
        });
        for (let j = 0; j < 3; j++) {
          const s = track.length * ((k * 3 + j) / 12 + 0.02), sd = (j % 2) ? 1 : -1;
          const p = track.place(s, sd * (track.half + 11), {});
          const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
          m.position.set(p.x, 7, p.z);
          m.rotation.y = Math.atan2(p.fx, p.fz) + Math.PI / 2;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), new THREE.MeshLambertMaterial({ color: 0x222244 }));
          post.position.set(p.x, 3.5, p.z);
          root.add(m, post);
        }
      });
    },

    forest(track, q, rng, root, extras) {
      const trunkG = new THREE.CylinderGeometry(0.5, 0.8, 3, 6); trunkG.translate(0, 1.5, 0);
      const c1G = new THREE.ConeGeometry(3.4, 6, 8); c1G.translate(0, 6, 0);
      const c2G = new THREE.ConeGeometry(2.5, 5, 8); c2G.translate(0, 10, 0);
      const n = Math.round(150 * q);
      const tr = inst(root, trunkG, new THREE.MeshLambertMaterial({ color: 0x3a2a3a }), n);
      const t1 = inst(root, c1G, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const t2 = inst(root, c2G, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const greens = [0x14463a, 0x1c4a52, 0x2a3a7a, 0x1a5a4a].map(col);
      for (let i = 0; i < n; i++) {
        const sp = spot(track, rng, track.half + 10, 480);
        if (!sp) break;
        const sc = 0.9 + rng() * 1.4, c = greens[Math.floor(rng() * greens.length)], ry = rng() * 6;
        add(tr, sp[0], -0.3, sp[1], ry, sc); add(t1, sp[0], -0.3, sp[1], ry, sc, sc, sc, c); add(t2, sp[0], -0.3, sp[1], ry, sc, sc, sc, c);
      }
      done(tr, t1, t2);
      // 幽靈樹：半透明發光
      const gn = Math.round(30 * q);
      const gg = new THREE.ConeGeometry(3, 18, 8); gg.translate(0, 9, 0);
      const gt = inst(root, gg, new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), gn);
      for (let i = 0; i < gn; i++) { const sp = spot(track, rng, track.half + 12, 420); if (!sp) break; add(gt, sp[0], -0.3, sp[1], rng() * 6, 0.8 + rng() * 1.2, 0.8 + rng() * 1.3, 0.8 + rng()); }
      done(gt);
      // 發光蘑菇
      const mn = Math.round(150 * q);
      const stG = new THREE.CylinderGeometry(0.35, 0.5, 2, 6); stG.translate(0, 1, 0);
      const capG = new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); capG.translate(0, 2, 0);
      const st = inst(root, stG, new THREE.MeshLambertMaterial({ color: 0xcfe8ff, emissive: 0x335577 }), mn);
      const cap = inst(root, capG, new THREE.MeshBasicMaterial({ color: 0xffffff }), mn);
      const caps = [0x3de6ff, 0x4d8cff, 0xb48cff, 0x7affc8].map(col);
      for (let i = 0; i < mn; i++) {
        const sp = spot(track, rng, track.half + 5, 360);
        if (!sp) break;
        const sc = 0.8 + rng() * 2.6;
        add(st, sp[0], -0.3, sp[1], 0, sc); add(cap, sp[0], -0.3, sp[1], 0, sc, sc, sc, caps[Math.floor(rng() * caps.length)]);
      }
      done(st, cap);
      // 月亮
      const moon = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, fog: false }));
      moon.position.set(-900, 1000, -1300);
      extras.push(moon);
    },

    ice(track, q, rng, root, extras) {
      const mg = new THREE.ConeGeometry(1, 1, 7); mg.translate(0, 0.5, 0);
      const mn = 26;
      const m = inst(root, mg, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a5a7a }), mn);
      const tints = [0xe8f4ff, 0xcfe6fa, 0xb8d4f0].map(col);
      for (let i = 0; i < mn; i++) {
        const p = farRing(track, rng, 120, 500);
        const r = 90 + rng() * 90;
        add(m, p[0], -0.3, p[1], rng() * 6, r, 110 + rng() * 170, r, tints[Math.floor(rng() * 3)]);
      }
      done(m);
      const cg = new THREE.OctahedronGeometry(1.4, 0); cg.scale(0.8, 2.6, 0.8); cg.translate(0, 3.2, 0);
      const cn = Math.round(80 * q);
      const cr = inst(root, cg, new THREE.MeshLambertMaterial({ color: 0xbfeaff, emissive: 0x3a6a9a, transparent: true, opacity: 0.85 }), cn);
      for (let i = 0; i < cn; i++) { const sp = spot(track, rng, track.half + 8, 520); if (!sp) break; const s = 0.8 + rng() * 2; add(cr, sp[0], -0.3, sp[1], rng() * 6, s, s * (0.8 + rng() * 1.2), s); }
      done(cr);
      // 積雪樹
      const trG = new THREE.ConeGeometry(3, 7, 7); trG.translate(0, 5, 0);
      const tn = Math.round(70 * q);
      const tt = inst(root, trG, new THREE.MeshLambertMaterial({ color: 0xffffff }), tn);
      const tcol = [0xf2f8ff, 0xcfe6fa].map(col);
      for (let i = 0; i < tn; i++) { const sp = spot(track, rng, track.half + 10, 480); if (!sp) break; const s = 0.9 + rng() * 1.3; add(tt, sp[0], -0.3, sp[1], rng() * 6, s, s, s, tcol[i % 2]); }
      done(tt);
      // 冰塊
      const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
      const bn = Math.round(40 * q);
      const bl = inst(root, bg, new THREE.MeshLambertMaterial({ color: 0xcfeaff, emissive: 0x294a6a, transparent: true, opacity: 0.9 }), bn);
      for (let i = 0; i < bn; i++) { const sp = spot(track, rng, track.half + 8, 520); if (!sp) break; add(bl, sp[0], -0.3, sp[1], rng() * 6, 4 + rng() * 10, 2 + rng() * 6, 4 + rng() * 10); }
      done(bl);
    },

    space(track, q, rng, root, extras) {
      const ag = new THREE.IcosahedronGeometry(1, 0);
      const an = Math.round(110 * q);
      const a = inst(root, ag, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a1040 }), an);
      const tints = [0x6a5a8a, 0x8a6a6a, 0x5a6a9a].map(col);
      for (let i = 0; i < an; i++) {
        const sp = spot(track, rng, track.half + 14, 560);
        if (!sp) break;
        const s = 4 + rng() * 20;
        add(a, sp[0], (rng() - 0.5) * 140, sp[1], rng() * 6, s, s * (0.6 + rng() * 0.6), s * (0.7 + rng() * 0.5), tints[Math.floor(rng() * 3)]);
      }
      done(a);
      // 遠方星球
      const planet = (r, color, emissive, pos, ring) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), new THREE.MeshLambertMaterial({ color, emissive, fog: false }));
        m.position.set(pos[0], pos[1], pos[2]);
        extras.push(m);
        if (ring) {
          const rg = new THREE.Mesh(new THREE.RingGeometry(r * 1.4, r * 2.1, 48), new THREE.MeshBasicMaterial({ color: 0xffd8a0, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
          rg.rotation.x = -Math.PI / 2 + 0.35; rg.position.copy(m.position);
          extras.push(rg);
        }
      };
      planet(260, 0xff9a4a, 0x7a3410, [-1100, 520, -1250], true);
      planet(150, 0x4a8cff, 0x142a6a, [1200, 260, -900], false);
      planet(70, 0xd0d0e8, 0x303050, [300, 760, 1400], false);
    },

    candy(track, q, rng, root, extras) {
      const popCols = [0xff7aa8, 0xffb066, 0xffe066, 0x7aeaa0, 0x66c8ff, 0xb58cff].map(col);
      const ln = Math.round(80 * q);
      const stG = new THREE.CylinderGeometry(0.4, 0.4, 9, 8); stG.translate(0, 4.5, 0);
      const dG = new THREE.SphereGeometry(1, 16, 12); dG.scale(1, 1, 0.22);
      const st = inst(root, stG, new THREE.MeshLambertMaterial({ color: 0xffffff }), ln);
      const ds = inst(root, dG, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }), ln);
      for (let i = 0; i < ln; i++) {
        const sp = spot(track, rng, track.half + 10, 500);
        if (!sp) break;
        const s = 3.5 + rng() * 4, ry = rng() * 6;
        add(st, sp[0], -0.3, sp[1], ry, 1, 0.8 + s / 8, 1);
        dummy.position.set(sp[0], 9 * (0.8 + s / 8) + s * 0.6, sp[1]);
        add(ds, sp[0], 9 * (0.8 + s / 8) + s * 0.6, sp[1], ry, s, s, s, popCols[Math.floor(rng() * 6)]);
      }
      done(st, ds);
      // 軟糖
      const gn = Math.round(110 * q);
      const gG = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const gd = inst(root, gG, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }), gn);
      for (let i = 0; i < gn; i++) { const sp = spot(track, rng, track.half + 6, 480); if (!sp) break; const s = 2 + rng() * 5; add(gd, sp[0], -0.3, sp[1], 0, s, s * 0.9, s, popCols[Math.floor(rng() * 6)]); }
      done(gd);
      // 巧克力方塊
      const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
      const bn = Math.round(30 * q);
      const bl = inst(root, bg, new THREE.MeshLambertMaterial({ color: 0x7a4a3a, emissive: 0x2a1410 }), bn);
      for (let i = 0; i < bn; i++) { const sp = spot(track, rng, track.half + 10, 480); if (!sp) break; add(bl, sp[0], -0.3, sp[1], rng() * 6, 5 + rng() * 9, 3 + rng() * 8, 5 + rng() * 9); }
      done(bl);
      // 彩虹拱門
      const rb = new THREE.Group();
      popCols.forEach((c, k) => {
        const t = new THREE.Mesh(new THREE.TorusGeometry(130 - k * 9, 5, 8, 36, Math.PI), new THREE.MeshBasicMaterial({ color: c }));
        rb.add(t);
      });
      const p = farRing(track, rng, 60, 200);
      rb.position.set(p[0], -0.3, p[1]); rb.rotation.y = rng() * 3;
      root.add(rb);
    },

    lava(track, q, rng, root, extras) {
      const rg = new THREE.IcosahedronGeometry(1, 0);
      const rn = Math.round(110 * q);
      const rk = inst(root, rg, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a0a04 }), rn);
      const tints = [0x2a1f22, 0x3a2a2e, 0x4a2a22].map(col);
      for (let i = 0; i < rn; i++) {
        const sp = spot(track, rng, track.half + 6, 520);
        if (!sp) break;
        const s = 3 + rng() * 10;
        add(rk, sp[0], 0, sp[1], rng() * 6, s, s * (0.8 + rng() * 1.2), s, tints[Math.floor(rng() * 3)]);
      }
      done(rk);
      // 火山
      const vg = new THREE.ConeGeometry(1, 1, 9); vg.translate(0, 0.5, 0);
      const vn = 8;
      const vc = inst(root, vg, new THREE.MeshLambertMaterial({ color: 0x3a2420, emissive: 0x200a06 }), vn);
      const tg = new THREE.ConeGeometry(1, 1, 9); tg.translate(0, 0.5, 0);
      const tops = inst(root, tg, new THREE.MeshBasicMaterial({ color: 0xff7a1f }), vn);
      for (let i = 0; i < vn; i++) {
        const p = farRing(track, rng, 100, 450), r = 120 + rng() * 120, h = 160 + rng() * 160;
        add(vc, p[0], -0.3, p[1], 0, r, h, r);
        add(tops, p[0], h * 0.86, p[1], 0, r * 0.2, h * 0.14, r * 0.2);
      }
      done(vc, tops);
      // 火柱
      const pn = Math.round(28 * q);
      const pg = new THREE.CylinderGeometry(2, 2.8, 1, 10, 1, true); pg.translate(0, 0.5, 0);
      const pl = inst(root, pg, new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), pn);
      for (let i = 0; i < pn; i++) { const sp = spot(track, rng, track.half + 14, 460); if (!sp) break; add(pl, sp[0], -0.3, sp[1], 0, 1 + rng() * 1.5, 30 + rng() * 60, 1 + rng() * 1.5); }
      done(pl);
    },
  };

  GK.buildScenery = function (track, quality) {
    const q = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;
    const map = track.map, root = track.root, extras = [];
    const rng = GK.mulberry32(5 + map.id.length);
    THEMES[map.theme](track, q, rng, root, extras);

    // 雲 / 氣球
    const cloudCol = { ice: 0xffffff, candy: 0xfff0fa, forest: 0, city: 0, space: 0, lava: 0x3a1a14 }[map.theme];
    if (cloudCol) {
      const nCl = Math.round(34 * q) + 8;
      const cl = inst(root, new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: cloudCol, transparent: true, opacity: map.theme === 'lava' ? 0.7 : 0.85, fog: false }), nCl);
      for (let i = 0; i < nCl; i++) {
        const a = rng() * 6.28, r = 300 + rng() * 900, sc = 30 + rng() * 40;
        add(cl, Math.cos(a) * r, 120 + rng() * 120, Math.sin(a) * r, 0, sc, sc * 0.35, sc * 0.6);
      }
      done(cl);
    }
    if (map.theme === 'candy') {
      const nB = Math.round(26 * q);
      const bal = inst(root, new THREE.SphereGeometry(3, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), nB);
      const pc = [0xff7aa8, 0xffe066, 0x7aeaa0, 0x66c8ff].map(col);
      for (let i = 0; i < nB; i++) {
        const a = rng() * 6.28, r = 60 + rng() * 480, sc = 0.8 + rng() * 1.2;
        add(bal, Math.cos(a) * r, 25 + rng() * 40, Math.sin(a) * r, 0, sc, sc * 1.2, sc, pc[i % 4]);
      }
      done(bal);
    }

    // 路邊燈柱
    const step = Math.max(8, Math.round((quality === 'low' ? 36 : 22) * track.N / 900));
    const lampCols = map.pal.lamp.map(col);
    const poleG = new THREE.CylinderGeometry(0.18, 0.25, 6, 6); poleG.translate(0, 3, 0);
    const lampG = new THREE.SphereGeometry(0.7, 10, 8); lampG.translate(0, 6.3, 0);
    const cnt = Math.floor(track.N / step) * 2;
    const poles = inst(root, poleG, new THREE.MeshLambertMaterial({ color: 0x4a4390 }), cnt);
    const lamps = inst(root, lampG, new THREE.MeshBasicMaterial({ color: 0xffffff }), cnt);
    let k = 0;
    for (let i = 0; i < track.N; i += step) {
      [-1, 1].forEach((sd) => {
        const lat = sd * (track.half + 5);
        const x = track.px[i] - track.fz[i] * lat, z = track.pz[i] + track.fx[i] * lat;
        add(poles, x, 0, z, 0, 1); add(lamps, x, 0, z, 0, 1, 1, 1, lampCols[(k + (sd > 0 ? 1 : 0)) % lampCols.length]);
        k++;
      });
    }
    done(poles, lamps);

    // 隧道拱門
    (map.tunnels || []).forEach((t) => {
      const s0 = track.length * t[0], s1 = track.length * t[1];
      const n = Math.floor((s1 - s0) / 9);
      const R = track.half + 3.2;
      const g = new THREE.TorusGeometry(R, 0.7, 6, 22, Math.PI);
      const a = inst(root, g, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
      const c1 = col(t[2]), c2 = col(t[3]);
      for (let i = 0; i < n; i++) {
        const p = track.place(s0 + i * 9, 0, {});
        add(a, p.x, 0, p.z, Math.atan2(p.fx, p.fz), 1, 0.62, 1, i % 2 ? c1 : c2);
      }
      done(a);
    });

    return extras;
  };
})();
