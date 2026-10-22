(() => {
  'use strict';
 
  /* =====================================================
     CONFIGering
     ===================================================== */
  const W = 896, H = 414;
  const GROUND_Y = 342;
  const RUNNER = { x: 110, w: 38, h: 62, inset: 7 };
  const GRAVITY = 2400;
  const JUMP_V = 880;
  const AIRTIME = (2 * JUMP_V) / GRAVITY;
 
  const PX_PER_M = 40;
  const LEVEL_M = 500;
  const LEVEL_PX = LEVEL_M * PX_PER_M;
  const SPEED_START = 320;
  const SPEED_END = 470;
 
  const CAN_LITRES = 20;
  const LITRES_PER_PERSON = 4;
  const HIT_INVULN = 1.0;
 
  const OBSTACLES = {
    rock:   { w: 46, h: 44, spill: 15 },
    puddle: { w: 96, h: 12, spill: 10 },
    animal: { w: 74, h: 58, spill: 20 },
  };
  const TYPES = Object.keys(OBSTACLES);
 
  /* =====================================================
     DOM
     ===================================================== */
  const $ = (id) => document.getElementById(id);
  const screens = document.querySelectorAll('[data-screen]');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Water Dash requires a browser with canvas support.');
  }
  const el = {
    waterFill: $('waterFill'), waterBar: $('waterBar'),
    distFill: $('distFill'), distBar: $('distBar'),
    score: $('score'), pauseOverlay: $('pauseOverlay'),
    bestStart: $('bestStart'), soundBtn: $('soundBtn'),
    resWater: $('resWater'), resPeople: $('resPeople'), resBest: $('resBest'),
    resultTitle: $('resultTitle'), shareBtn: $('shareBtn'),
    howDialog: $('howDialog'),
  };
 
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 
  /* =====================================================
     STATE
     ===================================================== */
  let state = 'start';
  let rafId = 0, lastT = 0;
  let soundOn = true;
 
  let g;
  function newRun() {
    g = {
      dist: 0, speed: SPEED_START, water: 100,
      z: 0, vy: 0, onGround: true,
      obstacles: [], particles: [],
      nextX: 900, invuln: 0, runT: 0, won: false,
    };
  }
 
  /* =====================================================
     STORAGE (best scores)
     ===================================================== */
  const KEY = 'waterdash.best';
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { m: 0, L: 0 }; }
    catch { return { m: 0, L: 0 }; }
  }
  function saveBest(b) {
    try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {}
  }
 
  /* =====================================================
     SCREENS
     ===================================================== */
  function show(name) {
    screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
  }
 
  function showStart() {
    cancelAnimationFrame(rafId);
    state = 'start';
    el.bestStart.textContent = String(Math.floor(loadBest().m)).padStart(3, '0');
    show('start');
  }
 
  function startGame() {
    newRun();
    state = 'playing';
    el.pauseOverlay.hidden = true;
    show('game');
    updateHud(true);
    lastT = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }
 
  function endGame(won) {
    state = 'results';
    cancelAnimationFrame(rafId);
    g.won = won;
    const litres = won ? Math.round((CAN_LITRES * g.water) / 100) : 0;
    const meters = Math.min(LEVEL_M, Math.floor(g.dist / PX_PER_M));
    const best = loadBest();
    best.L = Math.max(best.L, litres);
    best.m = Math.max(best.m, meters);
    saveBest(best);
 
    el.resultTitle.textContent = won ? 'YOU REACHED THE VILLAGE' : 'YOU RAN OUT OF WATER';
    el.resWater.textContent = `${litres} L`;
    el.resPeople.textContent = String(Math.round(litres / LITRES_PER_PERSON));
    el.resBest.textContent = `${best.L} L`;
    g.litres = litres;
    show('results');
  }
 
  function setPaused(p) {
    if (state !== 'playing' && state !== 'paused') return;
    state = p ? 'paused' : 'playing';
    el.pauseOverlay.hidden = !p;
    if (!p) lastT = performance.now();
  }
 
  /* =====================================================
     INPUT
     ===================================================== */
  function jump() {
    if (state !== 'playing' || !g.onGround) return;
    g.vy = JUMP_V;
    g.onGround = false;
  }
 
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      if (state === 'playing') { e.preventDefault(); if (!e.repeat) jump(); }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      setPaused(state === 'playing');
    }
  });
  $('stage').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay')) return;
    jump();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
 
  $('playBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('howBtn').addEventListener('click', () => el.howDialog.showModal());
  $('closeHow').addEventListener('click', () => el.howDialog.close());
  $('pauseBtn').addEventListener('click', (e) => { setPaused(true); e.currentTarget.blur(); });
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  el.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    el.soundBtn.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
    el.soundBtn.setAttribute('aria-pressed', String(soundOn));
  });
 
  el.shareBtn.addEventListener('click', async () => {
    const text = `I delivered ${g.litres} L of water in Water Dash!`;
    try {
      if (navigator.share) await navigator.share({ title: 'Water Dash', text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); flash(el.shareBtn, 'COPIED'); }
    } catch {}
  });
  function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = old; }, 1500);
  }
 
  /* =====================================================
     UPDATE
     ===================================================== */
  function frame(t) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (state === 'playing') update(dt);
    draw();
  }
 
  function update(dt) {
    const progress = Math.min(g.dist / LEVEL_PX, 1);
    g.speed = SPEED_START + (SPEED_END - SPEED_START) * progress;
    g.dist += g.speed * dt;
    g.runT += dt;
    if (g.invuln > 0) g.invuln -= dt;
 
    if (!g.onGround) {
      g.vy -= GRAVITY * dt;
      g.z += g.vy * dt;
      if (g.z <= 0) { g.z = 0; g.vy = 0; g.onGround = true; }
    }
 
    spawnObstacles();
    g.obstacles = g.obstacles.filter((o) => sx(o.x) > -150);
 
    if (g.invuln <= 0) {
      const r = runnerBox();
      for (const o of g.obstacles) {
        if (o.hit) continue;
        const ox = sx(o.x), oy = GROUND_Y - o.h;
        if (r.x < ox + o.w && r.x + r.w > ox && r.y < oy + o.h && r.y + r.h > oy) {
          o.hit = true;
          g.water = Math.max(0, g.water - OBSTACLES[o.type].spill);
          g.invuln = HIT_INVULN;
          spill(r.x + r.w, r.y + 20);
          break;
        }
      }
    }
 
    updateParticles(dt);
    updateHud();
 
    if (g.water <= 0) endGame(false);
    else if (g.dist >= LEVEL_PX) endGame(true);
  }
 
  const sx = (worldX) => worldX - g.dist + RUNNER.x;
 
  function runnerBox() {
    const top = GROUND_Y - g.z - RUNNER.h;
    return {
      x: RUNNER.x + RUNNER.inset, y: top + RUNNER.inset,
      w: RUNNER.w - RUNNER.inset * 2, h: RUNNER.h - RUNNER.inset,
    };
  }
 
  function spawnObstacles() {
    while (g.nextX < g.dist + W + 200 && g.nextX < LEVEL_PX - 250) {
      const type = TYPES[Math.floor(Math.random() * TYPES.length)];
      const def = OBSTACLES[type];
      g.obstacles.push({ type, x: g.nextX, w: def.w, h: def.h, hit: false });
      g.nextX += def.w + 220 + g.speed * 0.35 + Math.random() * 240;
    }
  }
 
  /* ---------- particles (spilled water) ---------- */
  function spill(x, y) {
    for (let i = 0; i < 14; i++) {
      g.particles.push({
        x, y, vx: 80 + Math.random() * 160, vy: 200 + Math.random() * 260, life: 0.7,
      });
    }
  }
  function updateParticles(dt) {
    for (const p of g.particles) {
      p.vy -= GRAVITY * 0.6 * dt;
      p.x += p.vx * dt;
      p.y -= p.vy * dt;
      p.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0 && p.y < GROUND_Y);
  }
 
  /* ---------- HUD ---------- */
  let lastWater = -1, lastDist = -1;
  function updateHud(force) {
    const water = Math.round(g.water);
    const dist = Math.min(100, Math.round((g.dist / LEVEL_PX) * 100));
    el.waterFill.style.transform = `scaleX(${g.water / 100})`;
    el.distFill.style.transform = `scaleX(${Math.min(g.dist / LEVEL_PX, 1)})`;
    if (force || water !== lastWater) { el.waterBar.setAttribute('aria-valuenow', water); lastWater = water; }
    if (force || dist !== lastDist) { el.distBar.setAttribute('aria-valuenow', dist); lastDist = dist; }
    const score = Math.floor(g.dist / PX_PER_M) * 10;
    el.score.textContent = `[${String(score).padStart(4, '0')}]`;
  }
 
  /* =====================================================
     DRAW
     ===================================================== */
  const INK = '#222', MID = '#888', WATER = '#1f8fd6', YELLOW = '#ffc907';
 
  function draw() {
    if (!g) return;
    ctx.clearRect(0, 0, W, H);
    drawGround();
    drawVillage();
    g.obstacles.forEach(drawObstacle);
    drawRunner();
    ctx.fillStyle = WATER;
    g.particles.forEach((p) => ctx.fillRect(p.x, p.y, 5, 5));
  }
 
  function drawGround() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, GROUND_Y, W, 3);
    ctx.fillStyle = MID;
    const off = g.dist % 80;
    for (let x = -off; x < W; x += 80) ctx.fillRect(x, GROUND_Y + 22, 24, 2);
  }
 
  function drawVillage() {
    const x = sx(LEVEL_PX + 220);
    if (x > W + 20) return;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 30, GROUND_Y - 180, 3, 180);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(x - 27, GROUND_Y - 180, 40, 24);
    [[x, 80, 70], [x + 100, 70, 56], [x + 190, 90, 80]].forEach(([hx, w, h]) => {
      ctx.fillStyle = '#e6e6e1';
      ctx.fillRect(hx, GROUND_Y - h, w, h);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.strokeRect(hx, GROUND_Y - h, w, h);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(hx - 8, GROUND_Y - h);
      ctx.lineTo(hx + w / 2, GROUND_Y - h - 28);
      ctx.lineTo(hx + w + 8, GROUND_Y - h);
      ctx.fill();
    });
  }
 
  function drawObstacle(o) {
    const x = sx(o.x), y = GROUND_Y - o.h;
    if (o.type === 'rock') {
      ctx.fillStyle = MID;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 8, y + 10); ctx.lineTo(x + 24, y);
      ctx.lineTo(x + o.w - 6, y + 14); ctx.lineTo(x + o.w, GROUND_Y);
      ctx.fill();
    } else if (o.type === 'puddle') {
      ctx.fillStyle = WATER;
      ctx.beginPath();
      ctx.ellipse(x + o.w / 2, GROUND_Y - 4, o.w / 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = INK;
      ctx.fillRect(x, y + 8, o.w - 16, 28);
      ctx.fillRect(x + o.w - 22, y, 22, 20);
      ctx.fillRect(x + 6, y + 34, 8, o.h - 34);
      ctx.fillRect(x + o.w - 34, y + 34, 8, o.h - 34);
      ctx.fillRect(x + o.w - 20, y - 6, 4, 8);
    }
  }
 
  function drawRunner() {
    if (g.invuln > 0 && Math.floor(g.invuln * 10) % 2 === 0) return;
    const x = RUNNER.x, top = GROUND_Y - g.z - RUNNER.h;
    ctx.fillStyle = INK;
    ctx.fillRect(x + 10, top, 18, 16);
    ctx.fillRect(x + 6, top + 18, 26, 24);
    const swing = g.onGround ? Math.sin(g.runT * 16) * 8 : 6;
    ctx.fillRect(x + 8 + swing, top + 42, 8, 20);
    ctx.fillRect(x + 20 - swing, top + 42, 8, 20);
    const cx = x + 30, cy = top + 22, cw = 18, ch = 24;
    ctx.fillStyle = YELLOW;
    ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = WATER;
    const fill = (ch - 4) * (g.water / 100);
    ctx.fillRect(cx + 2, cy + ch - 2 - fill, cw - 4, fill);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
  }
 
  /* =====================================================
     INIT
     ===================================================== */
  newRun();
  showStart();
})();