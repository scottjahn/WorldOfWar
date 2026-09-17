/* World of War: Prehistoric — the sound table.
 *
 * Everything here is bigger than it should be, so everything here is lower than
 * it should be. See js/sounds-common.js for the builders and the fields.
 *
 * Almost all melee, like Animals, and beaten animals break and run rather than
 * die — so the death cues are bellows going away. The differences from Animals
 * are scale and domain: a Brachiosaurus stomping is a ground event rather than a
 * bite, the marine reptiles fight underwater and need to sound wet, and one
 * animal on the field actually throws something.
 */
(function (W) {
  'use strict';

  const S = W.SoundsCommon;
  const noise = S.noise, tone = S.tone;

  const VOICES = Object.assign({}, S.UI, {

    /* ------------------------- the small ------------------------ */

    /* Compsognathus, Meganeura. Fast, dry, and beneath notice. */
    nip: {
      gain: 0.75, limit: 4, rateVar: 0.15,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 2.6, cut0: 3400, cut1: 1700, dur: 0.05, gain: 0.2 }),
        tone({ wave: 'square', f0: 520, f1: 240, dur: 0.05, gain: 0.07 })
      ]
    },

    /* A sickle claw, or a microraptor. A cut rather than a crush. */
    claw: {
      gain: 0.9, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.1, cut0: 5000, cut1: 1200, dur: 0.14, gain: 0.34 }),
        tone({ wave: 'triangle', f0: 340, f1: 130, dur: 0.1, gain: 0.12 })
      ]
    },

    /* --------------------------- jaws --------------------------- */

    /* Mid-sized teeth closing. The workhorse voice of the edition. */
    bite: {
      gain: 0.95, limit: 3, rateVar: 0.1,
      layers: [
        tone({ wave: 'sawtooth', f0: 260, f1: 105, dur: 0.18, gain: 0.14, attack: 0.012 }),
        noise({ color: 'white', filter: 'lowpass', cut0: 2400, cut1: 380, dur: 0.16, gain: 0.36 }),
        tone({ wave: 'sine', f0: 140, f1: 52, dur: 0.16, gain: 0.22 })
      ]
    },

    /* Allosaurus, Spinosaurus — jaws with a body behind them. */
    jaws: {
      gain: 1, limit: 2, rateVar: 0.07,
      layers: [
        tone({ wave: 'sawtooth', f0: 165, f1: 70, dur: 0.4, gain: 0.2, attack: 0.025 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1700, cut1: 190, dur: 0.38, gain: 0.52 }),
        tone({ wave: 'sine', f0: 95, f1: 32, dur: 0.34, gain: 0.34 })
      ]
    },

    /* The Tyrannosaurus. This is the loudest, lowest, longest thing in the
     * edition, and it is meant to be recognisable from off screen. */
    roar: {
      gain: 1, limit: 1, rateVar: 0.04,
      layers: [
        tone({ wave: 'sawtooth', f0: 105, f1: 42, dur: 0.95, gain: 0.26, attack: 0.06 }),
        tone({ wave: 'sawtooth', f0: 70, f1: 30, dur: 1.05, gain: 0.18, attack: 0.1 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1500, cut1: 130, dur: 0.6, gain: 0.55 }),
        tone({ wave: 'sine', f0: 58, f1: 20, dur: 0.7, gain: 0.4 })
      ]
    },

    /* ------------------------ heavy bone ------------------------ */

    /* A thagomizer or a tail club: bone swung into hide, with the air it moved
     * arriving just before it. */
    club: {
      gain: 1, limit: 2, rateVar: 0.07,
      layers: [
        noise({ color: 'pink', filter: 'bandpass', q: 0.8, cut0: 800, cut1: 2200, dur: 0.16, gain: 0.16 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1200, cut1: 130, dur: 0.45, gain: 0.6, delay: 0.1 }),
        tone({ wave: 'sine', f0: 88, f1: 28, dur: 0.42, gain: 0.42, delay: 0.1 })
      ]
    },

    /* Horns and tusks: a Triceratops or a Mammoth connecting at speed. */
    ram: {
      gain: 1, limit: 2, rateVar: 0.06,
      layers: [
        tone({ wave: 'sawtooth', f0: 140, f1: 62, dur: 0.4, gain: 0.18, attack: 0.03 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1500, cut1: 120, dur: 0.5, gain: 0.62 }),
        tone({ wave: 'sine', f0: 78, f1: 25, dur: 0.45, gain: 0.44 })
      ]
    },

    /* Forty tonnes putting a foot down. No voice at all — the animal is not
     * biting anything, it is simply standing where something used to be. */
    stomp: {
      gain: 1, limit: 2, rateVar: 0.05,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 900, cut1: 60, dur: 0.8, gain: 0.75 }),
        tone({ wave: 'sine', f0: 52, f1: 16, dur: 0.7, gain: 0.55 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 700, dur: 0.4, gain: 0.1, attack: 0.04, delay: 0.06 })
      ]
    },

    /* ------------------------- serpents ------------------------- */

    constrict: {
      gain: 0.95, limit: 2, rateVar: 0.07,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.9, cut0: 4400, cut1: 2400, dur: 0.34, gain: 0.16, attack: 0.02 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 800, cut1: 130, dur: 0.42, gain: 0.48 }),
        tone({ wave: 'sine', f0: 110, f1: 38, dur: 0.38, gain: 0.3 })
      ]
    },

    /* ------------------------- airborne ------------------------- */

    /* Pterosaurs. A hard, high cry that cuts through everything underneath it,
     * which is the only way anything with a nine-metre wingspan and no weight
     * makes itself heard on this field. */
    screech: {
      gain: 0.9, limit: 3, rateVar: 0.09,
      layers: [
        tone({ wave: 'sawtooth', f0: 1400, f1: 620, dur: 0.26, gain: 0.13, attack: 0.012 }),
        tone({ wave: 'sawtooth', f0: 2100, f1: 900, dur: 0.2, gain: 0.07, attack: 0.012 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.0, cut0: 3200, cut1: 1500, dur: 0.1, gain: 0.18 })
      ]
    },

    /* --------------------------- water -------------------------- */

    /* Marine reptiles. Same jaws, heard through water: no crack at the front and
     * the top end rolled off, so it lands as a muffled thud and a surge. */
    wetSnap: {
      gain: 0.9, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1100, cut1: 240, dur: 0.24, gain: 0.44, attack: 0.008 }),
        tone({ wave: 'sine', f0: 170, f1: 60, dur: 0.22, gain: 0.24 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.4, cut0: 900, cut1: 2400, dur: 0.3, gain: 0.1, attack: 0.05 })
      ]
    },

    /* A Megalodon or a Mosasaurus taking something whole. */
    chomp: {
      gain: 1, limit: 2, rateVar: 0.06,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1000, cut1: 90, dur: 0.6, gain: 0.72, attack: 0.01 }),
        tone({ wave: 'sine', f0: 82, f1: 22, dur: 0.55, gain: 0.48 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.2, cut0: 700, cut1: 2800, dur: 0.5, gain: 0.14, attack: 0.08 })
      ]
    },

    /* ------------------------- the spit ------------------------- */

    /* The one thing in the edition that is thrown. Wet and unpleasant rather
     * than explosive — there is no chemistry on this field yet. */
    spit: {
      gain: 0.85, limit: 3, rateVar: 0.12,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.0, cut0: 2600, cut1: 5200, dur: 0.16, gain: 0.24, attack: 0.008 }),
        tone({ wave: 'sawtooth', f0: 480, f1: 1100, dur: 0.14, gain: 0.07 })
      ]
    },

    splat: {
      gain: 0.8, limit: 4, rateVar: 0.14,
      layers: [
        noise({ color: 'pink', filter: 'lowpass', cut0: 2200, cut1: 500, dur: 0.1, gain: 0.26 }),
        tone({ wave: 'sine', f0: 320, f1: 110, dur: 0.08, gain: 0.1 })
      ]
    },

    /* ---------------------- animals leaving --------------------- */

    /* Bellows, receding. Sized by the animal, since what you hear is its voice. */

    fleeSmall: {
      gain: 0.9, limit: 3, rateVar: 0.11,
      layers: [
        tone({ wave: 'sawtooth', f0: 820, f1: 340, dur: 0.3, gain: 0.12, attack: 0.012 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 1400, dur: 0.4, gain: 0.1, attack: 0.04 })
      ]
    },

    fleeMed: {
      gain: 0.95, limit: 3, rateVar: 0.07,
      layers: [
        tone({ wave: 'sawtooth', f0: 380, f1: 150, dur: 0.55, gain: 0.18, attack: 0.03 }),
        tone({ wave: 'sine', f0: 190, f1: 80, dur: 0.6, gain: 0.12, attack: 0.04 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1100, cut1: 300, dur: 0.7, gain: 0.16, attack: 0.06 })
      ]
    },

    /* A sauropod or a T. rex giving up the field. Long enough that it is still
     * going when the next one starts. */
    fleeLarge: {
      gain: 1, limit: 2, rateVar: 0.04,
      layers: [
        tone({ wave: 'sawtooth', f0: 150, f1: 52, dur: 1.2, gain: 0.24, attack: 0.08 }),
        tone({ wave: 'sawtooth', f0: 98, f1: 38, dur: 1.4, gain: 0.15, attack: 0.12 }),
        tone({ wave: 'sine', f0: 62, f1: 24, dur: 1.5, gain: 0.16, attack: 0.1 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 800, cut1: 180, dur: 1.3, gain: 0.2, attack: 0.1 })
      ]
    },

    /* ------------------- the edition's own UI ------------------- */

    /* Nobody blows a horn here. Something very large announces that it has seen
     * something else very large, and the herds move. */
    uiStart: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 62, f1: 98, dur: 1.3, gain: 0.22, attack: 0.25 }),
        tone({ wave: 'sawtooth', f0: 93, f1: 147, dur: 1.2, gain: 0.11, attack: 0.35 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 180, cut1: 700, dur: 1.4, gain: 0.32, attack: 0.6 })
      ]
    },

    /* Low and open rather than bright — a fanfare in this edition is still a
     * couple of animals shouting. */
    uiWin: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 147, f1: 147, dur: 0.28, gain: 0.16, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 220, f1: 220, dur: 1.1, gain: 0.17, attack: 0.03, delay: 0.24 }),
        tone({ wave: 'sine', f0: 73, f1: 73, dur: 1.3, gain: 0.16, attack: 0.04, delay: 0.24 })
      ]
    },

    uiLose: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 175, f1: 175, dur: 0.3, gain: 0.15, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 131, f1: 128, dur: 1.4, gain: 0.16, attack: 0.04, delay: 0.26 }),
        tone({ wave: 'sine', f0: 65, f1: 63, dur: 1.6, gain: 0.15, attack: 0.06, delay: 0.26 })
      ]
    },

    uiDraw: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 147, f1: 147, dur: 0.32, gain: 0.14, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 175, f1: 175, dur: 1.1, gain: 0.14, attack: 0.04, delay: 0.26 }),
        tone({ wave: 'sine', f0: 73, f1: 73, dur: 1.3, gain: 0.13, attack: 0.05, delay: 0.26 })
      ]
    }
  });

  const BY_KIND = { melee: 'bite', tracer: 'spit' };

  W.SoundsPrehistoric = {
    voices: VOICES,

    /* Hot, heavy air over a floodplain: lower and thicker than the Animals
     * breeze, nowhere near as loud as Earth's artillery rumble. */
    ambience: { color: 'brown', cut: 300, drift: 0.04, gain: 0.04 },

    weapon: function (def) {
      return def.sfx || BY_KIND[def.kind] || 'bite';
    },

    /* Only two things reach here: the Dilophosaurus's spit landing, and the
     * splash radius on a heavy animal's swing. */
    impact: function (size) {
      if (size <= 14) return 'splat';
      return size <= 30 ? 'bite' : 'club';
    },

    death: function (type) {
      if (type.radius >= 18) return 'fleeLarge';
      if (type.radius >= 11) return 'fleeMed';
      return 'fleeSmall';
    }
  };
})(window);
