/* Canvas renderer: bakes the terrain once, then draws units, projectiles and
 * effects each frame through a pan/zoom camera. Reads simulation state, never
 * writes to it. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;
  const Terrain = W.Terrain;

  const TEAM = [
    { main: '#4aa3ff', dark: '#1d4f8a', light: '#a8d6ff', glow: 'rgba(74,163,255,0.35)' },
    { main: '#ff5f4a', dark: '#8a2a1d', light: '#ffb0a4', glow: 'rgba(255,95,74,0.35)' }
  ];

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.terrain = null;
    this.terrainCanvas = null;
    this.decalCanvas = null;
    this.decalCount = 0;
    this.time = 0;
  }

  /* ------------------------- setup & camera ------------------------ */

  Renderer.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  };

  Renderer.prototype.setTerrain = function (terrain) {
    this.terrain = terrain;
    this.bakeTerrain();
    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = terrain.width;
    this.decalCanvas.height = terrain.height;
    this.decalCtx = this.decalCanvas.getContext('2d');
    this.decalCount = 0;
  };

  Renderer.prototype.fit = function (padding) {
    if (!this.terrain) return;
    const pad = padding || 20;
    /* Guard against a zero-size viewport (hidden tab, mid-rotation on mobile). */
    const vw = Math.max(80, this.w - pad * 2);
    const vh = Math.max(80, this.h - pad * 2);
    this.cam.zoom = Math.min(vw / this.terrain.width, vh / this.terrain.height);
    this.minZoom = this.cam.zoom * 0.85;
    this.cam.x = this.terrain.width / 2;
    this.cam.y = this.terrain.height / 2;
  };

  /* Frames the deployment zone so placement starts usefully zoomed in. */
  Renderer.prototype.focusZone = function (team) {
    if (!this.terrain) return;
    const t = this.terrain;
    const zoneW = t.width * 0.34;
    const zx = this.w / zoneW, zy = this.h / t.height;
    this.cam.zoom = U.clamp(Math.min(zx, zy) * 0.95, this.minZoom || 0.2, 2.2);
    this.cam.x = team === 0 ? zoneW * 0.45 : t.width - zoneW * 0.45;
    this.cam.y = t.height / 2;
    this.clampCamera();
  };

  Renderer.prototype.clampCamera = function () {
    if (!this.terrain) return;
    const t = this.terrain, c = this.cam;
    c.zoom = U.clamp(c.zoom, this.minZoom || 0.15, 2.2);
    const halfW = this.w / (2 * c.zoom), halfH = this.h / (2 * c.zoom);
    /* Allow a little slack past the edges so corners are reachable. */
    const slackX = Math.max(0, halfW - t.width / 2) + 60;
    const slackY = Math.max(0, halfH - t.height / 2) + 60;
    c.x = U.clamp(c.x, -slackX + halfW * 0, t.width + slackX);
    c.y = U.clamp(c.y, -slackY, t.height + slackY);
    c.x = U.clamp(c.x, Math.min(halfW, t.width / 2) - slackX * 0.2, Math.max(t.width - halfW, t.width / 2) + slackX * 0.2);
    c.y = U.clamp(c.y, Math.min(halfH, t.height / 2) - slackY * 0.2, Math.max(t.height - halfH, t.height / 2) + slackY * 0.2);
  };

  Renderer.prototype.screenToWorld = function (sx, sy) {
    const c = this.cam;
    return { x: (sx - this.w / 2) / c.zoom + c.x, y: (sy - this.h / 2) / c.zoom + c.y };
  };
  Renderer.prototype.worldToScreen = function (wx, wy) {
    const c = this.cam;
    return { x: (wx - c.x) * c.zoom + this.w / 2, y: (wy - c.y) * c.zoom + this.h / 2 };
  };

  Renderer.prototype.zoomAt = function (sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = U.clamp(this.cam.zoom * factor, this.minZoom || 0.15, 2.2);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCamera();
  };

  /* --------------------------- terrain bake ------------------------ */

  Renderer.prototype.bakeTerrain = function () {
    const t = this.terrain;
    const cv = document.createElement('canvas');
    cv.width = t.width; cv.height = t.height;
    const g = cv.getContext('2d');
    const TS = t.tileSize;
    const noise = U.makeNoise(t.seed ^ 0x77);

    /* Indexed by surface type: water, grass, sand, forest, rock. */
    const COLORS = [
      ['#12364f'],   // water
      ['#3f5c34'],   // grass
      ['#9a8a5f'],   // sand
      ['#2c4526'],   // forest
      ['#5b5b60']    // rock
    ];

    /* Every tile-sized fill goes onto a scratch layer first. Blurring that layer
     * once, as a whole, is what removes the 20px stair-stepping along coastlines —
     * anything drawn after the blur would put the hard edges straight back. */
    const base = document.createElement('canvas');
    base.width = t.width; base.height = t.height;
    const bg = base.getContext('2d');

    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        const surf = t.tiles[y * t.cols + x];
        const n = noise(x * 0.22, y * 0.22, 2);
        bg.fillStyle = shade(COLORS[surf][0], n * 0.10);
        bg.fillRect(x * TS - 1, y * TS - 1, TS + 2, TS + 2);
      }
    }

    /* Deep water darkens away from the coast. */
    bg.save();
    bg.globalAlpha = 0.30;
    bg.fillStyle = '#06192b';
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        if (t.tiles[y * t.cols + x] !== Terrain.WATER) continue;
        let deep = true;
        for (let dy = -2; dy <= 2 && deep; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const sx = x + dx, sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= t.cols || sy >= t.rows) continue;
            if (t.tiles[sy * t.cols + sx] !== Terrain.WATER) { deep = false; break; }
          }
        }
        if (deep) bg.fillRect(x * TS - 1, y * TS - 1, TS + 2, TS + 2);
      }
    }
    bg.restore();

    /* Surf: soft blobs on the water side of the shore. Drawn pre-blur so they
     * merge into a continuous band instead of reading as a chain of rings. */
    bg.fillStyle = 'rgba(198,230,245,0.40)';
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        if (t.tiles[y * t.cols + x] !== Terrain.WATER) continue;
        let shore = false;
        for (let k = 0; k < 4 && !shore; k++) {
          const sx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const sy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (sx < 0 || sy < 0 || sx >= t.cols || sy >= t.rows) continue;
          if (t.tiles[sy * t.cols + sx] !== Terrain.WATER) shore = true;
        }
        if (!shore) continue;
        bg.beginPath();
        bg.arc((x + 0.5) * TS, (y + 0.5) * TS, TS * 0.6, 0, U.TAU);
        bg.fill();
      }
    }

    g.filter = 'blur(5px)';
    g.drawImage(base, 0, 0);
    g.filter = 'none';

    /* Scatter tree and rock detail. */
    const rand = U.rng(t.seed ^ 0xabcd);
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        const surf = t.tiles[y * t.cols + x];
        if (surf === Terrain.FOREST) {
          const n = 3;
          for (let i = 0; i < n; i++) {
            const px = (x + rand()) * TS, py = (y + rand()) * TS;
            const r = 4 + rand() * 3.5;
            g.fillStyle = 'rgba(10,26,10,0.35)';
            g.beginPath(); g.arc(px + 1.5, py + 2, r, 0, U.TAU); g.fill();
            g.fillStyle = shade('#2f5a2a', rand() * 0.3 - 0.1);
            g.beginPath(); g.arc(px, py, r, 0, U.TAU); g.fill();
          }
        } else if (surf === Terrain.ROCK) {
          for (let i = 0; i < 2; i++) {
            const px = (x + rand()) * TS, py = (y + rand()) * TS;
            const r = 5 + rand() * 5;
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.beginPath(); g.arc(px + 2, py + 2.5, r, 0, U.TAU); g.fill();
            g.fillStyle = shade('#75757c', rand() * 0.35 - 0.15);
            g.beginPath();
            g.moveTo(px - r, py + r * 0.6);
            g.lineTo(px - r * 0.3, py - r);
            g.lineTo(px + r * 0.7, py - r * 0.2);
            g.lineTo(px + r, py + r * 0.7);
            g.closePath(); g.fill();
          }
        } else if (surf === Terrain.WATER) {
          /* Wave chop, drawn after the blur. Without it, open water zooms into a
           * flat smear because there is no other detail out there. */
          for (let i = 0; i < 2; i++) {
            if (rand() > 0.55) continue;
            const px = (x + rand()) * TS, py = (y + rand()) * TS;
            const w = 4 + rand() * 7;
            g.strokeStyle = rand() < 0.5 ? 'rgba(150,195,220,0.10)' : 'rgba(6,22,38,0.14)';
            g.lineWidth = 1 + rand();
            g.beginPath();
            g.moveTo(px - w, py);
            g.quadraticCurveTo(px, py - 2 - rand() * 2, px + w, py);
            g.stroke();
          }
        } else if (surf === Terrain.GRASS && rand() < 0.05) {
          const px = (x + rand()) * TS, py = (y + rand()) * TS;
          g.strokeStyle = 'rgba(120,150,90,0.25)';
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + rand() * 6 - 3, py - 4); g.stroke();
        }
      }
    }

    /* Vignette so the playfield edges recede. */
    const vg = g.createRadialGradient(t.width / 2, t.height / 2, Math.min(t.width, t.height) * 0.35,
      t.width / 2, t.height / 2, Math.max(t.width, t.height) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = vg;
    g.fillRect(0, 0, t.width, t.height);

    this.terrainCanvas = cv;
  };

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1, 7), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    r = U.clamp(Math.round(r + amount * 255), 0, 255);
    gg = U.clamp(Math.round(gg + amount * 255), 0, 255);
    b = U.clamp(Math.round(b + amount * 255), 0, 255);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  /* ---------------------------- main draw -------------------------- */

  Renderer.prototype.draw = function (state, dt) {
    const ctx = this.ctx;
    this.time += dt;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0f15';
    ctx.fillRect(0, 0, this.w, this.h);

    if (!this.terrain) { ctx.restore(); return; }

    const c = this.cam;
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrainCanvas, 0, 0);

    const battle = state.battle;
    if (battle) {
      this.syncDecals(battle);
      ctx.drawImage(this.decalCanvas, 0, 0);
    }

    if (state.phase === 'place') this.drawDeployZones(ctx, state);

    if (battle) {
      this.drawBattle(ctx, battle, state);
    } else if (state.armies) {
      this.drawStaticArmies(ctx, state);
    }

    if (state.phase === 'place') this.drawGhost(ctx, state);

    ctx.restore();
  };

  Renderer.prototype.drawDeployZones = function (ctx, state) {
    const t = this.terrain;
    const w = t.width * 0.26;
    for (let team = 0; team < 2; team++) {
      const active = state.team === team;
      const x = team === 0 ? 0 : t.width - w;
      ctx.save();
      ctx.fillStyle = TEAM[team].glow;
      ctx.globalAlpha = active ? 0.16 : 0.06;
      ctx.fillRect(x, 0, w, t.height);
      ctx.globalAlpha = active ? 0.9 : 0.3;
      ctx.strokeStyle = TEAM[team].main;
      ctx.lineWidth = 3 / this.cam.zoom;
      ctx.setLineDash([14 / this.cam.zoom, 10 / this.cam.zoom]);
      ctx.beginPath();
      const edge = team === 0 ? w : t.width - w;
      ctx.moveTo(edge, 0); ctx.lineTo(edge, t.height);
      ctx.stroke();
      ctx.restore();
    }
  };

  Renderer.prototype.drawStaticArmies = function (ctx, state) {
    const self = this;
    state.armies.forEach(function (army, team) {
      army.forEach(function (e) {
        const type = Units.TYPES[e.type];
        self.drawUnitShape(ctx, type, team, e.x, e.y, team === 0 ? 0 : Math.PI, 0, 1);
      });
    });
    /* Highlight whatever the pointer is over so deleting is unambiguous. */
    if (state.hover) {
      const h = state.hover;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / this.cam.zoom;
      ctx.beginPath();
      ctx.arc(h.x, h.y, Units.TYPES[h.type].radius + 6, 0, U.TAU);
      ctx.stroke();
      ctx.restore();
    }
  };

  Renderer.prototype.drawGhost = function (ctx, state) {
    if (!state.ghost || !state.placingType) return;
    const type = Units.TYPES[state.placingType];
    const g = state.ghost;
    ctx.save();
    ctx.globalAlpha = g.valid ? 0.75 : 0.35;
    this.drawUnitShape(ctx, type, state.team, g.x, g.y, state.team === 0 ? 0 : Math.PI, 0, 1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g.valid ? '#7dffa8' : '#ff6a5a';
    ctx.lineWidth = 2 / this.cam.zoom;
    ctx.beginPath();
    ctx.arc(g.x, g.y, type.radius + 8, 0, U.TAU);
    ctx.stroke();

    /* Show the reach of the unit being placed — makes range differences legible. */
    if (type.maxRange > 0) {
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([8 / this.cam.zoom, 8 / this.cam.zoom]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, type.maxRange, 0, U.TAU);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* Wrecks and craters are painted once into a persistent layer. */
  Renderer.prototype.syncDecals = function (battle) {
    const g = this.decalCtx;
    while (this.decalCount < battle.decals.length) {
      const d = battle.decals[this.decalCount++];
      g.save();
      if (d.kind === 'crater') {
        /* Kept light: heavy shelling stacks many of these on the same ground. */
        const cg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        cg.addColorStop(0, 'rgba(24,19,14,0.30)');
        cg.addColorStop(0.7, 'rgba(30,24,18,0.16)');
        cg.addColorStop(1, 'rgba(30,24,18,0)');
        g.fillStyle = cg;
        g.beginPath(); g.arc(d.x, d.y, d.r, 0, U.TAU); g.fill();
      } else if (d.kind === 'foam') {
        const fg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.8);
        fg.addColorStop(0, 'rgba(206,230,244,0.22)');
        fg.addColorStop(0.6, 'rgba(206,230,244,0.12)');
        fg.addColorStop(1, 'rgba(206,230,244,0)');
        g.fillStyle = fg;
        g.beginPath(); g.arc(d.x, d.y, d.r * 1.8, 0, U.TAU); g.fill();
      } else {
        /* Burnt-out hull: scorch halo, charred body, a hint of the team colour left. */
        g.translate(d.x, d.y);
        g.rotate(d.a || 0);
        const scorch = g.createRadialGradient(0, 0, d.r * 0.3, 0, 0, d.r * 2.1);
        scorch.addColorStop(0, 'rgba(18,14,11,0.42)');
        scorch.addColorStop(1, 'rgba(18,14,11,0)');
        g.fillStyle = scorch;
        g.beginPath(); g.arc(0, 0, d.r * 2.1, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(46,38,33,0.85)';
        roundRect(g, -d.r, -d.r * 0.6, d.r * 2, d.r * 1.2, 2);
        g.fill();
        g.fillStyle = d.team === 0 ? 'rgba(58,80,104,0.6)' : 'rgba(104,62,54,0.6)';
        g.fillRect(-d.r * 0.45, -d.r * 0.3, d.r * 0.9, d.r * 0.6);
      }
      g.restore();
    }
  };

  Renderer.prototype.drawBattle = function (ctx, battle, state) {
    const zoom = this.cam.zoom;
    const view = {
      x0: this.cam.x - this.w / (2 * zoom) - 80,
      y0: this.cam.y - this.h / (2 * zoom) - 80,
      x1: this.cam.x + this.w / (2 * zoom) + 80,
      y1: this.cam.y + this.h / (2 * zoom) + 80
    };

    const units = battle.units;

    /* Ship wakes go under the hulls. */
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.domain !== Units.SEA || u.speed < 8) continue;
      if (u.x < view.x0 || u.x > view.x1 || u.y < view.y0 || u.y > view.y1) continue;
      const a = u.hdg + Math.PI;
      const len = u.radius + 20 + 34 * U.clamp(u.speed / 60, 0, 1);
      const x0 = u.x + Math.cos(a) * u.radius, y0 = u.y + Math.sin(a) * u.radius;
      const x1 = u.x + Math.cos(a) * len, y1 = u.y + Math.sin(a) * len;
      /* Fade along the trail so it reads as churned water, not a painted bar. */
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      const peak = 0.30 * U.clamp(u.speed / 60, 0, 1);
      grad.addColorStop(0, 'rgba(214,238,250,' + peak + ')');
      grad.addColorStop(1, 'rgba(214,238,250,0)');
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = u.radius * 0.55;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    /* Aircraft shadows sell the altitude difference. */
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.domain !== Units.AIR) continue;
      if (u.x < view.x0 || u.x > view.x1 || u.y < view.y0 || u.y > view.y1) continue;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.translate(u.x + 16, u.y + 18);
      ctx.rotate(u.hdg);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 0, u.radius * 1.2, u.radius * 0.8, 0, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      if (u.x < view.x0 || u.x > view.x1 || u.y < view.y0 || u.y > view.y1) continue;
      const submerged = u.type.stealth;
      this.drawUnitShape(ctx, u.type, u.team, u.x, u.y, u.hdg, u.turret, submerged ? 0.55 : 1, u);
    }

    this.drawProjectiles(ctx, battle);
    this.drawEffects(ctx, battle);

    /* Health bars last, so nothing overdraws them. */
    if (zoom > 0.28) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive) continue;
        if (u.x < view.x0 || u.x > view.x1 || u.y < view.y0 || u.y > view.y1) continue;
        if (u.hp >= u.maxHp) continue;
        const w = Math.max(18, u.radius * 2.2);
        const y = u.y - u.radius - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(u.x - w / 2, y, w, 4);
        const frac = u.hp / u.maxHp;
        ctx.fillStyle = frac > 0.55 ? '#66dd66' : frac > 0.25 ? '#ddcc44' : '#ee4444';
        ctx.fillRect(u.x - w / 2 + 0.5, y + 0.5, (w - 1) * frac, 3);
      }
    }
  };

  Renderer.prototype.drawProjectiles = function (ctx, battle) {
    const list = battle.projectiles;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const d = p.def;

      if (p.kind === 'shell' || p.kind === 'bomb') {
        const h = p.h || 0;
        /* Shadow on the ground, shell lifted by its arc height. */
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(p.x, p.y - h, p.kind === 'bomb' ? 3.4 : 2.8, 0, U.TAU); ctx.fill();
        continue;
      }

      if (p.kind === 'missile' || p.kind === 'torpedo') {
        const back = 16;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = p.kind === 'torpedo' ? 'rgba(210,235,255,0.55)' : 'rgba(255,220,180,0.5)';
        ctx.lineWidth = p.kind === 'torpedo' ? 3 : 4;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.hdg) * back, p.y - Math.sin(p.hdg) * back);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(p.hdg) * 6, p.y - Math.sin(p.hdg) * 6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        continue;
      }

      /* Tracer: a short streak along the direction of travel. */
      const len = Math.min(22, U.dist(p.px, p.py, p.x, p.y) + 6);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.tracerWidth;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(p.hdg) * len, p.y - Math.sin(p.hdg) * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.drawEffects = function (ctx, battle) {
    const list = battle.effects;
    ctx.save();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const k = e.t / e.life;

      if (e.kind === 'boom') {
        const r = e.size * (0.35 + k * 1.3);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        const a = (1 - k);
        g.addColorStop(0, 'rgba(255,246,200,' + (a * 0.95) + ')');
        g.addColorStop(0.35, 'rgba(255,168,60,' + (a * 0.8) + ')');
        g.addColorStop(1, 'rgba(120,40,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, U.TAU); ctx.fill();
      } else if (e.kind === 'smoke') {
        /* Soft-edged and translucent: a flat dark disc reads as a hole in the map. */
        const r = e.size * (0.5 + k * 1.6);
        const a = (1 - k) * 0.30;
        const sg = ctx.createRadialGradient(e.x, e.y - k * 16, 0, e.x, e.y - k * 16, r);
        sg.addColorStop(0, 'rgba(96,90,84,' + a + ')');
        sg.addColorStop(0.6, 'rgba(80,75,70,' + (a * 0.55) + ')');
        sg.addColorStop(1, 'rgba(70,66,62,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(e.x, e.y - k * 16, r, 0, U.TAU); ctx.fill();
      } else if (e.kind === 'muzzle') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#fff3c4';
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(e.size * 2.4, -e.size * 0.5);
        ctx.lineTo(e.size * 3.2, 0);
        ctx.lineTo(e.size * 2.4, e.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'heal') {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = '#8effc0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 10 + k * 14, 0, U.TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  };

  /* --------------------------- unit shapes ------------------------- */

  Renderer.prototype.drawUnitShape = function (ctx, type, team, x, y, hdg, turret, alpha, live) {
    const col = TEAM[team];
    const r = type.radius;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y);

    /* Ground shadow. */
    if (type.domain !== Units.AIR) {
      ctx.save();
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(1.5, 2.5, r * 1.05, r * 0.85, 0, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(hdg);

    const flash = live && live.damageFlash > 0.01;
    const body = flash ? '#ffd9d0' : col.main;
    const dark = flash ? '#e0a090' : col.dark;
    const light = col.light;

    switch (type.shape) {
      case 'infantry': drawInfantry(ctx, r, body, dark, light); break;
      case 'wheeled': drawWheeled(ctx, r, body, dark, light); break;
      case 'artillery': drawArtillery(ctx, r, body, dark, light, hdg, turret, live); break;
      case 'static': drawStatic(ctx, r, body, dark, light, hdg, turret, live); break;
      case 'drone': drawDrone(ctx, r, body, dark, light, live); break;
      case 'heli': drawHeli(ctx, r, body, dark, light, live); break;
      case 'jet': drawJet(ctx, r, body, dark, light); break;
      case 'bomber': drawBomber(ctx, r, body, dark, light); break;
      case 'boat': drawBoat(ctx, r, body, dark, light); break;
      case 'ship': drawShip(ctx, r, body, dark, light); break;
      case 'sub': drawSub(ctx, r, body, dark, light); break;
      default: drawTank(ctx, r, body, dark, light); break;
    }

    /* Rotating turret drawn in world space, not hull space. */
    if (type.shape === 'tank' || type.shape === 'ship' || type.shape === 'wheeled') {
      ctx.rotate(-hdg);
      ctx.rotate(turret || 0);
      const recoil = live ? live.recoil * 3 : 0;
      drawTurret(ctx, r, type, body, dark, light, recoil);
    }

    ctx.restore();

    /* Muzzle glow sits on top of everything for the unit. */
    if (live && live.flash > 0.05) {
      ctx.save();
      ctx.globalAlpha = live.flash * 0.5;
      ctx.fillStyle = '#ffdf9a';
      ctx.beginPath();
      ctx.arc(x + Math.cos(live.turret) * (r + 4), y + Math.sin(live.turret) * (r + 4), 5, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  function drawInfantry(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = light;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(r * 0.2, 0); ctx.lineTo(r * 1.15, 0); ctx.stroke();
  }

  function drawWheeled(ctx, r, body, dark, light) {
    ctx.fillStyle = '#1a1a1c';
    for (let i = -1; i <= 1; i += 2) {
      ctx.fillRect(-r * 0.7, i * r * 0.62 - r * 0.18, r * 0.5, r * 0.36);
      ctx.fillRect(r * 0.25, i * r * 0.62 - r * 0.18, r * 0.5, r * 0.36);
    }
    ctx.fillStyle = dark;
    roundRect(ctx, -r * 0.95, -r * 0.6, r * 1.9, r * 1.2, 3);
    ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.8, -r * 0.46, r * 1.6, r * 0.92, 2.5);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(r * 0.2, -r * 0.3, r * 0.35, r * 0.6);
  }

  function drawTank(ctx, r, body, dark, light) {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(-r, -r * 0.85, r * 2, r * 0.32);
    ctx.fillRect(-r, r * 0.53, r * 2, r * 0.32);
    ctx.fillStyle = dark;
    roundRect(ctx, -r * 0.95, -r * 0.62, r * 1.9, r * 1.24, 3);
    ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.82, -r * 0.5, r * 1.64, r * 1.0, 2.5);
    ctx.fill();
  }

  function drawTurret(ctx, r, type, body, dark, light, recoil) {
    const barrel = Math.min(1.9, 0.9 + type.maxRange / 600);
    ctx.fillStyle = dark;
    ctx.fillRect(-recoil, -r * 0.14, r * barrel - recoil, r * 0.28);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, U.TAU); ctx.fill();
  }

  function drawArtillery(ctx, r, body, dark, light, hdg, turret, live) {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(-r * 0.9, -r * 0.8, r * 1.7, r * 0.28);
    ctx.fillRect(-r * 0.9, r * 0.52, r * 1.7, r * 0.28);
    ctx.fillStyle = dark;
    roundRect(ctx, -r * 0.9, -r * 0.58, r * 1.7, r * 1.16, 3); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.78, -r * 0.46, r * 1.45, r * 0.92, 2.5); ctx.fill();
    /* Long barrel that tracks the target. */
    ctx.rotate(-hdg);
    ctx.rotate(turret || 0);
    const recoil = live ? live.recoil * 5 : 0;
    ctx.fillStyle = '#2b2b2e';
    ctx.fillRect(-r * 0.3 - recoil, -r * 0.16, r * 2.1, r * 0.32);
    ctx.fillStyle = light;
    ctx.fillRect(r * 1.5 - recoil, -r * 0.2, r * 0.3, r * 0.4);
  }

  function drawStatic(ctx, r, body, dark, light, hdg, turret, live) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      const px = Math.cos(a) * r * 0.72, py = Math.sin(a) * r * 0.72;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.rotate(-hdg);
    ctx.rotate(turret || 0);
    const recoil = live ? live.recoil * 3 : 0;
    ctx.fillStyle = '#22222a';
    ctx.fillRect(-recoil, -r * 0.15, r * 1.3, r * 0.3);
  }

  function drawDrone(ctx, r, body, dark, light, live) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.7); ctx.lineTo(r * 0.7, r * 0.7);
    ctx.moveTo(r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.7, r * 0.7);
    ctx.stroke();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, U.TAU); ctx.fill();
    const spin = live ? live.rotor : 0;
    ctx.strokeStyle = 'rgba(220,235,255,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.TAU + Math.PI / 4;
      const px = Math.cos(a) * r * 0.7, py = Math.sin(a) * r * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.34, spin, spin + 4.2);
      ctx.stroke();
    }
  }

  function drawHeli(ctx, r, body, dark, light, live) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.42, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(r * 0.15, 0, r * 0.62, r * 0.32, 0, 0, U.TAU);
    ctx.fill();
    /* Tail boom and rotor. */
    ctx.fillStyle = dark;
    ctx.fillRect(-r * 1.5, -r * 0.09, r * 0.75, r * 0.18);
    ctx.fillStyle = light;
    ctx.fillRect(-r * 1.6, -r * 0.3, r * 0.12, r * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.2, 0, U.TAU); ctx.fill();

    const spin = live ? live.rotor : 0.7;
    ctx.save();
    ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(225,240,255,0.28)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 2; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-r * 1.35, 0); ctx.lineTo(r * 1.35, 0); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(225,240,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, U.TAU); ctx.stroke();
  }

  function drawJet(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0);
    ctx.lineTo(-r * 0.2, -r * 0.32);
    ctx.lineTo(-r * 1.1, -r * 0.22);
    ctx.lineTo(-r * 1.1, r * 0.22);
    ctx.lineTo(-r * 0.2, r * 0.32);
    ctx.closePath(); ctx.fill();
    /* Swept wings. */
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 0.35, 0);
    ctx.lineTo(-r * 0.55, -r * 1.05);
    ctx.lineTo(-r * 0.85, -r * 1.0);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.85, r * 1.0);
    ctx.lineTo(-r * 0.55, r * 1.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.16, 0, U.TAU); ctx.fill();
    /* Exhaust. */
    ctx.fillStyle = 'rgba(255,190,120,0.55)';
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.14);
    ctx.lineTo(-r * 1.9, 0);
    ctx.lineTo(-r * 1.1, r * 0.14);
    ctx.closePath(); ctx.fill();
  }

  function drawBomber(ctx, r, body, dark, light) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 1.15);
    ctx.lineTo(r * 0.2, -r * 1.15);
    ctx.lineTo(r * 0.35, r * 1.15);
    ctx.lineTo(-r * 0.25, r * 1.15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.25, 0);
    ctx.lineTo(-r * 1.05, -r * 0.34);
    ctx.lineTo(-r * 1.05, r * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-r * 1.05, -r * 0.7, r * 0.28, r * 1.4);
    ctx.fillStyle = '#20202a';
    for (let i = -1; i <= 1; i += 2) {
      ctx.fillRect(-r * 0.05, i * r * 0.62 - r * 0.12, r * 0.42, r * 0.24);
      ctx.fillRect(-r * 0.05, i * r * 0.95 - r * 0.1, r * 0.36, r * 0.2);
    }
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 0.75, 0, r * 0.14, 0, U.TAU); ctx.fill();
  }

  function drawBoat(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(r * 0.2, -r * 0.5);
    ctx.lineTo(-r * 1.05, -r * 0.42);
    ctx.lineTo(-r * 1.05, r * 0.42);
    ctx.lineTo(r * 0.2, r * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.5, -r * 0.3, r * 0.85, r * 0.6, 2); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(-r * 0.15, -r * 0.16, r * 0.3, r * 0.32);
  }

  function drawShip(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.75, 0);
    ctx.lineTo(r * 0.85, -r * 0.44);
    ctx.lineTo(-r * 1.5, -r * 0.4);
    ctx.lineTo(-r * 1.65, 0);
    ctx.lineTo(-r * 1.5, r * 0.4);
    ctx.lineTo(r * 0.85, r * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.75, -r * 0.3, r * 1.5, r * 0.6, 2); ctx.fill();
    ctx.fillStyle = light;
    roundRect(ctx, -r * 0.2, -r * 0.2, r * 0.5, r * 0.4, 2); ctx.fill();
    /* Deck details fore and aft. */
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(r * 1.05, 0, r * 0.22, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 1.1, 0, r * 0.2, 0, U.TAU); ctx.fill();
  }

  function drawSub(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.5, r * 0.42, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.25, -r * 0.3, r * 0.55, r * 0.6, 2); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(-r * 1.5, -r * 0.06, r * 0.4, r * 0.12);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* Small standalone icon used by the roster list. */
  Renderer.drawIcon = function (ctx, type, team, size) {
    const r = size * 0.34;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const fake = { radius: r, shape: type.shape, domain: type.domain, maxRange: type.maxRange };
    const col = TEAM[team];
    switch (type.shape) {
      case 'infantry': drawInfantry(ctx, r, col.main, col.dark, col.light); break;
      case 'wheeled': drawWheeled(ctx, r, col.main, col.dark, col.light); drawTurret(ctx, r, fake, col.main, col.dark, col.light, 0); break;
      case 'artillery': drawArtillery(ctx, r, col.main, col.dark, col.light, 0, 0, null); break;
      case 'static': drawStatic(ctx, r, col.main, col.dark, col.light, 0, 0, null); break;
      case 'drone': drawDrone(ctx, r, col.main, col.dark, col.light, null); break;
      case 'heli': drawHeli(ctx, r, col.main, col.dark, col.light, null); break;
      case 'jet': drawJet(ctx, r, col.main, col.dark, col.light); break;
      case 'bomber': drawBomber(ctx, r, col.main, col.dark, col.light); break;
      case 'boat': drawBoat(ctx, r, col.main, col.dark, col.light); break;
      case 'ship': drawShip(ctx, r, col.main, col.dark, col.light); drawTurret(ctx, r, fake, col.main, col.dark, col.light, 0); break;
      case 'sub': drawSub(ctx, r, col.main, col.dark, col.light); break;
      default: drawTank(ctx, r, col.main, col.dark, col.light); drawTurret(ctx, r, fake, col.main, col.dark, col.light, 0); break;
    }
    ctx.restore();
  };

  Renderer.TEAM = TEAM;
  W.Renderer = Renderer;
})(window);
