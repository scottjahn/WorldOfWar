/* Editions: same engine, different worlds.
 *
 * An edition owns everything content-shaped — the roster, the maps and their
 * size, the budgets, what the two sides are called, the AI's shopping lists and
 * what happens to a defeated unit. The simulation, renderer and UI read the
 * active edition rather than knowing which one is loaded.
 *
 * Adding one means: a js/roster-<id>.js file, an entry here, a script tag in
 * index.html, and a wire list in js/share.js so replay links can name its units.
 */
(function (W) {
  'use strict';

  const EARTH_MAPS = [
    {
      id: 'plains', name: 'Open Plains',
      blurb: 'Rolling ground with scattered ponds. Armour country — navies have almost nowhere to sail.',
      water: function (nx, ny, n) { return n < -0.42; }
    },
    {
      id: 'coast', name: 'Coastal Assault',
      blurb: 'A wide sea along the southern edge. Fleets shell the shore while armies fight inland.',
      water: function (nx, ny, n, x, noise) { return ny > 0.60 + noise(x * 0.035, 100, 3) * 0.10; }
    },
    {
      id: 'river', name: 'River Crossing',
      blurb: 'A river splits the field east to west. Land forces are cut in two; boats own the middle.',
      water: function (nx, ny, n, x, noise) {
        const centre = 0.5 + noise(x * 0.028, 200, 3) * 0.13;
        const halfWidth = 0.085 + noise(x * 0.05, 300, 2) * 0.03;
        return Math.abs(ny - centre) < halfWidth;
      }
    },
    {
      id: 'strait', name: 'The Strait',
      blurb: 'A narrow land bridge between two seas. Naval power on both flanks, a brutal ground chokepoint.',
      water: function (nx, ny, n, x, noise) {
        const centre = 0.5 + noise(x * 0.025, 400, 3) * 0.07;
        const halfWidth = 0.20 + noise(x * 0.04, 500, 2) * 0.05;
        return Math.abs(ny - centre) > halfWidth;
      }
    },
    {
      id: 'archipelago', name: 'Archipelago',
      blurb: 'Scattered islands in open water. Ground units are stranded — build a navy or an air force.',
      water: function (nx, ny, n) {
        const edgeBias = Math.max(0, 1 - Math.abs(nx - 0.5) * 2.4) * 0.18;
        return n < 0.16 + edgeBias;
      }
    }
  ];

  /* No water anywhere in the Animals edition, so every map is dry by construction. */
  const ANIMAL_MAPS = [
    {
      id: 'backyard', name: 'The Back Garden',
      blurb: 'Open lawn with a few flower beds. Nowhere to hide and nothing to slow a charge.',
      water: function () { return false; },
      forestBias: -0.15, rockBias: 0.15
    },
    {
      id: 'meadow', name: 'Wildflower Meadow',
      blurb: 'Long grass broken by thickets. Cover for something small to close the distance in.',
      water: function () { return false; },
      forestBias: 0.12, rockBias: 0.05
    },
    {
      id: 'woodland', name: 'Deep Woodland',
      blurb: 'Dense trees and boulders. Everything moves slowly, so speed matters far less than teeth.',
      water: function () { return false; },
      forestBias: 0.3, rockBias: -0.05
    },
    {
      id: 'quarry', name: 'The Old Quarry',
      blurb: 'Bare stone with impassable outcrops carving the ground into lanes and dead ends.',
      water: function () { return false; },
      forestBias: -0.3, rockBias: 0.3
    }
  ];

  /* Space has no water either, and reuses the surface types for vacuum:
   * GRASS is open space, SAND is a dust and debris wash, FOREST is nebula gas
   * that drags a hull down to 60% speed, and ROCK is a rock — an asteroid or a
   * planet — that nothing flies through.
   *
   * The ambient noise pass only ever produces a scatter, so anything with a
   * shape (a belt, a planet) is drawn by the map's own `carve`. See
   * Terrain.prototype.decorate for when that runs and why. */
  const SPACE_MAPS = [
    {
      id: 'deepspace', name: 'Deep Space',
      blurb: 'Empty sky between two stars. No cover, no chokepoints — the fleets simply meet.',
      water: function () { return false; },
      forestBias: -0.55, rockBias: -0.42,
      space: { tint: '#1c2a58', clouds: 0.25, stars: 1 }
    },
    {
      id: 'orbit', name: 'Planetary Orbit',
      blurb: 'A world fills the lower sky and a moon hangs above. Nothing crosses either — ' +
        'the fight is decided in the lanes around them.',
      water: function () { return false; },
      forestBias: -0.5, rockBias: -0.4,
      space: { tint: '#132446', clouds: 0.3, stars: 1 },
      carve: function (t) {
        const R = W.Terrain.ROCK;
        /* Kept inside the middle of the field on purpose: the deployment strips
         * are scrubbed of rock after this runs, which would bite a notch out of
         * anything overlapping them. */
        const planet = { x: t.cols * 0.5, y: t.rows * 1.0, r: t.rows * 0.38 };
        const moon = { x: t.cols * 0.5, y: t.rows * 0.2, r: t.rows * 0.125 };
        t.disc(planet.x, planet.y, planet.r, R);
        t.disc(moon.x, moon.y, moon.r, R);
        const TS = t.tileSize;
        t.props.push({
          kind: 'planet', x: planet.x * TS, y: planet.y * TS, r: planet.r * TS,
          color: '#3f6a52', shade: '#1a3128', atmos: 'rgba(150,220,255,0.55)', bands: 4
        });
        t.props.push({
          kind: 'planet', x: moon.x * TS, y: moon.y * TS, r: moon.r * TS,
          color: '#8d8a84', shade: '#3a3835', atmos: null, craters: 7
        });
      }
    },
    {
      id: 'asteroids', name: 'Asteroid Belt',
      blurb: 'A belt of rock and dust straight across the middle. Everything in it slows down, ' +
        'and the big hulls have to pick their way through.',
      water: function () { return false; },
      forestBias: -0.5, rockBias: -0.3,
      space: { tint: '#3b2c20', clouds: 0.35, stars: 0.9 },
      carve: function (t, noise) {
        const ROCK = W.Terrain.ROCK, SAND = W.Terrain.SAND;
        for (let y = 0; y < t.rows; y++) {
          for (let x = 0; x < t.cols; x++) {
            const ny = y / t.rows;
            const centre = 0.5 + noise(x * 0.03, 700, 3) * 0.16;
            const half = 0.16 + noise(x * 0.05, 900, 2) * 0.05;
            const off = Math.abs(ny - centre);
            if (off > half) continue;
            /* Densest along the spine, fraying out to loose dust at the edges. */
            const density = 1 - off / half;
            const n = noise(x * 0.16 + 40, y * 0.16 + 40, 2);
            t.tiles[y * t.cols + x] = (n + density * 0.35 > 0.60) ? ROCK : SAND;
          }
        }
      }
    },
    {
      id: 'nebula', name: 'Ion Nebula',
      blurb: 'Charged gas across most of the field. Everything crawls, so the long guns never ' +
        'get the range they were bought for.',
      water: function () { return false; },
      forestBias: 0.24, rockBias: -0.35,
      space: { tint: '#4b2a63', clouds: 1, stars: 0.55 },
      carve: function (t, noise) {
        const FOREST = W.Terrain.FOREST;
        /* A couple of dense cores so the gas has a shape rather than just a
         * uniform speckle. */
        for (let i = 0; i < 3; i++) {
          const cx = t.cols * (0.34 + i * 0.16);
          const cy = t.rows * (0.5 + noise(i * 7.7, 1200, 2) * 0.34);
          t.disc(cx, cy, t.rows * 0.2, FOREST);
        }
      }
    },
    {
      id: 'graveyard', name: 'The Graveyard',
      blurb: 'Somebody else\'s battle, cold for a century. Drifting hulks block the lanes and ' +
        'the debris between them fouls a drive.',
      water: function () { return false; },
      forestBias: -0.45, rockBias: -0.2,
      space: { tint: '#26333c', clouds: 0.4, stars: 0.8 },
      carve: function (t, noise, rand) {
        const ROCK = W.Terrain.ROCK, SAND = W.Terrain.SAND;
        /* A wash of debris down the middle third. */
        for (let y = 0; y < t.rows; y++) {
          for (let x = 0; x < t.cols; x++) {
            const nx = x / t.cols;
            if (nx < 0.24 || nx > 0.76) continue;
            if (noise(x * 0.1 + 300, y * 0.1 + 300, 2) < 0.06) continue;
            const i = y * t.cols + x;
            if (t.tiles[i] !== ROCK) t.tiles[i] = SAND;
          }
        }
        /* Derelict hulks: solid enough to path around, each in its own debris halo. */
        for (let i = 0; i < 16; i++) {
          const cx = t.cols * (0.3 + rand() * 0.4);
          const cy = t.rows * (0.08 + rand() * 0.84);
          const r = 1.6 + rand() * 2.6;
          t.disc(cx, cy, r + 2.2, SAND);
          t.disc(cx, cy, r, ROCK);
        }
      }
    }
  ];

  /* Prehistoric fields all three domains, so most of these carry real water —
   * a map with none is a map where a third of the roster cannot deploy, which is
   * a deliberate choice on one or two of them rather than the default. */
  const PREHISTORIC_MAPS = [
    {
      id: 'delta', name: 'River Delta',
      blurb: 'A warm shallow sea along the southern edge. Marine reptiles work the coast ' +
        'while the herds decide it inland.',
      water: function (nx, ny, n, x, noise) { return ny > 0.58 + noise(x * 0.035, 100, 3) * 0.12; },
      forestBias: 0.08
    },
    {
      id: 'floodplain', name: 'Fern Floodplain',
      blurb: 'Open ground and scattered watering holes. Nowhere to hide from a charge, ' +
        'and almost nowhere to swim.',
      water: function (nx, ny, n) { return n < -0.44; },
      forestBias: -0.05
    },
    {
      id: 'crossing', name: 'The Crossing',
      blurb: 'A river cuts the field east to west. The herds are split in two and ' +
        'something very large is already in the water.',
      water: function (nx, ny, n, x, noise) {
        const centre = 0.5 + noise(x * 0.028, 200, 3) * 0.13;
        const halfWidth = 0.09 + noise(x * 0.05, 300, 2) * 0.035;
        return Math.abs(ny - centre) < halfWidth;
      },
      forestBias: 0.12
    },
    {
      id: 'shallows', name: 'The Shallows',
      blurb: 'Warm sea north and south with one sandbar between them. The herds have a ' +
        'single strip to fight over and both flanks belong to the swimmers.',
      /* Deliberately a bar rather than an archipelago: with no long-range weapon
       * anywhere in this edition, scattered islands leave two melee armies looking
       * at each other across water until the clock runs out. */
      water: function (nx, ny, n, x, noise) {
        const centre = 0.5 + noise(x * 0.025, 400, 3) * 0.08;
        const halfWidth = 0.21 + noise(x * 0.04, 500, 2) * 0.05;
        return Math.abs(ny - centre) > halfWidth;
      }
    },
    {
      id: 'forest', name: 'Horsetail Forest',
      blurb: 'Dense cycads and fallen trunks, and not a drop of open water. Everything ' +
        'slows down, so reach and teeth matter far more than speed.',
      water: function () { return false; },
      forestBias: 0.3, rockBias: -0.05
    },
    {
      id: 'ashfall', name: 'Ashfall Basin',
      blurb: 'Bare rock under two cinder cones, with a single pass between them. ' +
        'No water, no cover, and one place the whole battle has to go through.',
      water: function () { return false; },
      forestBias: -0.35, rockBias: 0.2,
      carve: function (t) {
        const ROCK = W.Terrain.ROCK;
        /* Kept off the centreline in y so the gap between them is the pass, and
         * inside the middle of the field in x — the deployment strips are scrubbed
         * of rock afterwards, which would bite a notch out of anything overlapping. */
        t.disc(t.cols * 0.48, t.rows * 0.16, t.rows * 0.2, ROCK);
        t.disc(t.cols * 0.54, t.rows * 0.86, t.rows * 0.18, ROCK);
      }
    }
  ];

  const EDITIONS = [
    {
      id: 'earth',
      name: 'World of War: Earth',
      short: 'Earth',
      tagline: 'Modern combined arms',
      blurb: 'Infantry, armour, artillery, aircraft and a navy across land, air and sea.',
      emblem: '🌍',
      available: true,
      roster: function () { return W.RosterEarth; },
      maps: EARTH_MAPS,
      cols: 120, rows: 70,
      budgets: [1500, 3000, 6000, 12000],
      defaultBudget: 3000,
      defaultMap: 'coast',
      teams: ['Red', 'Blue'],
      teamsShort: ['RED', 'BLUE'],
      factions: false,           // both sides buy from the same roster
      defeat: 'destroy',
      words: {
        wipeout: 'Enemy army destroyed',
        survivors: 'Survivors',
        lost: 'Value lost',
        remaining: 'Value left',
        unitsLeft: 'left'
      }
    },
    {
      id: 'animals',
      name: 'World of War: Animals',
      short: 'Animals',
      tagline: 'Household Pets vs Killer Animals',
      blurb: 'Everything is melee, nothing has wheels, and nobody dies — a beaten animal simply bolts.',
      emblem: '🐾',
      available: true,
      roster: function () { return W.RosterAnimals; },
      maps: ANIMAL_MAPS,
      /* A smaller field to match smaller, slower combatants. */
      cols: 72, rows: 44,
      budgets: [400, 800, 1600, 3200],
      defaultBudget: 800,
      defaultMap: 'backyard',
      teams: ['Household Pets', 'Killer Animals'],
      teamsShort: ['PETS', 'WILD'],
      factions: true,            // each side has its own roster
      factionWord: 'animals',
      defeat: 'flee',
      words: {
        wipeout: 'Every rival fled the field',
        survivors: 'Held the field',
        lost: 'Value routed',
        remaining: 'Value left',
        unitsLeft: 'still in'
      }
    },
    {
      id: 'space',
      name: 'World of War: Space',
      short: 'Space',
      tagline: 'Rebel Alliance vs Imperial Navy',
      blurb: 'Starfighters, capital ships and turbolasers. One domain — everything flies.',
      emblem: '🚀',
      available: true,
      roster: function () { return W.RosterSpace; },
      maps: SPACE_MAPS,
      /* The widest field in the game: a Star Destroyer's main battery reaches
       * 1,150 on its own, so a smaller board would start the battle already in
       * range and skip the approach entirely. */
      cols: 140, rows: 80,
      budgets: [2000, 4000, 8000, 16000],
      defaultBudget: 4000,
      defaultMap: 'orbit',
      teams: ['Rebel Alliance', 'Imperial Navy'],
      teamsShort: ['REBELS', 'EMPIRE'],
      factions: true,            // each navy has its own roster
      factionWord: 'ships',
      defeat: 'destroy',
      look: 'space',             // renderer swaps to a starfield palette
      scars: false,              // no ground out here to hold a crater
      /* One domain, so the land/air/sea tabs collapse to a single shelf and the
       * detail panel drops the "Engages" line — it would say the same thing for
       * every weapon in the edition. */
      singleDomain: true,
      bucketNames: { land: 'Fleet' },
      words: {
        wipeout: 'Enemy fleet destroyed',
        survivors: 'Ships left',
        lost: 'Tonnage lost',
        remaining: 'Fleet value',
        unitsLeft: 'left',
        blocked: 'Cannot deploy inside an asteroid'
      }
    },
    {
      id: 'prehistoric',
      name: 'World of War: Prehistoric',
      short: 'Prehistoric',
      tagline: 'Before anyone invented the wheel',
      blurb: 'Dinosaurs, pterosaurs and marine reptiles across land, air and sea. ' +
        'Both herds field the same animals.',
      emblem: '🦕',
      available: true,
      roster: function () { return W.RosterPrehistoric; },
      maps: PREHISTORIC_MAPS,
      /* Between Animals and Earth. Almost everything here is melee, so a field the
       * size of Earth's would be spent walking; smaller than this and the fast
       * runners cross it before a slow herd has formed up at all. */
      cols: 100, rows: 60,
      budgets: [1000, 2000, 4000, 8000],
      defaultBudget: 2000,
      defaultMap: 'delta',
      teams: ['Red Herd', 'Blue Herd'],
      teamsShort: ['RED', 'BLUE'],
      factions: false,           // both sides buy from the same roster
      /* Nothing is killed on screen: a beaten animal breaks and runs, same as
       * Animals — a Triceratops does not explode. */
      defeat: 'flee',
      words: {
        wipeout: 'The rival herd broke and ran',
        survivors: 'Held the field',
        lost: 'Value routed',
        remaining: 'Value left',
        unitsLeft: 'still in'
      }
    }
  ];

  let active = null;

  function byId(id) {
    return EDITIONS.filter(function (e) { return e.id === id; })[0] || null;
  }

  /* Loads an edition's content into the shared catalogue, map list and AI tables. */
  function activate(id) {
    const ed = byId(id);
    if (!ed || !ed.available) return null;
    active = ed;
    W.Units.setCatalogue(ed.roster());
    W.Terrain.setEdition(ed);
    if (W.ArmyAI && W.ArmyAI.setEdition) W.ArmyAI.setEdition(ed);
    return ed;
  }

  function current() { return active; }

  /* Units a given side is allowed to buy. Editions without factions let both
   * sides buy anything. */
  function rosterFor(team) {
    const ids = [];
    ['land', 'air', 'sea'].forEach(function (b) {
      W.Units.ORDER[b].forEach(function (id) { ids.push(id); });
    });
    return ids.filter(function (id) {
      const f = W.Units.TYPES[id].faction;
      return f == null || !active || !active.factions || f === team;
    });
  }

  function teamName(team) {
    return active && active.teams ? active.teams[team] : (team === 0 ? 'Red' : 'Blue');
  }

  function word(key, fallback) {
    return (active && active.words && active.words[key]) || fallback;
  }

  W.Editions = {
    ALL: EDITIONS,
    byId: byId,
    activate: activate,
    current: current,
    rosterFor: rosterFor,
    teamName: teamName,
    word: word
  };
})(window);
