/* Unit definition machinery and the active catalogue.
 *
 * The rosters themselves live in js/roster-*.js, one per edition, and js/editions.js
 * decides which one is loaded. Everything downstream reads Units.TYPES and
 * Units.ORDER, so swapping editions swaps the whole army list without any other
 * module knowing an edition exists.
 *
 * Damage model
 * ------------
 * A hit applies  dmg * pen / (pen + armor)  (floored at 6% of dmg), so a weapon's
 * `pen` is what decides whether it can meaningfully hurt heavy armour, while `dmg`
 * decides how hard it hits once it gets through. That relationship is what makes
 * army composition matter, and it is shared by every edition.
 *
 * Targeting masks
 * ---------------
 * Weapons declare which domains they can engage. A weapon that omits AIR simply
 * cannot shoot back at aircraft, which is why unescorted ground forces lose to
 * air power.
 *
 * Target preference
 * -----------------
 * `prefers` biases a mount toward a domain; `prefersTag` biases it toward units
 * carrying a given entry in their `tags`. The tag route exists for editions with
 * a single domain — Space has no land/air/sea split, so a Star Destroyer's point
 * defence tells starfighters from capital ships by tag rather than by domain.
 * Both are priorities rather than restrictions.
 *
 * `onlyTag` *is* a restriction, and it is the tag-space equivalent of `targets`:
 * a mount that declares one will not engage anything without that tag. It is
 * what stops a proton torpedo — fused for a capital hull, and reloading for
 * eight seconds — from being spent on a passing starfighter.
 */
(function (W) {
  'use strict';

  /* Domain bit flags. A unit has exactly one; a weapon targets any combination. */
  const LAND = 1, SEA = 2, AIR = 4;
  const GROUND = LAND | SEA, ALL = LAND | SEA | AIR;

  const DOMAIN = { LAND: LAND, SEA: SEA, AIR: AIR, GROUND: GROUND, ALL: ALL };

  /* Weapon defaults, so each definition only lists what makes it interesting. */
  function weapon(def) {
    return Object.assign({
      name: 'Gun',
      kind: 'tracer',     // tracer | shell | missile | bomb | torpedo | melee | repair
      dmg: 10,
      pen: 10,
      range: 200,
      minRange: 0,
      cd: 1,              // seconds between bursts
      spread: 0.02,       // aiming error in radians
      splash: 0,          // area-of-effect radius in world units
      speed: 900,         // projectile speed; shells/bombs use arc timing instead
      salvo: 1,           // shots per burst
      salvoDelay: 0.08,   // seconds between shots inside a burst
      targets: GROUND,
      prefersTag: null,   // unit tag this mount hunts first, e.g. 'fighter'
      onlyTag: null,      // unit tag this mount can engage *at all*
      lead: true,         // aim at where the target will be
      turnRate: 3.2,      // homing weapons only
      color: '#ffd98a',
      tracerWidth: 1.6
    }, def);
  }

  function unit(def) {
    const u = Object.assign({
      domain: LAND,
      armor: 10,
      speed: 40,
      turnRate: 2.0,      // radians/sec of hull rotation
      radius: 12,
      accel: 120,
      move: 'ground',     // ground | naval | hover | fixedwing | static
      weapons: [],
      asw: false,         // can detect and attack submerged units
      stealth: false,
      shape: 'tank',
      hidden: false,      // true = carried by another unit, never sold in the roster
      squadron: null,     // { type, count, respawn, reserve } — units this one launches
      tags: []
    }, def);
    u.weapons = u.weapons.map(weapon);
    /* Cached for targeting / standoff decisions. */
    u.maxRange = u.weapons.reduce(function (m, w) { return Math.max(m, w.range); }, 0);
    u.targetMask = u.weapons.reduce(function (m, w) { return m | w.targets; }, 0);
    return u;
  }

  /* The active catalogue.
   *
   * Both are mutated in place rather than reassigned: other modules capture these
   * references when they load, so replacing the objects would leave them pointing
   * at the previous edition's roster. */
  const TYPES = {};
  const ORDER = { land: [], air: [], sea: [] };

  function setCatalogue(defs) {
    Object.keys(TYPES).forEach(function (k) { delete TYPES[k]; });
    ORDER.land.length = 0; ORDER.air.length = 0; ORDER.sea.length = 0;

    Object.keys(defs).forEach(function (id) {
      const t = defs[id];
      t.id = id;
      t.bucket = t.domain === AIR ? 'air' : t.domain === SEA ? 'sea' : 'land';
      TYPES[id] = t;
      /* Hidden units still exist and fight, they just cannot be bought. */
      if (!t.hidden) ORDER[t.bucket].push(id);
    });

    /* Cheapest first reads best in a shop list. */
    Object.keys(ORDER).forEach(function (k) {
      ORDER[k].sort(function (a, b) { return TYPES[a].cost - TYPES[b].cost; });
    });
  }

  /* Which domain tabs have anything in them, for the roster UI. */
  function activeBuckets(faction) {
    return ['land', 'air', 'sea'].filter(function (b) {
      return ORDER[b].some(function (id) {
        const f = TYPES[id].faction;
        return f == null || faction == null || f === faction;
      });
    });
  }

  W.Units = {
    TYPES: TYPES, ORDER: ORDER, DOMAIN: DOMAIN,
    LAND: LAND, SEA: SEA, AIR: AIR, GROUND: GROUND, ALL: ALL,
    weapon: weapon, unit: unit, setCatalogue: setCatalogue, activeBuckets: activeBuckets
  };
})(window);
