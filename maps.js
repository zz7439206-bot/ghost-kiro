/* 地圖與地面材質定義（六張主題地圖） */
(function () {
  'use strict';
  const GK = window.GK;

  // 地面材質：speed 為最高速係數，grip 為抓地力，grav 為空中重力係數
  GK.SURFACES = {
    ice: { name: '冰面', speed: 1, grip: 0.28, grav: 1, c1: 0xa8ecff, c2: 0xdaf8ff, fx: 'sparkle', fxColor: [0.6, 0.9, 1] },
    sand: { name: '粗糙地', speed: 0.72, grip: 0.8, grav: 1, c1: 0xd8b46a, c2: 0xc09a52, fx: 'dust', fxColor: [0.55, 0.45, 0.25] },
    mud: { name: '泥沼', speed: 0.76, grip: 0.7, grav: 1, c1: 0x4a3a52, c2: 0x3a2d44, fx: 'dust', fxColor: [0.3, 0.4, 0.45] },
    syrup: { name: '糖漿', speed: 0.8, grip: 0.9, grav: 1, c1: 0xff9ad0, c2: 0xff7ab8, fx: 'dust', fxColor: [0.9, 0.4, 0.7] },
    ash: { name: '火山灰', speed: 0.82, grip: 0.75, grav: 1, c1: 0x5a4a4a, c2: 0x463838, fx: 'dust', fxColor: [0.5, 0.3, 0.2] },
    lowg: { name: '低重力區', speed: 1, grip: 1, grav: 0.4, c1: 0x7a5cff, c2: 0x5a3cd0, fx: 'sparkle', fxColor: [0.7, 0.6, 1] },
  };

  // 由極座標參數產生封閉賽道控制點
  GK.genCtrl = function (g) {
    const pts = [];
    for (let i = 0; i < g.n; i++) {
      const t = (i / g.n) * Math.PI * 2;
      let r = 1;
      g.c.forEach((c) => { r += c[1] * Math.cos(c[0] * t + c[2]); });
      pts.push([Math.cos(t) * g.R * r * (g.sx || 1), Math.sin(t) * g.R * r * (g.sz || 1)]);
    }
    return pts;
  };

  const RAINBOW = [0xff7aa8, 0xffb066, 0xffe066, 0x7aeaa0, 0x66c8ff, 0xb58cff];

  GK.MAPS = [
    {
      id: 'neon', name: '霓虹城市', en: 'NEON CITY', difficulty: 1, laps: [2, 3, 5], theme: 'city',
      desc: '未來都市的夜間高速公路，加速跑道與霓虹隧道。',
      ctrl: [[0, -220], [140, -200], [240, -100], [220, 40], [120, 100], [140, 200], [20, 260], [-120, 220], [-200, 120], [-180, -20], [-240, -120], [-140, -200]],
      width: 26,
      pal: { skyTop: '#04021e', skyMid: '#2a0e6a', skyLow: '#ff3fb8', fog: 0x3a1170, fogNear: 160, fogFar: 950,
        ground: ['#0d0826', '#150c36'], gridLine: '#ff3fd8', road: [0x23205a, 0x1d1a50], edge: 0x3de6ff, edge2: 0xff3fd8,
        curb: [0xff3d9e, 0xffffff], wall: [0x3de6ff, 0xff3fd8], hemi: [0x9fb4ff, 0x2a1a6a, 1.0], sun: [0xcfd8ff, 0.55], stars: true, lamp: [0x3de6ff, 0xff3fd8, 0xb6ff3d] },
      pads: [[0.10, -6], [0.34, 6], [0.58, -5], [0.83, 5], [0.46, 0]], ramps: [[0.22, 0], [0.70, -4]], boxes: [0.07, 0.29, 0.47, 0.66, 0.88],
      surfaces: [],
      tunnels: [[0.36, 0.43, 0x3de6ff, 0xff3fd8], [0.88, 0.95, 0xff3fd8, 0x3de6ff]],
      obst: { count: 26, endless: 36, types: ['cone', 'barrel', 'crate'], movers: 0 },
      skin: { cone: [0xff3fd8, 0xffffff], barrel: [0x3de6ff, 0x1a1a5a], crate: [0xffd93d, 0x2a1a5a], bounce: [0xff7ad9] },
      ambient: 'city', particles: 'neonrain',
    },
    {
      id: 'forest', name: '幽靈森林', en: 'GHOST FOREST', difficulty: 2, laps: [2, 3, 5], theme: 'forest',
      desc: "迷霧籠罩的神秘森林，發光蘑菇、泥沼與會左右移動的障礙。",
      gen: { R: 190, n: 18, c: [[2, 0.16, 0.5], [3, 0.12, 2.0], [5, 0.05, 1.0]], sx: 1.15 },
      width: 25,
      pal: { skyTop: '#040a22', skyMid: '#0f2a5c', skyLow: '#4a7ac0', fog: 0x1c3c70, fogNear: 40, fogFar: 460,
        ground: ['#14392e', '#1a4a3b'], gridLine: null, road: [0x3c4256, 0x353a4c], edge: 0x4dd6ff, edge2: 0x7affc8,
        curb: [0x2c7a5c, 0x1c4e3c], wall: [0x4dd6ff, 0x7affc8], hemi: [0x7fa8ff, 0x1a3a2a, 0.9], sun: [0x9fbfff, 0.5], stars: true, lamp: [0x7affc8, 0x4dd6ff, 0xb48cff] },
      pads: [[0.12, 5], [0.40, -6], [0.63, 6], [0.88, -5]], ramps: [[0.27, 3], [0.75, -3]], boxes: [0.06, 0.24, 0.50, 0.70, 0.90],
      surfaces: [
        { type: 'mud', s: [0.14, 0.19], l: [-13, 0] }, { type: 'mud', s: [0.52, 0.58], l: [0, 13] },
      ],
      tunnels: [[0.78, 0.85, 0x7affc8, 0x4dd6ff]],
      obst: { count: 28, endless: 36, types: ['cone', 'barrel', 'crate'], movers: 7 },
      skin: { cone: [0x5a3ad0, 0x7affc8], barrel: [0x2a6a5a, 0x7affc8], crate: [0x4a3a6a, 0x4dd6ff], bounce: [0x7affc8] },
      ambient: 'forest', particles: 'fireflies',
    },
    {
      id: 'ice', name: '冰雪世界', en: 'ICE WORLD', difficulty: 2, laps: [2, 3, 5], theme: 'ice',
      desc: '冰封的寬闊賽道，大面積低摩擦冰面，考驗漂移控制。',
      gen: { R: 230, n: 18, c: [[2, 0.2, 0.0], [4, 0.09, 1.2]], sx: 1.1 },
      width: 28,
      pal: { skyTop: '#5784b8', skyMid: '#a5c8e8', skyLow: '#eaf6ff', fog: 0xdcefff, fogNear: 180, fogFar: 880,
        ground: ['#b9d3ea', '#a9c6e0'], gridLine: null, road: [0x6f93bd, 0x6488b4], edge: 0xffffff, edge2: 0x7fd8ff,
        curb: [0xffffff, 0x9fd8ff], wall: [0xbfeaff, 0x7fd8ff], hemi: [0xdfeeff, 0x6f90b8, 0.8], sun: [0xffffff, 0.45], stars: false, lamp: [0x7fd8ff, 0xffffff, 0xa8ecff] },
      pads: [[0.10, 5], [0.36, -6], [0.62, 6], [0.85, -5]], ramps: [[0.25, -3], [0.72, 3]], boxes: [0.07, 0.29, 0.49, 0.68, 0.90],
      surfaces: [
        { type: 'ice', s: [0.16, 0.26], l: [-14, 14] }, { type: 'ice', s: [0.42, 0.50], l: [-14, 14] },
        { type: 'ice', s: [0.76, 0.84], l: [-14, 14] },
      ],
      tunnels: [[0.52, 0.58, 0xbfeaff, 0x7fd8ff]],
      obst: { count: 26, endless: 36, types: ['cone', 'barrel', 'crate'], movers: 0 },
      skin: { cone: [0x9fe8ff, 0xffffff], barrel: [0xffffff, 0x7fd8ff], crate: [0xbfeaff, 0x5a8ac0], bounce: [0x7fd8ff] },
      ambient: 'ice', particles: 'snow',
    },
    {
      id: 'space', name: '太空世界', en: 'SPACE GALAXY', difficulty: 3, laps: [2, 3, 5], theme: 'space',
      desc: '漂浮在星空中的未來賽道，低重力區與特殊跳躍平台。',
      gen: { R: 200, n: 20, c: [[3, 0.22, 0.3], [5, 0.09, 2.2]] },
      width: 26,
      pal: { skyTop: '#01010a', skyMid: '#0a0a2e', skyLow: '#241058', fog: 0x0a0a2a, fogNear: 300, fogFar: 1500,
        ground: null, gridLine: null, road: [0x2e3260, 0x282c58], edge: 0x3de6ff, edge2: 0xffa23d,
        curb: [0xffa23d, 0xffffff], wall: [0x3de6ff, 0xb48cff], hemi: [0xb0b8ff, 0x20206a, 1.0], sun: [0xe0e0ff, 0.7], stars: true, lamp: [0x3de6ff, 0xffa23d, 0xb48cff] },
      pads: [[0.08, -5], [0.32, 6], [0.55, -6], [0.80, 5], [0.93, 0]], ramps: [[0.19, 0], [0.45, -4], [0.68, 4]], boxes: [0.05, 0.26, 0.42, 0.62, 0.86],
      surfaces: [
        { type: 'lowg', s: [0.19, 0.30], l: [-14, 14] }, { type: 'lowg', s: [0.66, 0.78], l: [-14, 14] },
      ],
      tunnels: [[0.34, 0.41, 0x3de6ff, 0xb48cff], [0.82, 0.90, 0xffa23d, 0x3de6ff]],
      obst: { count: 30, endless: 40, types: ['cone', 'barrel', 'crate'], movers: 5 },
      skin: { cone: [0xffa23d, 0xffffff], barrel: [0x3de6ff, 0x20206a], crate: [0xb48cff, 0x20206a], bounce: [0xff7ad9] },
      ambient: 'space', particles: 'dust',
    },
    {
      id: 'candy', name: '糖果世界', en: 'CANDY DREAM', difficulty: 1, laps: [2, 3, 5], theme: 'candy',
      desc: '彩虹糖果賽道，沒有尖銳障礙，到處都是彈跳糖球。',
      gen: { R: 210, n: 20, c: [[4, 0.16, 0.7], [1, 0.1, 0.0], [6, 0.04, 0.4]] },
      width: 28,
      pal: { skyTop: '#7fd0ff', skyMid: '#ffc2ea', skyLow: '#fff0fa', fog: 0xffd8f2, fogNear: 260, fogFar: 1200,
        ground: ['#ff9ccc', '#ff8cc2'], gridLine: null, road: RAINBOW, rainbow: true, edge: 0xffffff, edge2: 0xff7ad9,
        curb: [0xff7aa8, 0xffffff], wall: [0xffffff, 0xffb8e8], hemi: [0xfff0fa, 0xd88ab8, 0.8], sun: [0xffffff, 0.3], stars: false, lamp: [0xff7aa8, 0x7aeaa0, 0x66c8ff] },
      pads: [[0.12, -6], [0.38, 6], [0.60, -5], [0.84, 5]], ramps: [[0.25, 0], [0.70, 3]], boxes: [0.07, 0.30, 0.48, 0.66, 0.90],
      surfaces: [
        { type: 'syrup', s: [0.46, 0.52], l: [-14, 0] }, { type: 'syrup', s: [0.88, 0.93], l: [0, 14] },
      ],
      tunnels: [],
      obst: { count: 26, endless: 36, types: ['cone', 'barrel', 'crate', 'bounce', 'bounce'], movers: 0 },
      skin: { cone: [0xff7aa8, 0xffffff], barrel: [0x7aeaa0, 0xffffff], crate: [0xffe066, 0xff7aa8], bounce: [0xff7ad9] },
      ambient: 'candy', particles: 'sprinkles',
    },
    {
      id: 'lava', name: '熔岩王國', en: 'LAVA KINGDOM', difficulty: 3, laps: [2, 3, 5], theme: 'lava',
      desc: '火山熔岩場景，賽道狹窄、彎道密集，高難度路線。',
      gen: { R: 190, n: 22, c: [[3, 0.18, 1.0], [5, 0.12, 0.2], [7, 0.05, 2.0]], sx: 1.1 },
      width: 22,
      pal: { skyTop: '#180404', skyMid: '#5a1208', skyLow: '#ff6a1f', fog: 0x6a1a0a, fogNear: 120, fogFar: 820,
        ground: ['#ff5a14', '#ffa41f'], gridLine: null, road: [0x2c2028, 0x261b22], edge: 0xff8a1f, edge2: 0xff3d6e,
        curb: [0xff3d1f, 0x2a1a1a], wall: [0xff8a1f, 0xff3d6e], hemi: [0xffb08a, 0x5a1a0a, 0.95], sun: [0xffb070, 0.6], stars: false, lamp: [0xff8a1f, 0xff3d6e, 0xffd93d] },
      pads: [[0.09, 4], [0.30, -5], [0.52, 5], [0.74, -5], [0.92, 0]], ramps: [[0.21, 0], [0.64, 3]], boxes: [0.06, 0.25, 0.44, 0.60, 0.82],
      surfaces: [
        { type: 'ash', s: [0.14, 0.19], l: [-12, 12] }, { type: 'ash', s: [0.56, 0.62], l: [-12, 12] },
      ],
      tunnels: [[0.35, 0.41, 0xff8a1f, 0xff3d6e]],
      obst: { count: 34, endless: 42, types: ['cone', 'barrel', 'crate'], movers: 6 },
      skin: { cone: [0x3a2a2a, 0xff6a1f], barrel: [0x5a1a1a, 0xff8a1f], crate: [0x2a2030, 0xff3d6e], bounce: [0xffd93d] },
      ambient: 'lava', particles: 'embers',
    },
  ];
  GK.getMap = (id) => GK.MAPS.find((m) => m.id === id) || GK.MAPS[0];
})();
