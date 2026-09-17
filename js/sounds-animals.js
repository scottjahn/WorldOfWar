/* World of War: Animals — the sound table.
 *
 * Teeth, claws and a lot of shouting. See js/sounds-common.js for the builders
 * and what the fields mean.
 *
 * Two things make this edition sound unlike the others. Every weapon is melee,
 * so there are no projectiles and no explosions — a sound here is an animal
 * arriving, not ordnance landing, and it is built as a voice over an impact
 * rather than a bang. And nothing dies: a beaten animal turns tail, so the
 * death cue is a yelp going away from you, pitched by how big the animal is.
 *
 * Levels sit lower than Earth's across the board. A garden is not a battlefield,
 * and a swarm of twenty hamsters arrives at a rate no machine gun matches.
 */
(function (W) {
  'use strict';

  const S = W.SoundsCommon;
  const noise = S.noise, tone = S.tone;

  const VOICES = Object.assign({}, S.UI, {

    /* -------------------- small and harmless -------------------- */

    /* A hamster's nibble. Almost nothing, which is the joke. */
    nibble: {
      gain: 0.75, limit: 4, rateVar: 0.16,
      layers: [
        tone({ wave: 'square', f0: 900, f1: 1500, dur: 0.05, gain: 0.06, attack: 0.004 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.4, cut0: 3600, cut1: 2000, dur: 0.04, gain: 0.12 })
      ]
    },

    /* A beak on something. Hard, dry, over instantly. */
    peck: {
      gain: 0.8, limit: 4, rateVar: 0.14,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 3.0, cut0: 3000, cut1: 1800, dur: 0.045, gain: 0.24 }),
        tone({ wave: 'triangle', f0: 620, f1: 300, dur: 0.04, gain: 0.08 })
      ]
    },

    /* A parrot or a vulture: enough beak to crack something. */
    beak: {
      gain: 0.9, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 2.2, cut0: 2400, cut1: 900, dur: 0.09, gain: 0.34 }),
        tone({ wave: 'square', f0: 380, f1: 150, dur: 0.07, gain: 0.12 })
      ]
    },

    /* ------------------------- claws ---------------------------- */

    /* A rising-then-gone band of noise reads as something being swept through
     * rather than struck — which is the difference between a claw and a jaw. */
    claw: {
      gain: 0.9, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.2, cut0: 5200, cut1: 1300, dur: 0.13, gain: 0.34 }),
        tone({ wave: 'triangle', f0: 300, f1: 140, dur: 0.08, gain: 0.1 })
      ]
    },

    /* ------------------------- jaws ----------------------------- */

    /* Jaws closing on something smaller than they are. */
    snap: {
      gain: 0.9, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 2600, cut1: 500, dur: 0.1, gain: 0.34 }),
        tone({ wave: 'sine', f0: 260, f1: 90, dur: 0.09, gain: 0.18 })
      ]
    },

    /* A dog. The short sawtooth fall is the bark; the noise under it is the hit. */
    bark: {
      gain: 0.95, limit: 3, rateVar: 0.09,
      layers: [
        tone({ wave: 'sawtooth', f0: 420, f1: 150, dur: 0.14, gain: 0.16, attack: 0.008 }),
        noise({ color: 'white', filter: 'lowpass', cut0: 2200, cut1: 420, dur: 0.12, gain: 0.3 }),
        tone({ wave: 'sine', f0: 150, f1: 62, dur: 0.14, gain: 0.16 })
      ]
    },

    /* Something with a head and a temper putting its weight through you. */
    barge: {
      gain: 1, limit: 3, rateVar: 0.08,
      layers: [
        tone({ wave: 'sawtooth', f0: 210, f1: 95, dur: 0.2, gain: 0.14, attack: 0.02 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1400, cut1: 200, dur: 0.26, gain: 0.45 }),
        tone({ wave: 'sine', f0: 110, f1: 40, dur: 0.24, gain: 0.3 })
      ]
    },

    /* ------------------------ big cats -------------------------- */

    /* A growl carried on the strike rather than before it — the animal is
     * already on top of whatever it hit. */
    maul: {
      gain: 1, limit: 2, rateVar: 0.07,
      layers: [
        tone({ wave: 'sawtooth', f0: 150, f1: 72, dur: 0.42, gain: 0.2, attack: 0.03 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1600, cut1: 180, dur: 0.38, gain: 0.5 }),
        tone({ wave: 'sine', f0: 90, f1: 34, dur: 0.34, gain: 0.34 })
      ]
    },

    /* A grizzly or a rhino connecting. The heaviest thing in the garden. */
    charge: {
      gain: 1, limit: 2, rateVar: 0.05,
      layers: [
        tone({ wave: 'sawtooth', f0: 120, f1: 55, dur: 0.6, gain: 0.22, attack: 0.05 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 1300, cut1: 110, dur: 0.55, gain: 0.6 }),
        tone({ wave: 'sine', f0: 70, f1: 24, dur: 0.5, gain: 0.42 })
      ]
    },

    /* ------------------------ snakes ---------------------------- */

    /* Constrictors: muscle rather than teeth, so the body of it is a low
     * compression with a hiss laid over the top. */
    constrict: {
      gain: 0.95, limit: 2, rateVar: 0.08,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.9, cut0: 4600, cut1: 2600, dur: 0.3, gain: 0.16, attack: 0.02 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 900, cut1: 160, dur: 0.34, gain: 0.4 }),
        tone({ wave: 'sine', f0: 130, f1: 46, dur: 0.3, gain: 0.24 })
      ]
    },

    /* Venom. No weight behind it at all — a hiss and a very fast strike, and the
     * damage happens somewhere you cannot hear. */
    venom: {
      gain: 0.85, limit: 3, rateVar: 0.1,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.1, cut0: 5800, cut1: 2800, dur: 0.22, gain: 0.2, attack: 0.015 }),
        noise({ color: 'white', filter: 'bandpass', q: 3.5, cut0: 2600, cut1: 1400, dur: 0.05, gain: 0.22 })
      ]
    },

    /* A rattlesnake announces itself. Six clipped ticks in ninety milliseconds
     * is the closest this synthesiser gets to a rattle, and it is close enough. */
    rattle: {
      gain: 0.85, limit: 2, rateVar: 0.06,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 4.0, cut0: 5000, cut1: 4200, dur: 0.02, gain: 0.2 }),
        noise({ color: 'white', filter: 'bandpass', q: 4.0, cut0: 5200, cut1: 4200, dur: 0.02, gain: 0.2, delay: 0.018 }),
        noise({ color: 'white', filter: 'bandpass', q: 4.0, cut0: 4800, cut1: 4000, dur: 0.02, gain: 0.2, delay: 0.036 }),
        noise({ color: 'white', filter: 'bandpass', q: 4.0, cut0: 5200, cut1: 4200, dur: 0.02, gain: 0.2, delay: 0.054 }),
        noise({ color: 'white', filter: 'bandpass', q: 4.0, cut0: 4900, cut1: 4100, dur: 0.02, gain: 0.2, delay: 0.072 }),
        noise({ color: 'white', filter: 'bandpass', q: 1.1, cut0: 5600, cut1: 2600, dur: 0.16, gain: 0.16, attack: 0.02, delay: 0.09 })
      ]
    },

    /* ---------------------- animals leaving --------------------- */

    /* Nothing dies here, so these are cries going away rather than wreckage.
     * Each is a falling call over the scuffle of something getting out. */

    fleeSmall: {
      gain: 0.9, limit: 3, rateVar: 0.12,
      layers: [
        tone({ wave: 'square', f0: 1200, f1: 480, dur: 0.22, gain: 0.1, attack: 0.008 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 1800, dur: 0.35, gain: 0.1, attack: 0.03 })
      ]
    },

    fleeMed: {
      gain: 0.95, limit: 3, rateVar: 0.08,
      layers: [
        tone({ wave: 'sawtooth', f0: 560, f1: 210, dur: 0.4, gain: 0.16, attack: 0.02 }),
        tone({ wave: 'triangle', f0: 280, f1: 120, dur: 0.45, gain: 0.1, attack: 0.03 }),
        noise({ color: 'pink', filter: 'bandpass', q: 0.9, cut0: 1400, cut1: 600, dur: 0.5, gain: 0.12, attack: 0.05 })
      ]
    },

    fleeLarge: {
      gain: 1, limit: 2, rateVar: 0.05,
      layers: [
        tone({ wave: 'sawtooth', f0: 230, f1: 80, dur: 0.75, gain: 0.2, attack: 0.05 }),
        tone({ wave: 'sine', f0: 110, f1: 45, dur: 0.8, gain: 0.16, attack: 0.06 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 900, cut1: 260, dur: 0.9, gain: 0.2, attack: 0.08 })
      ]
    },

    /* ------------------- the edition's own UI ------------------- */

    /* No war horn in a back garden. This is the two-note whistle you use to call
     * a dog, and it is the only thing on the field anyone here obeys. */
    uiStart: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sine', f0: 780, f1: 1250, dur: 0.22, gain: 0.13, attack: 0.02 }),
        tone({ wave: 'sine', f0: 1250, f1: 980, dur: 0.5, gain: 0.13, attack: 0.02, delay: 0.2 }),
        noise({ color: 'pink', filter: 'bandpass', q: 1.2, cut0: 900, cut1: 1600, dur: 0.7, gain: 0.08, attack: 0.3 })
      ]
    },

    /* Bright and quick — a garden, not a parade ground. */
    uiWin: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'triangle', f0: 523, f1: 523, dur: 0.16, gain: 0.13, attack: 0.008 }),
        tone({ wave: 'triangle', f0: 659, f1: 659, dur: 0.16, gain: 0.13, attack: 0.008, delay: 0.12 }),
        tone({ wave: 'triangle', f0: 784, f1: 784, dur: 0.7, gain: 0.15, attack: 0.008, delay: 0.24 }),
        tone({ wave: 'sine', f0: 262, f1: 262, dur: 0.85, gain: 0.11, attack: 0.02, delay: 0.24 })
      ]
    },

    /* A whimper. The army did not lose so much as give up and go home. */
    uiLose: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 520, f1: 340, dur: 0.3, gain: 0.12, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 400, f1: 190, dur: 0.9, gain: 0.13, attack: 0.03, delay: 0.26 }),
        tone({ wave: 'sine', f0: 190, f1: 95, dur: 1.0, gain: 0.1, attack: 0.04, delay: 0.26 })
      ]
    },

    uiDraw: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'triangle', f0: 440, f1: 440, dur: 0.26, gain: 0.12, attack: 0.01 }),
        tone({ wave: 'triangle', f0: 523, f1: 523, dur: 0.8, gain: 0.12, attack: 0.02, delay: 0.22 }),
        tone({ wave: 'sine', f0: 220, f1: 220, dur: 0.95, gain: 0.1, attack: 0.03, delay: 0.22 })
      ]
    }
  });

  /* Melee is the only `kind` in the edition, so the fallback is a plain set of
   * teeth rather than anything clever. */
  const BY_KIND = { melee: 'snap' };

  W.SoundsAnimals = {
    voices: VOICES,

    /* Wind through long grass, up where a breeze lives rather than down where
     * artillery does. */
    ambience: { color: 'pink', cut: 620, drift: 0.07, gain: 0.03 },

    weapon: function (def) {
      return def.sfx || BY_KIND[def.kind] || 'snap';
    },

    /* Nothing here throws anything, so this only ever answers for a heavy
     * animal's splash — a bear's swipe or a rhino going through a line. */
    impact: function (size) {
      return size <= 20 ? 'snap' : 'barge';
    },

    /* Sized by the animal, because what you hear is its voice. Radius tracks
     * that far better than cost does: a Black Mamba is expensive and small, and
     * it does not bellow. */
    death: function (type) {
      if (type.radius >= 15) return 'fleeLarge';
      if (type.radius >= 10) return 'fleeMed';
      return 'fleeSmall';
    }
  };
})(window);
