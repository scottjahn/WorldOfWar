/* Canvas renderer: bakes the terrain once, then draws units, projectiles and
 * effects each frame through a pan/zoom camera. Reads simulation state, never
 * writes to it. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;
  const Terrain = W.Terrain;

  /* Team 0 holds the west edge and is red; team 1 holds the east and is blue.
   * Every edition follows that, so "red on the left" is the one thing a player
   * never has to relearn between worlds. The stylesheet mirrors these in
   * --team-a and --team-b — change both together. */
  const TEAM = [
    { main: '#ff5f4a', dark: '#8a2a1d', light: '#ffb0a4', glow: 'rgba(255,95,74,0.35)' },
    { main: '#4aa3ff', dark: '#1d4f8a', light: '#a8d6ff', glow: 'rgba(74,163,255,0.35)' }
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

    if (t.look === 'space') this.bakeSpace(g, t);
    else this.bakeGround(g, t);

    this.terrainCanvas = cv;
  };

  Renderer.prototype.bakeGround = function (g, t) {
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
  };

  /* ---------------------------- space bake ------------------------- */

  /* The vacuum version of the same job. The tile grid means the same things it
   * always does — it is only painted differently: GRASS is empty space, SAND a
   * dust and debris wash, FOREST nebula gas, ROCK an asteroid or a planet.
   *
   * Everything here is baked once, so it can afford to be expensive: a couple of
   * thousand stars and a blurred gas layer cost nothing per frame. */
  Renderer.prototype.bakeSpace = function (g, t) {
    const TS = t.tileSize;
    const style = (t.def && t.def.space) || {};
    const tint = style.tint || '#1c2a58';
    const clouds = style.clouds == null ? 0.3 : style.clouds;
    const rand = U.rng(t.seed ^ 0x5eed);

    g.fillStyle = '#05070e';
    g.fillRect(0, 0, t.width, t.height);

    /* Distant gas, as a handful of enormous soft gradients. Drawn before the
     * stars so the bright ones still read through it. */
    const puffs = Math.round(4 + clouds * 9);
    for (let i = 0; i < puffs; i++) {
      const cx = rand() * t.width, cy = rand() * t.height;
      const r = (0.16 + rand() * 0.36) * t.width * 0.5;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, rgba(tint, 0.20 * clouds));
      grd.addColorStop(0.5, rgba(tint, 0.09 * clouds));
      grd.addColorStop(1, rgba(tint, 0));
      g.fillStyle = grd;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    /* Starfield. Most are faint dust; a few are bright enough to earn a glare
     * cross, which is what stops the field reading as flat noise. */
    const density = style.stars == null ? 1 : style.stars;
    const stars = Math.round((t.width * t.height) / 2400 * density);
    for (let i = 0; i < stars; i++) {
      const x = rand() * t.width, y = rand() * t.height;
      const m = rand();
      const bright = m > 0.986;
      const r = bright ? 1.8 + rand() * 1.4 : m > 0.86 ? 1.0 + rand() * 0.6 : 0.45 + rand() * 0.5;
      const a = bright ? 0.95 : m > 0.86 ? 0.55 + rand() * 0.35 : 0.14 + rand() * 0.3;
      const h = rand();
      const col = h > 0.9 ? '255,212,166' : h > 0.78 ? '186,212,255' : '255,255,255';
      g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, U.TAU); g.fill();
      if (bright) {
        const len = r * 5;
        g.strokeStyle = 'rgba(' + col + ',0.28)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - len, y); g.lineTo(x + len, y);
        g.moveTo(x, y - len); g.lineTo(x, y + len);
        g.stroke();
      }
    }

    /* Nebula tiles. Same trick as the Earth coastline: blobs go onto their own
     * layer and the whole layer is blurred once, so the gas has no tile edges. */
    const gasCv = document.createElement('canvas');
    gasCv.width = t.width; gasCv.height = t.height;
    const gc = gasCv.getContext('2d');
    let anyGas = false;
    gc.fillStyle = rgba(tint, 0.85);
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        if (t.tiles[y * t.cols + x] !== Terrain.FOREST) continue;
        anyGas = true;
        gc.beginPath();
        gc.arc((x + 0.5) * TS, (y + 0.5) * TS, TS * 1.0, 0, U.TAU);
        gc.fill();
      }
    }
    if (anyGas) {
      g.save();
      g.filter = 'blur(16px)';
      g.globalAlpha = 0.8;
      g.drawImage(gasCv, 0, 0);
      g.filter = 'none';
      /* A second, tighter pass brightens the cores so the gas has depth. */
      g.globalAlpha = 0.35;
      g.filter = 'blur(34px)';
      g.drawImage(gasCv, 0, 0);
      g.restore();
    }

    /* Dust and debris: fine grit, plus the odd pebble to catch the eye. */
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        if (t.tiles[y * t.cols + x] !== Terrain.SAND) continue;
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          const px = (x + rand()) * TS, py = (y + rand()) * TS;
          const r = 0.6 + rand() * 1.9;
          g.fillStyle = rand() < 0.35 ? 'rgba(20,18,16,0.55)' : 'rgba(150,140,126,0.30)';
          g.beginPath(); g.arc(px, py, r, 0, U.TAU); g.fill();
        }
      }
    }

    /* Asteroids. Tiles swallowed by a planet are skipped — that mass gets drawn
     * once, as a sphere, rather than as a few hundred boulders. */
    const props = t.props || [];
    for (let y = 0; y < t.rows; y++) {
      for (let x = 0; x < t.cols; x++) {
        if (t.tiles[y * t.cols + x] !== Terrain.ROCK) continue;
        const wx = (x + 0.5) * TS, wy = (y + 0.5) * TS;
        let hidden = false;
        for (let p = 0; p < props.length; p++) {
          const pr = props[p];
          if (pr.kind !== 'planet') continue;
          if (U.dist2(wx, wy, pr.x, pr.y) < (pr.r + TS) * (pr.r + TS)) { hidden = true; break; }
        }
        if (hidden) continue;
        drawRock(g, wx + (rand() - 0.5) * TS * 0.5, wy + (rand() - 0.5) * TS * 0.5,
          TS * (0.5 + rand() * 0.45), rand);
        if (rand() < 0.5) {
          drawRock(g, (x + rand()) * TS, (y + rand()) * TS, TS * (0.15 + rand() * 0.22), rand);
        }
      }
    }

    props.forEach(function (p) { if (p.kind === 'planet') drawPlanet(g, p, rand); });

    const vg = g.createRadialGradient(t.width / 2, t.height / 2, Math.min(t.width, t.height) * 0.42,
      t.width / 2, t.height / 2, Math.max(t.width, t.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg;
    g.fillRect(0, 0, t.width, t.height);
  };

  /* A single lump of rock, lit from the upper left like everything else. */
  function drawRock(g, x, y, r, rand) {
    const points = 7;
    g.save();
    g.translate(x, y);
    g.rotate(rand() * U.TAU);
    g.beginPath();
    for (let i = 0; i < points; i++) {
      const a = (i / points) * U.TAU;
      const rr = r * (0.68 + rand() * 0.42);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.save(); g.translate(r * 0.18, r * 0.22); g.fill(); g.restore();
    const grd = g.createLinearGradient(-r, -r, r, r);
    grd.addColorStop(0, '#8d8a86');
    grd.addColorStop(0.55, '#5e5b58');
    grd.addColorStop(1, '#302e2d');
    g.fillStyle = grd;
    g.fill();
    g.restore();
  }

  /* A planet or moon: lit limb, dark terminator, and a thin atmosphere rim. */
  function drawPlanet(g, p, rand) {
    const r = p.r;
    if (p.atmos) {
      const halo = g.createRadialGradient(p.x, p.y, r * 0.93, p.x, p.y, r * 1.16);
      halo.addColorStop(0, p.atmos);
      halo.addColorStop(0.35, p.atmos.replace(/[\d.]+\)$/, '0.18)'));
      halo.addColorStop(1, p.atmos.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = halo;
      g.beginPath(); g.arc(p.x, p.y, r * 1.16, 0, U.TAU); g.fill();
    }

    g.save();
    g.beginPath(); g.arc(p.x, p.y, r, 0, U.TAU);
    g.clip();

    const body = g.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.05, p.x, p.y, r * 1.05);
    body.addColorStop(0, shade(p.color, 0.16));
    body.addColorStop(0.5, p.color);
    body.addColorStop(1, p.shade);
    g.fillStyle = body;
    g.fillRect(p.x - r, p.y - r, r * 2, r * 2);

    /* Cloud bands for a gas-and-water world, craters for a dead one. */
    for (let i = 0; i < (p.bands || 0); i++) {
      const cy = p.y - r + (i + 0.6) * (r * 2 / ((p.bands || 1) + 0.5));
      g.fillStyle = 'rgba(255,255,255,' + (0.05 + rand() * 0.07).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(p.x + (rand() - 0.5) * r * 0.5, cy, r * (0.6 + rand() * 0.45), r * (0.07 + rand() * 0.07), 0, 0, U.TAU);
      g.fill();
    }
    for (let i = 0; i < (p.craters || 0); i++) {
      const a = rand() * U.TAU, d = Math.sqrt(rand()) * r * 0.86;
      const cr = r * (0.06 + rand() * 0.13);
      g.fillStyle = 'rgba(0,0,0,0.20)';
      g.beginPath(); g.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, cr, 0, U.TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.beginPath(); g.arc(p.x + Math.cos(a) * d - cr * 0.2, p.y + Math.sin(a) * d - cr * 0.25, cr * 0.7, 0, U.TAU); g.fill();
    }

    /* Terminator: the far side falls off into night. */
    const night = g.createRadialGradient(p.x - r * 0.5, p.y - r * 0.55, r * 0.2, p.x - r * 0.2, p.y - r * 0.25, r * 1.5);
    night.addColorStop(0, 'rgba(0,0,0,0)');
    night.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    night.addColorStop(1, 'rgba(0,0,0,0.88)');
    g.fillStyle = night;
    g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    g.restore();

    /* A bright sliver on the lit limb sells the curvature. */
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = Math.max(1, r * 0.012);
    g.beginPath();
    g.arc(p.x, p.y, r * 0.995, Math.PI * 1.05, Math.PI * 1.85);
    g.stroke();
    g.restore();
  }

  /* '#rrggbb' plus an alpha, for the one place that needs a translucent tint. */
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1, 7), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }

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
      /* armyFilter hides the other commander's deployment in hotseat play:
       * a team index shows only that army, -1 shows none, null shows everything. */
      if (state.armyFilter != null && state.armyFilter !== team) return;
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
        /* A hint of the team colour left in the burnt-out hull. */
        g.fillStyle = d.team === 0 ? 'rgba(104,62,54,0.6)' : 'rgba(58,80,104,0.6)';
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
    const space = this.terrain.look === 'space';

    /* Engine glow behind anything under power. In vacuum this is the only cue
     * that a hull is moving at all — there is no wake and no ground going past. */
    if (space) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive) continue;
        if (u.x < view.x0 || u.x > view.x1 || u.y < view.y0 || u.y > view.y1) continue;
        const frac = U.clamp(u.speed / Math.max(1, u.type.speed), 0, 1);
        if (frac < 0.12) continue;
        const a = u.hdg + Math.PI;
        const stern = u.radius * 0.7;
        const len = u.radius * (0.8 + frac * 2.4);
        const x0 = u.x + Math.cos(a) * stern, y0 = u.y + Math.sin(a) * stern;
        const x1 = u.x + Math.cos(a) * (stern + len), y1 = u.y + Math.sin(a) * (stern + len);
        const col = TEAM[u.team];
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, 'rgba(214,238,255,' + (0.65 * frac).toFixed(3) + ')');
        grad.addColorStop(0.3, rgba(col.light, 0.34 * frac));
        grad.addColorStop(1, rgba(col.light, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = u.radius * 0.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* Ship wakes go under the hulls. */
    for (let i = 0; !space && i < units.length; i++) {
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
    for (let i = 0; !space && i < units.length; i++) {
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
      } else if (e.kind === 'strike') {
        /* A quick slash where two animals met. */
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.a);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff2d0';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        for (let s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          ctx.moveTo(-e.size * 0.4, s * e.size * 0.55);
          ctx.quadraticCurveTo(e.size * 0.3, s * e.size * 0.2, e.size * 0.9, s * e.size * 0.5);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'flee') {
        /* The animal bolts off the field, shrinking and fading as it goes. */
        const dist = 30 + k * 150;
        const fx = e.x + Math.cos(e.a) * dist;
        const fy = e.y + Math.sin(e.a) * dist;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.85;
        const col = TEAM[e.team];
        ctx.translate(fx, fy);
        /* Facing the way it is running. */
        ctx.rotate(e.a);
        ctx.scale(1 - k * 0.35, 1 - k * 0.35);
        drawBody(ctx, e.type, col, null);
        ctx.restore();
        /* A little dust puff behind it. */
        ctx.globalAlpha = (1 - k) * 0.3;
        ctx.fillStyle = '#b9a888';
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(e.a) * dist * 0.4, e.y + Math.sin(e.a) * dist * 0.4,
          6 + k * 14, 0, U.TAU);
        ctx.fill();
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

    /* Ground shadow. Nothing to cast one onto in vacuum. */
    if (type.domain !== Units.AIR && !(this.terrain && this.terrain.look === 'space')) {
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

    drawShapeOf(ctx, type, r, body, dark, light, hdg, turret, live);

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

  function drawCarrier(ctx, r, body, dark, light) {
    /* Hull, then a broad flight deck overhanging it. */
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.75, 0);
    ctx.lineTo(r * 1.4, -r * 0.5);
    ctx.lineTo(-r * 1.5, -r * 0.48);
    ctx.lineTo(-r * 1.62, 0);
    ctx.lineTo(-r * 1.5, r * 0.48);
    ctx.lineTo(r * 1.4, r * 0.5);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#3c4149';
    ctx.beginPath();
    ctx.moveTo(r * 1.62, -r * 0.28);
    ctx.lineTo(r * 1.62, r * 0.34);
    ctx.lineTo(-r * 1.5, r * 0.62);
    ctx.lineTo(-r * 1.55, -r * 0.66);
    ctx.closePath();
    ctx.fill();
    /* Team-coloured deck trim — the deck itself is grey, so without this you
     * cannot tell whose carrier it is at normal zoom. */
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.stroke();

    /* Angled landing deck stripe. */
    ctx.save();
    ctx.strokeStyle = 'rgba(236,240,245,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.setLineDash([r * 0.22, r * 0.18]);
    ctx.beginPath();
    ctx.moveTo(r * 1.4, -r * 0.16);
    ctx.lineTo(-r * 1.35, -r * 0.44);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 1.45, r * 0.12);
    ctx.lineTo(-r * 1.3, r * 0.42);
    ctx.stroke();
    ctx.restore();

    /* Island superstructure to starboard. */
    ctx.fillStyle = body;
    roundRect(ctx, -r * 0.1, r * 0.34, r * 0.7, r * 0.3, 2); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(r * 0.32, r * 0.38, r * 0.12, r * 0.22);
    ctx.fillStyle = dark;
    ctx.fillRect(-r * 0.02, r * 0.4, r * 0.16, r * 0.18);
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

  /* The one place that maps a shape name to a drawing routine. Used by live
   * units, roster icons and the flee animation alike. */
  function drawShapeOf(ctx, type, r, body, dark, light, hdg, turret, live) {
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
      case 'carrier': drawCarrier(ctx, r, body, dark, light); break;
      case 'sub': drawSub(ctx, r, body, dark, light); break;
      case 'critter': drawCritter(ctx, r, body, dark, light); break;
      case 'quadruped': drawQuadruped(ctx, r, body, dark, light); break;
      case 'beast': drawBeast(ctx, r, body, dark, light); break;
      case 'bird': drawBird(ctx, r, body, dark, light, live); break;
      case 'shelled': drawShelled(ctx, r, body, dark, light); break;
      case 'snub': drawSnub(ctx, r, body, dark, light); break;
      case 'awing': drawAwing(ctx, r, body, dark, light); break;
      case 'xwing': drawXwing(ctx, r, body, dark, light); break;
      case 'ywing': drawYwing(ctx, r, body, dark, light); break;
      case 'bwing': drawBwing(ctx, r, body, dark, light); break;
      case 'freighter': drawFreighter(ctx, r, body, dark, light); break;
      case 'transport': drawTransport(ctx, r, body, dark, light); break;
      case 'corvette': drawCorvette(ctx, r, body, dark, light); break;
      case 'frigate': drawFrigate(ctx, r, body, dark, light); break;
      case 'cruiser': drawStarCruiser(ctx, r, body, dark, light); break;
      case 'platform': drawPlatform(ctx, r, body, dark, light); break;
      case 'tie': drawTie(ctx, r, body, dark, light); break;
      case 'tieint': drawTieInt(ctx, r, body, dark, light); break;
      case 'tiebomber': drawTieBomber(ctx, r, body, dark, light); break;
      case 'tiedef': drawTieDef(ctx, r, body, dark, light); break;
      case 'gunboat': drawGunboat(ctx, r, body, dark, light); break;
      case 'shuttle': drawShuttle(ctx, r, body, dark, light); break;
      case 'escort': drawEscort(ctx, r, body, dark, light); break;
      case 'raider': drawRaider(ctx, r, body, dark, light); break;
      case 'wedge': drawWedge(ctx, r, body, dark, light); break;
      default: drawTank(ctx, r, body, dark, light); break;
    }
  }

  /* Shape only, at the type's own size — for the routed animal animation. */
  function drawBody(ctx, type, col, live) {
    drawShapeOf(ctx, type, type.radius, col.main, col.dark, col.light, 0, 0, live);
  }

  /* ---------------------- animal shapes ---------------------- */
  /* All drawn nose-right, matching the heading convention of the vehicles. */

  function drawCritter(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                   // tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.quadraticCurveTo(-r * 1.6, -r * 0.5, -r * 1.3, -r * 0.9);
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = dark; ctx.stroke();
    ctx.fillStyle = body;                                   // body
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.85, r * 0.62, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                   // ears
    ctx.beginPath(); ctx.ellipse(r * 0.55, -r * 0.42, r * 0.24, r * 0.34, -0.4, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.42, r * 0.24, r * 0.34, 0.4, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;                                   // head
    ctx.beginPath(); ctx.arc(r * 0.68, 0, r * 0.46, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;                                  // snout
    ctx.beginPath(); ctx.arc(r * 1.02, 0, r * 0.16, 0, U.TAU); ctx.fill();
  }

  function drawQuadruped(ctx, r, body, dark, light) {
    ctx.strokeStyle = dark; ctx.lineCap = 'round';           // legs
    ctx.lineWidth = r * 0.2;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, i * r * 0.3); ctx.lineTo(-r * 0.72, i * r * 0.72);
      ctx.moveTo(r * 0.4, i * r * 0.3); ctx.lineTo(r * 0.6, i * r * 0.72);
      ctx.stroke();
    }
    ctx.strokeStyle = dark; ctx.lineWidth = r * 0.16;        // tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, 0);
    ctx.quadraticCurveTo(-r * 1.5, -r * 0.25, -r * 1.5, -r * 0.7);
    ctx.stroke();
    ctx.fillStyle = dark;                                    // body
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 1.0, r * 0.5, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.86, r * 0.38, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // ears
    ctx.beginPath(); ctx.moveTo(r * 0.72, -r * 0.34);
    ctx.lineTo(r * 0.92, -r * 0.7); ctx.lineTo(r * 1.02, -r * 0.28); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.72, r * 0.34);
    ctx.lineTo(r * 0.92, r * 0.7); ctx.lineTo(r * 1.02, r * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;                                    // head + muzzle
    ctx.beginPath(); ctx.arc(r * 0.92, 0, r * 0.44, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 1.3, 0, r * 0.26, r * 0.19, 0, 0, U.TAU); ctx.fill();
  }

  function drawBeast(ctx, r, body, dark, light) {
    ctx.strokeStyle = dark; ctx.lineCap = 'round';           // heavy legs
    ctx.lineWidth = r * 0.28;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, i * r * 0.4); ctx.lineTo(-r * 0.68, i * r * 0.82);
      ctx.moveTo(r * 0.35, i * r * 0.4); ctx.lineTo(r * 0.52, i * r * 0.82);
      ctx.stroke();
    }
    ctx.fillStyle = dark;                                    // bulk
    ctx.beginPath(); ctx.ellipse(-r * 0.15, 0, r * 1.05, r * 0.66, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * 0.9, r * 0.52, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // shoulder hump
    ctx.beginPath(); ctx.arc(-r * 0.05, -r * 0.06, r * 0.42, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;                                    // head
    ctx.beginPath(); ctx.ellipse(r * 0.92, 0, r * 0.5, r * 0.42, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;                                   // horn / tusks
    ctx.beginPath();
    ctx.moveTo(r * 1.3, -r * 0.1); ctx.lineTo(r * 1.62, -r * 0.3); ctx.lineTo(r * 1.32, r * 0.1);
    ctx.closePath(); ctx.fill();
  }

  function drawBird(ctx, r, body, dark, light, live) {
    /* Wings beat over time; without a live unit (icon) they sit spread. */
    const beat = live ? Math.sin(live.rotor * 0.55) : 0.35;
    const span = r * (1.15 + beat * 0.35);
    ctx.fillStyle = dark;
    ctx.beginPath();                                         // wings
    ctx.moveTo(-r * 0.1, 0);
    ctx.quadraticCurveTo(-r * 0.3, -span, r * 0.55, -span * 0.82);
    ctx.quadraticCurveTo(r * 0.15, -r * 0.2, r * 0.1, 0);
    ctx.quadraticCurveTo(r * 0.15, r * 0.2, r * 0.55, span * 0.82);
    ctx.quadraticCurveTo(-r * 0.3, span, -r * 0.1, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;                                    // tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 1.25, -r * 0.3);
    ctx.lineTo(-r * 1.25, r * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;                                    // body
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.3, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;                                    // head
    ctx.beginPath(); ctx.arc(r * 0.72, 0, r * 0.3, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;                                   // beak
    ctx.beginPath();
    ctx.moveTo(r * 0.95, -r * 0.12); ctx.lineTo(r * 1.35, 0);
    ctx.lineTo(r * 0.95, r * 0.12); ctx.closePath(); ctx.fill();
  }

  function drawShelled(ctx, r, body, dark, light) {
    ctx.strokeStyle = dark; ctx.lineCap = 'round';           // stubby legs
    ctx.lineWidth = r * 0.22;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, i * r * 0.5); ctx.lineTo(-r * 0.62, i * r * 0.82);
      ctx.moveTo(r * 0.4, i * r * 0.5); ctx.lineTo(r * 0.62, i * r * 0.82);
      ctx.stroke();
    }
    ctx.fillStyle = body;                                    // head
    ctx.beginPath(); ctx.ellipse(r * 1.0, 0, r * 0.36, r * 0.26, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // shell
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0, r * 0.8, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r * 0.62, 0, 0, U.TAU); ctx.fill();
    /* Scute plates. */
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.4, r * 0.3, 0, 0, U.TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.3);
      ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.62);
      ctx.stroke();
    }
  }

  /* ---------------------- starship shapes ---------------------- */
  /* Nose to +x, same as everything else, and all sized off the unit radius so a
   * Star Destroyer and a TIE come out of the same code at very different scales.
   * Hulls take the team colour rather than a realistic grey: at the zoom this
   * game is normally played at, whose ship it is has to be readable before what
   * class it is. Engine bells are the one exception — those stay blue-white. */

  const EXHAUST = 'rgba(200,232,255,0.7)';
  const NACELLE = '#1e2129';

  function drawSnub(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // straight wings
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 0.25); ctx.lineTo(-r * 0.55, -r * 1.05);
    ctx.lineTo(-r * 0.9, -r * 1.0); ctx.lineTo(-r * 0.5, -r * 0.2);
    ctx.lineTo(-r * 0.5, r * 0.2); ctx.lineTo(-r * 0.9, r * 1.0);
    ctx.lineTo(-r * 0.55, r * 1.05); ctx.lineTo(-r * 0.1, r * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;                                    // fuselage
    ctx.beginPath();
    ctx.moveTo(r * 1.25, 0); ctx.lineTo(r * 0.2, -r * 0.3);
    ctx.lineTo(-r * 1.0, -r * 0.26); ctx.lineTo(-r * 1.0, r * 0.26);
    ctx.lineTo(r * 0.2, r * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.12, 0, r * 0.26, r * 0.17, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;
    ctx.fillRect(-r * 1.12, -r * 0.3, r * 0.2, r * 0.22);
    ctx.fillRect(-r * 1.12, r * 0.08, r * 0.2, r * 0.22);
  }

  function drawAwing(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // full wedge
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r * 0.9, -r * 0.95); ctx.lineTo(-r * 1.05, -r * 0.9);
    ctx.lineTo(-r * 1.05, r * 0.9); ctx.lineTo(-r * 0.9, r * 0.95);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.05, 0); ctx.lineTo(-r * 0.8, -r * 0.62); ctx.lineTo(-r * 0.8, r * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.35, 0, r * 0.22, r * 0.15, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;                                 // outboard engines
    ctx.fillRect(-r * 1.02, -r * 0.92, r * 0.2, r * 0.36);
    ctx.fillRect(-r * 1.02, r * 0.56, r * 0.2, r * 0.36);
    ctx.fillStyle = EXHAUST;
    ctx.fillRect(-r * 1.12, -r * 0.87, r * 0.12, r * 0.26);
    ctx.fillRect(-r * 1.12, r * 0.61, r * 0.12, r * 0.26);
    ctx.fillStyle = light;                                   // wingtip cannons
    for (let s = -1; s <= 1; s += 2) ctx.fillRect(-r * 0.5, s * r * 0.86 - r * 0.04, r * 0.7, r * 0.08);
  }

  function drawXwing(ctx, r, body, dark, light) {
    /* Two foils sweeping back, two forward — the open-S-foil X from above. */
    const tips = [[-r * 1.25, -r * 1.15], [r * 0.05, -r * 1.1],
      [-r * 1.25, r * 1.15], [r * 0.05, r * 1.1]];
    ctx.fillStyle = dark;
    tips.forEach(function (w) {
      const s = w[1] < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, s * r * 0.05);
      ctx.lineTo(w[0] + r * 0.18, w[1]);
      ctx.lineTo(w[0] - r * 0.12, w[1]);
      ctx.lineTo(-r * 0.66, s * r * 0.24);
      ctx.closePath(); ctx.fill();
    });
    ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, r * 0.11);   // wingtip cannons
    tips.forEach(function (w) {
      ctx.beginPath();
      ctx.moveTo(w[0] - r * 0.12, w[1]); ctx.lineTo(w[0] + r * 0.8, w[1]);
      ctx.stroke();
    });
    ctx.fillStyle = NACELLE;                                 // engine nacelles
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.ellipse(-r * 0.75, s * r * 0.44, r * 0.36, r * 0.18, 0, 0, U.TAU); ctx.fill();
    }
    ctx.fillStyle = EXHAUST;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.ellipse(-r * 1.04, s * r * 0.44, r * 0.1, r * 0.13, 0, 0, U.TAU); ctx.fill();
    }
    ctx.fillStyle = body;                                    // fuselage
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0); ctx.lineTo(r * 0.45, -r * 0.2);
    ctx.lineTo(-r * 1.0, -r * 0.26); ctx.lineTo(-r * 1.0, r * 0.26);
    ctx.lineTo(r * 0.45, r * 0.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.08, 0, r * 0.24, r * 0.16, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // astromech socket
    ctx.beginPath(); ctx.arc(-r * 0.45, 0, r * 0.15, 0, U.TAU); ctx.fill();
  }

  function drawYwing(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // the two nacelles
    for (let s = -1; s <= 1; s += 2) {
      roundRect(ctx, -r * 1.25, s * r * 0.52 - r * 0.24, r * 2.0, r * 0.48, r * 0.2);
      ctx.fill();
    }
    ctx.fillStyle = NACELLE;
    for (let s = -1; s <= 1; s += 2) ctx.fillRect(-r * 1.42, s * r * 0.52 - r * 0.17, r * 0.2, r * 0.34);
    ctx.fillStyle = EXHAUST;
    for (let s = -1; s <= 1; s += 2) ctx.fillRect(-r * 1.5, s * r * 0.52 - r * 0.12, r * 0.1, r * 0.24);
    ctx.fillStyle = dark;                                    // spar
    ctx.fillRect(-r * 0.25, -r * 0.66, r * 0.5, r * 1.32);
    ctx.fillStyle = body;                                    // fuselage
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.75, -r * 0.3);
    ctx.lineTo(-r * 1.15, -r * 0.3); ctx.lineTo(-r * 1.15, r * 0.3);
    ctx.lineTo(r * 0.75, r * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.3, r * 0.2, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // ion turret
    ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.22, 0, U.TAU); ctx.fill();
  }

  function drawBwing(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // primary airfoil
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 1.5); ctx.lineTo(r * 0.25, -r * 1.35);
    ctx.lineTo(r * 0.3, r * 1.35); ctx.lineTo(-r * 0.2, r * 1.5);
    ctx.closePath(); ctx.fill();
    for (let s = -1; s <= 1; s += 2) {                       // cross foils
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, s * r * 0.15); ctx.lineTo(-r * 1.0, s * r * 0.95);
      ctx.lineTo(-r * 1.18, s * r * 0.85); ctx.lineTo(-r * 0.68, s * r * 0.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = body;                                    // hull
    ctx.beginPath();
    ctx.moveTo(r * 1.45, 0); ctx.lineTo(r * 0.6, -r * 0.26);
    ctx.lineTo(-r * 1.1, -r * 0.3); ctx.lineTo(-r * 1.1, r * 0.3);
    ctx.lineTo(r * 0.6, r * 0.26);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;                                   // gyro cockpit, right at the nose
    ctx.beginPath(); ctx.ellipse(r * 0.9, 0, r * 0.24, r * 0.17, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;
    ctx.fillRect(-r * 1.28, -r * 0.3, r * 0.22, r * 0.6);
    ctx.fillStyle = EXHAUST;
    ctx.fillRect(-r * 1.38, -r * 0.2, r * 0.12, r * 0.4);
  }

  function drawFreighter(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // forward mandibles
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(r * 0.35, s * r * 0.15); ctx.lineTo(r * 1.45, s * r * 0.26);
      ctx.lineTo(r * 1.45, s * r * 0.6); ctx.lineTo(r * 0.3, s * r * 0.64);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU); ctx.fill();  // saucer
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // dorsal turret ring
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;                                    // offset cockpit tube
    ctx.beginPath();
    ctx.moveTo(r * 0.5, r * 0.5); ctx.lineTo(r * 1.12, r * 0.86);
    ctx.lineTo(r * 1.0, r * 1.06); ctx.lineTo(r * 0.35, r * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 1.0, r * 0.9, r * 0.14, 0, U.TAU); ctx.fill();
    ctx.fillStyle = EXHAUST;                                 // stern drive strip
    roundRect(ctx, -r * 1.04, -r * 0.5, r * 0.16, r * 1.0, r * 0.07); ctx.fill();
  }

  function drawTransport(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0); ctx.lineTo(r * 0.55, -r * 0.72);
    ctx.lineTo(-r * 1.15, -r * 0.8); ctx.lineTo(-r * 1.3, 0);
    ctx.lineTo(-r * 1.15, r * 0.8); ctx.lineTo(r * 0.55, r * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.05, 0); ctx.lineTo(r * 0.45, -r * 0.5);
    ctx.lineTo(-r * 0.95, -r * 0.56); ctx.lineTo(-r * 0.95, r * 0.56);
    ctx.lineTo(r * 0.45, r * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;                                    // containers lashed to the spine
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, -r * 0.82 + i * r * 0.52, -r * 0.34, r * 0.42, r * 0.68, 2);
      ctx.fill();
    }
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.78, 0, r * 0.18, r * 0.13, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = EXHAUST;
    ctx.fillRect(-r * 1.22, -r * 0.42, r * 0.12, r * 0.84);
  }

  function drawCorvette(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // hammerhead bridge
    roundRect(ctx, r * 0.95, -r * 0.62, r * 0.62, r * 1.24, r * 0.16); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, r * 1.05, -r * 0.48, r * 0.42, r * 0.96, r * 0.12); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(r * 1.36, -r * 0.2, r * 0.12, r * 0.4);
    ctx.fillStyle = dark;                                    // neck
    ctx.fillRect(r * 0.45, -r * 0.2, r * 0.6, r * 0.4);
    ctx.beginPath();                                         // hull
    ctx.moveTo(r * 0.75, -r * 0.34); ctx.lineTo(-r * 1.2, -r * 0.5);
    ctx.lineTo(-r * 1.2, r * 0.5); ctx.lineTo(r * 0.75, r * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 0.6, -r * 0.24); ctx.lineTo(-r * 1.05, -r * 0.36);
    ctx.lineTo(-r * 1.05, r * 0.36); ctx.lineTo(r * 0.6, r * 0.24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = NACELLE;                                 // the famous engine bank
    ctx.fillRect(-r * 1.35, -r * 0.5, r * 0.2, r * 1.0);
    ctx.fillStyle = EXHAUST;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.32, i * r * 0.2, r * 0.078, 0, U.TAU); ctx.fill();
    }
  }

  function drawFrigate(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // forward command section
    roundRect(ctx, r * 0.55, -r * 0.7, r * 0.95, r * 1.4, r * 0.18); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, r * 0.66, -r * 0.55, r * 0.72, r * 1.1, r * 0.14); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 1.26, 0, r * 0.16, 0, U.TAU); ctx.fill();
    ctx.fillStyle = dark;                                    // the spine everyone aims at
    ctx.fillRect(-r * 0.55, -r * 0.18, r * 1.15, r * 0.36);
    ctx.fillStyle = body;
    ctx.fillRect(-r * 0.5, -r * 0.1, r * 1.05, r * 0.2);
    ctx.fillStyle = dark;                                    // engineering block
    roundRect(ctx, -r * 1.3, -r * 0.85, r * 0.8, r * 1.7, r * 0.14); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -r * 1.2, -r * 0.7, r * 0.6, r * 1.4, r * 0.1); ctx.fill();
    ctx.fillStyle = EXHAUST;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.34, i * r * 0.36, r * 0.11, 0, U.TAU); ctx.fill();
    }
  }

  function drawStarCruiser(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // organic Mon Cal hull
    ctx.beginPath();
    ctx.moveTo(r * 1.65, 0);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.52, -r * 0.35, -r * 0.62);
    ctx.quadraticCurveTo(-r * 1.2, -r * 0.6, -r * 1.5, -r * 0.3);
    ctx.lineTo(-r * 1.5, r * 0.3);
    ctx.quadraticCurveTo(-r * 1.2, r * 0.6, -r * 0.35, r * 0.62);
    ctx.quadraticCurveTo(r * 0.7, r * 0.52, r * 1.65, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.4, 0);
    ctx.quadraticCurveTo(r * 0.6, -r * 0.38, -r * 0.35, -r * 0.46);
    ctx.quadraticCurveTo(-r * 1.05, -r * 0.44, -r * 1.32, -r * 0.22);
    ctx.lineTo(-r * 1.32, r * 0.22);
    ctx.quadraticCurveTo(-r * 1.05, r * 0.44, -r * 0.35, r * 0.46);
    ctx.quadraticCurveTo(r * 0.6, r * 0.38, r * 1.4, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;                                    // dorsal ridge
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.78, r * 0.2, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;                                   // turret blisters
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.ellipse(r * 0.4, s * r * 0.3, r * 0.16, r * 0.1, 0, 0, U.TAU); ctx.fill();
    }
    ctx.fillStyle = EXHAUST;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.48, i * r * 0.2, r * 0.1, 0, U.TAU); ctx.fill();
    }
  }

  function drawPlatform(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // gun arms
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i / 3) * U.TAU);
      roundRect(ctx, r * 0.3, -r * 0.2, r * 1.1, r * 0.4, r * 0.1); ctx.fill();
      ctx.restore();
    }
    hexagon(ctx, r * 0.82); ctx.fillStyle = dark; ctx.fill();
    hexagon(ctx, r * 0.62); ctx.fillStyle = body; ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, U.TAU); ctx.fill();
  }

  function hexagon(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.TAU + Math.PI / 6;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* The TIE line: a ball between two panels seen edge-on. What separates the
   * variants from above is the panel outline and how many there are. */
  function drawTie(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, s * r * 0.72); ctx.lineTo(r * 0.72, s * r * 0.72);
      ctx.lineTo(r * 0.6, s * r * 1.08); ctx.lineTo(-r * 0.6, s * r * 1.08);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(-r * 0.12, -r * 0.9, r * 0.24, r * 1.8);     // pylons
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.17, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;                                 // chin cannons
    for (let s = -1; s <= 1; s += 2) ctx.fillRect(r * 0.34, s * r * 0.2 - r * 0.05, r * 0.42, r * 0.1);
  }

  function drawTieInt(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // swept dagger panels
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(r * 0.95, s * r * 0.6); ctx.lineTo(-r * 0.85, s * r * 0.68);
      ctx.lineTo(-r * 0.7, s * r * 1.14); ctx.lineTo(r * 0.45, s * r * 1.0);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(-r * 0.1, -r * 0.85, r * 0.2, r * 1.7);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 0.13, 0, r * 0.15, 0, U.TAU); ctx.fill();
    for (let s = -1; s <= 1; s += 2) {                       // wingtip cannons
      ctx.fillRect(r * 0.42, s * r * 0.94 - r * 0.05, r * 0.52, r * 0.1);
    }
  }

  function drawTieBomber(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, s * r * 0.92); ctx.lineTo(r * 0.7, s * r * 0.92);
      ctx.lineTo(r * 0.58, s * r * 1.26); ctx.lineTo(-r * 0.58, s * r * 1.26);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(-r * 0.2, -r * 1.05, r * 0.4, r * 2.1);
    for (let s = -1; s <= 1; s += 2) {                       // twin pods
      ctx.fillStyle = dark;
      roundRect(ctx, -r * 0.85, s * r * 0.34 - r * 0.28, r * 1.7, r * 0.56, r * 0.24); ctx.fill();
      ctx.fillStyle = body;
      roundRect(ctx, -r * 0.72, s * r * 0.34 - r * 0.2, r * 1.44, r * 0.4, r * 0.18); ctx.fill();
    }
    ctx.fillStyle = light;                                   // cockpit in the port pod
    ctx.beginPath(); ctx.ellipse(r * 0.55, -r * 0.34, r * 0.2, r * 0.13, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;                                 // bomb bay doors
    ctx.fillRect(r * 0.1, r * 0.22, r * 0.55, r * 0.24);
  }

  function drawTieDef(ctx, r, body, dark, light) {
    for (let i = 0; i < 3; i++) {                            // three panels at 120°
      ctx.save();
      ctx.rotate(Math.PI / 2 + (i / 3) * U.TAU);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
      ctx.lineTo(r * 0.45, r * 1.18); ctx.lineTo(-r * 0.45, r * 1.18);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-r * 0.09, 0, r * 0.18, r * 0.78);
      ctx.restore();
    }
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, U.TAU); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, U.TAU); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.16, 0, U.TAU); ctx.fill();
    for (let s = -1; s <= 1; s += 2) ctx.fillRect(r * 0.4, s * r * 0.22 - r * 0.05, r * 0.58, r * 0.1);
  }

  function drawGunboat(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // swept wings
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, s * r * 0.2); ctx.lineTo(-r * 0.75, s * r * 1.15);
      ctx.lineTo(-r * 1.05, s * r * 1.05); ctx.lineTo(-r * 0.6, s * r * 0.18);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = body;                                    // long nose
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.5, -r * 0.28);
    ctx.lineTo(-r * 1.0, -r * 0.42); ctx.lineTo(-r * 1.0, r * 0.42);
    ctx.lineTo(r * 0.5, r * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.24, r * 0.16, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;
    ctx.fillRect(-r * 1.12, -r * 0.44, r * 0.16, r * 0.88);
    ctx.fillStyle = EXHAUST;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.1, i * r * 0.28, r * 0.09, 0, U.TAU); ctx.fill();
    }
  }

  function drawShuttle(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // the two lower wings
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(r * 0.1, s * r * 0.2); ctx.lineTo(-r * 1.15, s * r * 1.28);
      ctx.lineTo(-r * 1.32, s * r * 1.05); ctx.lineTo(-r * 0.35, s * r * 0.15);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath();                                         // dorsal fin between them
    ctx.moveTo(r * 0.2, 0); ctx.lineTo(-r * 1.35, -r * 0.16); ctx.lineTo(-r * 1.35, r * 0.16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.45, 0); ctx.lineTo(r * 0.5, -r * 0.3);
    ctx.lineTo(-r * 0.85, -r * 0.4); ctx.lineTo(-r * 0.85, r * 0.4);
    ctx.lineTo(r * 0.5, r * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(r * 0.8, 0, r * 0.22, r * 0.15, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = EXHAUST;
    ctx.fillRect(-r * 0.96, -r * 0.3, r * 0.12, r * 0.6);
  }

  function drawEscort(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // side fins
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(r * 0.3, s * r * 0.42); ctx.lineTo(-r * 0.2, s * r * 0.98);
      ctx.lineTo(-r * 1.0, s * r * 0.98); ctx.lineTo(-r * 1.0, s * r * 0.42);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath();                                         // hull
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.85, -r * 0.4);
    ctx.lineTo(-r * 1.15, -r * 0.46); ctx.lineTo(-r * 1.15, r * 0.46);
    ctx.lineTo(r * 0.85, r * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.28, 0); ctx.lineTo(r * 0.75, -r * 0.28);
    ctx.lineTo(-r * 1.0, -r * 0.33); ctx.lineTo(-r * 1.0, r * 0.33);
    ctx.lineTo(r * 0.75, r * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light;                                   // bridge
    roundRect(ctx, -r * 0.58, -r * 0.16, r * 0.34, r * 0.32, r * 0.06); ctx.fill();
    ctx.fillStyle = EXHAUST;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.2, i * r * 0.24, r * 0.1, 0, U.TAU); ctx.fill();
    }
  }

  function drawRaider(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(r * 1.6, 0); ctx.lineTo(-r * 1.1, -r * 0.62);
    ctx.lineTo(-r * 1.25, -r * 0.3); ctx.lineTo(-r * 1.25, r * 0.3);
    ctx.lineTo(-r * 1.1, r * 0.62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r * 0.95, -r * 0.42);
    ctx.lineTo(-r * 1.05, 0); ctx.lineTo(-r * 0.95, r * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;                                    // missile pods
    for (let s = -1; s <= 1; s += 2) {
      roundRect(ctx, -r * 0.5, s * r * 0.44 - r * 0.12, r * 0.85, r * 0.24, r * 0.08); ctx.fill();
    }
    ctx.fillStyle = light;
    roundRect(ctx, -r * 0.78, -r * 0.14, r * 0.3, r * 0.28, r * 0.06); ctx.fill();
    ctx.fillStyle = EXHAUST;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-r * 1.2, i * r * 0.22, r * 0.09, 0, U.TAU); ctx.fill();
    }
  }

  function drawWedge(ctx, r, body, dark, light) {
    ctx.fillStyle = dark;                                    // dagger hull
    ctx.beginPath();
    ctx.moveTo(r * 1.75, 0); ctx.lineTo(-r * 1.15, -r * 0.95);
    ctx.lineTo(-r * 1.3, -r * 0.8); ctx.lineTo(-r * 1.3, r * 0.8);
    ctx.lineTo(-r * 1.15, r * 0.95);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * 1.02, -r * 0.76);
    ctx.lineTo(-r * 1.15, -r * 0.64); ctx.lineTo(-r * 1.15, r * 0.64);
    ctx.lineTo(-r * 1.02, r * 0.76);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark;                                  // panel lines to the bow
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(r * 1.45, 0); ctx.lineTo(-r * 1.05, s * r * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = dark;                                    // superstructure
    roundRect(ctx, -r * 0.98, -r * 0.42, r * 0.88, r * 0.84, r * 0.06); ctx.fill();
    ctx.fillStyle = light;                                   // command tower
    roundRect(ctx, -r * 0.74, -r * 0.2, r * 0.36, r * 0.4, r * 0.05); ctx.fill();
    ctx.fillStyle = dark;                                    // sensor globes
    ctx.beginPath(); ctx.arc(-r * 0.56, -r * 0.13, r * 0.09, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.56, r * 0.13, r * 0.09, 0, U.TAU); ctx.fill();
    ctx.fillStyle = NACELLE;                                 // main drives
    ctx.fillRect(-r * 1.38, -r * 0.68, r * 0.18, r * 1.36);
    ctx.fillStyle = 'rgba(200,232,255,0.8)';
    const bells = [0, 0.32, -0.32, 0.58, -0.58];
    for (let i = 0; i < bells.length; i++) {
      ctx.beginPath();
      ctx.arc(-r * 1.33, bells[i] * r, i < 3 ? r * 0.15 : r * 0.1, 0, U.TAU);
      ctx.fill();
    }
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

  /* Small standalone icon used by the roster list.
   *
   * The radius factor has to clear the longest thing any shape draws, not the
   * average one: hulls run out to about 1.75r ahead of centre (a Star Destroyer,
   * a battleship) and horns and tails to about 1.6r, while a long gun barrel
   * reaches 1.9r — so anything above 0.26 lops the nose off the biggest ships
   * and the muzzle off the artillery in the roster list. */
  Renderer.drawIcon = function (ctx, type, team, size) {
    const r = size * 0.26;
    const col = TEAM[team];
    /* drawTurret needs a unit-like object; only the turreted vehicle shapes use it. */
    const fake = { radius: r, shape: type.shape, domain: type.domain, maxRange: type.maxRange };
    ctx.save();
    ctx.translate(size / 2, size / 2);
    drawShapeOf(ctx, type, r, col.main, col.dark, col.light, 0, 0, null);
    if (type.shape === 'tank' || type.shape === 'ship' || type.shape === 'wheeled') {
      drawTurret(ctx, r, fake, col.main, col.dark, col.light, 0);
    }
    ctx.restore();
  };

  Renderer.TEAM = TEAM;
  W.Renderer = Renderer;
})(window);
