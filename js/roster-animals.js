/* World of War: Animals — Household Pets against Killer Animals.
 *
 * Two asymmetric factions: `faction: 0` units are only buyable by Household Pets,
 * `faction: 1` only by Killer Animals. Everything here is melee, so range is
 * reach — roughly the two animals' radii plus a nose — and fights are decided by
 * who closes, how many bodies arrive, and whether their bite can get through hide.
 *
 * Nothing dies. A defeated animal turns tail and bolts off the field, which the
 * edition's `defeat: 'flee'` setting handles.
 *
 * Balance shape: Pets are cheap and numerous with low `pen`, so a swarm struggles
 * to bite through a Rhino's hide and needs its own heavies. Killers are expensive
 * and armoured but can be dragged down by weight of numbers.
 */
(function (W) {
  'use strict';

  const U = W.Units;
  const unit = U.unit;
  const LAND = U.LAND, AIR = U.AIR, GROUND = U.GROUND, ALL = U.ALL;

  /* Melee attacks resolve on contact — no projectile, so `range` is reach. */
  function bite(def) {
    return Object.assign({ kind: 'melee', name: 'Bite', speed: 0, spread: 0, targets: GROUND }, def);
  }

  W.RosterAnimals = {

    /* ==================== HOUSEHOLD PETS (faction 0) ==================== */

    hamster: unit({
      name: 'Hamster', faction: 0, domain: LAND, cost: 8, hp: 26, armor: 0,
      speed: 62, radius: 6, shape: 'critter', turnRate: 7,
      role: 'Pocket chaff',
      desc: 'Costs almost nothing and achieves almost nothing alone. Twenty of them underfoot is a different problem.',
      weapons: [bite({ name: 'Nibble', dmg: 4, pen: 2, range: 26, cd: 0.7 })]
    }),

    pigeon: unit({
      name: 'Pigeon', faction: 0, domain: AIR, cost: 12, hp: 30, armor: 0,
      speed: 118, radius: 7, shape: 'bird', move: 'hover', turnRate: 5, accel: 220,
      role: 'Flock filler',
      desc: 'Ignores every fence and hedge on the field. Harmless individually, genuinely annoying in a flock.',
      weapons: [bite({ name: 'Peck', dmg: 5, pen: 3, range: 28, cd: 0.6, targets: ALL })]
    }),

    rabbit: unit({
      name: 'Rabbit', faction: 0, domain: LAND, cost: 16, hp: 44, armor: 1,
      speed: 96, radius: 8, shape: 'critter', turnRate: 6.5,
      role: 'Fast chaff',
      desc: 'The quickest thing in the garden. Gets across open ground before anything slow can line it up.',
      weapons: [bite({ name: 'Kick', dmg: 7, pen: 4, range: 28, cd: 0.65 })]
    }),

    budgie: unit({
      name: 'Budgie', faction: 0, domain: AIR, cost: 20, hp: 34, armor: 0,
      speed: 140, radius: 7, shape: 'bird', move: 'hover', turnRate: 6, accel: 260,
      role: 'Harasser',
      desc: 'Darts in, pecks, and is somewhere else before the reply arrives. Anything that can catch birds ends it instantly.',
      weapons: [bite({ name: 'Peck', dmg: 9, pen: 6, range: 28, cd: 0.42, targets: ALL })]
    }),

    housecat: unit({
      name: 'House Cat', faction: 0, domain: LAND, cost: 30, hp: 70, armor: 2,
      speed: 88, radius: 9, shape: 'quadruped', turnRate: 6,
      role: 'Bird catcher',
      desc: 'The only cheap answer to anything with wings — it will pull a bird out of the air without breaking stride.',
      weapons: [bite({ name: 'Claws', dmg: 13, pen: 9, range: 32, cd: 0.5, targets: ALL })]
    }),

    ferret: unit({
      name: 'Ferret', faction: 0, domain: LAND, cost: 34, hp: 60, armor: 1,
      speed: 104, radius: 8, shape: 'critter', turnRate: 7,
      role: 'Flanker',
      desc: 'Fast and vicious for its size. Built to get past the front line and into whatever is standing behind it.',
      weapons: [bite({ name: 'Bite', dmg: 18, pen: 14, range: 30, cd: 0.55 })]
    }),

    terrier: unit({
      name: 'Terrier', faction: 0, domain: LAND, cost: 42, hp: 105, armor: 3,
      speed: 84, radius: 10, shape: 'quadruped', turnRate: 5.5,
      role: 'Scrapper',
      desc: 'Has no idea how small it is. The cheapest pet that can actually hurt something wild.',
      weapons: [bite({ name: 'Bite', dmg: 24, pen: 18, range: 32, cd: 0.6 })]
    }),

    parrot: unit({
      name: 'Parrot', faction: 0, domain: AIR, cost: 55, hp: 68, armor: 2,
      speed: 122, radius: 9, shape: 'bird', move: 'hover', turnRate: 5, accel: 220,
      role: 'Heavy bird',
      desc: 'A beak that cracks nuts does unpleasant things to an ear. Slower than the little birds and worth shooting at.',
      weapons: [bite({ name: 'Beak', dmg: 26, pen: 20, range: 32, cd: 0.7, targets: ALL })]
    }),

    bulldog: unit({
      name: 'Bulldog', faction: 0, domain: LAND, cost: 78, hp: 260, armor: 12,
      speed: 52, radius: 12, shape: 'quadruped', turnRate: 3.6,
      role: 'Anchor',
      desc: 'Slow, wide and extremely hard to move. Holds the middle of the garden while the small ones do the work.',
      weapons: [bite({ name: 'Locked Jaw', dmg: 34, pen: 26, range: 34, cd: 0.85 })]
    }),

    tortoise: unit({
      name: 'Tortoise', faction: 0, domain: LAND, cost: 64, hp: 300, armor: 30,
      speed: 16, radius: 11, shape: 'shelled', turnRate: 1.6,
      role: 'Walking wall',
      desc: 'Nothing on the field can bite through the shell in a hurry. It will also take most of the battle to arrive.',
      weapons: [bite({ name: 'Snap', dmg: 16, pen: 12, range: 30, cd: 1.3 })]
    }),

    guarddog: unit({
      name: 'Guard Dog', faction: 0, domain: LAND, cost: 120, hp: 300, armor: 14,
      speed: 92, radius: 13, shape: 'quadruped', turnRate: 4.6,
      role: 'Line breaker',
      desc: 'The backbone of any serious pet army — fast, heavy, and the one pet that trades evenly with a wolf.',
      weapons: [bite({ name: 'Bite', dmg: 52, pen: 40, range: 36, cd: 0.75 })]
    }),

    pig: unit({
      name: 'Pot-Bellied Pig', faction: 0, domain: LAND, cost: 150, hp: 480, armor: 22,
      speed: 46, radius: 15, shape: 'beast', turnRate: 2.6,
      role: 'Heavy',
      desc: 'Far more animal than anything else in the house. Soaks punishment that would rout the whole flock.',
      weapons: [bite({ name: 'Barge', dmg: 60, pen: 44, range: 38, cd: 1.0 })]
    }),

    /* ==================== KILLER ANIMALS (faction 1) ==================== */

    vulture: unit({
      name: 'Vulture', faction: 1, domain: AIR, cost: 60, hp: 90, armor: 3,
      speed: 112, radius: 10, shape: 'bird', move: 'hover', turnRate: 4.4, accel: 200,
      role: 'Scavenger',
      desc: 'Circles above the fight and drops on whatever is already losing. Cheap way for a wild army to reach over the line.',
      weapons: [bite({ name: 'Tear', dmg: 30, pen: 24, range: 34, cd: 0.75, targets: ALL })]
    }),

    hyena: unit({
      name: 'Hyena', faction: 1, domain: LAND, cost: 72, hp: 190, armor: 9,
      speed: 96, radius: 11, shape: 'quadruped', turnRate: 5,
      role: 'Pack hunter',
      desc: 'The cheap end of the wild roster. Works in numbers, which is the closest a Killer army gets to a swarm.',
      weapons: [bite({ name: 'Bite', dmg: 38, pen: 30, range: 34, cd: 0.7 })]
    }),

    boar: unit({
      name: 'Wild Boar', faction: 1, domain: LAND, cost: 96, hp: 320, armor: 20,
      speed: 66, radius: 12, shape: 'beast', turnRate: 3,
      role: 'Bruiser',
      desc: 'Tusks and bad temper. Tough enough that small pets simply cannot chew through it.',
      weapons: [bite({ name: 'Tusks', dmg: 48, pen: 36, range: 36, cd: 0.85 })]
    }),

    lynx: unit({
      name: 'Lynx', faction: 1, domain: LAND, cost: 105, hp: 175, armor: 8,
      speed: 108, radius: 11, shape: 'quadruped', turnRate: 6,
      role: 'Bird hunter',
      desc: 'The wild answer to anything airborne, and quick enough to run down a flock before it scatters.',
      weapons: [bite({ name: 'Pounce', dmg: 44, pen: 34, range: 36, cd: 0.6, targets: ALL })]
    }),

    wolf: unit({
      name: 'Wolf', faction: 1, domain: LAND, cost: 130, hp: 290, armor: 14,
      speed: 104, radius: 12, shape: 'quadruped', turnRate: 5,
      role: 'Line fighter',
      desc: 'Fast, durable and hits hard — the standard against which the whole wild roster is priced.',
      weapons: [bite({ name: 'Bite', dmg: 58, pen: 46, range: 36, cd: 0.7 })]
    }),

    eagle: unit({
      name: 'Golden Eagle', faction: 1, domain: AIR, cost: 145, hp: 150, armor: 6,
      speed: 148, radius: 11, shape: 'bird', move: 'hover', turnRate: 5, accel: 260,
      role: 'Air superiority',
      desc: 'Owns the sky outright and can carry off anything small enough. Only a cat or a lynx makes it think twice.',
      weapons: [bite({ name: 'Talons', dmg: 62, pen: 50, range: 36, cd: 0.7, targets: ALL })]
    }),

    cheetah: unit({
      name: 'Cheetah', faction: 1, domain: LAND, cost: 160, hp: 200, armor: 8,
      speed: 168, radius: 12, shape: 'quadruped', turnRate: 5.5,
      role: 'Sprinter',
      desc: 'Nothing on four legs is faster. Crosses the field before the enemy has formed up and goes straight for the soft units.',
      weapons: [bite({ name: 'Throat Bite', dmg: 70, pen: 54, range: 36, cd: 0.62 })]
    }),

    crocodile: unit({
      name: 'Crocodile', faction: 1, domain: LAND, cost: 190, hp: 620, armor: 34,
      speed: 38, radius: 15, shape: 'shelled', turnRate: 1.8,
      role: 'Ambusher',
      desc: 'Armoured like nothing else and bites harder than anything its price. Desperately slow away from water.',
      weapons: [bite({ name: 'Death Roll', dmg: 130, pen: 78, range: 40, cd: 1.5 })]
    }),

    lion: unit({
      name: 'Lion', faction: 1, domain: LAND, cost: 240, hp: 620, armor: 24,
      speed: 88, radius: 15, shape: 'quadruped', turnRate: 3.8,
      role: 'Heavy',
      desc: 'Big, fast and armoured — the unit a pet army has to plan around rather than simply outnumber.',
      weapons: [bite({ name: 'Maul', dmg: 92, pen: 68, range: 40, cd: 0.85 })]
    }),

    bear: unit({
      name: 'Grizzly Bear', faction: 1, domain: LAND, cost: 320, hp: 980, armor: 34,
      speed: 62, radius: 18, shape: 'beast', turnRate: 2.6,
      role: 'Breakthrough',
      desc: 'Absorbs an absurd amount of biting and flattens whatever it reaches. Slow enough to be avoided, if you can afford to.',
      weapons: [bite({ name: 'Swipe', dmg: 120, pen: 82, range: 42, cd: 1.0, splash: 26 })]
    }),

    rhino: unit({
      name: 'Rhinoceros', faction: 1, domain: LAND, cost: 400, hp: 1300, armor: 52,
      speed: 74, radius: 20, shape: 'beast', turnRate: 1.9,
      role: 'Unstoppable',
      desc: 'Hide that small teeth simply cannot penetrate, at a weight that goes through a line rather than round it.',
      weapons: [bite({ name: 'Charge', dmg: 150, pen: 95, range: 44, cd: 1.2, splash: 30 })]
    })
  };
})(window);
