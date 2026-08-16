/* Automatic army generation — used for the AI opponent and the Auto-fill button.
 *
 * Buys a doctrine-flavoured mix that fits the budget and the map (no navy on a
 * map with no water, no tank divisions on an archipelago), then places each unit
 * on legal ground inside its deployment zone. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;
  const T = Units.TYPES;

  /* Each doctrine lists candidate purchases with a relative weight.
   * `faction` restricts a doctrine to one side in editions that have factions. */
  const ANIMAL_DOCTRINES = [
    {
      name: 'The Whole Litter', faction: 0,
      picks: [['hamster', 4], ['rabbit', 3.5], ['pigeon', 3], ['housecat', 2.5],
        ['budgie', 2], ['ferret', 1.6], ['terrier', 1.4]]
    },
    {
      name: 'Pedigree Line', faction: 0,
      picks: [['guarddog', 2.2], ['bulldog', 2], ['pig', 1.4], ['terrier', 1.8],
        ['housecat', 1.4], ['tortoise', 1], ['parrot', 0.9]]
    },
    {
      name: 'Aviary', faction: 0,
      picks: [['pigeon', 3], ['budgie', 3], ['parrot', 2], ['housecat', 1.6],
        ['rabbit', 1.4], ['terrier', 1]]
    },
    {
      name: 'Garden Wall', faction: 0,
      picks: [['tortoise', 2.4], ['bulldog', 2.2], ['pig', 1.6], ['housecat', 1.6],
        ['guarddog', 1.2], ['hamster', 1.6]]
    },
    {
      name: 'Pack Hunt', faction: 1,
      picks: [['wolf', 2.6], ['hyena', 2.4], ['cheetah', 1.6], ['lynx', 1.4], ['boar', 1.2]]
    },
    {
      name: 'Apex Predators', faction: 1,
      picks: [['lion', 2.2], ['bear', 1.6], ['rhino', 1.2], ['wolf', 1.6],
        ['crocodile', 1.2], ['lynx', 1]]
    },
    {
      name: 'Sky Hunters', faction: 1,
      picks: [['eagle', 2.4], ['vulture', 2.6], ['lynx', 1.6], ['cheetah', 1.4], ['hyena', 1.4]]
    },
    {
      name: 'Heavy Hide', faction: 1,
      picks: [['rhino', 2], ['bear', 2], ['crocodile', 1.8], ['boar', 1.8], ['lion', 1.2]]
    }
  ];

  const SPACE_DOCTRINES = [
    {
      name: 'Starfighter Corps', faction: 0,
      picks: [['xwing', 3], ['awing', 2.4], ['z95', 2.6], ['ywing', 1.8], ['bwing', 1.2]]
    },
    {
      /* Bombers cannot arm their racks against small craft, so a wing without a
       * real escort simply gets eaten. The escort weights here are load-bearing. */
      name: 'Torpedo Strike', faction: 0,
      picks: [['ywing', 2.6], ['bwing', 2.0], ['awing', 2.4], ['xwing', 2.2],
        ['mc30', 1.0], ['gr75', 0.5]]
    },
    {
      name: 'Battle Line', faction: 0,
      picks: [['mc80', 1.2], ['nebulonb', 1.6], ['cr90', 2.0], ['mc30', 1.2],
        ['xwing', 1.4], ['gr75', 0.6]]
    },
    {
      name: 'Blockade Runners', faction: 0,
      picks: [['cr90', 2.6], ['yt1300', 2.2], ['awing', 2.0], ['z95', 1.6], ['xwing', 1.4]]
    },
    {
      /* Anchors on the immobile guns, so it needs hulls that can go and finish it. */
      name: 'Fixed Defence', faction: 0,
      picks: [['ionplatform', 1.6], ['cr90', 1.6], ['xwing', 2.0], ['ywing', 1.4],
        ['nebulonb', 0.9], ['gr75', 0.6]]
    },
    {
      name: 'TIE Swarm', faction: 1,
      picks: [['tie', 4], ['tieint', 2.4], ['tiebomber', 1.6], ['gozanti', 1.0]]
    },
    {
      name: 'Bomber Wing', faction: 1,
      picks: [['tiebomber', 2.8], ['gunboat', 2.2], ['tieint', 2.0], ['tie', 2.0],
        ['shuttle', 0.5]]
    },
    {
      name: 'Line of Battle', faction: 1,
      picks: [['isd', 1.1], ['victory', 1.6], ['arquitens', 1.8], ['raider', 1.4],
        ['tie', 1.6], ['shuttle', 0.5]]
    },
    {
      name: 'Elite Squadrons', faction: 1,
      picks: [['tiedef', 2.4], ['gunboat', 2.0], ['tieint', 1.8], ['raider', 1.2], ['tie', 1.2]]
    },
    {
      name: 'Static Cordon', faction: 1,
      picks: [['golan', 1.6], ['arquitens', 1.6], ['raider', 1.4], ['tie', 2.2],
        ['tiebomber', 1.4], ['victory', 0.9]]
    },
    {
      /* Only reachable on the larger budgets — the station alone is 6,000, and
       * `affordable` simply never offers it below that. The escorts matter:
       * unscreened, the thing is a very large target for a bomber wing. */
      name: 'Battle Station', faction: 1,
      picks: [['deathstar', 3], ['raider', 1.8], ['tieint', 2.0], ['tie', 1.8],
        ['arquitens', 1.2], ['gunboat', 1.2]]
    }
  ];

  /* No factions here, so every doctrine is available to both herds. */
  const PREHISTORIC_DOCTRINES = [
    {
      /* Small teeth cannot get through a scute, so a pack that is only quick and
       * cheap starves against anything armoured. The Allosaurus and Pachycephalosaur
       * weights here are the pack's tin opener. */
      name: 'Raptor Pack',
      picks: [['velociraptor', 3], ['compsognathus', 2.2], ['gallimimus', 1.8],
        ['dilophosaurus', 1.6], ['smilodon', 1.8], ['allosaurus', 2.2],
        ['pachycephalosaurus', 1.6]]
    },
    {
      /* Cheap bodies out front, and enough reach behind them that it is not simply
       * fed to whatever heavy it runs into. */
      name: 'The Whole Nesting Ground',
      picks: [['compsognathus', 3.2], ['gallimimus', 2.2], ['parasaurolophus', 1.8],
        ['meganeura', 2.0], ['microraptor', 1.6], ['velociraptor', 1.8],
        ['pachycephalosaurus', 2.0], ['allosaurus', 1.4], ['dilophosaurus', 1.2]]
    },
    {
      name: 'Apex Predators',
      picks: [['trex', 1.4], ['allosaurus', 2.0], ['spinosaurus', 1.4],
        ['smilodon', 1.6], ['velociraptor', 1.6], ['dilophosaurus', 1.0]]
    },
    {
      /* Most of a herd cannot reach a pterosaur at all, so the spitter and the
       * long-necked sauropod are what stop this from being free food for a wing.
       * Their weights are the difference between a hard line and a helpless one. */
      name: 'Armoured Herd',
      picks: [['ankylosaurus', 2.0], ['triceratops', 2.0], ['stegosaurus', 1.8],
        ['parasaurolophus', 1.4], ['mammoth', 1.4], ['brachiosaurus', 1.4],
        ['dilophosaurus', 2.0], ['allosaurus', 1.2]]
    },
    {
      name: 'Trample',
      picks: [['mammoth', 2.0], ['brachiosaurus', 1.6], ['triceratops', 1.8],
        ['pachycephalosaurus', 2.0], ['parasaurolophus', 1.2], ['smilodon', 2.0],
        ['dilophosaurus', 1.4]]
    },
    {
      name: 'Sky Reptiles',
      picks: [['pteranodon', 2.4], ['rhamphorhynchus', 2.6], ['quetzalcoatlus', 1.4],
        ['microraptor', 2.0], ['meganeura', 1.8], ['velociraptor', 1.2],
        ['dilophosaurus', 1.0]]
    },
    {
      /* Marine reptiles cannot reach anything inland at all, so the wings here are
       * load-bearing: without them a fleet that wins the water still has no way to
       * touch a herd that stayed on the grass, and the clock decides it. */
      name: 'Deep Water',
      picks: [['mosasaurus', 1.6], ['megalodon', 1.0], ['dunkleosteus', 1.8],
        ['elasmosaurus', 1.8], ['ichthyosaur', 2.0], ['archelon', 1.4],
        ['ammonite', 1.4], ['pteranodon', 2.0], ['rhamphorhynchus', 1.8],
        ['quetzalcoatlus', 0.9], ['spinosaurus', 0.9]],
      /* A high bar on purpose. A river is not enough water to commit an army to —
       * a fleet that cannot leave a channel 20% of the field wide spends the whole
       * battle unable to reach anything, so this only comes out on an open sea. */
      needsSea: 0.30
    },
    {
      name: 'Shoreline',
      picks: [['spinosaurus', 1.4], ['elasmosaurus', 1.6], ['archelon', 1.2],
        ['ichthyosaur', 1.4], ['triceratops', 1.6], ['allosaurus', 1.6],
        ['pteranodon', 1.4], ['parasaurolophus', 1.4], ['compsognathus', 1.6]],
      needsSea: 0.10
    }
  ];

  const EARTH_DOCTRINES = [
    {
      name: 'Combined Arms',
      picks: [['rifles', 3], ['mgteam', 1.5], ['atteam', 1.5], ['medtank', 2], ['lighttank', 1.5],
        ['apc', 1.5], ['flaktank', 1.2], ['spg', 0.8], ['gunship', 0.9], ['repair', 0.4]]
    },
    {
      name: 'Armoured Fist',
      picks: [['heavytank', 2], ['medtank', 3], ['lighttank', 1.5], ['flaktank', 1.4],
        ['repair', 0.7], ['rifles', 1.2], ['apc', 1]]
    },
    {
      name: 'Air Cavalry',
      picks: [['attackheli', 2], ['gunship', 2.2], ['fighter', 1.6], ['drone', 2], ['bomber', 0.8],
        ['rifles', 1.4], ['sam', 0.8]]
    },
    {
      name: 'Gun Line',
      picks: [['spg', 2], ['mlrs', 1.6], ['mortar', 1.6], ['rifles', 2.2], ['mgteam', 1.6],
        ['pillbox', 1.2], ['flaktank', 1.2], ['sam', 0.9], ['medtank', 1]]
    },
    {
      /* Cheap units only, but enough AT and flak that it is not free food for armour. */
      name: 'Swarm',
      picks: [['rifles', 4], ['jeep', 2], ['atteam', 3.5], ['drone', 2], ['mgteam', 1.8],
        ['flaktank', 1.2], ['lighttank', 1.2]]
    },
    {
      name: 'Naval Task Force',
      picks: [['destroyer', 2], ['corvette', 2], ['patrolboat', 1.6], ['submarine', 1.4],
        ['battleship', 0.7], ['carrier', 0.6], ['gunship', 0.8], ['rifles', 1]],
      needsSea: 0.18
    },
    {
      /* Static guns anchor the line, but it needs mobile units to actually close a battle. */
      name: 'Coastal Defence',
      picks: [['coastalgun', 1.0], ['pillbox', 0.8], ['corvette', 1.6], ['submarine', 1.6],
        ['sam', 1], ['rifles', 2], ['medtank', 1.6], ['spg', 1.2], ['flaktank', 1]],
      needsSea: 0.10
    }
  ];

  /* Placement bands: back-line units deploy behind the front line. */
  const DEPTH = {
    spg: 0.15, mlrs: 0.2, sam: 0.25, mortar: 0.3, coastalgun: 0.25, repair: 0.25,
    battleship: 0.2, corvette: 0.35, submarine: 0.3, carrier: 0.12,
    bomber: 0.2, fighter: 0.3,
    heavytank: 0.7, medtank: 0.68, lighttank: 0.72, apc: 0.72, jeep: 0.78,
    rifles: 0.75, mgteam: 0.6, atteam: 0.68, pillbox: 0.55,
    /* Animals: the slow heavies start forward, the quick ones sweep from behind. */
    tortoise: 0.85, bulldog: 0.8, pig: 0.78, guarddog: 0.7, terrier: 0.7,
    housecat: 0.6, ferret: 0.6, rabbit: 0.55, hamster: 0.5,
    pigeon: 0.5, budgie: 0.45, parrot: 0.4,
    rhino: 0.82, bear: 0.8, crocodile: 0.84, boar: 0.76, lion: 0.7,
    wolf: 0.66, hyena: 0.6, lynx: 0.56, cheetah: 0.5, eagle: 0.4, vulture: 0.45,
    /* Space: the capitals form the line, the fighter screen launches from behind
     * it, and the immobile guns and the tender sit at the very back. */
    ionplatform: 0.12, golan: 0.12, gr75: 0.18, shuttle: 0.18, deathstar: 0.3,
    isd: 0.5, mc80: 0.5, victory: 0.55, nebulonb: 0.5, mc30: 0.45,
    arquitens: 0.62, cr90: 0.68, raider: 0.68, gozanti: 0.55,
    ywing: 0.75, bwing: 0.75, tiebomber: 0.75, gunboat: 0.78,
    xwing: 0.82, tie: 0.85, tieint: 0.88, tiedef: 0.85, awing: 0.9, z95: 0.85,
    yt1300: 0.85,
    /* Prehistoric: the armoured herbivores form the front, the predators come
     * through the gaps behind them, and the spitter stays out of reach. */
    ankylosaurus: 0.86, stegosaurus: 0.84, triceratops: 0.8, brachiosaurus: 0.82,
    mammoth: 0.78, parasaurolophus: 0.76, pachycephalosaurus: 0.72,
    spinosaurus: 0.7, trex: 0.66, allosaurus: 0.64, smilodon: 0.56,
    velociraptor: 0.54, gallimimus: 0.5, compsognathus: 0.6, dilophosaurus: 0.32,
    quetzalcoatlus: 0.4, pteranodon: 0.42, rhamphorhynchus: 0.46,
    microraptor: 0.5, meganeura: 0.5,
    ammonite: 0.8, archelon: 0.76, dunkleosteus: 0.6, ichthyosaur: 0.5,
    elasmosaurus: 0.55, mosasaurus: 0.45, megalodon: 0.4
  };

  /* The doctrine pool for the active edition. */
  let DOCTRINES = EARTH_DOCTRINES;

  function setEdition(ed) {
    DOCTRINES = ed.id === 'animals' ? ANIMAL_DOCTRINES
      : ed.id === 'space' ? SPACE_DOCTRINES
        : ed.id === 'prehistoric' ? PREHISTORIC_DOCTRINES : EARTH_DOCTRINES;
  }

  function domainOf(id) { return T[id].domain; }

  /* Rejection-sample a legal spot inside the team's deployment zone. */
  function findSpot(terrain, team, typeId, depth, rand, taken) {
    const type = T[typeId];
    const zoneW = terrain.width * 0.26;
    for (let attempt = 0; attempt < 220; attempt++) {
      /* Bias toward the requested depth, loosening as attempts fail. */
      const slack = 0.12 + attempt * 0.004;
      const d = U.clamp(depth + (rand() * 2 - 1) * slack, 0.04, 0.96);
      const x = team === 0 ? d * zoneW : terrain.width - d * zoneW;
      const y = rand() * (terrain.height - 60) + 30;

      if (!terrain.passable(type.domain, x, y)) continue;

      let clash = false;
      for (let i = 0; i < taken.length; i++) {
        const o = taken[i];
        if (domainOf(o.type) !== type.domain) continue;
        const minD = (T[o.type].radius + type.radius) * 1.5;
        if (U.dist2(o.x, o.y, x, y) < minD * minD) { clash = true; break; }
      }
      if (clash) continue;
      /* Whole world units, matching hand placement, so replay links round-trip
       * these positions exactly. */
      return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  }

  function weightedPick(picks, rand, affordable) {
    let total = 0;
    for (let i = 0; i < picks.length; i++) {
      if (affordable(picks[i][0])) total += picks[i][1];
    }
    if (total <= 0) return null;
    let r = rand() * total;
    for (let i = 0; i < picks.length; i++) {
      if (!affordable(picks[i][0])) continue;
      r -= picks[i][1];
      if (r <= 0) return picks[i][0];
    }
    return null;
  }

  /* Returns an array of { type, x, y } within `budget`. */
  function generateArmy(terrain, team, budget, seed) {
    const rand = U.rng((seed >>> 0) ^ (team * 7919) ^ 0x5bf03635);

    const seaFrac = terrain.zoneSeaFrac;
    const landFrac = terrain.zoneLandFrac;

    /* In an edition with factions each side has its own doctrines and roster. */
    const factioned = W.Editions && W.Editions.current() && W.Editions.current().factions;
    const forTeam = DOCTRINES.filter(function (d) {
      return !factioned || d.faction === team;
    });

    let pool = forTeam.filter(function (d) {
      return !d.needsSea || seaFrac >= d.needsSea;
    });
    /* Almost no dry land to deploy on: force something that can actually fight. */
    if (landFrac < 0.15) {
      const naval = forTeam.filter(function (d) { return d.needsSea; });
      if (naval.length) pool = naval;
    }
    if (!pool.length) pool = forTeam.length ? forTeam : DOCTRINES;
    const doctrine = pool[Math.floor(rand() * pool.length)];

    /* On mixed maps, blend in some of a second doctrine so armies feel varied. */
    let picks = doctrine.picks.slice();
    if (rand() < 0.6) {
      const other = pool[Math.floor(rand() * pool.length)];
      other.picks.forEach(function (p) { picks.push([p[0], p[1] * 0.45]); });
    }
    /* Drop anything that has nowhere legal to sit on this map. Hidden units are
     * excluded too: they are carried, not bought, and a zero cost would spin the
     * purchase loop forever without ever consuming budget. */
    picks = picks.filter(function (p) {
      if (!T[p[0]] || T[p[0]].hidden || T[p[0]].cost <= 0) return false;
      /* Never buy the other side's animals. */
      if (factioned && T[p[0]].faction != null && T[p[0]].faction !== team) return false;
      const dm = domainOf(p[0]);
      if (dm === Units.SEA) return seaFrac > 0.05;
      if (dm === Units.LAND) return landFrac > 0.05;
      return true;
    });
    /* Nothing in any doctrine can deploy on this map. Fall back to whatever this
     * side is allowed to buy at all, so the army is never empty — naming Earth
     * unit ids here would throw in any other edition. */
    if (!picks.length) {
      picks = (W.Editions ? W.Editions.rosterFor(team) : Object.keys(T))
        .filter(function (id) { return T[id] && !T[id].hidden && T[id].cost > 0; })
        .map(function (id) { return [id, 1]; });
    }

    const army = [];
    let spent = 0;
    let guard = 0;

    const affordable = function (id) { return T[id].cost <= budget - spent; };

    while (spent < budget && guard++ < 800) {
      const id = weightedPick(picks, rand, affordable);
      if (!id) break;
      const depth = DEPTH[id] != null ? DEPTH[id] : 0.5;
      const spot = findSpot(terrain, team, id, depth, rand, army);
      if (!spot) {
        /* No room left for this type; stop offering it. */
        picks = picks.filter(function (p) { return p[0] !== id; });
        if (!picks.length) break;
        continue;
      }
      army.push({ type: id, x: spot.x, y: spot.y });
      spent += T[id].cost;
    }

    army.doctrine = doctrine.name;
    army.spent = spent;
    return army;
  }

  W.ArmyAI = {
    generateArmy: generateArmy,
    setEdition: setEdition,
    doctrines: function () { return DOCTRINES; }
  };
})(window);
