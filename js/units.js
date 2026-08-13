/* Unit catalogue: every vehicle's stats, weapons, cost and drawing style.
 *
 * Damage model
 * ------------
 * A hit applies  dmg * pen / (pen + armor)  (floored at 6% of dmg), so a weapon's
 * `pen` is what decides whether it can meaningfully hurt heavy armour, while `dmg`
 * decides how hard it hits once it gets through. Cheap machine guns shred infantry
 * and aircraft but bounce off a Heavy Tank; a Bazooka barely scratches a swarm but
 * kills tanks. That relationship is what makes composition matter.
 *
 * Targeting masks
 * ---------------
 * Weapons declare which domains they can engage. A weapon that omits AIR simply
 * cannot shoot back at aircraft, which is why pure armour columns lose to air power.
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
      kind: 'tracer',     // tracer | shell | missile | bomb | torpedo | repair
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
      asw: false,         // can detect and attack submerged submarines
      stealth: false,
      shape: 'tank',
      tags: []
    }, def);
    u.weapons = u.weapons.map(weapon);
    /* Cached for targeting / standoff decisions. */
    u.maxRange = u.weapons.reduce(function (m, w) { return Math.max(m, w.range); }, 0);
    u.targetMask = u.weapons.reduce(function (m, w) { return m | w.targets; }, 0);
    return u;
  }

  const TYPES = {

    /* ==================== LAND ==================== */

    rifles: unit({
      name: 'Rifle Squad', domain: LAND, cost: 30, hp: 170, armor: 3,
      speed: 48, radius: 9, shape: 'infantry', turnRate: 6,
      role: 'Line infantry',
      desc: 'Dirt-cheap bodies that close ground fast. Poor against armour, but numbers soak damage and overwhelm exposed artillery.',
      weapons: [{ name: 'Rifles', dmg: 8, pen: 8, range: 165, cd: 0.5, salvo: 3, salvoDelay: 0.07, spread: 0.09, targets: GROUND, color: '#ffe9b0', tracerWidth: 1 }]
    }),

    mgteam: unit({
      name: 'MG Team', domain: LAND, cost: 65, hp: 150, armor: 3,
      speed: 36, radius: 9, shape: 'infantry', turnRate: 5,
      role: 'Suppression',
      desc: 'Sustained fire that mulches infantry and light aircraft. Slow to reposition and helpless against tanks.',
      weapons: [{ name: 'Heavy MG', dmg: 7, pen: 9, range: 205, cd: 0.12, spread: 0.07, targets: ALL, color: '#fff0c0', tracerWidth: 1.2 }]
    }),

    atteam: unit({
      name: 'AT Team', domain: LAND, cost: 80, hp: 150, armor: 3,
      speed: 44, radius: 9, shape: 'infantry', turnRate: 5,
      role: 'Anti-armour infantry',
      desc: 'Rocket launchers that punch far above their price against tanks. Fragile, and still outranged by a real gun.',
      weapons: [{ name: 'Rocket Launcher', kind: 'missile', dmg: 140, pen: 75, range: 310, cd: 3.0, speed: 300, splash: 18, turnRate: 1.6, targets: GROUND, color: '#ffb066' }]
    }),

    mortar: unit({
      name: 'Mortar Team', domain: LAND, cost: 110, hp: 85, armor: 3,
      speed: 20, radius: 9, shape: 'artillery', turnRate: 4,
      role: 'Light indirect fire',
      desc: 'Cheap arcing splash that lands on infantry clumps. Cannot fire at anything close, cannot touch aircraft.',
      weapons: [{ name: '81mm Mortar', kind: 'shell', dmg: 75, pen: 22, range: 470, minRange: 130, cd: 3.4, splash: 58, spread: 0.05, targets: GROUND, color: '#ffcf8a' }]
    }),

    jeep: unit({
      name: 'Scout Jeep', domain: LAND, cost: 70, hp: 170, armor: 8,
      speed: 108, radius: 10, shape: 'wheeled', turnRate: 3.4, accel: 200,
      role: 'Fast harasser',
      desc: 'Outruns everything on land. Built to swarm artillery and unescorted support units before they can react.',
      weapons: [{ name: 'Pintle MG', dmg: 6, pen: 8, range: 185, cd: 0.15, spread: 0.08, targets: ALL, color: '#fff0c0', tracerWidth: 1.1 }]
    }),

    apc: unit({
      name: 'APC', domain: LAND, cost: 130, hp: 440, armor: 18,
      speed: 64, radius: 12, shape: 'wheeled', turnRate: 2.6, accel: 150,
      role: 'Armoured escort',
      desc: 'Tough enough to lead an advance and armed well enough to keep infantry and drones off your expensive units.',
      weapons: [{ name: 'Autocannon', dmg: 11, pen: 15, range: 235, cd: 0.18, spread: 0.05, targets: ALL, color: '#ffe08a', tracerWidth: 1.4 }]
    }),

    lighttank: unit({
      name: 'Light Tank', domain: LAND, cost: 175, hp: 540, armor: 26,
      speed: 58, radius: 13, shape: 'tank', turnRate: 2.2,
      role: 'Manoeuvre armour',
      desc: 'The efficient midpoint: fast enough to flank, armed well enough to threaten anything short of heavy armour.',
      weapons: [{ name: '45mm Gun', dmg: 75, pen: 52, range: 330, cd: 1.6, spread: 0.02, targets: GROUND, color: '#ffd27a', tracerWidth: 2 }]
    }),

    medtank: unit({
      name: 'Medium Tank', domain: LAND, cost: 300, hp: 900, armor: 38,
      speed: 46, radius: 14, shape: 'tank', turnRate: 1.8,
      role: 'Main battle line',
      desc: 'The backbone of any land army. Nothing it fights on the ground is comfortable, but the sky is not its problem.',
      weapons: [{ name: '75mm Gun', dmg: 125, pen: 78, range: 370, cd: 2.0, splash: 12, spread: 0.018, targets: GROUND, color: '#ffc86a', tracerWidth: 2.4 }]
    }),

    heavytank: unit({
      name: 'Heavy Tank', domain: LAND, cost: 520, hp: 1750, armor: 58,
      speed: 32, radius: 16, shape: 'tank', turnRate: 1.3,
      role: 'Breakthrough armour',
      desc: 'Small-arms fire simply bounces. Slow, expensive, and utterly dependent on friends to watch the sky.',
      weapons: [{ name: '120mm Gun', dmg: 220, pen: 115, range: 410, cd: 2.8, splash: 18, spread: 0.015, targets: GROUND, color: '#ffbf5a', tracerWidth: 3 }]
    }),

    flaktank: unit({
      name: 'Flak Tank', domain: LAND, cost: 250, hp: 400, armor: 20,
      speed: 60, radius: 12, shape: 'tank', turnRate: 2.4,
      role: 'Mobile anti-air',
      desc: 'A wall of light shells that deletes helicopters and shreds infantry. Its rounds do nothing against real armour.',
      weapons: [{ name: 'Quad Flak', dmg: 18, pen: 26, range: 350, cd: 0.1, spread: 0.045, targets: ALL, prefers: AIR, color: '#ffe27a', tracerWidth: 1.5 }]
    }),

    sam: unit({
      name: 'SAM Launcher', domain: LAND, cost: 330, hp: 320, armor: 14,
      speed: 52, radius: 12, shape: 'wheeled', turnRate: 2.0,
      role: 'Area air denial',
      desc: 'Reaches most of the map and one-shots anything with wings. Completely defenceless if ground units reach it.',
      weapons: [{ name: 'SAM', kind: 'missile', dmg: 240, pen: 120, range: 780, cd: 3.8, speed: 430, turnRate: 3.4, splash: 20, targets: AIR, color: '#9fe8ff' }]
    }),

    spg: unit({
      name: 'Artillery', domain: LAND, cost: 420, hp: 420, armor: 12,
      speed: 34, radius: 14, shape: 'artillery', turnRate: 1.4,
      role: 'Long-range bombardment',
      desc: 'Outranges every land weapon in the game and lands enormous splash. Paper-thin and blind inside its minimum range.',
      weapons: [{ name: '155mm Howitzer', kind: 'shell', dmg: 190, pen: 48, range: 960, minRange: 270, cd: 5.8, splash: 88, spread: 0.035, targets: GROUND, color: '#ffb45a' }]
    }),

    mlrs: unit({
      name: 'Rocket Truck', domain: LAND, cost: 380, hp: 330, armor: 10,
      speed: 62, radius: 13, shape: 'wheeled', turnRate: 2.2,
      role: 'Saturation fire',
      desc: 'Empties a full salvo across a wide area, then sits reloading for nine seconds. Devastating against packed formations.',
      weapons: [{ name: 'Rocket Pod', kind: 'shell', dmg: 95, pen: 42, range: 800, minRange: 190, cd: 9.0, salvo: 8, salvoDelay: 0.17, splash: 62, spread: 0.075, targets: GROUND, color: '#ff9a5a' }]
    }),

    repair: unit({
      name: 'Repair Truck', domain: LAND, cost: 180, hp: 280, armor: 10,
      speed: 72, radius: 11, shape: 'wheeled', turnRate: 2.8,
      role: 'Field support',
      desc: 'Continuously patches the nearest damaged ally. Pays for itself behind a line of heavy armour and nowhere else.',
      weapons: [{ name: 'Repair Arm', kind: 'repair', dmg: 30, range: 135, cd: 1.0, targets: 0, color: '#8effc0' }]
    }),

    pillbox: unit({
      name: 'Pillbox', domain: LAND, cost: 90, hp: 800, armor: 42,
      speed: 0, radius: 12, shape: 'static', move: 'static', turnRate: 3,
      role: 'Static defence',
      desc: 'Cannot move, ever. In exchange it is absurdly durable for the price and holds a chokepoint against infantry.',
      weapons: [{ name: 'Emplaced MG', dmg: 9, pen: 11, range: 245, cd: 0.13, spread: 0.05, targets: ALL, color: '#fff0c0', tracerWidth: 1.2 }]
    }),

    coastalgun: unit({
      name: 'Coastal Gun', domain: LAND, cost: 260, hp: 950, armor: 46,
      speed: 0, radius: 14, shape: 'static', move: 'static', turnRate: 1.2,
      role: 'Static naval defence',
      desc: 'A dug-in battery that punishes anything sailing into range. Immobile, so it only earns its cost on the right map.',
      weapons: [{ name: 'Casemate Gun', dmg: 280, pen: 100, range: 720, cd: 4.8, splash: 32, spread: 0.02, targets: GROUND, color: '#ffc06a', tracerWidth: 2.6 }]
    }),

    /* ==================== AIR ==================== */

    drone: unit({
      name: 'Scout Drone', domain: AIR, cost: 80, hp: 90, armor: 4,
      speed: 155, radius: 9, shape: 'drone', move: 'hover', turnRate: 4.0, accel: 240,
      role: 'Cheap air harasser',
      desc: 'Ignores terrain entirely and pecks at anything without anti-air. Dies instantly to a single flak burst.',
      weapons: [{ name: 'Light Gun', dmg: 9, pen: 12, range: 210, cd: 0.2, spread: 0.05, targets: ALL, color: '#ffe9b0', tracerWidth: 1.1 }]
    }),

    gunship: unit({
      name: 'Gunship Heli', domain: AIR, cost: 270, hp: 440, armor: 12,
      speed: 108, radius: 13, shape: 'heli', move: 'hover', turnRate: 2.6, accel: 170,
      role: 'Close air support',
      desc: 'A hovering chaingun that crosses water and rough ground as if it were not there. Melts infantry and light vehicles.',
      weapons: [{ name: 'Chaingun', dmg: 13, pen: 21, range: 290, cd: 0.09, spread: 0.05, targets: ALL, color: '#ffe08a', tracerWidth: 1.4 }]
    }),

    attackheli: unit({
      name: 'Attack Helicopter', domain: AIR, cost: 400, hp: 500, armor: 15,
      speed: 96, radius: 14, shape: 'heli', move: 'hover', turnRate: 2.2, accel: 150, asw: true,
      role: 'Airborne tank killer',
      desc: 'Salvos of anti-tank rockets from outside return fire, plus a missile for self-defence. The answer to heavy armour.',
      weapons: [
        { name: 'AT Rockets', kind: 'missile', dmg: 115, pen: 88, range: 395, cd: 3.0, salvo: 4, salvoDelay: 0.12, speed: 380, splash: 24, turnRate: 2.4, targets: GROUND, color: '#ffa860' },
        { name: 'Air-to-Air', kind: 'missile', dmg: 95, pen: 62, range: 320, cd: 4.0, speed: 400, turnRate: 3.0, targets: AIR, color: '#9fe8ff' }
      ]
    }),

    fighter: unit({
      name: 'Fighter Jet', domain: AIR, cost: 430, hp: 310, armor: 10,
      speed: 275, radius: 13, shape: 'jet', move: 'fixedwing', turnRate: 1.5, accel: 300,
      role: 'Air superiority',
      desc: 'Owns the sky and strafes anything below it, but never stops moving — it overshoots and must come back around.',
      weapons: [
        { name: 'AAM', kind: 'missile', dmg: 210, pen: 85, range: 540, cd: 6.0, speed: 520, turnRate: 3.6, splash: 16, targets: AIR, color: '#9fe8ff' },
        { name: 'Nose Cannon', dmg: 22, pen: 32, range: 310, cd: 0.07, spread: 0.035, targets: ALL, color: '#ffe27a', tracerWidth: 1.5 }
      ]
    }),

    bomber: unit({
      name: 'Bomber', domain: AIR, cost: 600, hp: 760, armor: 20,
      speed: 175, radius: 18, shape: 'bomber', move: 'fixedwing', turnRate: 0.85, accel: 160,
      role: 'Heavy strike',
      desc: 'Drops a stick of bombs that erases whatever is underneath. Cannot defend itself at all — bring an escort.',
      weapons: [{ name: 'Bomb Bay', kind: 'bomb', dmg: 320, pen: 105, range: 110, cd: 8.0, salvo: 4, salvoDelay: 0.12, splash: 95, spread: 0.02, targets: GROUND, color: '#ffae5a' }]
    }),

    /* ==================== SEA ==================== */

    patrolboat: unit({
      name: 'Patrol Boat', domain: SEA, cost: 110, hp: 280, armor: 10,
      speed: 98, radius: 12, shape: 'boat', move: 'naval', turnRate: 1.8, accel: 90, asw: true,
      role: 'Fast screen',
      desc: 'Cheap hull that spots submarines and chases down anything smaller. Folds the moment a real warship notices it.',
      weapons: [{ name: 'Deck Gun', dmg: 9, pen: 13, range: 235, cd: 0.16, spread: 0.06, targets: ALL, color: '#ffe9b0', tracerWidth: 1.2 }]
    }),

    corvette: unit({
      name: 'Missile Corvette', domain: SEA, cost: 300, hp: 560, armor: 18,
      speed: 80, radius: 15, shape: 'ship', move: 'naval', turnRate: 1.2, accel: 60,
      role: 'Naval strike',
      desc: 'Launches heavy anti-ship missiles well past gun range, and can shell a coastline from safety. Thin armour.',
      weapons: [
        { name: 'AShM', kind: 'missile', dmg: 200, pen: 98, range: 650, cd: 5.0, salvo: 2, salvoDelay: 0.4, speed: 330, turnRate: 2.0, splash: 30, targets: GROUND, color: '#ffb066' },
        { name: 'CIWS', dmg: 10, pen: 18, range: 240, cd: 0.12, spread: 0.05, targets: AIR, color: '#fff0c0', tracerWidth: 1.1 }
      ]
    }),

    destroyer: unit({
      name: 'Destroyer', domain: SEA, cost: 560, hp: 1600, armor: 34,
      speed: 64, radius: 18, shape: 'ship', move: 'naval', turnRate: 0.95, accel: 50, asw: true,
      role: 'Fleet workhorse',
      desc: 'Guns for the surface, a real anti-air battery, and sonar for submarines. The most flexible hull in the game.',
      weapons: [
        { name: 'Main Battery', dmg: 160, pen: 92, range: 640, cd: 2.2, splash: 26, spread: 0.025, targets: GROUND, color: '#ffc86a', tracerWidth: 2.4 },
        { name: 'AA Battery', dmg: 16, pen: 26, range: 400, cd: 0.1, spread: 0.045, targets: AIR, color: '#ffe27a', tracerWidth: 1.4 }
      ]
    }),

    battleship: unit({
      name: 'Battleship', domain: SEA, cost: 1100, hp: 3800, armor: 70,
      speed: 42, radius: 24, shape: 'ship', move: 'naval', turnRate: 0.5, accel: 26,
      role: 'Capital ship',
      desc: 'Outranges everything except artillery and hits harder than anything in the game. Torpedoes and massed air are its ruin.',
      weapons: [
        { name: 'Triple 16"', dmg: 440, pen: 145, range: 1180, cd: 6.0, salvo: 3, salvoDelay: 0.22, splash: 72, spread: 0.03, targets: GROUND, color: '#ffb45a', tracerWidth: 3.4 },
        { name: 'Secondaries', dmg: 15, pen: 24, range: 380, cd: 0.11, spread: 0.05, targets: AIR, color: '#ffe27a', tracerWidth: 1.3 }
      ]
    }),

    submarine: unit({
      name: 'Submarine', domain: SEA, cost: 380, hp: 440, armor: 16,
      speed: 56, radius: 14, shape: 'sub', move: 'naval', turnRate: 1.0, accel: 40, stealth: true,
      role: 'Ambush',
      desc: 'Invisible to anything without sonar until it is almost touching. Torpedoes gut capital ships, but it cannot hit land or air.',
      weapons: [{ name: 'Torpedoes', kind: 'torpedo', dmg: 420, pen: 135, range: 440, cd: 7.0, salvo: 2, salvoDelay: 0.5, speed: 145, turnRate: 1.4, splash: 22, targets: SEA, color: '#bfe9ff' }]
    })
  };

  /* Stamp each definition with its own key and freeze the ordering used by the UI. */
  const ORDER = { land: [], air: [], sea: [] };
  Object.keys(TYPES).forEach(function (id) {
    const t = TYPES[id];
    t.id = id;
    const bucket = t.domain === AIR ? 'air' : t.domain === SEA ? 'sea' : 'land';
    t.bucket = bucket;
    ORDER[bucket].push(id);
  });
  /* Cheapest first reads best in a shop list. */
  Object.keys(ORDER).forEach(function (k) {
    ORDER[k].sort(function (a, b) { return TYPES[a].cost - TYPES[b].cost; });
  });

  W.Units = { TYPES: TYPES, ORDER: ORDER, DOMAIN: DOMAIN, LAND: LAND, SEA: SEA, AIR: AIR, GROUND: GROUND, ALL: ALL };
})(window);
