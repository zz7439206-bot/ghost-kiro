/* 車手：賽道座標系物理（s 前進距離、lat 橫向偏移）、互動與外觀同步 */
(function () {
  'use strict';
  const GK = window.GK;
  const CF = 0.8;      // 離心係數
  const F = {};        // 暫存座標框架
  // 地面速度係數：沙地、路肩只在沒有加速時降低最高速
  function boostedSurf(r, sf) { return (r.boostT > 0 || r.padT > 0) ? 1 - (1 - sf.speed) * 0.4 : sf.speed; }

  class Racer {
    constructor(game, o) {
      this.game = game;
      this.id = o.id;
      this.name = o.name;
      this.isPlayer = !!o.isPlayer;
      this.def = o.def;
      this.look = o.look || GK.defaultLook();
      this.dot = '#' + new THREE.Color(this.look.color != null ? this.look.color : o.def.color).getHexString();
      this.kart = GK.createKart(this.look, o.def);
      game.scene.add(this.kart.root);
      this.ai = this.isPlayer ? null : {
        skill: o.skill || 1, bias: GK.rand(-7, 7), biasT: GK.rand(2, 5),
        distractT: 0, nextDistract: GK.rand(3, 8), itemT: GK.rand(1.5, 4),
      };
      this.reset(o.s0 || 0, o.lat0 || 0);
    }

    reset(s, lat) {
      this.s = s; this.lat = lat; this.latVel = 0; this.speed = 0;
      this.y = 0; this.vy = 0; this.air = false; this.onRamp = null;
      this.steerCur = 0; this.scale = 1;
      this.boostT = 0; this.padT = 0; this.driftBoostT = 0; this.gboost = false;
      this.stunT = 0; this.slowT = 0; this.phaseT = 0; this.invulT = 0;
      this.wallCd = 0; this.bumpCd = 0; this.magnetT = 0; this.itemRoll = 0; this.stealthT = 0; this.surf = ''; this.gravMul = 1; this.bounceCd = 0;
      this.shield = false; this.item = null; this.pendingItem = null;
      this.energy = 60;
      this.drifting = false; this.driftT = 0; this.driftDir = 0;
      this.finished = false; this.finishTime = 0; this.rank = 1;
      this.lap = 1; this.lapStart = 0; this.lapTimes = [];
      this.wx = 0; this.wz = 0; this.fdx = 0; this.fdz = 1;
      this.fxT = 0; this.spin = 0; this.wheelRot = 0;
    }

    driftStage() { const t = this.driftT; return t > 2.4 ? 3 : t > 1.4 ? 2 : t > 0.6 ? 1 : 0; }

    destroy() { this.game.scene.remove(this.kart.root); }

    maxLat() {
      return 17 * this.def.handling * (0.35 + 0.65 * Math.min(1, this.speed / 28)) * (this.drifting ? 1.25 : 1) * (this.air ? 0.55 : 1);
    }

    // 控制輸入 c: { steer, brake, boost, phase, item }
    update(dt, c) {
      const g = this.game, T = g.track, def = this.def, L = T.length;
      const stunned = this.stunT > 0;
      this.boostT = Math.max(0, this.boostT - dt);
      this.padT = Math.max(0, this.padT - dt);
      this.driftBoostT = Math.max(0, this.driftBoostT - dt);
      this.slowT = Math.max(0, this.slowT - dt);
      this.phaseT = Math.max(0, this.phaseT - dt);
      this.invulT = Math.max(0, this.invulT - dt);
      this.wallCd = Math.max(0, this.wallCd - dt);
      this.bumpCd = Math.max(0, this.bumpCd - dt);
      this.magnetT = Math.max(0, this.magnetT - dt);
      this.stealthT = Math.max(0, this.stealthT - dt);
      this.bounceCd = Math.max(0, this.bounceCd - dt);
      const sf = T.surfaceAt(this.s, this.lat);
      this.surf = sf.type;
      this.gravMul = sf.grav;
      if (stunned) { this.stunT -= dt; c = { steer: 0, brake: false, boost: false }; }

      // 抽道具倒數
      if (this.itemRoll > 0) {
        this.itemRoll -= dt;
        if (this.itemRoll <= 0) {
          this.itemRoll = 0; this.item = this.pendingItem; this.pendingItem = null;
          g.emit('itemReady', this);
        }
      }

      // 幽靈加速（耗能量）
      this.gboost = !!c.boost && this.energy > 2 && !stunned;
      this.energy = this.gboost ? Math.max(0, this.energy - 30 * dt) : Math.min(100, this.energy + (this.drifting ? 14 : 8) * dt);
      // 幽靈穿越
      if (c.phase && this.phaseT <= 0 && this.energy >= 35 && !stunned) {
        this.energy -= 35; this.phaseT = 2.6; g.emit('phase', this);
      }
      // 使用道具
      if (c.item && this.item && !stunned) {
        const it = this.item; this.item = null;
        g.items.use(this, it);
      }

      // ---- 速度 ----
      let mult = 1;
      if (this.boostT > 0) mult = 1.5;
      else if (this.padT > 0) mult = 1.38;
      else if (this.driftBoostT > 0) mult = this.driftBoostLv >= 3 ? 1.34 : 1.26;
      if (this.gboost) mult = Math.max(mult, 1.3);
      if (this.slowT > 0) mult *= 0.62;
      const vmax = def.max * this.scale * mult * (boostedSurf(this, sf));
      const boosted = mult > 1.05;
      if (stunned) {
        this.speed *= Math.exp(-1.6 * dt);
      } else {
        const target = c.brake ? 6 : vmax;
        if (this.speed < target) {
          this.speed = Math.min(target, this.speed + def.accel * (boosted ? 3 : 1) * (this.speed < 10 ? 1.6 : 1) * dt);
        } else {
          this.speed = Math.max(target, this.speed - (c.brake ? 60 : 22) * dt);
        }
      }

      // ---- 轉向、漂移、離心力 ----
      if (!stunned) {
        this.steerCur = GK.damp(this.steerCur, c.steer, 14, dt);
        const hard = Math.abs(this.steerCur) > 0.65 && this.speed > def.max * 0.7 && !this.air;
        if (hard) {
          if (!this.drifting) { this.drifting = true; this.driftT = 0; this.driftDir = Math.sign(this.steerCur); g.emit('driftStart', this); }
          this.driftT += dt;
        } else if (this.drifting) {
          this.drifting = false;
          const st = this.driftStage();
          if (st > 0) {
            this.driftBoostT = [0, 0.7, 1.2, 1.9][st];
            this.driftBoostLv = st;
            g.emit('driftBoost', this, { stage: st });
          }
          this.driftT = 0;
        }
        const grip = (this.drifting ? 3.4 : 6.5) * (this.air ? 0.4 : 1) * sf.grip;
        this.latVel += (this.steerCur * this.maxLat() - this.latVel) * Math.min(1, grip * dt);
      } else {
        this.steerCur = GK.damp(this.steerCur, 0, 6, dt);
        this.latVel *= Math.exp(-3 * dt);
        if (this.drifting) { this.drifting = false; this.driftT = 0; }
      }
      this.latVel += T.kappaAt(this.s) * this.speed * this.speed * CF * dt * (this.air ? 0.3 : 1);
      if (!this.air) this.speed = Math.max(0, this.speed - Math.abs(this.latVel) * 0.3 * dt);

      // ---- 位置 ----
      this.lat += this.latVel * dt;
      const lim = T.limit;
      if (Math.abs(this.lat) > lim) {
        const sd = Math.sign(this.lat);
        this.lat = sd * lim;
        if (this.latVel * sd > 0) this.latVel = -this.latVel * 0.35;
        if (this.wallCd <= 0 && this.speed > 12) {
          this.speed *= 0.9; this.wallCd = 0.4;
          g.emit('wall', this, { side: sd });
        }
      }
      this.s += this.speed * dt;

      // ---- 垂直（跳躍） ----
      if (this.air) {
        this.vy -= 34 * dt * (this.gravMul || 1);
        this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.air = false; g.emit('land', this); }
      }

      this.interact(dt, stunned);
    }

    // 與加速區、跳台、障礙物、道具箱互動
    interact(dt, stunned) {
      const g = this.game, T = g.track, L = T.length;

      for (const p of T.pads) {
        if (Math.abs(GK.wrapDiff(this.s, p.s, L)) < p.len / 2 && Math.abs(this.lat - p.lat) < p.wid / 2 && !this.air) {
          if (this.padT < 0.6) g.emit('pad', this);
          this.padT = 1.2;
        }
      }

      // 跳台：沿斜面抬升，離開前緣時起飛
      if (!this.air) {
        let ramp = null;
        for (const r of T.ramps) {
          const d = GK.wrapDiff(this.s, r.s + r.len / 2, L);
          if (Math.abs(this.lat - r.lat) < r.wid / 2 && d > -r.len && d <= 0) {
            ramp = r; this.y = r.h * (1 + d / r.len); break;
          }
        }
        if (this.onRamp && !ramp) {
          const d = GK.wrapDiff(this.s, this.onRamp.s + this.onRamp.len / 2, L);
          if (d > -0.5) {
            this.vy = 9 + this.speed * 0.17; this.air = true;
            g.emit('jump', this);
          } else this.y = 0;
        }
        this.onRamp = ramp;
        if (!ramp && !this.air) this.y = 0;
      }

      // 障礙物
      for (const o of T.obstacles) {
        if (!o.enabled || o.hit) continue;
        const d = GK.wrapDiff(o.s, this.s, L);
        if (Math.abs(d) > o.r + 2.2) continue;
        if (Math.abs(o.lat - this.lat) > o.r + 1.3) continue;
        if (this.y > o.h) continue;      // 跳過去了
        if (this.phaseT > 0) continue;   // 幽靈穿越
        if (o.type === 'bounce') {       // 彈跳糖球：把車彈起，不會暈眩
          if (this.bounceCd <= 0 && !stunned) {
            this.vy = 13 + this.speed * 0.06; this.air = true; this.y = Math.max(this.y, 0.05); this.onRamp = null;
            this.bounceCd = 0.6; g.emit('bounce', this);
          }
          continue;
        }
        T.knock(o, Math.sign(o.lat - this.lat) || 1);
        if (this.shield) {
          this.shield = false; g.emit('shieldBreak', this);
        } else if (this.invulT <= 0) {
          this.stunT = 0.75; this.speed *= 0.4; this.invulT = 1.6;
          g.emit('hit', this, { kind: 'obstacle' });
        } else {
          this.speed *= 0.85;
        }
      }

      // 道具箱
      const canTake = !this.item && !this.pendingItem && !this.finished;
      const endless = g.mode.endless;
      if ((canTake || (endless && this.isPlayer)) && !stunned) {
        const mag = this.magnetT > 0;
        const rd = mag ? 40 : 2.7, rl = mag ? 28 : 2.7;
        for (const b of T.boxes) {
          if (!b.active) continue;
          const d = GK.wrapDiff(b.s, this.s, L);
          if (mag ? (d < -4 || d > rd) : Math.abs(d) > rd) continue;
          if (Math.abs(b.lat - this.lat) > rl) continue;
          if (!mag && this.y > 3.5) continue;
          b.active = false; b.respawn = 5;
          if (mag) { b.flyTo = this; b.flyT = 0.35; } else b.mesh.visible = false;
          if (endless && this.isPlayer) g.bonus += 50;
          if (canTake) {
            this.itemRoll = this.isPlayer ? 0.9 : 0.3;
            this.pendingItem = GK.Items.roll(this.rank, g.racers.length);
            g.emit('pickup', this);
          } else g.emit('coin', this);
          break;
        }
      }
    }

    // 同步 3D 外觀
    syncVisual(dt, time) {
      const g = this.game, T = g.track, k = this.kart;
      T.frame(this.s, F);
      this.wx = F.x + F.rx * this.lat; this.wz = F.z + F.rz * this.lat;
      const yawTan = this.speed > 2 ? GK.clamp(this.latVel / Math.max(this.speed, 12), -0.6, 0.6) : 0;
      const drift = this.drifting ? this.driftDir * 0.32 : 0;
      this.fdx = F.fx + F.rx * (yawTan + drift);
      this.fdz = F.fz + F.rz * (yawTan + drift);
      k.root.position.set(this.wx, 0, this.wz);
      k.root.rotation.y = Math.atan2(this.fdx, this.fdz);
      k.body.position.y = this.y;
      this.spin = this.stunT > 0 ? this.spin + dt * 16 : 0;
      k.body.rotation.y = this.spin;
      k.body.rotation.z = GK.clamp(this.latVel * 0.012, -0.3, 0.3) + (this.drifting ? this.driftDir * 0.12 : 0);
      k.body.rotation.x = this.air ? GK.clamp(-this.vy * 0.02, -0.3, 0.3) : 0;
      k.ghostG.position.y = 1.0 + Math.sin(time * 5 + this.id) * 0.07;
      k.ghostG.rotation.z = Math.sin(time * 3 + this.id) * 0.05;
      this.wheelRot += this.speed * dt * 0.7;
      k.wheels.forEach((w) => { w.rotation.x = this.wheelRot; });
      k.pivots.forEach((p) => { p.rotation.y = -this.steerCur * 0.4; });
      const fl = (this.boostT > 0 || this.padT > 0 || this.driftBoostT > 0 || this.gboost) ? 1 : (this.speed / this.def.max) * 0.25;
      k.flames.forEach((f) => { f.scale.set(1, 1, 0.01 + fl * (0.9 + Math.random() * 0.5)); });
      k.shield.visible = this.shield;
      if (this.shield) k.shield.rotation.y += dt * 2;
      k.shadow.visible = !this.air || this.y < 12;
      k.shadow.scale.setScalar(Math.max(0.4, 1 - this.y * 0.06));
      let op = 1;
      if (this.phaseT > 0) op = 0.35 + 0.1 * Math.sin(time * 20);
      else if (this.invulT > 0 && this.stunT <= 0) op = Math.sin(time * 40) > 0 ? 1 : 0.5;
      if (this.stealthT > 0) op = Math.min(op, this.isPlayer ? 0.45 : 0.18);
      k.setOpacity(op);
      k.update(time);
    }

    // 粒子特效（每個模擬步呼叫）
    emitFx(dt) {
      const g = this.game;
      const fx = g.fx;
      const bx = this.wx - this.fdx * 2.2, bz = this.wz - this.fdz * 2.2;
      if (this.drifting && !this.air) {
        const st = this.driftStage();
        let col = st >= 3 ? [0.8, 0.3, 1] : st >= 2 ? [1, 0.6, 0.15] : st >= 1 ? [0.3, 0.8, 1] : [0.9, 0.9, 0.9];
        const dm = this.kart.driftMode;
        if (dm === 1) { const c = new THREE.Color().setHSL(Math.random(), 1, 0.6); col = [c.r, c.g, c.b]; }
        else if (dm === 2) col = [1, 0.4, 0.7];
        else if (dm === 3) col = [0.3, 1, 0.5];
        else if (dm === 4) col = [1, 0.85, 0.3];
        g.smoke.emit(bx + (Math.random() - 0.5) * 2, 0.5, bz + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2, 0.7, 0.45, 0.45, 0.5);
        for (let i = 0; i < 2; i++) {
          const sd = i ? 1 : -1;
          const rx = -this.fdz * sd * 1.4, rz = this.fdx * sd * 1.4;
          fx.emit(bx + rx, 0.3, bz + rz, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6, 0.35, col[0], col[1], col[2], 20);
        }
      }
      const sd = GK.SURFACES[this.surf];
      if (sd && sd.fx === 'dust' && this.speed > 15 && Math.random() < 0.7) {
        g.smoke.emit(bx + (Math.random() - 0.5) * 2.5, 0.4, bz + (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, 0.6, sd.fxColor[0], sd.fxColor[1], sd.fxColor[2]);
      } else if (sd && sd.fx === 'sparkle' && Math.random() < 0.5) {
        fx.emit(this.wx + (Math.random() - 0.5) * 3, 0.3, this.wz + (Math.random() - 0.5) * 3, 0, 4, 0, 0.5, sd.fxColor[0], sd.fxColor[1], sd.fxColor[2], 6);
      }
      // 角色專屬粒子（只在玩家附近產生，節省效能）
      const pl = g.player;
      if (this.speed > 8 && Math.random() < 0.3 && (this.isPlayer || Math.abs(this.wx - pl.wx) + Math.abs(this.wz - pl.wz) < 160)) {
        let c = this.kart.charFx;
        if (this.kart.charId === 'rainbow') { const cc = new THREE.Color().setHSL(Math.random(), 1, 0.6); c = [cc.r, cc.g, cc.b]; }
        const up = this.kart.charId === 'fire' || this.kart.charId === 'gold' ? 4 : this.kart.charId === 'ice' ? -1 : 1.5;
        fx.emit(this.wx + (Math.random() - 0.5) * 1.6, this.y + 1.5 + Math.random() * 1.4, this.wz + (Math.random() - 0.5) * 1.6, -this.fdx * 4 + (Math.random() - 0.5) * 2, up, -this.fdz * 4 + (Math.random() - 0.5) * 2, 0.6, c[0], c[1], c[2], this.kart.charId === 'ice' ? 3 : 0);
      }
      if (this.boostT > 0 || this.padT > 0 || this.driftBoostT > 0 || this.gboost) {
        fx.emit(bx + (Math.random() - 0.5), 0.9, bz + (Math.random() - 0.5), -this.fdx * 12, 0, -this.fdz * 12, 0.3, this.kart.flameRgb[0], this.kart.flameRgb[1], this.kart.flameRgb[2], 0);
        fx.emit(bx + (Math.random() - 0.5), 0.9, bz + (Math.random() - 0.5), -this.fdx * 18, 1, -this.fdz * 18, 0.22, 0.4, 0.8, 1, 0);
      }
      if (this.slowT > 0 && Math.random() < 0.4) {
        fx.emit(this.wx + (Math.random() - 0.5) * 2, 2.5, this.wz + (Math.random() - 0.5) * 2, 0, -3, 0, 0.4, 0.9, 0.9, 0.2, 0);
      }
      if (this.stunT > 0 && Math.random() < 0.6) {
        fx.emit(this.wx + (Math.random() - 0.5) * 2, 3.2, this.wz + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, 0.45, 1, 0.9, 0.2, 0);
      }
      if (this.magnetT > 0 && Math.random() < 0.5) {
        fx.emit(this.wx + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, this.wz + (Math.random() - 0.5) * 6, 0, 1, 0, 0.5, 1, 0.3, 0.6, 0);
      }
    }
  }

  GK.Racer = Racer;
})();
