/* World of War: Space — the sound table.
 *
 * See js/sounds-common.js for the builders and the fields.
 *
 * The blaster bolt is the whole identity of this edition, and it is one trick: a
 * fast downward pitch sweep. Everything that shoots here is a variation on it —
 * a laser cannon falls fast and high, a turbolaser falls slowly from somewhere
 * much lower, point defence barely falls at all. Ion weapons break the pattern
 * on purpose, because they are the one thing on the field that is not a bolt.
 *
 * Nothing is muffled by air out here, so the impacts keep their top end where
 * Earth's lose it: more crack and sizzle, less of the low rolling body that a
 * shell landing in a field has. Which is not how vacuum works, and is the only
 * way a space battle has ever been allowed to sound.
 */
(function (W) {
  'use strict';

  const S = W.SoundsCommon;
  const noise = S.noise, tone = S.tone;

  const VOICES = Object.assign({}, S.UI, {

    /* -------------------------- bolts --------------------------- */

    /* A starfighter's laser cannons: the canonical falling sweep, with a bright
     * transient on the front so it reads as a discharge rather than a slide. */
    laser: {
      gain: 0.85, limit: 4, rateVar: 0.07,
      layers: [
        tone({ wave: 'sawtooth', f0: 1900, f1: 250, dur: 0.16, gain: 0.2, attack: 0.002 }),
        tone({ wave: 'square', f0: 950, f1: 170, dur: 0.14, gain: 0.08 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.4, cut0: 5000, cut1: 1400, dur: 0.07, gain: 0.2 })
      ]
    },

    /* Point defence: thinner, higher, and it barely falls — a wall of this is
     * meant to read as a rate rather than as individual shots. */
    pointDefence: {
      gain: 0.7, limit: 4, rateVar: 0.05,
      layers: [
        tone({ wave: 'sawtooth', f0: 2400, f1: 900, dur: 0.07, gain: 0.13, attack: 0.001 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.0, cut0: 6000, cut1: 3000, dur: 0.05, gain: 0.14 })
      ]
    },

    /* A freighter's quad turrets — between a fighter's cannons and a warship's
     * battery, and the one bolt in the edition that sounds hand-aimed. */
    quadLaser: {
      gain: 0.9, limit: 3, rateVar: 0.06,
      layers: [
        tone({ wave: 'sawtooth', f0: 1500, f1: 190, dur: 0.22, gain: 0.22, attack: 0.002 }),
        tone({ wave: 'square', f0: 700, f1: 120, dur: 0.18, gain: 0.09 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.2, cut0: 4200, cut1: 900, dur: 0.09, gain: 0.2 })
      ]
    },

    /* Turbolaser: the same fall, an octave and a half down and three times as
     * long, over a body you feel. A capital ship opening up should be audible
     * through everything the fighter screen is doing. */
    turbolaser: {
      gain: 1, limit: 3, rateVar: 0.05,
      layers: [
        tone({ wave: 'sawtooth', f0: 620, f1: 62, dur: 0.5, gain: 0.3, attack: 0.003 }),
        tone({ wave: 'square', f0: 310, f1: 44, dur: 0.42, gain: 0.12 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 2600, cut1: 200, dur: 0.4, gain: 0.4 }),
        tone({ wave: 'sine', f0: 90, f1: 28, dur: 0.45, gain: 0.3 })
      ]
    },

    /* A station or a Star Destroyer's main battery. Slower still, and with a
     * tail long enough that a broadside overlaps itself. */
    heavyTurbolaser: {
      gain: 1, limit: 2, rateVar: 0.04,
      layers: [
        tone({ wave: 'sawtooth', f0: 430, f1: 40, dur: 0.75, gain: 0.32, attack: 0.004 }),
        tone({ wave: 'square', f0: 215, f1: 32, dur: 0.6, gain: 0.13 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 2200, cut1: 130, dur: 0.65, gain: 0.5 }),
        tone({ wave: 'sine', f0: 68, f1: 20, dur: 0.7, gain: 0.4 })
      ]
    },

    /* --------------------------- ion ---------------------------- */

    /* Ion weapons do not fall — they buzz. A square wave held flat against a
     * rising filter is electrical rather than ballistic, which is exactly the
     * distinction the roster is built on: this is the gun that eats armour
     * instead of hull. */
    ion: {
      gain: 0.9, limit: 3, rateVar: 0.06,
      layers: [
        tone({ wave: 'square', f0: 74, f1: 96, dur: 0.34, gain: 0.16, attack: 0.006 }),
        tone({ wave: 'square', f0: 148, f1: 188, dur: 0.3, gain: 0.1, attack: 0.006 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.6, cut0: 1200, cut1: 5200, dur: 0.36, gain: 0.26, attack: 0.02 })
      ]
    },

    /* The Ion Cannon Platform and the B-wing's heavy mount: the same buzz with
     * a great deal more behind it. */
    heavyIon: {
      gain: 1, limit: 2, rateVar: 0.05,
      layers: [
        tone({ wave: 'square', f0: 48, f1: 68, dur: 0.6, gain: 0.22, attack: 0.01 }),
        tone({ wave: 'square', f0: 96, f1: 134, dur: 0.55, gain: 0.13, attack: 0.01 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.8, cut0: 900, cut1: 4800, dur: 0.62, gain: 0.3, attack: 0.03 }),
        tone({ wave: 'sine', f0: 60, f1: 34, dur: 0.6, gain: 0.24 })
      ]
    },

    /* ------------------------ ordnance --------------------------- */

    /* Proton torpedoes leave the tube on a thump and then climb away. */
    torpedo: {
      gain: 0.9, limit: 2, rateVar: 0.05,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1600, cut1: 280, dur: 0.18, gain: 0.4 }),
        tone({ wave: 'sine', f0: 130, f1: 44, dur: 0.16, gain: 0.26 }),
        noise({ color: 'white', filter: 'bandpass', q: 0.7, cut0: 800, cut1: 3400, dur: 0.6, gain: 0.3, attack: 0.05 }),
        tone({ wave: 'sawtooth', f0: 190, f1: 620, dur: 0.55, gain: 0.09, attack: 0.06 })
      ]
    },

    /* Concussion missiles: lighter, faster off the rail, no thump worth the name. */
    concussion: {
      gain: 0.85, limit: 3, rateVar: 0.07,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.7, cut0: 1000, cut1: 3800, dur: 0.45, gain: 0.34, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 260, f1: 780, dur: 0.4, gain: 0.1, attack: 0.03 })
      ]
    },

    /* The one sound in the game that is allowed to take four seconds. Eight
     * tributary beams spin up over two, then the whole thing goes off — which
     * is the twenty-second reload made audible, and fair warning to whatever is
     * standing in front of it. */
    superlaser: {
      gain: 1, limit: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 110, f1: 440, dur: 2.0, gain: 0.2, attack: 1.4 }),
        tone({ wave: 'sawtooth', f0: 165, f1: 660, dur: 2.0, gain: 0.12, attack: 1.6 }),
        noise({ color: 'white', filter: 'bandpass', q: 3.0, cut0: 600, cut1: 4000, dur: 2.0, gain: 0.18, attack: 1.5 }),
        tone({ wave: 'sawtooth', f0: 900, f1: 30, dur: 1.6, gain: 0.42, attack: 0.01, delay: 2.0 }),
        tone({ wave: 'square', f0: 450, f1: 24, dur: 1.4, gain: 0.2, attack: 0.01, delay: 2.0 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 3000, cut1: 60, dur: 1.8, gain: 0.7, delay: 2.0 }),
        tone({ wave: 'sine', f0: 48, f1: 14, dur: 2.2, gain: 0.5, attack: 0.02, delay: 2.0 })
      ]
    },

    /* Hull repair: a droid chirp, and the only friendly noise in the edition. */
    repair: {
      gain: 0.7, limit: 2,
      layers: [
        tone({ wave: 'square', f0: 880, f1: 1320, dur: 0.06, gain: 0.07, attack: 0.004 }),
        tone({ wave: 'square', f0: 1320, f1: 1100, dur: 0.08, gain: 0.06, attack: 0.004, delay: 0.07 })
      ]
    },

    /* ------------------------- impacts -------------------------- */

    /* Brighter and shorter than Earth's: shields taking a bolt, not a shell
     * cratering a field. */

    impactTick: {
      gain: 0.6, limit: 5, rateVar: 0.16,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.8, cut0: 6000, cut1: 2200, dur: 0.06, gain: 0.24 }),
        tone({ wave: 'square', f0: 1600, f1: 500, dur: 0.05, gain: 0.05 })
      ]
    },

    impactSmall: {
      gain: 0.9, limit: 4, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.9, cut0: 4600, cut1: 700, dur: 0.2, gain: 0.46 }),
        tone({ wave: 'sine', f0: 210, f1: 55, dur: 0.18, gain: 0.26 })
      ]
    },

    impactMed: {
      gain: 1, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 4000, cut1: 260, dur: 0.42, gain: 0.6 }),
        tone({ wave: 'sine', f0: 110, f1: 30, dur: 0.4, gain: 0.44 }),
        noise({ color: 'white', filter: 'highpass', cut0: 2600, dur: 0.3, gain: 0.12, attack: 0.03 })
      ]
    },

    impactBig: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 2800, cut1: 90, dur: 0.85, gain: 0.8 }),
        tone({ wave: 'sine', f0: 74, f1: 18, dur: 0.8, gain: 0.6 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.1, cut0: 3400, cut1: 1200, dur: 0.5, gain: 0.18, attack: 0.04 })
      ]
    },

    /* -------------------- ships coming apart -------------------- */

    /* A starfighter: one flash and it is gone. Short on purpose — at the rate
     * TIEs die, anything longer is a permanent roar. */
    wreckFighter: {
      gain: 0.95, limit: 3, rateVar: 0.08,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 5000, cut1: 300, dur: 0.4, gain: 0.6 }),
        tone({ wave: 'sine', f0: 190, f1: 44, dur: 0.36, gain: 0.4 }),
        noise({ color: 'white', filter: 'highpass', cut0: 3000, dur: 0.25, gain: 0.14, attack: 0.02, delay: 0.04 })
      ]
    },

    /* An escort or a corvette: a real explosion with something left burning. */
    wreckShip: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 3000, cut1: 140, dur: 0.9, gain: 0.8 }),
        tone({ wave: 'sine', f0: 92, f1: 24, dur: 0.85, gain: 0.55 }),
        tone({ wave: 'sawtooth', f0: 140, f1: 40, dur: 0.6, gain: 0.14, attack: 0.03 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 1200, dur: 0.7, gain: 0.16, attack: 0.05, delay: 0.12 })
      ]
    },

    /* A capital ship. Two seconds of a hull failing, which at these prices is
     * the most significant thing that can happen in a battle. */
    wreckCapital: {
      gain: 1, limit: 1,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 2400, cut1: 55, dur: 1.9, gain: 1 }),
        tone({ wave: 'sine', f0: 62, f1: 13, dur: 1.6, gain: 0.7 }),
        tone({ wave: 'sine', f0: 40, f1: 11, dur: 2.1, gain: 0.42, attack: 0.12 }),
        tone({ wave: 'sawtooth', f0: 96, f1: 26, dur: 1.4, gain: 0.14, attack: 0.06 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 900, dur: 1.3, gain: 0.18, attack: 0.1, delay: 0.25 })
      ]
    },

    /* ------------------- the edition's own UI ------------------- */

    /* Engines answering all ahead: a low hum that climbs a fifth and stays
     * there, with the drive noise building underneath it. */
    uiStart: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 55, f1: 82, dur: 1.4, gain: 0.2, attack: 0.3 }),
        tone({ wave: 'sawtooth', f0: 110, f1: 165, dur: 1.3, gain: 0.1, attack: 0.4 }),
        tone({ wave: 'square', f0: 220, f1: 330, dur: 1.1, gain: 0.05, attack: 0.5 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.6, cut0: 400, cut1: 2400, dur: 1.5, gain: 0.14, attack: 0.8 })
      ]
    },

    /* Wide, bright and in fourths — the only place in the game where the
     * fanfare is allowed to be a fanfare. */
    uiWin: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 294, f1: 294, dur: 0.18, gain: 0.14, attack: 0.01 }),
        tone({ wave: 'sawtooth', f0: 392, f1: 392, dur: 0.18, gain: 0.14, attack: 0.01, delay: 0.14 }),
        tone({ wave: 'sawtooth', f0: 587, f1: 587, dur: 1.0, gain: 0.16, attack: 0.01, delay: 0.28 }),
        tone({ wave: 'sawtooth', f0: 392, f1: 392, dur: 1.0, gain: 0.09, attack: 0.02, delay: 0.28 }),
        tone({ wave: 'sine', f0: 147, f1: 147, dur: 1.2, gain: 0.14, attack: 0.02, delay: 0.28 })
      ]
    },

    /* The same intervals soured — a semitone flatter on the top and held. */
    uiLose: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 277, f1: 277, dur: 0.22, gain: 0.13, attack: 0.01 }),
        tone({ wave: 'sawtooth', f0: 233, f1: 233, dur: 0.22, gain: 0.13, attack: 0.01, delay: 0.18 }),
        tone({ wave: 'sawtooth', f0: 185, f1: 183, dur: 1.4, gain: 0.15, attack: 0.03, delay: 0.36 }),
        tone({ wave: 'sine', f0: 92, f1: 91, dur: 1.6, gain: 0.14, attack: 0.05, delay: 0.36 })
      ]
    },

    uiDraw: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 262, f1: 262, dur: 0.3, gain: 0.12, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 349, f1: 349, dur: 1.1, gain: 0.12, attack: 0.03, delay: 0.24 }),
        tone({ wave: 'sine', f0: 131, f1: 131, dur: 1.3, gain: 0.12, attack: 0.04, delay: 0.24 })
      ]
    }
  });

  const BY_KIND = {
    tracer: 'laser',
    missile: 'concussion',
    repair: 'repair'
  };

  W.SoundsSpace = {
    voices: VOICES,

    /* A drive room heard through a bulkhead: a held pitch rather than weather,
     * which is the one bed in the game that is not wind. */
    ambience: {
      color: 'brown', cut: 120, drift: 0.03, gain: 0.05,
      tone: { wave: 'sine', f: 41, gain: 0.5 }
    },

    weapon: function (def) {
      return def.sfx || BY_KIND[def.kind] || 'laser';
    },

    impact: function (size) {
      if (size <= 14) return 'impactTick';
      if (size <= 38) return 'impactSmall';
      if (size <= 78) return 'impactMed';
      return 'impactBig';
    },

    /* Tagged rather than measured: the roster already sorts itself into
     * starfighters and capital ships, and that split is exactly the one the ear
     * wants. Anything untagged is judged on size. */
    death: function (type) {
      const tags = type.tags || [];
      if (tags.indexOf('fighter') >= 0) return 'wreckFighter';
      if (type.radius >= 26 || type.cost >= 1000) return 'wreckCapital';
      return 'wreckShip';
    }
  };
})(window);
