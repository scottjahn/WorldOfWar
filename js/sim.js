/* Battle simulation: fixed-timestep, self-contained, no rendering.
 *
 * Battle.step(dt) advances everything one tick. The renderer only reads state,
 * which keeps fast-forward (running several steps per frame) honest. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;
  /* Deterministic trig. Native Math.sin/cos/atan2/hypot vary between engines,
   * which would make a shared replay link reproduce only on the same browser. */
  const M = W.DMath;
  const LAND = Units.LAND, SEA = Units.SEA, AIR = Units.AIR;

  const DT = 1 / 60;
  const MAX_BATTLE_TIME = 240;   // seconds before the battle is judged on points

  /* Math.pow(0.06, DT), pinned to a literal so it cannot vary between engines. */
  const DRAG_PER_TICK = 0.9541921825457205;

  /* How close a unit must be to see a submerged submarine. Shared by the
   * visibility check and by the stealth stand-off logic, which needs to know the
   * distance it is trying to stay outside of. */
  const ASW_DETECT = 620;        // units with sonar
  const PASSIVE_DETECT = 150;    // everything else

  let nextId = 1;

  /* ============================ Unit ============================ */

  function Unit(type, team, x, y, rand) {
    this.id = nextId++;
    this.type = type;
    this.team = team;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hp = type.hp;
    this.maxHp = type.hp;
    this.alive = true;
    this.domain = type.domain;
    this.radius = type.radius;

    /* Aircraft and ships face the way they travel; turrets track independently. */
    this.hdg = team === 0 ? 0 : Math.PI;
    this.turret = this.hdg;
    this.speed = type.move === 'fixedwing' ? type.speed : 0;

    /* Every random value here comes from the battle's seeded generator, never
     * Math.random — the initial stagger of thinking, pathing and weapon cooldowns
     * feeds straight into the outcome, so a replay would otherwise diverge. */
    this.target = null;
    this.thinkIn = rand() * 0.4;
    this.pathIn = rand() * 0.6;
    this.path = null;
    this.pathStep = 0;
    this.pathGoalX = 0; this.pathGoalY = 0;
    this.stuck = 0;

    this.weapons = type.weapons.map(function (w) {
      return { def: w, cd: rand() * w.cd, salvoLeft: 0, salvoTimer: 0, target: null };
    });

    /* Carriers track the aircraft they have in the air, plus a finite pool of
     * spare airframes so a long battle cannot be farmed with endless respawns. */
    this.wing = type.squadron ? [] : null;
    this.reserve = type.squadron ? (type.squadron.reserve || 0) : 0;
    this.launchTimer = 0;

    /* Visual-only state the renderer reads. */
    this.rotor = rand() * U.TAU;
    this.recoil = 0;
    this.flash = 0;
    this.wake = 0;
    this.damageFlash = 0;
  }

  Unit.prototype.standoff = function () {
    /* Sit at the edge of the longest weapon that can hurt the current target. */
    let best = 0, minR = 0;
    for (let i = 0; i < this.weapons.length; i++) {
      const d = this.weapons[i].def;
      if (this.target && !mountCanHit(d, this.target)) continue;
      if (d.range > best) { best = d.range; minR = d.minRange; }
    }
    if (best === 0) best = this.type.maxRange;

    let want = best * 0.82;
    let min = minR * 1.15;

    /* A stealth unit holds outside the range at which its target could spot it,
     * provided its weapons still reach from there. Without this a submarine
     * closes to its own firing range and simply waits for a blind capital ship to
     * blunder into detection range, throwing away the ambush it is built around.
     * Against a sonar-equipped hunter the detection range exceeds the torpedo's
     * reach, so no safe distance exists and the submarine has to accept the fight
     * — which is exactly how escorts are meant to counter it. */
    if (this.type.stealth && this.target) {
      /* The margin is generous on purpose: a submarine turns slowly, so an enemy
       * closes a long way before the retreat actually takes effect. Cutting it
       * fine let one boat drift into detection, and a capital ship's splash then
       * killed the neighbours clustered around it. */
      const spotted = (this.target.type.asw ? ASW_DETECT : PASSIVE_DETECT) + 180;
      if (spotted < best * 0.95) {
        min = Math.max(min, spotted);
        /* Keep the hold distance clear of the back-off distance, or the unit
         * oscillates between advancing and retreating. */
        if (want < min + 15) want = Math.min(best * 0.95, min + 15);
      }
    }
    return { want: want, min: min };
  };

  /* ========================== Projectile ========================= */

  function Projectile(owner, wdef, x, y, target, aimX, aimY) {
    this.owner = owner;
    this.team = owner.team;
    this.def = wdef;
    this.kind = wdef.kind;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.target = target;
    this.dead = false;
    this.life = 0;

    const dx = aimX - x, dy = aimY - y;
    const d = Math.max(1, M.hypot(dx, dy));
    this.hdg = M.atan2(dy, dx);

    if (this.kind === 'shell' || this.kind === 'bomb') {
      /* Ballistic: fly to a fixed ground point over a travel time set by distance. */
      this.sx = x; this.sy = y;
      this.gx = aimX; this.gy = aimY;
      this.dur = this.kind === 'bomb' ? 0.55 : U.clamp(d / 420, 0.5, 3.2);
      this.t = 0;
      this.arc = this.kind === 'bomb' ? 0 : Math.min(180, d * 0.22);
    } else {
      this.vx = (dx / d) * wdef.speed;
      this.vy = (dy / d) * wdef.speed;
      this.maxLife = this.kind === 'torpedo' ? 8 : (wdef.range / wdef.speed) * 1.8 + 0.4;
    }
  }

  /* ============================ Battle =========================== */

  /* `seed` makes a battle reproducible: the same terrain, armies and seed always
   * play out identically, which is what lets a replay actually be a replay. */
  function Battle(terrain, armies, seed) {
    this.terrain = terrain;
    this.units = [];
    this.projectiles = [];
    this.effects = [];
    this.decals = [];
    this.time = 0;
    this.over = false;
    this.winner = -1;
    this.reason = '';
    this.hash = new U.SpatialHash(terrain.width, terrain.height, 96);
    this.scratch = [];
    /* Splash uses its own buffer: detonate() can be called from inside a loop that
     * is already iterating a query result held in `scratch`. */
    this.splashScratch = [];
    this.pathQueue = [];
    this.startValue = [0, 0];
    this.lostValue = [0, 0];
    this.seed = (seed != null ? seed : (0x1234 ^ terrain.seed)) >>> 0;
    this.rand = U.rng(this.seed);
    /* What happens to a beaten unit — 'destroy' or 'flee'. */
    const ed = W.Editions && W.Editions.current();
    this.defeat = (ed && ed.defeat) || 'destroy';
    /* Whether the battlefield holds a crater. Space does not. */
    this.scars = !ed || ed.scars !== false;
    this.words = (ed && ed.words) || {};

    const self = this;
    armies.forEach(function (army, team) {
      army.forEach(function (entry) {
        const type = Units.TYPES[entry.type];
        const u = new Unit(type, team, entry.x, entry.y, self.rand);
        self.units.push(u);
        self.startValue[team] += type.cost;
      });
    });

    /* Carriers arrive with their squadron already airborne. Snapshot the list
     * first, since launching appends to it. */
    this.units.slice().forEach(function (u) {
      if (u.type.squadron) self.launch(u, u.type.squadron.count);
    });
  }

  /* Puts `n` aircraft into the air around a carrier, fanned out around the deck. */
  Battle.prototype.launch = function (carrier, n) {
    const squad = carrier.type.squadron;
    const type = Units.TYPES[squad.type];
    if (!type) return;
    for (let i = 0; i < n; i++) {
      const spread = carrier.wing.length + i;
      const a = carrier.hdg + (spread % 2 === 0 ? 0.7 : -0.7) - Math.PI * (spread % 4) * 0.12;
      const d = carrier.radius + 34;
      const u = new Unit(type, carrier.team, carrier.x + M.cos(a) * d, carrier.y + M.sin(a) * d, this.rand);
      u.hdg = a;
      u.turret = a;
      u.speed = type.speed * 0.6;
      carrier.wing.push(u);
      this.units.push(u);
    }
  };

  /* Replaces squadron losses while the carrier is alive. Destroying the carrier
   * does not down the aircraft already flying — it just stops the replacements. */
  Battle.prototype.serviceSquadrons = function (dt) {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.alive || !u.type.squadron || !u.wing) continue;

      let live = 0;
      for (let k = 0; k < u.wing.length; k++) if (u.wing[k].alive) live++;
      if (live !== u.wing.length) {
        u.wing = u.wing.filter(function (a) { return a.alive; });
      }

      if (u.wing.length >= u.type.squadron.count || u.reserve <= 0) {
        u.launchTimer = u.type.squadron.respawn;
        continue;
      }
      u.launchTimer -= dt;
      if (u.launchTimer <= 0) {
        u.launchTimer = u.type.squadron.respawn;
        u.reserve--;
        this.launch(u, 1);
        this.effects.push({ kind: 'heal', x: u.x, y: u.y, t: 0, life: 0.6 });
      }
    }
  };

  Battle.prototype.aliveUnits = function (team) {
    let n = 0;
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i].alive && this.units[i].team === team) n++;
    }
    return n;
  };

  Battle.prototype.remainingValue = function (team) {
    let v = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.alive && u.team === team) v += u.type.cost * (u.hp / u.maxHp);
    }
    return v;
  };

  /* --------------------------- main step -------------------------- */

  Battle.prototype.step = function () {
    if (this.over) return;
    const dt = DT;
    this.time += dt;

    this.hash.clear();
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i].alive) this.hash.insert(this.units[i]);
    }

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.alive) continue;
      this.think(u, dt);
      this.move(u, dt);
      this.fight(u, dt);
      if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt * 4);
      if (u.flash > 0) u.flash = Math.max(0, u.flash - dt * 12);
      if (u.damageFlash > 0) u.damageFlash = Math.max(0, u.damageFlash - dt * 5);
      u.rotor += dt * 34;
    }

    /* After the unit loop: launching appends to this.units. */
    this.serviceSquadrons(dt);
    this.servicePathQueue();
    this.stepProjectiles(dt);
    this.stepEffects(dt);
    this.checkVictory();
  };

  /* ------------------------- target selection --------------------- */

  /* Submarines are invisible unless the looker has sonar, or is right on top of them. */
  Battle.prototype.canSee = function (looker, other) {
    if (!other.type.stealth) return true;
    const d2 = U.dist2(looker.x, looker.y, other.x, other.y);
    const r = looker.type.asw ? ASW_DETECT : PASSIVE_DETECT;
    return d2 < r * r;
  };

  /* Unit tags drive weapon target preference in editions that have only one
   * domain to sort by (see js/units.js). */
  function hasTag(u, tag) {
    const t = u.type.tags;
    return !!t && t.indexOf(tag) >= 0;
  }

  /* Can this individual mount engage this unit at all? The domain mask and the
   * tag restriction are the same question asked two ways, and every place that
   * used to test `targets` alone has to ask both. */
  function mountCanHit(d, e) {
    if (!(d.targets & e.domain)) return false;
    return !d.onlyTag || hasTag(e, d.onlyTag);
  }

  Battle.prototype.canEngage = function (u, e) {
    if (!e.alive || e.team === u.team) return false;
    if (!(u.type.targetMask & e.domain)) return false;
    return this.canSee(u, e);
  };

  Battle.prototype.think = function (u, dt) {
    u.thinkIn -= dt;
    if (u.target && (!u.target.alive || !this.canEngage(u, u.target))) {
      u.target = null;
      /* Re-acquire promptly, but never in the same tick the target was lost —
       * otherwise every idle unit runs a full scan 60 times a second. */
      if (u.thinkIn > 0.15) u.thinkIn = 0.05 + this.rand() * 0.1;
    }
    if (u.thinkIn > 0) return;
    u.thinkIn = 0.3 + this.rand() * 0.25;

    const searchR = Math.max(420, u.type.maxRange * 1.7);
    const near = this.hash.query(u.x, u.y, searchR, this.scratch);

    /* Tag interest is ranked ahead of distance, not folded into it. A torpedo
     * bomber whose payload will not arm against a starfighter has to fly past
     * the screen and go for the warship, however much closer the screen is —
     * weighting the score instead just meant it chased the nearest TIE around
     * the map with a full rack. A unit whose mounts express no tag interest, or
     * one where every enemy satisfies some mount, sees no tiers and falls
     * through to plain nearest-first, which is every other edition. */
    let best = null, bestScore = Infinity, bestPref = -1;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!this.canEngage(u, e)) continue;
      let score = U.dist(u.x, u.y, e.x, e.y);
      let pref = 0;
      for (let k = 0; k < u.weapons.length; k++) {
        const wd = u.weapons[k].def;
        /* Dedicated AA prioritises aircraft even when something closer is on
         * the ground. */
        if (wd.prefers && (wd.prefers & e.domain)) { score *= 0.5; break; }
        const tag = wd.prefersTag || wd.onlyTag;
        if (tag && hasTag(e, tag)) { pref = 1; break; }
      }
      if (pref > bestPref || (pref === bestPref && score < bestScore)) {
        bestPref = pref; bestScore = score; best = e;
      }
    }

    /* Nothing nearby: pick the closest enemy anywhere so the army keeps advancing. */
    if (!best) {
      bestScore = Infinity;
      for (let i = 0; i < this.units.length; i++) {
        const e = this.units[i];
        if (!this.canEngage(u, e)) continue;
        const d = U.dist2(u.x, u.y, e.x, e.y);
        if (d < bestScore) { bestScore = d; best = e; }
      }
    }

    /* Support units look for the most damaged friend instead. */
    if (u.weapons.length && u.weapons[0].def.kind === 'repair') {
      best = this.findRepairTarget(u);
    }

    /* Nothing on the map this unit can engage at all (a SAM battery with no enemy
     * aircraft left). Back off hard so it stops scanning every frame. */
    if (!best) u.thinkIn = 1.0 + this.rand() * 0.5;

    u.target = best;
    this.assignWeaponTargets(u);
  };

  /* Gives each weapon its own target when the unit's primary is something that
   * weapon cannot engage — or simply should not waste its rounds on. Sharing one
   * target across every mount meant a warship locked onto the nearest aircraft
   * and left its main battery — which cannot shoot at aircraft — silent for the
   * whole battle. The same split is what lets a capital ship put its point
   * defence on the fighters clawing at it while the heavy guns stay on the enemy
   * line of battle. */
  Battle.prototype.assignWeaponTargets = function (u) {
    for (let i = 0; i < u.weapons.length; i++) {
      const w = u.weapons[i];
      const d = w.def;
      if (d.kind === 'repair') { w.target = u.target; continue; }

      const wants = d.prefersTag;
      if (u.target && mountCanHit(d, u.target) &&
        (!wants || hasTag(u.target, wants))) { w.target = u.target; continue; }

      const near = this.hash.query(u.x, u.y, d.range * 1.3, this.scratch);
      /* Ranked on preference first, distance second. With no preference set this
       * is exactly "nearest legal target", which is what every other edition
       * relies on — including the replay links already out there. */
      let best = null, bestD = Infinity, bestPref = -1;
      for (let k = 0; k < near.length; k++) {
        const e = near[k];
        if (!e.alive || e.team === u.team) continue;
        if (!mountCanHit(d, e)) continue;
        if (!this.canSee(u, e)) continue;
        const pref = (!wants || hasTag(e, wants)) ? 1 : 0;
        const dd = U.dist2(u.x, u.y, e.x, e.y);
        if (pref > bestPref || (pref === bestPref && dd < bestD)) {
          bestPref = pref; bestD = dd; best = e;
        }
      }
      /* Preferred prey out of reach: fall back to the primary rather than sit
       * silent — a point-defence battery with no fighters left still shoots. */
      if (!best && wants && u.target && mountCanHit(d, u.target)) best = u.target;
      w.target = best;
    }
  };

  Battle.prototype.findRepairTarget = function (u) {
    const near = this.hash.query(u.x, u.y, 420, this.scratch);
    let best = null, bestScore = 0;
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (!a.alive || a.team !== u.team || a === u) continue;
      if (a.hp >= a.maxHp) continue;
      if (a.domain === AIR) continue;
      const missing = (a.maxHp - a.hp) / Math.max(1, U.dist(u.x, u.y, a.x, a.y));
      if (missing > bestScore) { bestScore = missing; best = a; }
    }
    return best;
  };

  /* ---------------------------- movement -------------------------- */

  Battle.prototype.servicePathQueue = function () {
    /* Bounded work per tick: A* is the only expensive thing in here. */
    let budget = 5;
    while (this.pathQueue.length && budget-- > 0) {
      const u = this.pathQueue.shift();
      if (!u.alive || !u.pendingGoal) continue;
      const goal = u.pendingGoal;
      u.pendingGoal = null;
      const path = this.terrain.findPath(u.domain, u.x, u.y, goal.x, goal.y, 4000);
      if (path) {
        u.path = path;
        u.pathStep = 0;
        u.pathGoalX = goal.x; u.pathGoalY = goal.y;
      } else {
        u.path = null;
      }
    }
  };

  Battle.prototype.requestPath = function (u, gx, gy) {
    u.pendingGoal = { x: gx, y: gy };
    if (this.pathQueue.indexOf(u) === -1) this.pathQueue.push(u);
  };

  Battle.prototype.move = function (u, dt) {
    const t = u.type;
    if (t.move === 'static') {
      this.aimTurret(u, dt);
      return;
    }

    const tgt = u.target;
    const so = u.standoff();

    /* Where do we want to be? */
    let gx, gy, wantMove = true;
    if (tgt) {
      const d = U.dist(u.x, u.y, tgt.x, tgt.y);
      if (d > so.want) {
        gx = tgt.x; gy = tgt.y;
      } else if (so.min > 0 && d < so.min) {
        /* Inside minimum range — back away from the target. */
        const a = M.atan2(u.y - tgt.y, u.x - tgt.x);
        gx = u.x + M.cos(a) * 120; gy = u.y + M.sin(a) * 120;
      } else {
        wantMove = false;
        gx = u.x; gy = u.y;
      }
    } else {
      /* No reachable enemy: drift toward the enemy side so stalemates resolve. */
      gx = u.team === 0 ? this.terrain.width * 0.75 : this.terrain.width * 0.25;
      gy = u.y;
    }

    if (t.move === 'fixedwing') { this.moveFixedWing(u, dt, tgt); return; }
    if (t.move === 'hover') { this.moveHover(u, dt, gx, gy, wantMove); return; }
    this.moveGround(u, dt, gx, gy, wantMove);
  };

  /* Tanks, trucks and ships: follow an A* path, rotate the hull, slide off obstacles. */
  Battle.prototype.moveGround = function (u, dt, gx, gy, wantMove) {
    const terrain = this.terrain;

    u.pathIn -= dt;
    const goalMoved = U.dist2(gx, gy, u.pathGoalX, u.pathGoalY) > 130 * 130;
    if (wantMove && (u.pathIn <= 0 || !u.path || goalMoved)) {
      u.pathIn = 0.9 + this.rand() * 0.6;
      if (terrain.lineClear(u.domain, u.x, u.y, gx, gy)) {
        u.path = [{ x: gx, y: gy }];
        u.pathStep = 0;
        u.pathGoalX = gx; u.pathGoalY = gy;
      } else if (terrain.reachable(u.domain, u.x, u.y, gx, gy)) {
        this.requestPath(u, gx, gy);
      } else {
        /* Stranded on the wrong landmass. Steer straight at the target and let
         * the wall-slide hug the shoreline — it gets as close as geometry allows
         * without ever running a search that cannot succeed. */
        u.path = [{ x: gx, y: gy }];
        u.pathStep = 0;
        u.pathGoalX = gx; u.pathGoalY = gy;
        u.pathIn = 2.5;
      }
    }

    let wpX = gx, wpY = gy;
    if (u.path && u.pathStep < u.path.length) {
      const wp = u.path[u.pathStep];
      if (U.dist2(u.x, u.y, wp.x, wp.y) < 26 * 26) {
        u.pathStep++;
      }
      const cur = u.path[Math.min(u.pathStep, u.path.length - 1)];
      wpX = cur.x; wpY = cur.y;
    }

    const desiredHdg = M.atan2(wpY - u.y, wpX - u.x);
    const turn = u.type.turnRate * dt;
    u.hdg = U.turnToward(u.hdg, desiredHdg, turn);

    /* Only accelerate once roughly pointed the right way — reads as tracked movement. */
    const facing = Math.abs(U.angleDiff(u.hdg, desiredHdg));
    const throttle = wantMove ? U.clamp(1 - facing / 1.4, 0.05, 1) : 0;
    const surface = terrain.speedAt(u.domain, u.x, u.y);
    const targetSpeed = u.type.speed * throttle * surface;

    u.speed = U.lerp(u.speed, targetSpeed, U.clamp(dt * 3.2, 0, 1));

    let nx = u.x + M.cos(u.hdg) * u.speed * dt;
    let ny = u.y + M.sin(u.hdg) * u.speed * dt;

    const sep = this.separation(u, dt);
    nx += sep.x; ny += sep.y;

    if (terrain.passable(u.domain, nx, ny)) {
      u.x = nx; u.y = ny;
      u.stuck = Math.max(0, u.stuck - dt);
    } else {
      /* Wall-slide: try each axis alone before giving up. */
      if (terrain.passable(u.domain, nx, u.y)) u.x = nx;
      else if (terrain.passable(u.domain, u.x, ny)) u.y = ny;
      else u.speed *= 0.3;
      u.stuck += dt;
      if (u.stuck > 1.5) { u.path = null; u.pathIn = 0; u.stuck = 0; }
    }

    u.wake = u.speed / Math.max(1, u.type.speed);
    this.aimTurret(u, dt);
  };

  /* Helicopters and drones: free 2D movement, hold a standoff, ignore terrain. */
  Battle.prototype.moveHover = function (u, dt, gx, gy, wantMove) {
    const ax = gx - u.x, ay = gy - u.y;
    const d = Math.max(1, M.hypot(ax, ay));
    const accel = u.type.accel;

    if (wantMove) {
      u.vx += (ax / d) * accel * dt;
      u.vy += (ay / d) * accel * dt;
    }
    /* Constant drag gives a floaty, damped feel and caps top speed.
     * dt is always the fixed timestep here, so this is Math.pow(0.06, 1/60)
     * hard-coded — Math.pow is implementation-defined, and a literal keeps the
     * value identical in every engine. */
    const drag = DRAG_PER_TICK;
    u.vx *= drag; u.vy *= drag;

    const sp = M.hypot(u.vx, u.vy);
    if (sp > u.type.speed) { u.vx = u.vx / sp * u.type.speed; u.vy = u.vy / sp * u.type.speed; }

    const sep = this.separation(u, dt);
    u.x = U.clamp(u.x + u.vx * dt + sep.x, 8, this.terrain.width - 8);
    u.y = U.clamp(u.y + u.vy * dt + sep.y, 8, this.terrain.height - 8);
    u.speed = M.hypot(u.vx, u.vy);

    if (u.speed > 6) u.hdg = U.turnToward(u.hdg, M.atan2(u.vy, u.vx), u.type.turnRate * dt * 1.6);
    this.aimTurret(u, dt);
  };

  /* Jets and bombers: never stop, bank toward the target, overshoot and come back. */
  Battle.prototype.moveFixedWing = function (u, dt, tgt) {
    let aimX, aimY;
    if (tgt) {
      const d = U.dist(u.x, u.y, tgt.x, tgt.y);
      /* Fly the attack run out to the longest weapon that can engage this target,
       * so a missile-armed fighter opens fire on the way in rather than having to
       * reach gun range first. Against ground targets its air-to-air missiles do
       * not apply, so this naturally collapses to the cannon's range. */
      let attackRange = 0;
      for (let i = 0; i < u.type.weapons.length; i++) {
        const w = u.type.weapons[i];
        if (!mountCanHit(w, tgt)) continue;
        if (w.range > attackRange) attackRange = w.range;
      }
      if (!attackRange) attackRange = u.type.maxRange;
      if (d < attackRange * 0.5) {
        /* Break off and set up another pass. These aircraft fire nose-on, so a
         * standing orbit would keep them alive and silent — they have to point at
         * the target to shoot. Breaking to just outside weapon range keeps the
         * attack cycle short instead of flying halfway across the map. */
        if (!u.orbitDir) u.orbitDir = this.rand() < 0.5 ? -1 : 1;
        const away = M.atan2(u.y - tgt.y, u.x - tgt.x);
        const breakR = attackRange * 1.15;
        const ang = away + u.orbitDir * 0.75;
        aimX = tgt.x + M.cos(ang) * breakR;
        aimY = tgt.y + M.sin(ang) * breakR;
      } else {
        /* Run straight in so the guns bear. */
        aimX = tgt.x; aimY = tgt.y;
      }
    } else {
      aimX = u.team === 0 ? this.terrain.width * 0.8 : this.terrain.width * 0.2;
      aimY = this.terrain.height * 0.5;
    }

    /* Steer back inside the map before leaving it. */
    const m = 140;
    if (u.x < m) aimX = Math.max(aimX, m * 3);
    if (u.x > this.terrain.width - m) aimX = Math.min(aimX, this.terrain.width - m * 3);
    if (u.y < m) aimY = Math.max(aimY, m * 3);
    if (u.y > this.terrain.height - m) aimY = Math.min(aimY, this.terrain.height - m * 3);

    const want = M.atan2(aimY - u.y, aimX - u.x);
    u.hdg = U.turnToward(u.hdg, want, u.type.turnRate * dt);
    u.speed = U.lerp(u.speed, u.type.speed, dt * 1.5);
    u.x += M.cos(u.hdg) * u.speed * dt;
    u.y += M.sin(u.hdg) * u.speed * dt;
    u.turret = u.hdg;
  };

  /* Soft push-apart so formations spread instead of stacking into one pixel. */
  Battle.prototype.separation = function (u, dt) {
    const near = this.hash.query(u.x, u.y, u.radius * 3.2, this.scratch);
    let px = 0, py = 0;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === u || !o.alive) continue;
      /* Aircraft only avoid other aircraft; they fly over everything else. */
      if ((o.domain === AIR) !== (u.domain === AIR)) continue;
      const dx = u.x - o.x, dy = u.y - o.y;
      const minD = u.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > minD * minD || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / minD;
      px += (dx / d) * push;
      py += (dy / d) * push;
    }
    const k = 60 * dt;
    return { x: px * k, y: py * k };
  };

  Battle.prototype.aimTurret = function (u, dt) {
    if (!u.target) {
      u.turret = U.turnToward(u.turret, u.hdg, dt * 1.5);
      return;
    }
    const want = M.atan2(u.target.y - u.y, u.target.x - u.x);
    u.turret = U.turnToward(u.turret, want, dt * 3.4);
  };

  /* ---------------------------- shooting -------------------------- */

  Battle.prototype.fight = function (u, dt) {
    for (let i = 0; i < u.weapons.length; i++) {
      const w = u.weapons[i];
      const d = w.def;

      /* Continue an in-progress burst even if the target dies mid-salvo. */
      if (w.salvoLeft > 0) {
        w.salvoTimer -= dt;
        if (w.salvoTimer <= 0) {
          w.salvoTimer = d.salvoDelay;
          w.salvoLeft--;
          if (w.target && w.target.alive) this.fireOne(u, w, w.target);
          else w.salvoLeft = 0;
        }
        continue;
      }

      w.cd -= dt;
      if (w.cd > 0) continue;

      /* This mount's own target, which is the unit's primary whenever that mount
       * can engage it (see assignWeaponTargets). */
      const tgt = w.target;
      if (!tgt || !tgt.alive) continue;

      /* Melee lands on contact — no projectile to launch or track. Reach is
       * measured between bodies, so a big animal does not need to overlap a
       * small one to bite it. */
      if (d.kind === 'melee') {
        if (!mountCanHit(d, tgt)) continue;
        const reach = U.dist(u.x, u.y, tgt.x, tgt.y) - u.radius - tgt.radius;
        if (reach > d.range) continue;
        const want = M.atan2(tgt.y - u.y, tgt.x - u.x);
        /* Wide arc: an animal only has to be facing roughly the right way. */
        if (Math.abs(U.angleDiff(u.turret, want)) > 1.0) continue;
        w.cd = d.cd;
        this.damage(tgt, d.dmg, d.pen, u);
        if (d.splash > 0) this.splashDamage(d, tgt.x, tgt.y, u.team, tgt);
        u.recoil = 1;
        this.effects.push({
          kind: 'strike', x: (u.x + tgt.x) / 2, y: (u.y + tgt.y) / 2,
          a: want, t: 0, life: 0.18, size: 5 + d.dmg * 0.06
        });
        continue;
      }

      if (d.kind === 'repair') {
        if (U.dist(u.x, u.y, tgt.x, tgt.y) <= d.range && tgt.hp < tgt.maxHp) {
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + d.dmg);
          w.cd = d.cd;
          this.effects.push({ kind: 'heal', x: tgt.x, y: tgt.y, t: 0, life: 0.5 });
        }
        continue;
      }

      if (!mountCanHit(d, tgt)) continue;
      const dist = U.dist(u.x, u.y, tgt.x, tgt.y);
      if (dist > d.range || dist < d.minRange) continue;

      /* Direct-fire weapons need the turret roughly on target first. Guided
       * weapons get a much wider arc — they steer themselves, and a boresight
       * gate made air-launched missiles nearly unusable, since a fixed-wing
       * aircraft's "turret" is locked to its heading. */
      /* Only the mount the turret is actually slewing to is arc-limited. A mount
       * engaging its own secondary target (a ship's AA battery while the main gun
       * tracks a surface contact) is a separate mount and trains independently. */
      if (d.kind !== 'shell' && tgt === u.target) {
        const want = M.atan2(tgt.y - u.y, tgt.x - u.x);
        const arc = (d.kind === 'missile' || d.kind === 'torpedo') ? 1.3 : 0.3;
        if (Math.abs(U.angleDiff(u.turret, want)) > arc) continue;
      }

      w.cd = d.cd;
      if (d.salvo > 1) {
        w.salvoLeft = d.salvo - 1;
        w.salvoTimer = d.salvoDelay;
      }
      this.fireOne(u, w, tgt);
    }
  };

  Battle.prototype.fireOne = function (u, w, tgt) {
    const d = w.def;
    const muzzle = u.radius + 4;
    const sx = u.x + M.cos(u.turret) * muzzle;
    const sy = u.y + M.sin(u.turret) * muzzle;

    /* Lead the target based on flight time. */
    let aimX = tgt.x, aimY = tgt.y;
    if (d.lead && d.speed > 0) {
      const flight = U.dist(sx, sy, tgt.x, tgt.y) / (d.kind === 'shell' ? 420 : d.speed);
      const tv = velocityOf(tgt);
      aimX += tv.x * flight;
      aimY += tv.y * flight;
    }

    /* Scatter: rotate the aim point around the shooter by a random spread angle. */
    if (d.spread > 0) {
      const a = M.atan2(aimY - sy, aimX - sx) + (this.rand() * 2 - 1) * d.spread;
      const r = U.dist(sx, sy, aimX, aimY);
      aimX = sx + M.cos(a) * r;
      aimY = sy + M.sin(a) * r;
    }

    this.projectiles.push(new Projectile(u, d, sx, sy, tgt, aimX, aimY));

    u.recoil = 1;
    u.flash = 1;
    this.effects.push({ kind: 'muzzle', x: sx, y: sy, a: u.turret, t: 0, life: 0.09, size: 3 + d.tracerWidth * 2 });
  };

  function velocityOf(u) {
    if (u.type.move === 'hover') return { x: u.vx, y: u.vy };
    return { x: M.cos(u.hdg) * u.speed, y: M.sin(u.hdg) * u.speed };
  }

  /* -------------------------- projectiles ------------------------- */

  Battle.prototype.stepProjectiles = function (dt) {
    const list = this.projectiles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead) continue;
      p.life += dt;
      p.px = p.x; p.py = p.y;

      if (p.kind === 'shell' || p.kind === 'bomb') {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = U.lerp(p.sx, p.gx, k);
        p.y = U.lerp(p.sy, p.gy, k);
        /* Visual arc height only; impact is decided by the ground point. */
        p.h = M.sin(k * Math.PI) * p.arc;
        if (k >= 1) { this.detonate(p, p.gx, p.gy); p.dead = true; }
        continue;
      }

      if (p.kind === 'missile' || p.kind === 'torpedo') {
        if (p.target && p.target.alive) {
          const want = M.atan2(p.target.y - p.y, p.target.x - p.x);
          p.hdg = U.turnToward(p.hdg, want, p.def.turnRate * dt);
          p.vx = M.cos(p.hdg) * p.def.speed;
          p.vy = M.sin(p.hdg) * p.def.speed;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.life > p.maxLife || p.x < -60 || p.y < -60 || p.x > this.terrain.width + 60 || p.y > this.terrain.height + 60) {
        p.dead = true;
        continue;
      }

      /* Torpedoes run out of water on contact with land. */
      if (p.kind === 'torpedo' && !this.terrain.passable(SEA, p.x, p.y)) {
        this.detonate(p, p.x, p.y);
        p.dead = true;
        continue;
      }

      this.checkHit(p);
    }

    /* Compact the array occasionally rather than splicing during iteration. */
    let w = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
    list.length = w;
  };

  Battle.prototype.checkHit = function (p) {
    const d = p.def;
    const near = this.hash.query(p.x, p.y, 60, this.scratch);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive || e.team === p.team) continue;
      /* A round flies straight through anything it is not fused for, so a
       * fighter screen cannot body-block a torpedo meant for the capital ship
       * behind it. */
      if (!mountCanHit(d, e)) continue;
      /* Swept test so fast projectiles cannot tunnel through a small unit. */
      if (!segmentHitsCircle(p.px, p.py, p.x, p.y, e.x, e.y, e.radius + 2)) continue;
      this.detonate(p, p.x, p.y, e);
      p.dead = true;
      return;
    }
  };

  function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
    t = U.clamp(t, 0, 1);
    const px = x0 + dx * t, py = y0 + dy * t;
    return U.dist2(px, py, cx, cy) <= r * r;
  }

  Battle.prototype.detonate = function (p, x, y, directHit) {
    const d = p.def;

    if (directHit) this.damage(directHit, d.dmg, d.pen, p.owner);

    if (d.splash > 0) this.splashDamage(d, x, y, p.team, directHit, p.owner);

    /* Capped: the fireball is scaled off raw damage, and a superlaser's four
     * figures of it would otherwise bloom across a third of the map. Every
     * conventional weapon in the game lands well under this. */
    const big = Math.min(200, Math.max(8, d.splash * 0.8 + d.dmg * 0.05));
    this.effects.push({ kind: 'boom', x: x, y: y, t: 0, life: 0.25 + big * 0.004, size: big });
    /* Craters are permanent, so only scar ground that can actually hold one.
     * Shells landing in the sea used to stack into a black hole on the water. */
    if (d.splash > 30 && this.scars && this.decals.length < 260 && this.terrain.passable(LAND, x, y)) {
      this.decals.push({ x: x, y: y, r: d.splash * 0.55, kind: 'crater' });
    }
  };

  /* Area damage around a point, shared by explosions and heavy melee swings. */
  Battle.prototype.splashDamage = function (d, x, y, team, skip, source) {
    const near = this.hash.query(x, y, d.splash + 40, this.splashScratch);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive || e === skip) continue;
      /* Splash is enemy-only: friendly fire would make artillery unusable. */
      if (e.team === team && !d.friendlyFire) continue;
      if (!(d.targets & e.domain)) continue;
      const dist = U.dist(x, y, e.x, e.y) - e.radius;
      if (dist > d.splash) continue;
      const falloff = 1 - U.clamp(dist / d.splash, 0, 1);
      this.damage(e, d.dmg * falloff * 0.85, d.pen, source);
    }
  };

  Battle.prototype.damage = function (u, dmg, pen, source) {
    if (!u.alive) return;
    /* Penetration vs armour: never fully immune, but heavy armour trivialises light guns. */
    const mult = Math.max(0.06, pen / (pen + u.type.armor));
    u.hp -= dmg * mult;
    u.damageFlash = 1;
    if (u.hp <= 0) this.kill(u);
  };

  /* Removes a unit from the battle. Editions choose what that looks like: Earth
   * blows it up and leaves a wreck, Animals has it turn tail and bolt. Either way
   * it stops fighting and its value counts as lost. */
  Battle.prototype.kill = function (u) {
    u.alive = false;
    u.hp = 0;
    this.lostValue[u.team] += u.type.cost;

    if (this.defeat === 'flee') {
      /* Away from whatever beat it, and off toward its own side of the field. */
      const homeward = u.team === 0 ? Math.PI : 0;
      const away = u.target ? M.atan2(u.y - u.target.y, u.x - u.target.x) : homeward;
      this.effects.push({
        kind: 'flee', x: u.x, y: u.y, a: away, hdg: u.hdg,
        type: u.type, team: u.team, t: 0, life: 1.6
      });
      return;
    }

    const size = 12 + u.radius * 1.4;
    this.effects.push({ kind: 'boom', x: u.x, y: u.y, t: 0, life: 0.5, size: size });
    this.effects.push({ kind: 'smoke', x: u.x, y: u.y, t: 0, life: 2.2, size: size });
    if (this.decals.length < 300) {
      /* Decided by what is under the unit, so aircraft downed over the sea leave
       * foam rather than a burnt-out hull floating on the water. */
      const onLand = this.terrain.passable(LAND, u.x, u.y);
      this.decals.push({ x: u.x, y: u.y, r: u.radius, kind: onLand ? 'wreck' : 'foam', a: u.hdg, team: u.team, shape: u.type.shape });
    }
  };

  Battle.prototype.stepEffects = function (dt) {
    const list = this.effects;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.t += dt;
      if (e.t < e.life) list[w++] = e;
    }
    list.length = w;
  };

  /* --------------------------- victory ---------------------------- */

  Battle.prototype.checkVictory = function () {
    const a = this.aliveUnits(0), b = this.aliveUnits(1);
    if (a === 0 || b === 0) {
      this.over = true;
      this.winner = a === 0 && b === 0 ? -1 : (a === 0 ? 1 : 0);
      this.reason = this.winner === -1 ? 'Mutual annihilation'
        : (this.words.wipeout || 'Enemy army destroyed');
      return;
    }
    if (this.time >= MAX_BATTLE_TIME) {
      const va = this.remainingValue(0), vb = this.remainingValue(1);
      this.over = true;
      this.winner = Math.abs(va - vb) < 1 ? -1 : (va > vb ? 0 : 1);
      this.reason = 'Time limit — decided on surviving army value';
    }
  };

  Battle.DT = DT;
  Battle.MAX_TIME = MAX_BATTLE_TIME;
  W.Battle = Battle;
  W.SimUnit = Unit;
})(window);
