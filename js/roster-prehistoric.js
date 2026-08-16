/* World of War: Prehistoric — dinosaurs and the rest of the fossil record.
 *
 * Structured like Earth rather than like Animals: three domains, and both sides
 * buy from the same list, so a battle is decided by composition and ground
 * rather than by which faction you were handed.
 *
 * Almost everything is melee, so `range` is reach — the gap between two bodies,
 * not between their centres — and what matters is who closes, how many arrive,
 * and whether their teeth can get through hide. Two things break that rule and
 * both are deliberate:
 *
 *   - Dilophosaurus spits venom. It is the only weapon in the edition with real
 *     standoff, which makes it the only unit that can hurt something it is not
 *     touching.
 *   - Reach still varies a lot. An Elasmosaurus swings a neck twice as long as
 *     anything else's bite, so it hits first and hits things standing on the
 *     shore — or flying low over it.
 *
 * Snakes run the length of the roster — Sanajeh raiding nests, Titanoboa in the
 * swamp and Palaeophis in the shallows. All three constrict rather than shear, so
 * their `dmg` is high for the price and their `pen` deliberately is not: a coil
 * that folds a Parasaurolophus still slides off an Ankylosaur's scutes.
 *
 * Domain reach, and why the three lists need each other
 * -----------------------------------------------------
 * Marine reptiles cannot leave the water and the herds cannot enter it, so on a
 * map with a coast the two lists fight past each other unless something bridges
 * the gap. Three things do. Flyers ignore terrain entirely. The big marine
 * predators target GROUND, so anything that walks along the shoreline is inside
 * their reach. And Spinosaurus targets GROUND from the bank, which is the only
 * land unit that can bite something swimming.
 *
 * Anti-air is scarce on purpose. Most of the herd cannot reach a pterosaur at
 * all; the ones that can — raptors leaping, a sabre cat, a Tyrannosaur's head at
 * six metres, the venom spitter — say so with `targets: ALL`.
 *
 * Nothing dies here either: a beaten animal breaks and runs, which the edition's
 * `defeat: 'flee'` setting handles.
 *
 * See js/units.js for the damage model and what each stat means.
 */
