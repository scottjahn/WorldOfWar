/* World of War: Space — Rebel Alliance against the Imperial Navy.
 *
 * One domain. Every hull in here flies in vacuum, so there is no land/air/sea
 * split to sort the roster by — `SHIP` is the only target mask in the file, and
 * a single Fleet tab holds the lot.
 *
 * What replaces the domain split is the `tags` field. Small craft carry
 * `'fighter'`, warships carry `'capital'`, and weapons use `prefersTag` to say
 * which they were built for: point defence hunts the fighter screen while the
 * turbolaser batteries stay on the enemy line of battle. Neither is a
 * restriction — a turbolaser that catches a TIE will vaporise it — but a
 * capital ship no longer wastes a six-second reload on a starfighter while
 * another Star Destroyer closes.
 *
 * The armour/penetration curve (see js/units.js) is what makes the two arms need
 * each other. Laser cannons have low `pen` and barely scratch capital armour, so
 * fighters carry proton torpedoes and ion cannons for the heavy work — and those
 * have long reloads, which is exactly the window point defence exists to use.
 *
 * Two asymmetries, deliberately:
 *   Imperial hulls are individually tougher and their capitals hit hardest, but
 *   TIE fighters are unshielded and die in droves.
 *   Rebel starfighters are shielded, expensive and punch far above their price
 *   against a capital ship; their warships are thinner and rely on speed.
 */
