/* AI 車手控制：走內側彎道、超車、閃避障礙、漂移過彎、撿道具、依排名與玩家位置使用道具 */
(function () {
  'use strict';
  const GK = window.GK;
  const CF_EQ = 0.8;

  GK.aiControl = function (r, game, dt, out) {
    const T = game.track, L = T.length, ai = r.ai;
    const half = T.limit - 2.5;
    const look = 12 + r.speed * 0.5;
    const total = game.racers.length;

    // 偏好車道與分心計時
    ai.biasT -= dt;
    if (ai.biasT <= 0) { ai.bias = GK.rand(-7, 7); ai.biasT = GK.rand(2, 5); }
    ai.nextDistract -= dt;
    if (ai.nextDistract <= 0) {
      ai.distractT = game.difficulty.distract * GK.rand(0.6, 1.2);
      ai.nextDistract = GK.rand(4, 9);
    }
    ai.distractT = Math.max(0, ai.distractT - dt);

    // 目標橫向位置：彎道走內側
    const kAhead = T.kappaAt(r.s + look * 1.2);
    let target = ai.bias * (1 - Math.min(1, Math.abs(kAhead) * 40) * 0.7) - kAhead * 190;

    // 道具箱 / 加速區
    if (!r.item && !r.pendingItem) {
      let bestD = 1e9, box = null;
      for (const b of T.boxes) {
        if (!b.active) continue;
        const d = GK.wrapDiff(b.s, r.s, L);
        if (d > 6 && d < 75 && d < bestD) { bestD = d; box = b; }
      }
      if (box) target = box.lat;
    } else {
      for (const p of T.pads) {
        const d = GK.wrapDiff(p.s, r.s, L);
        if (d > 4 && d < 60) { target = p.lat; break; }
      }
    }

    // 避開冰面（除非已有護盾或穿越）
    for (const f of T.surfaces) {
      if (f.type !== 'ice') continue;
      const d = GK.wrapDiff(f.s0, r.s, L);
      if (d > 0 && d < 50) { target = target * 0.5; }
    }

    // 超車：前方有車擋路時換到旁邊的車道
    let overtaking = false;
    for (const o of game.racers) {
      if (o === r || o.finished) continue;
      const d = GK.wrapDiff(o.s, r.s, L);
      if (d > 3 && d < 24 && Math.abs(o.lat - r.lat) < 3.6 && o.speed < r.speed * 1.08) {
        const side = o.lat >= 0 ? -1 : 1; // 往賽道較寬的一側超車
        target = o.lat + side * 5;
        overtaking = true;
        break;
      }
    }

    // 閃避障礙（分心時會漏看）
    let nearObs = 1e9;
    if (ai.distractT <= 0 && r.phaseT <= 0) {
      let best = null;
      for (const o of T.obstacles) {
        if (!o.enabled || o.hit) continue;
        const d = GK.wrapDiff(o.s, r.s, L);
        if (d > 1 && d < look * 1.7 && Math.abs(o.lat - r.lat) < o.r + 3 && d < nearObs) { nearObs = d; best = o; }
      }
      if (best) {
        let side = r.lat >= best.lat ? 1 : -1;
        let t = best.lat + side * (best.r + 3.6);
        if (Math.abs(t) > half) { side = -side; t = best.lat + side * (best.r + 3.6); }
        target = t;
      }
    }
    // 避開前方陷阱
    for (const tr of game.items.traps) {
      const d = GK.wrapDiff(tr.s, r.s, L);
      if (d > 2 && d < look * 1.5 && Math.abs(tr.lat - r.lat) < 4 && tr.owner !== r) {
        const side = r.lat >= tr.lat ? 1 : -1;
        target = tr.lat + side * 5; nearObs = Math.min(nearObs, d);
      }
    }
    target = GK.clamp(target, -half, half);

    // 轉向：先估計離心力造成的橫向速度，再補償
    const maxLat = r.maxLat();
    const desired = GK.clamp((target - r.lat) * 1.8, -maxLat, maxLat);
    const cfeq = (CF_EQ * T.kappaAt(r.s) * r.speed * r.speed) / 6.5;
    let steer = GK.clamp((desired - cfeq) / Math.max(maxLat, 1), -0.85, 0.85);

    // 漂移過彎：急彎且高速時，朝彎道方向保持足夠的轉向量以觸發漂移
    if (Math.abs(kAhead) > 0.014 && r.speed > r.def.max * 0.75 && nearObs > 30 && !overtaking && r.surf !== 'ice') {
      const turn = kAhead > 0 ? -1 : 1; // 左彎(曲率>0)往左(負)轉
      const inner = turn;
      if (r.lat * inner < half - 5 && steer * turn > -0.2) steer = turn * Math.max(Math.abs(steer), 0.72);
    }
    out.steer = steer;
    out.brake = false;

    // ---------- 道具與技能 ----------
    out.item = false; out.phase = false; out.boost = false;
    if (r.item) {
      ai.itemT -= dt;
      if (ai.itemT <= 0) {
        const p = game.player;
        const rank = r.rank;
        const leading = rank <= 2;
        let use = false;
        switch (r.item) {
          case 'nitro': use = rank > 3 || Math.abs(kAhead) < 0.012; break;
          case 'missile': {
            // 領先玩家時不浪費；落後或玩家在射程內時優先攻擊
            let any = false;
            for (const o of game.racers) {
              if (o === r || o.finished) continue;
              const d = GK.wrapDiff(o.s, r.s, L);
              if (d > 10 && d < 150) { any = true; if (o === p) { use = true; break; } }
            }
            if (any && !use) use = Math.random() < 0.5;
            break;
          }
          case 'trap': {
            for (const o of game.racers) {
              if (o === r || o.finished) continue;
              const d = GK.wrapDiff(r.s, o.s, L);
              if (d > 6 && d < 70 && (leading || o === p)) { use = true; break; }
            }
            break;
          }
          case 'shield': use = leading || ai.itemT < -2; break;
          case 'lightning': use = rank >= 3; break;
          case 'stealth': use = leading; break;
          case 'magnet': use = nearBox(T, r); break;
          default: break;
        }
        if (use) { out.item = true; ai.itemT = GK.rand(1.2, 3.5); } else ai.itemT = Math.max(ai.itemT, -3) - 0.0001;
      }
    }
    if (nearObs < 14 && r.energy >= 35 && r.phaseT <= 0 && Math.random() < 0.08) out.phase = true;
    // 落後時更積極使用幽靈加速
    if (r.energy > (r.rank > 3 ? 40 : 75) && Math.abs(kAhead) < 0.008 && nearObs > 30) out.boost = true;
    return out;
  };

  function nearBox(T, r) {
    for (const b of T.boxes) {
      if (!b.active) continue;
      const d = GK.wrapDiff(b.s, r.s, T.length);
      if (d > 0 && d < 40) return true;
    }
    return false;
  }
})();
