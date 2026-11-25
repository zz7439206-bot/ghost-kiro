/* 輸入：鍵盤與觸控 */
(function () {
  'use strict';
  const GK = window.GK;

  const keys = new Set();
  const touch = { left: false, right: false, brake: false, boost: false };
  let phaseEdge = false, itemEdge = false, pauseEdge = false;

  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight']);

  window.addEventListener('keydown', (e) => {
    if (GK.input.active && (GAME_KEYS.has(e.code) || e.code === 'Enter')) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') phaseEdge = true;
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') itemEdge = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pauseEdge = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    touch.left = touch.right = touch.brake = touch.boost = false;
  });

  function bindTouch() {
    document.querySelectorAll('#touch [data-act]').forEach((el) => {
      const act = el.dataset.act;
      const down = (e) => {
        e.preventDefault();
        if (act === 'phase') phaseEdge = true;
        else if (act === 'item') itemEdge = true;
        else touch[act] = true;
        el.classList.add('down');
      };
      const up = (e) => {
        e.preventDefault();
        if (act !== 'phase' && act !== 'item') touch[act] = false;
        el.classList.remove('down');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  GK.input = {
    active: false, // 比賽中才攔截按鍵預設行為
    init: bindTouch,
    steer() {
      const l = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
      const r = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
      return (r ? 1 : 0) - (l ? 1 : 0);
    },
    brake() { return keys.has('ArrowDown') || keys.has('KeyS') || touch.brake; },
    boost() { return keys.has('Space') || touch.boost; },
    takePhase() { const v = phaseEdge; phaseEdge = false; return v; },
    takeItem() { const v = itemEdge; itemEdge = false; return v; },
    takePause() { const v = pauseEdge; pauseEdge = false; return v; },
    clearEdges() { phaseEdge = itemEdge = pauseEdge = false; },
  };
})();
