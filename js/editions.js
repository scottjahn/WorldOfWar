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
      teams: ['Blue', 'Red'],
      teamsShort: ['BLUE', 'RED'],
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
      tagline: 'Fleet actions in open space',
      blurb: 'Capital ships, fighter wings and orbital bombardment.',
      emblem: '🚀',
      available: false
    },
    {
      id: 'prehistoric',
      name: 'World of War: Prehistoric',
      short: 'Prehistoric',
      tagline: 'Before anyone invented the wheel',
      blurb: 'Tribes, tusks and things with far too many teeth.',
      emblem: '🦕',
      available: false
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
    return active && active.teams ? active.teams[team] : (team === 0 ? 'Blue' : 'Red');
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