(function (W) {
  'use strict';

  const U = W.Units;
  const unit = U.unit;

  /* The one domain there is. Named for what it means here rather than reusing
   * `LAND`, which would read as nonsense in a file about starships. */
  const SHIP = U.LAND;

  /* Bolt colours are how you tell the two navies apart at a glance. */
  const REB = '#ff6a52';        // Rebel red
  const IMP = '#8dff72';        // Imperial green
  const ION = '#9fd8ff';        // ion — blue, and it eats armour
  const PROTON = '#c8dcff';     // proton torpedoes
  const CONC = '#ffb066';       // concussion missiles

  /* Laser cannon: fast bolts, tuned for the fighter screen. */
  function laser(def) {
    return Object.assign({
      kind: 'tracer', name: 'Laser Cannons', speed: 1250, spread: 0.035,
      targets: SHIP, prefersTag: 'fighter', tracerWidth: 1.8
    }, def);
  }

  /* Point defence: a wall of light fire. Too little penetration to trouble a
   * warship, which is the whole point — it exists to clear small craft. */
  function pointDefence(def) {
    return Object.assign({
      kind: 'tracer', name: 'Point Defence', dmg: 14, pen: 22, range: 420,
      cd: 0.1, spread: 0.055, speed: 1400, targets: SHIP,
      prefersTag: 'fighter', tracerWidth: 1.2
    }, def);
  }

  /* Turbolaser: slow, enormous, and aimed at the enemy line of battle. */
  function turbolaser(def) {
    return Object.assign({
      kind: 'tracer', name: 'Turbolasers', speed: 900, spread: 0.028,
      targets: SHIP, prefersTag: 'capital', tracerWidth: 3.4
    }, def);
  }

  W.RosterSpace = {

    /* ================== REBEL ALLIANCE (faction 0) ================== */

    z95: unit({
      name: 'Z-95 Headhunter', faction: 0, domain: SHIP, cost: 40, hp: 85, armor: 9,
      speed: 175, radius: 9, shape: 'snub', move: 'fixedwing', turnRate: 2.4,
      role: 'Cheap screen', tags: ['fighter'],
      desc: 'An obsolete snubfighter the Alliance keeps flying because it is what they have. ' +
        'It costs almost nothing and carries nothing that worries a warship — but unlike its ' +
        'Imperial opposite number it has a deflector, so it takes a beating a TIE would not.',
      weapons: [laser({ dmg: 11, pen: 18, range: 300, cd: 0.55, salvo: 2, salvoDelay: 0.09, color: REB })]
    }),

    awing: unit({
      name: 'RZ-1 A-wing', faction: 0, domain: SHIP, cost: 110, hp: 155, armor: 10,
      speed: 285, radius: 9, shape: 'awing', move: 'fixedwing', turnRate: 2.9,
      role: 'Interceptor', tags: ['fighter'],
      desc: 'The fastest thing either side fields. Built to catch TIEs rather than to hurt ' +
        'anything large — its missiles are fused for small craft and it has no answer at all ' +
        'to capital armour.',
      weapons: [
        laser({ dmg: 12, pen: 22, range: 330, cd: 0.45, salvo: 2, salvoDelay: 0.08, color: REB }),
        {
          name: 'Concussion Missiles', kind: 'missile', dmg: 105, pen: 68, range: 430, cd: 5.5,
          salvo: 1, speed: 470, turnRate: 2.4, splash: 16,
          targets: SHIP, onlyTag: 'fighter', color: CONC
        }
      ]
    }),

    xwing: unit({
      name: 'T-65 X-wing', faction: 0, domain: SHIP, cost: 135, hp: 220, armor: 16,
      speed: 205, radius: 11, shape: 'xwing', move: 'fixedwing', turnRate: 2.3,
      role: 'Line fighter', tags: ['fighter'],
      desc: 'Four laser cannons for the dogfight and a pair of proton torpedoes for whatever ' +
        'is behind it. The one Rebel hull that is genuinely good at both jobs, which is why ' +
        'every squadron is built around it.',
      weapons: [
        laser({ dmg: 14, pen: 26, range: 340, cd: 0.6, salvo: 4, salvoDelay: 0.07, color: REB }),
        {
          name: 'Proton Torpedoes', kind: 'missile', dmg: 260, pen: 175, range: 560, cd: 7.5,
          salvo: 2, salvoDelay: 0.45, speed: 420, turnRate: 2.2, splash: 20,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        }
      ]
    }),

    ywing: unit({
      name: 'BTL-A4 Y-wing', faction: 0, domain: SHIP, cost: 180, hp: 330, armor: 22,
      speed: 145, radius: 12, shape: 'ywing', move: 'fixedwing', turnRate: 1.5,
      role: 'Torpedo bomber', tags: ['fighter'],
      desc: 'Half the armour plating stripped off and the rest held together by the ground ' +
        'crew. Ion cannon and heavy torpedoes make it the cheapest thing in the fleet that ' +
        'can properly hurt a Star Destroyer — but neither will arm against a starfighter, ' +
        'and the two nose cannons are all it has if one finds it.',
      weapons: [
        /* prefersTag cleared: a bomber that fancies fighters flies at the screen
         * instead of the warship its rack is fused for. */
        laser({ name: 'Nose Cannons', dmg: 12, pen: 20, range: 300, cd: 0.7, salvo: 2, salvoDelay: 0.1, color: REB, prefersTag: null }),
        {
          name: 'Ion Cannon', kind: 'tracer', dmg: 85, pen: 195, range: 430, cd: 2.4,
          salvo: 2, salvoDelay: 0.25, speed: 700, spread: 0.04,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 2.6
        },
        {
          name: 'Proton Torpedoes', kind: 'missile', dmg: 300, pen: 185, range: 590, cd: 7.5,
          salvo: 2, salvoDelay: 0.45, speed: 400, turnRate: 2.0, splash: 24,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        }
      ]
    }),

    gr75: unit({
      name: 'GR-75 Transport', faction: 0, domain: SHIP, cost: 240, hp: 950, armor: 26,
      speed: 72, radius: 17, shape: 'transport', move: 'ground', turnRate: 0.8,
      role: 'Repair tender', tags: ['capital'],
      desc: 'A bulk hauler with a repair rig bolted into the hold. It patches the nearest ' +
        'damaged hull continuously, which pays for itself behind a cruiser and nowhere else. ' +
        'Anything that reaches it kills it.',
      weapons: [
        { name: 'Repair Rig', kind: 'repair', dmg: 45, range: 210, cd: 1.0, targets: 0, color: '#8effc0' }
      ]
    }),

    bwing: unit({
      name: 'A/SF-01 B-wing', faction: 0, domain: SHIP, cost: 250, hp: 420, armor: 28,
      speed: 155, radius: 12, shape: 'bwing', move: 'fixedwing', turnRate: 1.4,
      role: 'Heavy assault fighter', tags: ['fighter'],
      desc: 'A gyroscopic gun platform with a cockpit attached. It carries a warship\'s ion ' +
        'armament on a starfighter airframe and turns like the brick it is — ruinous to ' +
        'anything with plating on it, and very poor company for an interceptor.',
      weapons: [
        laser({ dmg: 18, pen: 24, range: 320, cd: 0.6, salvo: 2, salvoDelay: 0.1, color: REB, prefersTag: null }),
        {
          name: 'Heavy Ion Cannon', kind: 'tracer', dmg: 150, pen: 225, range: 500, cd: 3.4,
          salvo: 2, salvoDelay: 0.3, speed: 720, spread: 0.035,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 3
        },
        {
          name: 'Proton Torpedoes', kind: 'missile', dmg: 290, pen: 180, range: 560, cd: 8.0,
          salvo: 2, salvoDelay: 0.4, speed: 410, turnRate: 2.1, splash: 22,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        }
      ]
    }),

    yt1300: unit({
      name: 'YT-1300 Freighter', faction: 0, domain: SHIP, cost: 330, hp: 700, armor: 32,
      speed: 190, radius: 14, shape: 'freighter', move: 'fixedwing', turnRate: 1.9,
      role: 'Armed freighter', tags: ['fighter'],
      desc: 'A stock light freighter with a great deal of unlicensed work done to it. ' +
        'Quad turrets that track independently, military-grade shielding, and enough speed ' +
        'to be somewhere else by the time the reply arrives.',
      weapons: [
        laser({
          name: 'Quad Laser Turrets', dmg: 26, pen: 42, range: 400, cd: 0.5,
          salvo: 3, salvoDelay: 0.09, color: REB, tracerWidth: 2.2, prefersTag: null
        }),
        {
          name: 'Concussion Missiles', kind: 'missile', dmg: 180, pen: 96, range: 480, cd: 6.5,
          salvo: 2, salvoDelay: 0.35, speed: 440, turnRate: 2.6, splash: 20,
          targets: SHIP, color: CONC
        }
      ]
    }),

    ionplatform: unit({
      name: 'Ion Cannon Platform', faction: 0, domain: SHIP, cost: 280, hp: 2100, armor: 58,
      speed: 0, radius: 16, shape: 'platform', move: 'static', turnRate: 1.2,
      role: 'Static heavy battery', tags: ['capital'],
      desc: 'A dug-in orbital gun that cannot move a metre once it is anchored. In exchange ' +
        'it reaches most of the field with a shot that goes through capital plating as though ' +
        'it were not there.',
      weapons: [
        {
          name: 'Heavy Ion Cannon', kind: 'tracer', dmg: 280, pen: 285, range: 920, cd: 4.2,
          speed: 780, spread: 0.02, splash: 24,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 4
        },
        pointDefence({ dmg: 12, pen: 20, range: 380, cd: 0.13, color: REB })
      ]
    }),

    cr90: unit({
      name: 'CR90 Corvette', faction: 0, domain: SHIP, cost: 470, hp: 1700, armor: 32,
      speed: 120, radius: 18, shape: 'corvette', move: 'ground', turnRate: 0.95,
      role: 'Fast escort', tags: ['capital'],
      desc: 'The blockade runner the Alliance built its navy out of. Faster than anything ' +
        'else with a turbolaser on it, and thin enough that a real warship opens it in one ' +
        'exchange — so it fights at the edges, not in the line.',
      weapons: [
        turbolaser({ dmg: 165, pen: 100, range: 610, cd: 2.2, salvo: 2, salvoDelay: 0.25, splash: 16, color: REB }),
        pointDefence({ dmg: 14, pen: 22, range: 400, cd: 0.095, color: REB })
      ]
    }),

    nebulonb: unit({
      name: 'Nebulon-B Frigate', faction: 0, domain: SHIP, cost: 800, hp: 2700, armor: 46,
      speed: 78, radius: 22, shape: 'frigate', move: 'ground', turnRate: 0.55,
      role: 'Escort carrier', tags: ['capital'],
      desc: 'Built to shepherd convoys, so almost everything on it points at small craft: ' +
        'twin point-defence batteries and a flight of X-wings kept on the rails. Its own ' +
        'turbolasers are an afterthought and its spine is famously easy to break.',
      squadron: { type: 'xwingw', count: 3, respawn: 20, reserve: 3 },
      weapons: [
        turbolaser({ dmg: 205, pen: 122, range: 720, cd: 3.2, salvo: 2, salvoDelay: 0.3, splash: 22, color: REB }),
        pointDefence({ dmg: 15, pen: 24, range: 440, cd: 0.09, color: REB }),
        pointDefence({ name: 'Escort Battery', dmg: 15, pen: 24, range: 440, cd: 0.09, color: REB })
      ]
    }),

    mc30: unit({
      name: 'MC30c Frigate', faction: 0, domain: SHIP, cost: 780, hp: 2200, armor: 42,
      speed: 100, radius: 19, shape: 'cruiser', move: 'ground', turnRate: 0.85,
      role: 'Torpedo strike ship', tags: ['capital'],
      desc: 'A Mon Calamari hull stuffed with launch tubes until there was no room left for ' +
        'armour. It throws a capital ship\'s torpedo salvo from a frigate that dies to one, ' +
        'so it wants a screen in front of it at all times.',
      weapons: [
        {
          name: 'Assault Torpedoes', kind: 'missile', dmg: 330, pen: 190, range: 840, cd: 7.0,
          salvo: 3, salvoDelay: 0.4, speed: 400, turnRate: 1.9, splash: 32,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        },
        {
          name: 'Ion Batteries', kind: 'tracer', dmg: 110, pen: 195, range: 620, cd: 2.8,
          salvo: 2, salvoDelay: 0.28, speed: 760, spread: 0.03,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 2.8
        },
        pointDefence({ dmg: 13, pen: 21, range: 390, cd: 0.11, color: REB })
      ]
    }),

    mc80: unit({
      name: 'MC80 Star Cruiser', faction: 0, domain: SHIP, cost: 1600, hp: 6100, armor: 68,
      speed: 52, radius: 30, shape: 'cruiser', move: 'ground', turnRate: 0.34,
      role: 'Fleet capital', tags: ['capital'],
      desc: 'A converted deep-space liner and the only Rebel hull that can stand in a line ' +
        'against a Star Destroyer. Heavy turbolasers, ion batteries that strip armour for the ' +
        'rest of the fleet, and a wing of X-wings on the racks.',
      squadron: { type: 'xwingw', count: 4, respawn: 18, reserve: 4 },
      weapons: [
        turbolaser({
          name: 'Heavy Turbolasers', dmg: 345, pen: 168, range: 1050, cd: 5.0,
          salvo: 3, salvoDelay: 0.3, splash: 38, color: REB, tracerWidth: 4.2
        }),
        {
          name: 'Ion Batteries', kind: 'tracer', dmg: 140, pen: 205, range: 800, cd: 3.2,
          salvo: 2, salvoDelay: 0.3, speed: 760, spread: 0.03,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 3
        },
        pointDefence({ dmg: 15, pen: 24, range: 440, cd: 0.09, color: REB })
      ]
    }),

    /* Carried by the Nebulon-B and the MC80, never bought. Costed at 0 so the
     * carrier's price is the whole package, in the roster and in the surviving
     * fleet value alike — same arrangement as the Earth carrier's Tomcats. */
    xwingw: unit({
      name: 'X-wing', faction: 0, domain: SHIP, cost: 0, hp: 220, armor: 16, hidden: true,
      speed: 205, radius: 11, shape: 'xwing', move: 'fixedwing', turnRate: 2.3,
      role: 'Carried starfighter', tags: ['fighter'],
      desc: 'A squadron flown off a warship rather than bought as part of the order of battle.',
      weapons: [
        laser({ dmg: 14, pen: 26, range: 340, cd: 0.6, salvo: 4, salvoDelay: 0.07, color: REB }),
        {
          name: 'Proton Torpedoes', kind: 'missile', dmg: 260, pen: 175, range: 560, cd: 7.5,
          salvo: 2, salvoDelay: 0.45, speed: 420, turnRate: 2.2, splash: 20,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        }
      ]
    }),

    /* ================ IMPERIAL NAVY (faction 1) ================ */

    tie: unit({
      name: 'TIE Fighter', faction: 1, domain: SHIP, cost: 40, hp: 75, armor: 5,
      speed: 215, radius: 9, shape: 'tie', move: 'fixedwing', turnRate: 2.8,
      role: 'Swarm fighter', tags: ['fighter'],
      desc: 'No shields, no hyperdrive, no life support worth the name — everything the ' +
        'Empire could delete to make it cheap and quick. Individually it is nothing. The ' +
        'Empire does not buy them individually.',
      weapons: [laser({ dmg: 10, pen: 17, range: 310, cd: 0.4, salvo: 2, salvoDelay: 0.08, color: IMP })]
    }),

    tieint: unit({
      name: 'TIE Interceptor', faction: 1, domain: SHIP, cost: 120, hp: 110, armor: 6,
      speed: 275, radius: 10, shape: 'tieint', move: 'fixedwing', turnRate: 3.0,
      role: 'Interceptor', tags: ['fighter'],
      desc: 'Four cannons in the wingtips and an engine profile that will run down anything ' +
        'the Alliance flies except an A-wing. Still unshielded, so it wins by killing first.',
      weapons: [laser({ dmg: 15, pen: 25, range: 330, cd: 0.4, salvo: 4, salvoDelay: 0.06, color: IMP })]
    }),

    tiebomber: unit({
      name: 'TIE Bomber', faction: 1, domain: SHIP, cost: 170, hp: 260, armor: 22,
      speed: 140, radius: 12, shape: 'tiebomber', move: 'fixedwing', turnRate: 1.4,
      role: 'Torpedo bomber', tags: ['fighter'],
      desc: 'The one TIE variant with armour on it, because it has to survive the run in. ' +
        'A full rack of proton bombs erases a corvette and puts a real dent in anything ' +
        'larger — but they will not arm against small craft, so an interceptor on its tail ' +
        'meets two light cannons and nothing else.',
      weapons: [
        laser({ dmg: 10, pen: 16, range: 280, cd: 0.6, salvo: 2, salvoDelay: 0.09, color: IMP, prefersTag: null }),
        {
          name: 'Proton Bombs', kind: 'missile', dmg: 330, pen: 190, range: 500, cd: 7.5,
          salvo: 3, salvoDelay: 0.35, speed: 380, turnRate: 1.9, splash: 30,
          targets: SHIP, onlyTag: 'capital', color: PROTON
        }
      ]
    }),

    gunboat: unit({
      name: 'Assault Gunboat', faction: 1, domain: SHIP, cost: 215, hp: 320, armor: 24,
      speed: 200, radius: 11, shape: 'gunboat', move: 'fixedwing', turnRate: 2.0,
      role: 'Missile boat', tags: ['fighter'],
      desc: 'A shielded patrol craft with warheads where the cargo should be. It is the ' +
        'Imperial answer to a Rebel bomber that outranges its own escorts — fast enough to ' +
        'catch one, armed well enough to end it.',
      weapons: [
        laser({ dmg: 16, pen: 28, range: 340, cd: 0.55, salvo: 2, salvoDelay: 0.08, color: IMP }),
        {
          name: 'Heavy Concussion Missiles', kind: 'missile', dmg: 195, pen: 108, range: 520, cd: 6.0,
          salvo: 2, salvoDelay: 0.35, speed: 460, turnRate: 2.8, splash: 22,
          targets: SHIP, color: CONC
        }
      ]
    }),

    shuttle: unit({
      name: 'Lambda-class Shuttle', faction: 1, domain: SHIP, cost: 250, hp: 720, armor: 24,
      speed: 105, radius: 14, shape: 'shuttle', move: 'ground', turnRate: 1.1,
      role: 'Repair tender', tags: ['capital'],
      desc: 'A staff shuttle pressed into fleet-service work, running repair crews to whatever ' +
        'is worst hit nearby. Quicker off the mark than the Rebel tender and half as tough.',
      weapons: [
        { name: 'Repair Crews', kind: 'repair', dmg: 40, range: 195, cd: 1.0, targets: 0, color: '#8effc0' }
      ]
    }),

    golan: unit({
      name: 'Golan Defence Platform', faction: 1, domain: SHIP, cost: 300, hp: 2500, armor: 62,
      speed: 0, radius: 17, shape: 'platform', move: 'static', turnRate: 1.2,
      role: 'Static heavy battery', tags: ['capital'],
      desc: 'An orbital weapons station: no drives at all, armour like a capital ship, and a ' +
        'turbolaser battery that covers most of the field. It only earns its price where the ' +
        'fighting is going to come to it.',
      weapons: [
        turbolaser({
          name: 'Station Turbolasers', dmg: 300, pen: 155, range: 960, cd: 4.4,
          salvo: 2, salvoDelay: 0.28, splash: 34, color: IMP, tracerWidth: 4
        }),
        pointDefence({ dmg: 14, pen: 23, range: 400, cd: 0.11, color: IMP })
      ]
    }),

    gozanti: unit({
      name: 'Gozanti Cruiser', faction: 1, domain: SHIP, cost: 340, hp: 1150, armor: 28,
      speed: 90, radius: 16, shape: 'escort', move: 'ground', turnRate: 0.9,
      role: 'Light escort carrier', tags: ['capital'],
      desc: 'A customs cruiser with TIE clamps under the hull. Two fighters, a light battery ' +
        'and nothing else — the cheapest way to put a fighter screen in front of a fleet that ' +
        'has already spent everything on Star Destroyers.',
      squadron: { type: 'tiew', count: 2, respawn: 22, reserve: 2 },
      weapons: [
        turbolaser({ name: 'Light Turbolasers', dmg: 105, pen: 76, range: 520, cd: 2.6, splash: 12, color: IMP, tracerWidth: 2.6 }),
        pointDefence({ dmg: 13, pen: 21, range: 380, cd: 0.12, color: IMP })
      ]
    }),

    tiedef: unit({
      name: 'TIE Defender', faction: 1, domain: SHIP, cost: 350, hp: 400, armor: 20,
      speed: 255, radius: 12, shape: 'tiedef', move: 'fixedwing', turnRate: 2.7,
      role: 'Elite fighter', tags: ['fighter'],
      desc: 'Three wings, shields, and every weapon the Empire could hang off a starfighter. ' +
        'It outclasses anything in the sky one-for-one and costs as much as eight TIEs, which ' +
        'is the argument the Imperial Navy keeps having with itself.',
      weapons: [
        laser({ dmg: 18, pen: 34, range: 370, cd: 0.5, salvo: 4, salvoDelay: 0.06, color: IMP, tracerWidth: 2 }),
        {
          name: 'Ion Cannon', kind: 'tracer', dmg: 95, pen: 200, range: 440, cd: 3.0,
          salvo: 2, salvoDelay: 0.25, speed: 720, spread: 0.035,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 2.6
        },
        {
          name: 'Concussion Missiles', kind: 'missile', dmg: 165, pen: 92, range: 480, cd: 6.0,
          salvo: 2, salvoDelay: 0.3, speed: 470, turnRate: 3.0, splash: 18,
          targets: SHIP, color: CONC
        }
      ]
    }),

    raider: unit({
      name: 'Raider-class Corvette', faction: 1, domain: SHIP, cost: 460, hp: 1650, armor: 36,
      speed: 108, radius: 17, shape: 'raider', move: 'ground', turnRate: 0.9,
      role: 'Anti-starfighter corvette', tags: ['capital'],
      desc: 'The Empire\'s admission that TIE swarms cannot be everywhere. Built around ' +
        'missile tubes and a heavy point-defence fit, it exists to catch bombers before they ' +
        'reach the line — and it is dangerously thin against another warship.',
      weapons: [
        turbolaser({ dmg: 150, pen: 96, range: 600, cd: 2.5, salvo: 2, salvoDelay: 0.25, splash: 16, color: IMP }),
        {
          name: 'Missile Tubes', kind: 'missile', dmg: 175, pen: 95, range: 640, cd: 5.5,
          salvo: 3, salvoDelay: 0.3, speed: 470, turnRate: 3.0, splash: 20,
          targets: SHIP, onlyTag: 'fighter', color: CONC
        },
        pointDefence({ dmg: 16, pen: 26, range: 450, cd: 0.1, color: IMP })
      ]
    }),

    arquitens: unit({
      name: 'Arquitens Light Cruiser', faction: 1, domain: SHIP, cost: 650, hp: 2500, armor: 46,
      speed: 84, radius: 20, shape: 'escort', move: 'ground', turnRate: 0.62,
      role: 'Line escort', tags: ['capital'],
      desc: 'A compact command cruiser that screens the heavy ships. Turbolasers out of ' +
        'proportion to its size, enough plating to stay in the line, and no fighters of its ' +
        'own to speak of.',
      weapons: [
        turbolaser({ dmg: 245, pen: 134, range: 780, cd: 3.6, salvo: 2, salvoDelay: 0.3, splash: 26, color: IMP, tracerWidth: 3.6 }),
        pointDefence({ dmg: 14, pen: 23, range: 410, cd: 0.1, color: IMP })
      ]
    }),

    victory: unit({
      name: 'Victory-class Destroyer', faction: 1, domain: SHIP, cost: 1100, hp: 4300, armor: 60,
      speed: 58, radius: 26, shape: 'wedge', move: 'ground', turnRate: 0.4,
      role: 'Medium capital', tags: ['capital'],
      desc: 'The older, smaller wedge — built for planetary bombardment and never quite fast ' +
        'enough for fleet work. Its concussion tubes are the reason it is still in service: ' +
        'they reach past most escorts and hit like a bomber wing.',
      weapons: [
        turbolaser({ dmg: 265, pen: 145, range: 900, cd: 4.4, salvo: 2, salvoDelay: 0.3, splash: 32, color: IMP, tracerWidth: 3.8 }),
        {
          name: 'Concussion Tubes', kind: 'missile', dmg: 215, pen: 118, range: 760, cd: 6.5,
          salvo: 4, salvoDelay: 0.28, speed: 430, turnRate: 2.2, splash: 26,
          targets: SHIP, prefersTag: 'capital', color: CONC
        },
        pointDefence({ dmg: 14, pen: 23, range: 420, cd: 0.1, color: IMP })
      ]
    }),

    isd: unit({
      name: 'Imperial-class Destroyer', faction: 1, domain: SHIP, cost: 2000, hp: 7000, armor: 78,
      speed: 46, radius: 34, shape: 'wedge', move: 'ground', turnRate: 0.28,
      role: 'Fleet capital', tags: ['capital'],
      desc: 'A kilometre and a half of hull, the heaviest turbolaser battery in the game, and ' +
        'six TIEs off the hangar deck with more on the racks. Nothing kills it quickly except ' +
        'massed torpedoes — so the whole Rebel plan is to get bombers past the point defence.',
      squadron: { type: 'tiew', count: 6, respawn: 14, reserve: 6 },
      weapons: [
        turbolaser({
          name: 'Heavy Turbolasers', dmg: 385, pen: 178, range: 1150, cd: 5.2,
          salvo: 3, salvoDelay: 0.3, splash: 42, color: IMP, tracerWidth: 4.4
        }),
        {
          name: 'Ion Batteries', kind: 'tracer', dmg: 145, pen: 210, range: 850, cd: 3.4,
          salvo: 2, salvoDelay: 0.3, speed: 760, spread: 0.03,
          targets: SHIP, onlyTag: 'capital', color: ION, tracerWidth: 3
        },
        pointDefence({ dmg: 16, pen: 26, range: 460, cd: 0.1, color: IMP }),
        pointDefence({ name: 'Quad Batteries', dmg: 16, pen: 26, range: 460, cd: 0.1, color: IMP })
      ]
    }),

    /* Flown off the Imperial-class and the Gozanti. Not for sale — see xwingw. */
    tiew: unit({
      name: 'TIE Fighter', faction: 1, domain: SHIP, cost: 0, hp: 75, armor: 5, hidden: true,
      speed: 215, radius: 9, shape: 'tie', move: 'fixedwing', turnRate: 2.8,
      role: 'Carried starfighter', tags: ['fighter'],
      desc: 'A flight launched off a warship rather than bought as part of the order of battle.',
      weapons: [laser({ dmg: 10, pen: 17, range: 310, cd: 0.4, salvo: 2, salvoDelay: 0.08, color: IMP })]
    })
  };
})(window);
