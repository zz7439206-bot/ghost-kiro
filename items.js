/* 道具系統：幽靈火箭、幽靈炸彈（陷阱）、防護罩、閃電、氮氣加速、幽靈隱身、磁力吸引 */
(function () {
  'use strict';
  const GK = window.GK;

  GK.ITEMS = {
    missile: { icon: '🚀', name: '幽靈火箭' },
    trap: { icon: '💣', name: '幽靈炸彈' },
    shield: { icon: '🛡️', name: '防護罩' },
    lightning: { icon: '⚡', name: '閃電' },
    nitro: { icon: '🔥', name: '氮氣加速' },
    stealth: { icon: '🫥', name: '幽靈隱身' },
    magnet: { icon: '🧲', name: '磁力吸引' },
  };

  class Items {
    constructor(game) {
      this.game = game;
      this.proj = [];
      this.traps = [];
      this.missileGeo = new THREE.ConeGeometry(0.55, 2.4, 10);
      this.missileGeo.rotateX(Math.PI / 2); // 尖端朝 +z
      this.missileMat = new THREE.MeshLambertMaterial({ color: 0xff5fd0, emissive: 0x80206a });
      this.bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10);
      this.bodyGeo.rotateX(Math.PI / 2);
      this.trapGeo = new THREE.IcosahedronGeometry(1.1, 0);
      this.trapMat = new THREE.MeshLambertMaterial({ color: 0x7b3bff, emissive: 0x4a1ac0 });
      this.eyeGeo = new THREE.SphereGeometry(0.2, 8, 6);
      this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }

    // 依名次抽道具：落後者較容易拿到強力道具
    static roll(rank, total) {
      const pos = total > 1 ? (rank - 1) / (total - 1) : 0.5;
      const w = {
        nitro: 1.4 + pos * 1.6,
        missile: total > 1 ? 1.8 + (1 - pos) * 0.4 : 0,
        trap: 1.4 + (1 - pos) * 1.0,
        shield: 1.6 - pos * 0.6,
        lightning: total > 1 && pos > 0.3 ? pos * 2.4 : 0,
        stealth: 0.9 + (1 - pos) * 0.6,
        magnet: 0.7,
      };
      let sum = 0;
      for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) { r -= w[k]; if (r <= 0) return k; }
      return 'nitro';
    }

    // 選擇火箭目標：優先最近的前方對手，隱身者有 75% 機率被忽略
    pickTarget(racer) {
      const g = this.game, L = g.track.length;
      let best = null, bestD = 260, fallback = null, fbD = 260;
      for (const o of g.racers) {
        if (o === racer || o.finished) continue;
        const d = GK.wrapDiff(o.s, racer.s, L);
        if (d <= 0 || d >= 260) continue;
        if (d < fbD) { fbD = d; fallback = o; }
        if (o.stealthT > 0 && Math.random() < 0.75) continue;
        if (d < bestD) { bestD = d; best = o; }
      }
      return best || fallback;
    }

    use(racer, kind) {
      const g = this.game;
      g.emit('item:' + kind, racer);
      switch (kind) {
        case 'nitro':
          racer.boostT = 2.6;
          racer.speed += 8;
          break;
        case 'shield':
          racer.shield = true;
          break;
        case 'magnet':
          racer.magnetT = 6;
          break;
        case 'stealth':
          racer.stealthT = 6;
          break;
        case 'lightning':
          for (const o of g.racers) {
            if (o === racer || o.finished) continue;
            if (o.shield) { o.shield = false; g.emit('shieldBreak', o); } else { o.slowT = 3.2; g.emit('lightningHit', o); }
          }
          g.flash();
          break;
        case 'missile': {
          const mesh = new THREE.Group();
          mesh.add(new THREE.Mesh(this.missileGeo, this.missileMat));
          const body = new THREE.Mesh(this.bodyGeo, this.missileMat);
          body.position.z = -1.4; mesh.add(body);
          g.scene.add(mesh);
          this.proj.push({ s: racer.s + 4, lat: racer.lat, owner: racer, target: this.pickTarget(racer), life: 4.5, mesh });
          break;
        }
        case 'trap': {
          const mesh = new THREE.Group();
          mesh.add(new THREE.Mesh(this.trapGeo, this.trapMat));
          [-1, 1].forEach((s) => { const e = new THREE.Mesh(this.eyeGeo, this.eyeMat); e.position.set(s * 0.4, 0.25, 0.9); mesh.add(e); });
          const p = g.track.place(racer.s - 5, racer.lat, {});
          mesh.position.set(p.x, 1.2, p.z);
          g.scene.add(mesh);
          this.traps.push({ s: racer.s - 5, lat: racer.lat, owner: racer, armT: 1.0, life: 25, mesh, x: p.x, z: p.z });
          break;
        }
        default: break;
      }
    }

    // 攻擊命中：防護罩可抵擋一次
    strike(r, stun, slow) {
      const g = this.game;
      if (r.shield) { r.shield = false; g.emit('shieldBreak', r); return false; }
      r.stunT = stun; r.speed *= slow; r.invulT = stun;
      g.emit('attackHit', r);
      return true;
    }

    update(dt) {
      const g = this.game, L = g.track.length, tmp = this._tmp || (this._tmp = {});
      // 火箭
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const p = this.proj[i];
        p.life -= dt;
        p.s += 140 * dt;
        if (p.target) p.lat += GK.clamp(p.target.lat - p.lat, -22 * dt, 22 * dt);
        let hit = null;
        for (const r of g.racers) {
          if (r === p.owner || r.phaseT > 0) continue;
          if (Math.abs(GK.wrapDiff(r.s, p.s, L)) < 3.4 && Math.abs(r.lat - p.lat) < 2.8) { hit = r; break; }
        }
        g.track.place(p.s, p.lat, tmp);
        p.mesh.position.set(tmp.x, 1.3, tmp.z);
        p.mesh.rotation.y = Math.atan2(tmp.fx, tmp.fz);
        g.fx.emit(tmp.x - tmp.fx * 2, 1.3, tmp.z - tmp.fz * 2, 0, 0, 0, 0.35, 1, 0.5, 0.2);
        g.smoke.emit(tmp.x - tmp.fx * 2.4, 1.3, tmp.z - tmp.fz * 2.4, 0, 1, 0, 0.6, 0.4, 0.4, 0.4);
        if (hit) {
          g.emit('explode', hit, { x: tmp.x, z: tmp.z });
          this.strike(hit, 1.5, 0.25);
        }
        if (hit || p.life <= 0) {
          g.scene.remove(p.mesh);
          this.proj.splice(i, 1);
        }
      }
      // 陷阱
      for (let i = this.traps.length - 1; i >= 0; i--) {
        const t = this.traps[i];
        t.life -= dt; t.armT -= dt;
        t.mesh.rotation.y += dt * 2;
        t.mesh.position.y = 1.2 + Math.sin(g.time * 4 + t.s) * 0.2;
        let hit = null;
        for (const r of g.racers) {
          if (r.phaseT > 0 || r.y > 1.5) continue;
          if (r === t.owner && t.armT > 0) continue;
          if (Math.abs(GK.wrapDiff(r.s, t.s, L)) < 2.8 && Math.abs(r.lat - t.lat) < 2.5) { hit = r; break; }
        }
        if (hit) {
          g.emit('explode', hit, { x: t.x, z: t.z });
          this.strike(hit, 1.4, 0.3);
        }
        if (hit || t.life <= 0) {
          g.scene.remove(t.mesh);
          this.traps.splice(i, 1);
        }
      }
    }

    clear() {
      this.proj.forEach((p) => this.game.scene.remove(p.mesh));
      this.traps.forEach((p) => this.game.scene.remove(p.mesh));
      this.proj.length = 0; this.traps.length = 0;
    }
  }

  GK.Items = Items;
})();
