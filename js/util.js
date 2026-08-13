/* Small math / helper library shared by every module. */
(function (W) {
  'use strict';

  const U = {};

  U.TAU = Math.PI * 2;

  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.dist2 = function (ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.dist = function (ax, ay, bx, by) { return Math.sqrt(U.dist2(ax, ay, bx, by)); };

  /* Shortest signed difference between two angles, in (-PI, PI]. */
  U.angleDiff = function (from, to) {
    let d = (to - from) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return d;
  };

  /* Rotate `from` toward `to` by at most `maxStep` radians. */
  U.turnToward = function (from, to, maxStep) {
    const d = U.angleDiff(from, to);
    if (Math.abs(d) <= maxStep) return to;
    return from + Math.sign(d) * maxStep;
  };

  /* mulberry32 — small, fast, seedable PRNG. */
  U.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + f() * (hi - lo); };
    f.int = function (lo, hi) { return Math.floor(lo + f() * (hi - lo + 1)); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.chance = function (p) { return f() < p; };
    return f;
  };

  /* Seeded 2D value noise with fractal octaves. Returns roughly [-1, 1]. */
  U.makeNoise = function (seed) {
    const rand = U.rng(seed);
    const SIZE = 256, MASK = SIZE - 1;
    const grid = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1;

    const smooth = function (t) { return t * t * (3 - 2 * t); };

    function sample(x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = smooth(x - x0), fy = smooth(y - y0);
      const ix = x0 & MASK, iy = y0 & MASK;
      const jx = (x0 + 1) & MASK, jy = (y0 + 1) & MASK;
      const a = grid[iy * SIZE + ix], b = grid[iy * SIZE + jx];
      const c = grid[jy * SIZE + ix], d = grid[jy * SIZE + jx];
      return U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
    }

    return function (x, y, octaves, freq) {
      octaves = octaves || 3; freq = freq || 1;
      let sum = 0, amp = 1, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += sample(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    };
  };

  /* Binary min-heap keyed by numeric `f`, used by the A* implementation. */
  U.Heap = function () {
    this.items = [];
  };
  U.Heap.prototype.push = function (node) {
    const a = this.items;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  };
  U.Heap.prototype.pop = function () {
    const a = this.items;
    const top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l].f < a[s].f) s = l;
        if (r < a.length && a[r].f < a[s].f) s = r;
        if (s === i) break;
        const t = a[s]; a[s] = a[i]; a[i] = t;
        i = s;
      }
    }
    return top;
  };
  Object.defineProperty(U.Heap.prototype, 'size', {
    get: function () { return this.items.length; }
  });

  /* Uniform grid used for "who is near me" queries during the battle. */
  U.SpatialHash = function (width, height, cell) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  };
  U.SpatialHash.prototype.clear = function () {
    for (let i = 0; i < this.buckets.length; i++) {
      if (this.buckets[i].length) this.buckets[i].length = 0;
    }
  };
  U.SpatialHash.prototype.insert = function (obj) {
    const cx = U.clamp(Math.floor(obj.x / this.cell), 0, this.cols - 1);
    const cy = U.clamp(Math.floor(obj.y / this.cell), 0, this.rows - 1);
    this.buckets[cy * this.cols + cx].push(obj);
  };
  /* Appends every object within `radius` of (x, y) to `out`; may include a few extras. */
  U.SpatialHash.prototype.query = function (x, y, radius, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = U.clamp(Math.floor((x - radius) / c), 0, this.cols - 1);
    const x1 = U.clamp(Math.floor((x + radius) / c), 0, this.cols - 1);
    const y0 = U.clamp(Math.floor((y - radius) / c), 0, this.rows - 1);
    const y1 = U.clamp(Math.floor((y + radius) / c), 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[row + cx];
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  };

  U.formatCost = function (n) { return n.toLocaleString('en-US'); };

  U.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  W.Util = U;
})(window);
