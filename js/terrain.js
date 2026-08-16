/* Battlefield generation, passability and A* pathfinding.
 *
 * The map is a tile grid. Each tile has a surface type; passability is derived
 * from that per movement domain (land units cannot swim, ships cannot beach,
 * aircraft ignore the whole question).
 */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;

  /* Surface types. */
  const WATER = 0, GRASS = 1, SAND = 2, FOREST = 3, ROCK = 4;

  /* How fast a ground unit crosses each surface. */
  const SPEED_MUL = [1, 1, 0.9, 0.6, 0];

  const TILE = 20;

  /* Field size and map list belong to the active edition — Animals plays on a much
   * smaller board. MAPS is mutated in place so modules that captured it stay valid. */
  let COLS = 120;
  let ROWS = 70;
  let LOOK = 'earth';
  const MAPS = [];

  Terrain.setEdition = function (ed) {
    COLS = ed.cols || 120;
    ROWS = ed.rows || 70;
    /* Carried on each terrain so the renderer can pick a palette without having
     * to ask which edition is loaded. */
    LOOK = ed.look || 'earth';
    MAPS.length = 0;
    (ed.maps || []).forEach(function (m) { MAPS.push(m); });
  };

  function Terrain(mapId, seed) {
    this.mapId = mapId;
    this.seed = seed >>> 0;
    this.cols = COLS;
    this.rows = ROWS;
    this.tileSize = TILE;
    this.width = COLS * TILE;
    this.height = ROWS * TILE;
    this.tiles = new Uint8Array(COLS * ROWS);
    this.look = LOOK;
    /* Named features a map carved deliberately — a planet is one object the
     * renderer draws as a sphere, not a thousand tiles it draws as rubble. */
    this.props = [];

    const def = MAPS.filter(function (m) { return m.id === mapId; })[0] || MAPS[0];
    this.def = def;
    this.name = def.name;
    this.blurb = def.blurb;

    this.generate();
    this.buildPassability();
    this.buildComponents();
    this.measureZones();
  }

  Terrain.prototype.generate = function () {
    const noise = U.makeNoise(this.seed);
    const rand = U.rng(this.seed ^ 0x9e3779b9);
    const cols = this.cols, rows = this.rows, t = this.tiles;
    /* Each map supplies its own water shape, so an edition can add maps — or have
     * none with any water at all — without touching this file. */
    const shape = (this.def && this.def.water) || function () { return false; };

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = x / cols, ny = y / rows;
        const n = noise(x * 0.06, y * 0.06, 4);
        t[y * cols + x] = shape(nx, ny, n, x, noise, y) ? WATER : GRASS;
      }
    }

    this.decorate(noise, rand);
  };

  /* Adds beaches next to water, forest patches and impassable rock outcrops. */
  Terrain.prototype.decorate = function (noise, rand) {
    const cols = this.cols, rows = this.rows, t = this.tiles;
    const base = t.slice();
    const forestBias = (this.def && this.def.forestBias) || 0;
    const rockBias = (this.def && this.def.rockBias) || 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (base[i] === WATER) continue;

        /* Beach: any land tile within two tiles of water. */
        let nearWater = false;
        for (let dy = -2; dy <= 2 && !nearWater; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const sx = x + dx, sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
            if (base[sy * cols + sx] === WATER) { nearWater = true; break; }
          }
        }
        if (nearWater) { t[i] = SAND; continue; }

        /* Maps can push their own character — a bare quarry, a dense wood. */
        const f = noise(x * 0.09 + 900, y * 0.09 + 900, 3) + forestBias;
        const r = noise(x * 0.14 - 700, y * 0.14 - 700, 2) + rockBias;
        if (r > 0.52) t[i] = ROCK;
        else if (f > 0.20) t[i] = FOREST;
      }
    }

    /* Deliberate, hand-placed features go on after the noise pass — which would
     * otherwise paint straight over them — and before the deployment-zone
     * cleanup below, so a map cannot accidentally wall its own armies in. */
    if (this.def && this.def.carve) this.def.carve(this, noise, rand);

    /* Deployment zones must stay clean enough to actually place an army in. */
    const zoneW = Math.floor(cols * 0.30);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x > zoneW && x < cols - zoneW) continue;
        const i = y * cols + x;
        if (t[i] === ROCK) t[i] = GRASS;
        if (t[i] === FOREST && rand.chance(0.6)) t[i] = GRASS;
      }
    }
  };

  /* Stamps a filled circle of one surface into the grid. Tile coordinates, and
   * fractional centres are fine — maps place features in fractions of the field.
   * The one drawing primitive a map's `carve` needs often enough to share. */
  Terrain.prototype.disc = function (cx, cy, r, surface) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.cols - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.rows - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.tiles[y * this.cols + x] = surface;
      }
    }
  };

  /* Per-domain passability bitmaps, built once per map. */
  Terrain.prototype.buildPassability = function () {
    const n = this.cols * this.rows, t = this.tiles;
    this.passLand = new Uint8Array(n);
    this.passSea = new Uint8Array(n);
    this.cost = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = t[i];
      this.passLand[i] = (s === GRASS || s === SAND || s === FOREST) ? 1 : 0;
      this.passSea[i] = (s === WATER) ? 1 : 0;
      this.cost[i] = SPEED_MUL[s] > 0 ? 1 / SPEED_MUL[s] : 1;
    }
  };

  /* Flood-fills each domain into connected components.
   *
   * This is what makes "can I even walk there?" an O(1) question. Without it,
   * a tank stranded on an island would run a full-budget A* every second for the
   * whole battle, which costs more than the rest of the simulation combined. */
  Terrain.prototype.buildComponents = function () {
    const cols = this.cols, rows = this.rows, n = cols * rows;
    const self = this;

    function fill(grid) {
      const comp = new Int32Array(n).fill(-1);
      const stack = new Int32Array(n);
      let next = 0;
      for (let start = 0; start < n; start++) {
        if (!grid[start] || comp[start] !== -1) continue;
        const id = next++;
        let sp = 0;
        stack[sp++] = start;
        comp[start] = id;
        while (sp > 0) {
          const i = stack[--sp];
          const x = i % cols, y = (i / cols) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (!grid[ni] || comp[ni] !== -1) continue;
            comp[ni] = id;
            stack[sp++] = ni;
          }
        }
      }
      return comp;
    }

    this.compLand = fill(this.passLand);
    this.compSea = fill(this.passSea);
    void self;
  };

  Terrain.prototype.componentAt = function (domain, x, y) {
    if (domain === Units.AIR) return 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    const comp = domain === Units.SEA ? this.compSea : this.compLand;
    return comp[cy * this.cols + cx];
  };

  /* True when a unit at (sx, sy) could physically travel to (tx, ty).
   * If the goal itself is not passable for this domain (a ship aiming at a
   * shore target), the nearest passable tile to the goal is used instead. */
  Terrain.prototype.reachable = function (domain, sx, sy, tx, ty) {
    if (domain === Units.AIR) return true;
    const from = this.componentAt(domain, sx, sy);
    if (from < 0) return true;   // already off-grid; let the mover sort it out
    let to = this.componentAt(domain, tx, ty);
    if (to < 0) {
      const alt = this.nearestPassable(domain, tx, ty, 8);
      if (!alt) return false;
      to = this.componentAt(domain, alt.x, alt.y);
    }
    return from === to;
  };

  /* Fraction of each deployment zone that is land / water, used to warn the player. */
  Terrain.prototype.measureZones = function () {
    const zoneW = Math.floor(this.cols * 0.26);
    let land = 0, sea = 0, total = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < zoneW; x++) {
        const i = y * this.cols + x;
        total++;
        if (this.passSea[i]) sea++; else if (this.passLand[i]) land++;
      }
    }
    this.zoneLandFrac = land / total;
    this.zoneSeaFrac = sea / total;
  };

  Terrain.prototype.grid = function (mask) {
    return mask === Units.SEA ? this.passSea : this.passLand;
  };

  Terrain.prototype.tileAt = function (x, y) {
    const cx = U.clamp(Math.floor(x / TILE), 0, this.cols - 1);
    const cy = U.clamp(Math.floor(y / TILE), 0, this.rows - 1);
    return this.tiles[cy * this.cols + cx];
  };

  /* Can a unit of this domain stand at this world position? */
  Terrain.prototype.passable = function (domain, x, y) {
    if (domain === Units.AIR) return x >= 0 && y >= 0 && x < this.width && y < this.height;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    return this.grid(domain)[cy * this.cols + cx] === 1;
  };

  Terrain.prototype.speedAt = function (domain, x, y) {
    if (domain !== Units.LAND) return 1;
    return SPEED_MUL[this.tileAt(x, y)] || 1;
  };

  /* Deployment zone test. team 0 holds the west edge, team 1 the east. */
  Terrain.prototype.inDeployZone = function (team, x) {
    const w = this.width * 0.26;
    return team === 0 ? (x < w) : (x > this.width - w);
  };

  /* Straight-line passability, used to shortcut A* and to smooth paths. */
  Terrain.prototype.lineClear = function (domain, x0, y0, x1, y1) {
    if (domain === Units.AIR) return true;
    const d = U.dist(x0, y0, x1, y1);
    const steps = Math.ceil(d / (TILE * 0.5));
    if (steps === 0) return true;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.passable(domain, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  };

  /* Nearest passable world point to (x, y) for this domain, searching outward. */
  Terrain.prototype.nearestPassable = function (domain, x, y, maxRings) {
    if (this.passable(domain, x, y)) return { x: x, y: y };
    const grid = this.grid(domain);
    const cx = U.clamp(Math.floor(x / TILE), 0, this.cols - 1);
    const cy = U.clamp(Math.floor(y / TILE), 0, this.rows - 1);
    const rings = maxRings || 14;
    for (let r = 1; r <= rings; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const sx = cx + dx, sy = cy + dy;
          if (sx < 0 || sy < 0 || sx >= this.cols || sy >= this.rows) continue;
          if (grid[sy * this.cols + sx]) {
            return { x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE };
          }
        }
      }
    }
    return null;
  };

  const NEIGHBOURS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]
  ];

  /* A* over the tile grid. Returns an array of world-space waypoints, or null.
   * `budget` caps node expansions so a hopeless search cannot stall a frame. */
  Terrain.prototype.findPath = function (domain, sx, sy, tx, ty, budget) {
    if (domain === Units.AIR) return [{ x: tx, y: ty }];

    const cols = this.cols, rows = this.rows, grid = this.grid(domain), cost = this.cost;
    const startX = U.clamp(Math.floor(sx / TILE), 0, cols - 1);
    const startY = U.clamp(Math.floor(sy / TILE), 0, rows - 1);
    let goalX = U.clamp(Math.floor(tx / TILE), 0, cols - 1);
    let goalY = U.clamp(Math.floor(ty / TILE), 0, rows - 1);

    /* If the goal tile is not passable for us, aim at the closest tile that is. */
    if (!grid[goalY * cols + goalX]) {
      const alt = this.nearestPassable(domain, tx, ty, 10);
      if (!alt) return null;
      goalX = U.clamp(Math.floor(alt.x / TILE), 0, cols - 1);
      goalY = U.clamp(Math.floor(alt.y / TILE), 0, rows - 1);
      if (!grid[goalY * cols + goalX]) return null;
    }

    const startIdx = startY * cols + startX;
    const goalIdx = goalY * cols + goalX;
    if (startIdx === goalIdx) return [{ x: tx, y: ty }];
    if (!grid[startIdx]) return null;

    /* Provably unreachable: skip the search entirely rather than exhausting the budget. */
    const comp = domain === Units.SEA ? this.compSea : this.compLand;
    if (comp[startIdx] !== comp[goalIdx]) return null;

    const n = cols * rows;
    if (!this._g || this._g.length !== n) {
      this._g = new Float32Array(n);
      this._from = new Int32Array(n);
      this._stamp = new Int32Array(n);
      this._epoch = 0;
    }
    const g = this._g, from = this._from, stamp = this._stamp;
    const epoch = ++this._epoch;

    const heap = new U.Heap();
    g[startIdx] = 0; from[startIdx] = -1; stamp[startIdx] = epoch;
    heap.push({ i: startIdx, f: 0 });

    let expanded = 0;
    const cap = budget || 6000;
    let found = false;

    while (heap.size) {
      const cur = heap.pop();
      if (cur.i === goalIdx) { found = true; break; }
      if (++expanded > cap) break;

      const cx = cur.i % cols, cy = (cur.i / cols) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NEIGHBOURS[k][0], ny = cy + NEIGHBOURS[k][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (!grid[ni]) continue;
        /* No cutting diagonally through a blocked corner. */
        if (NEIGHBOURS[k][0] && NEIGHBOURS[k][1]) {
          if (!grid[cy * cols + nx] || !grid[ny * cols + cx]) continue;
        }
        const step = NEIGHBOURS[k][2] * cost[ni];
        const ng = g[cur.i] + step;
        if (stamp[ni] === epoch && ng >= g[ni]) continue;
        stamp[ni] = epoch;
        g[ni] = ng;
        from[ni] = cur.i;
        const h = Math.abs(nx - goalX) + Math.abs(ny - goalY);
        heap.push({ i: ni, f: ng + h * 1.05 });
      }
    }

    if (!found) return null;

    /* Walk the parent chain back, then smooth away redundant waypoints. */
    const raw = [];
    let i = goalIdx;
    let guard = 0;
    while (i !== -1 && guard++ < n) {
      raw.push({ x: ((i % cols) + 0.5) * TILE, y: (((i / cols) | 0) + 0.5) * TILE });
      i = from[i];
    }
    raw.reverse();
    raw[raw.length - 1] = { x: tx, y: ty };

    const path = [];
    let anchorX = sx, anchorY = sy, j = 0;
    while (j < raw.length) {
      let best = j;
      for (let k = raw.length - 1; k > j; k--) {
        if (this.lineClear(domain, anchorX, anchorY, raw[k].x, raw[k].y)) { best = k; break; }
      }
      path.push(raw[best]);
      anchorX = raw[best].x; anchorY = raw[best].y;
      j = best + 1;
    }
    return path;
  };

  Terrain.WATER = WATER;
  Terrain.GRASS = GRASS;
  Terrain.SAND = SAND;
  Terrain.FOREST = FOREST;
  Terrain.ROCK = ROCK;
  Terrain.TILE = TILE;
  Terrain.MAPS = MAPS;

  W.Terrain = Terrain;
})(window);
