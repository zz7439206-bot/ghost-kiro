/* 啟動入口 */
(function () {
  'use strict';
  const GK = window.GK;

  function showError(msg) {
    const el = document.getElementById('error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  window.addEventListener('error', (e) => showError('發生錯誤：' + (e.message || e) + '\n請重新整理頁面。'));

  function webglOk() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!window.THREE) { showError('無法載入 Three.js（vendor/three.min.js）。'); return; }
    if (!webglOk()) { showError('你的瀏覽器不支援 WebGL，無法執行遊戲。請改用新版 Chrome、Safari 或 Edge。'); return; }
    GK.save.load();
    GK.input.init();
    const game = new GK.Game();
    GK.game = game;
    game.init();
    GK.ui.init(game);
    GK.lobby.init();
    GK.lobby.handleInvite();
  });
})();