(function (W) {
  'use strict';

  const U = W.Units;
  const unit = U.unit;
  const LAND = U.LAND, SEA = U.SEA, AIR = U.AIR, GROUND = U.GROUND, ALL = U.ALL;

  /* Melee attacks resolve on contact — no projectile, so `range` is reach. */
  function bite(def) {
    return Object.assign({ kind: 'melee', name: 'Bite', speed: 0, spread: 0, targets: GROUND }, def);
  }

  W.RosterPrehistoric = {

    /* ==================== LAND ==================== */

    compsognathus: unit({
      name: 'Compsognathus', domain: LAND, cost: 12, hp: 34, armor: 1,
      speed: 108, radius: 7, shape: 'theropod', turnRate: 7,
      role: 'Swarm chaff',
      desc: 'Chicken-sized and worth nothing on its own. Thirty of them arriving at once is how a cheap army drags down something enormous.',
      weapons: [bite({ name: 'Nip', dmg: 6, pen: 4, range: 26, cd: 0.55 })]
    }),

    gallimimus: unit({
      name: 'Gallimimus', domain: LAND, cost: 26, hp: 78, armor: 2,
      speed: 142, radius: 10, shape: 'theropod', turnRate: 6,
      role: 'Outrunner',
      desc: 'The fastest thing on two legs. Built to get behind a herd and trample whatever soft units are standing there.',
      weapons: [bite({ name: 'Kick', dmg: 13, pen: 9, range: 30, cd: 0.6 })]
    }),

    sanajeh: unit({
      name: 'Sanajeh', domain: LAND, cost: 44, hp: 120, armor: 4,
      speed: 84, radius: 9, shape: 'serpent', turnRate: 5,
      role: 'Nest raider',
      desc: 'A three metre snake that made its living inside other animals\' nests. Cheap, quiet and a real problem for anything soft it can get a coil around.',
      weapons: [bite({ name: 'Coil', dmg: 24, pen: 20, range: 28, cd: 0.75 })]
    }),

    velociraptor: unit({
      name: 'Velociraptor', domain: LAND, cost: 48, hp: 110, armor: 4,
      speed: 132, radius: 10, shape: 'theropod', turnRate: 6.5,
      role: 'Pack hunter',
      desc: 'Cheap, quick and it leaps — one of the few things on the ground that can pull a pterosaur out of the air.',
      weapons: [bite({ name: 'Sickle Claw', dmg: 26, pen: 22, range: 30, cd: 0.5, targets: ALL })]
    }),

    parasaurolophus: unit({
      name: 'Parasaurolophus', domain: LAND, cost: 60, hp: 280, armor: 12,
      speed: 76, radius: 13, shape: 'theropod', turnRate: 4,
      role: 'Herd body',
      desc: 'A big herbivore that fights only because it has been cornered. Cheap bulk to put in front of the things that can actually kill.',
      weapons: [bite({ name: 'Trample', dmg: 30, pen: 24, range: 32, cd: 0.85 })]
    }),

    dilophosaurus: unit({
      name: 'Dilophosaurus', domain: LAND, cost: 85, hp: 130, armor: 4,
      speed: 100, radius: 11, shape: 'theropod', turnRate: 5,
      role: 'Venom spitter',
      desc: 'The only thing in the edition that can hurt something it is not touching. Blinding spit that reaches the sky as well as the ground — and paper-thin the moment anything closes.',
      weapons: [
        { name: 'Venom Spit', dmg: 24, pen: 28, range: 195, cd: 0.85, spread: 0.06, targets: ALL, color: '#a8e85a', tracerWidth: 2.2 },
        bite({ name: 'Bite', dmg: 20, pen: 16, range: 30, cd: 0.7 })
      ]
    }),

    pachycephalosaurus: unit({
      name: 'Pachycephalosaurus', domain: LAND, cost: 95, hp: 310, armor: 18,
      speed: 88, radius: 12, shape: 'theropod', turnRate: 4.4,
      role: 'Battering ram',
      desc: 'Twenty-five centimetres of solid bone on the front of its skull, moving at a run. Cheapest way to crack something armoured.',
      weapons: [bite({ name: 'Head Ram', dmg: 56, pen: 42, range: 32, cd: 1.0 })]
    }),

    smilodon: unit({
      name: 'Smilodon', domain: LAND, cost: 130, hp: 265, armor: 10,
      speed: 138, radius: 12, shape: 'quadruped', turnRate: 5.5,
      role: 'Assassin',
      desc: 'Sabre teeth go through hide that stops a bite twice their size. Fast enough to pick its target, and it will take a low flyer on the way.',
      weapons: [bite({ name: 'Sabre Bite', dmg: 66, pen: 58, range: 34, cd: 0.65, targets: ALL })]
    }),

    stegosaurus: unit({
      name: 'Stegosaurus', domain: LAND, cost: 170, hp: 640, armor: 30,
      speed: 44, radius: 15, shape: 'stegosaur', turnRate: 2.2,
      role: 'Tail spikes',
      desc: 'Four metre spikes on the end of a tail it swings through everything standing nearby. Slow, and it has to be reached to matter.',
      weapons: [bite({ name: 'Thagomizer', dmg: 96, pen: 64, range: 40, cd: 1.2, splash: 26 })]
    }),

    allosaurus: unit({
      name: 'Allosaurus', domain: LAND, cost: 215, hp: 540, armor: 18,
      speed: 96, radius: 14, shape: 'theropod', turnRate: 4.4,
      role: 'Line predator',
      desc: 'The efficient middle of the roster — fast enough to flank, armed well enough to threaten anything short of the armoured heavies, and tall enough to snap at something flying low.',
      weapons: [bite({ name: 'Bite', dmg: 80, pen: 66, range: 36, cd: 0.7, targets: ALL })]
    }),

    ankylosaurus: unit({
      name: 'Ankylosaurus', domain: LAND, cost: 255, hp: 920, armor: 54,
      speed: 40, radius: 15, shape: 'ankylosaur', turnRate: 2.0,
      role: 'Walking fortress',
      desc: 'Small teeth simply bounce off the scutes. In exchange it arrives late to everything, and it swings a bone club at whatever is left when it does.',
      weapons: [bite({ name: 'Tail Club', dmg: 110, pen: 74, range: 40, cd: 1.4, splash: 30 })]
    }),

    titanoboa: unit({
      name: 'Titanoboa', domain: LAND, cost: 285, hp: 900, armor: 20,
      speed: 58, radius: 17, shape: 'serpent', turnRate: 3.2,
      role: 'Constrictor',
      desc: 'Thirteen metres and a tonne of snake, and the hardest squeeze anything here will ever be in. It crushes rather than cuts, so the armoured herbivores are the one thing it cannot simply fold up.',
      weapons: [bite({ name: 'Constriction', dmg: 175, pen: 84, range: 42, cd: 1.7 })]
    }),

    triceratops: unit({
      name: 'Triceratops', domain: LAND, cost: 300, hp: 840, armor: 40,
      speed: 76, radius: 16, shape: 'ceratopsian', turnRate: 2.6,
      role: 'Charging heavy',
      desc: 'Armoured at the front and quick enough to use it. The one herbivore that goes through a line rather than waiting behind it.',
      weapons: [bite({ name: 'Horn Charge', dmg: 122, pen: 90, range: 40, cd: 1.1, splash: 18 })]
    }),

    mammoth: unit({
      name: 'Woolly Mammoth', domain: LAND, cost: 360, hp: 1050, armor: 36,
      speed: 66, radius: 18, shape: 'beast', turnRate: 2.2,
      role: 'Heavy',
      desc: 'Ten tonnes behind four metres of tusk. Absorbs an absurd amount of biting and flattens a whole rank at a time.',
      weapons: [bite({ name: 'Tusks', dmg: 130, pen: 92, range: 44, cd: 1.25, splash: 24 })]
    }),

    spinosaurus: unit({
      name: 'Spinosaurus', domain: LAND, cost: 450, hp: 1150, armor: 32,
      speed: 84, radius: 18, shape: 'sailback', turnRate: 3.0,
      role: 'Riverbank hunter',
      desc: 'The longest predator that ever walked, and the only land animal here that fishes. Jaws for one target and a set of hooked claws for whatever is pressed in around it — and it will wade in to take a marine reptile off the shallows.',
      weapons: [
        bite({ name: 'Crocodile Jaws', dmg: 152, pen: 110, range: 46, cd: 1.0 }),
        bite({ name: 'Hooked Claws', dmg: 74, pen: 62, range: 44, cd: 1.3, splash: 22 })
      ]
    }),

    trex: unit({
      name: 'Tyrannosaurus Rex', domain: LAND, cost: 560, hp: 1600, armor: 38,
      speed: 90, radius: 19, shape: 'theropod', turnRate: 2.8,
      role: 'Apex predator',
      desc: 'The hardest single bite in the game, on a body fast enough to catch what it is aimed at. Its head is six metres up, so the sky is not safe either.',
      weapons: [bite({ name: 'Killing Bite', dmg: 250, pen: 150, range: 46, cd: 1.3, targets: ALL })]
    }),

    brachiosaurus: unit({
      name: 'Brachiosaurus', domain: LAND, cost: 620, hp: 2700, armor: 44,
      speed: 38, radius: 24, shape: 'sauropod', turnRate: 1.2,
      role: 'Living wall',
      desc: 'Nothing on the field can chew through it in a hurry, and everything underneath it gets stepped on. Its head is twelve metres up, so it is also the one thing in a herd that can swat a pterosaur out of the air — and it will take most of the battle to arrive.',
      weapons: [
        bite({ name: 'Stomp', dmg: 165, pen: 82, range: 48, cd: 1.8, splash: 38 }),
        bite({ name: 'Neck Sweep', dmg: 70, pen: 60, range: 52, cd: 1.4, targets: AIR })
      ]
    }),

    /* ==================== AIR ==================== */

    meganeura: unit({
      name: 'Meganeura', domain: AIR, cost: 14, hp: 30, armor: 0,
      speed: 152, radius: 7, shape: 'dragonfly', move: 'hover', turnRate: 6.5, accel: 250,
      role: 'Insect swarm',
      desc: 'A dragonfly with a seventy centimetre wingspan. Achieves nothing alone and ignores every hedge, river and cliff on the field.',
      weapons: [bite({ name: 'Mandibles', dmg: 6, pen: 5, range: 26, cd: 0.5, targets: ALL })]
    }),

    microraptor: unit({
      name: 'Microraptor', domain: AIR, cost: 32, hp: 62, armor: 1,
      speed: 126, radius: 8, shape: 'bird', move: 'hover', turnRate: 5.5, accel: 230,
      role: 'Glider',
      desc: 'Four wings and a set of claws on each of them. Cheap air cover for an army that cannot spare the points for a real pterosaur.',
      weapons: [bite({ name: 'Claws', dmg: 15, pen: 11, range: 28, cd: 0.55, targets: ALL })]
    }),

    rhamphorhynchus: unit({
      name: 'Rhamphorhynchus', domain: AIR, cost: 62, hp: 110, armor: 5,
      speed: 158, radius: 9, shape: 'pterosaur', move: 'hover', turnRate: 5, accel: 250,
      role: 'Air harasser',
      desc: 'A mouthful of forward-pointing needles on something quick enough to be somewhere else before the reply lands.',
      weapons: [bite({ name: 'Needle Teeth', dmg: 30, pen: 24, range: 30, cd: 0.55, targets: ALL })]
    }),

    pteranodon: unit({
      name: 'Pteranodon', domain: AIR, cost: 135, hp: 210, armor: 14,
      speed: 142, radius: 12, shape: 'pterosaur', move: 'hover', turnRate: 4.4, accel: 220,
      role: 'Air superiority',
      desc: 'Seven metres of wing that owns the sky over an army with no answer to it. Only the leapers and the spitter make it think twice.',
      weapons: [bite({ name: 'Beak Strike', dmg: 60, pen: 46, range: 34, cd: 0.7, targets: ALL })]
    }),

    quetzalcoatlus: unit({
      name: 'Quetzalcoatlus', domain: AIR, cost: 300, hp: 430, armor: 16,
      speed: 124, radius: 16, shape: 'pterosaur', move: 'hover', turnRate: 3.2, accel: 180,
      role: 'Heavy flyer',
      desc: 'As tall as a giraffe with the wingspan of a small aircraft. It stalks on the wing and spears whatever it lands next to — and the small flyers cannot bite hard enough to bring it down.',
      weapons: [bite({ name: 'Spear Beak', dmg: 112, pen: 86, range: 40, cd: 0.85, targets: ALL })]
    }),

    /* ==================== SEA ==================== */

    ammonite: unit({
      name: 'Ammonite', domain: SEA, cost: 18, hp: 95, armor: 16,
      speed: 28, radius: 9, shape: 'ammonite', move: 'naval', turnRate: 2.0, accel: 40,
      role: 'Drifting chaff',
      desc: 'Barely moves and barely bites, but the shell is real armour at a price nothing else touches. A cheap screen for the things behind it.',
      weapons: [bite({ name: 'Tentacles', dmg: 11, pen: 8, range: 28, cd: 0.9, targets: SEA })]
    }),

    ichthyosaur: unit({
      name: 'Ichthyosaur', domain: SEA, cost: 80, hp: 195, armor: 8,
      speed: 132, radius: 12, shape: 'fish', move: 'naval', turnRate: 3.0, accel: 95,
      role: 'Fast hunter',
      desc: 'Shaped like a dolphin and quicker than anything else in the water. Catches the slow armoured things before they reach the fight.',
      weapons: [bite({ name: 'Snap', dmg: 34, pen: 30, range: 30, cd: 0.55, targets: SEA })]
    }),

    archelon: unit({
      name: 'Archelon', domain: SEA, cost: 125, hp: 640, armor: 46,
      speed: 42, radius: 14, shape: 'shelled', move: 'naval', turnRate: 1.4, accel: 40,
      role: 'Armoured screen',
      desc: 'A four metre sea turtle. Nothing cheap gets through the shell, and it will spend most of the battle deciding where to be.',
      weapons: [bite({ name: 'Beak', dmg: 42, pen: 32, range: 32, cd: 1.2, targets: SEA })]
    }),

    palaeophis: unit({
      name: 'Palaeophis', domain: SEA, cost: 145, hp: 380, armor: 10,
      speed: 116, radius: 13, shape: 'serpent', move: 'naval', turnRate: 2.6, accel: 90,
      role: 'Shallows hunter',
      desc: 'Nine metres of sea snake, and the cheapest thing in the water that can take something walking the shoreline. Quick, and far too thin-skinned to trade with the armoured swimmers.',
      weapons: [bite({ name: 'Strike', dmg: 74, pen: 76, range: 36, cd: 0.7 })]
    }),

    dunkleosteus: unit({
      name: 'Dunkleosteus', domain: SEA, cost: 175, hp: 530, armor: 34,
      speed: 78, radius: 14, shape: 'armourfish', move: 'naval', turnRate: 2.2, accel: 70,
      role: 'Armoured predator',
      desc: 'Bony plates instead of a face, and shearing jaws behind them. The efficient answer to anything else with armour.',
      weapons: [bite({ name: 'Shearing Jaws', dmg: 106, pen: 90, range: 34, cd: 1.0, targets: SEA })]
    }),

    elasmosaurus: unit({
      name: 'Elasmosaurus', domain: SEA, cost: 210, hp: 480, armor: 18,
      speed: 86, radius: 15, shape: 'plesiosaur', move: 'naval', turnRate: 2.0, accel: 60,
      role: 'Long reach',
      desc: 'A neck longer than the rest of it. Strikes from well outside anything else\'s reach — so it fights from the second rank — and plucks flyers and shoreline stragglers off the surface.',
      weapons: [bite({ name: 'Long Neck', dmg: 78, pen: 58, range: 64, cd: 0.75, targets: ALL })]
    }),

    mosasaurus: unit({
      name: 'Mosasaurus', domain: SEA, cost: 400, hp: 1300, armor: 30,
      speed: 108, radius: 18, shape: 'mosasaur', move: 'naval', turnRate: 2.2, accel: 80,
      role: 'Apex marine',
      desc: 'Fifteen metres of lizard built for open water. It lunges clean out of it, so a coastal line is inside its reach and so is anything flying low over the shallows.',
      weapons: [bite({ name: 'Lunge', dmg: 178, pen: 122, range: 46, cd: 1.1, targets: ALL })]
    }),

    megalodon: unit({
      name: 'Megalodon', domain: SEA, cost: 540, hp: 1850, armor: 38,
      speed: 100, radius: 21, shape: 'shark', move: 'naval', turnRate: 1.8, accel: 60,
      role: 'Ocean apex',
      desc: 'The largest set of teeth that has ever existed, on eighteen metres of shark. Nothing in the water survives a second pass, and anything walking the shoreline is inside its reach — but it cannot touch the sky.',
      weapons: [bite({ name: 'Devour', dmg: 305, pen: 165, range: 50, cd: 1.35 })]
    })
  };
})(window);
