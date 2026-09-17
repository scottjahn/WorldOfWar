/* World of War: Earth — the sound table.
 *
 * Gunpowder and jet fuel. Every entry is a recipe, not a recording; see
 * js/sounds-common.js for the two builders and what the fields mean.
 *
 * `limit` is how many of a voice may play on one frame before the rest fold
 * into a crowd. Small arms get a generous one because massed fire is the point
 * of them; artillery gets a low one because two shells landing together is
 * already very loud.
 *
 * Adding a sound to a weapon is a one-word `sfx` on its definition in
 * js/roster-earth.js. Anything without one falls back to its `kind`, so a new
 * unit is never silent by accident.
 */
(function (W) {
  'use strict';

  const S = W.SoundsCommon;
  const noise = S.noise, tone = S.tone;

  const VOICES = Object.assign({}, S.UI, {

    /* ------------------------ small arms ------------------------ */

    rifle: {
      gain: 0.9, limit: 4,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.1, cut0: 2800, cut1: 820, dur: 0.1, gain: 0.55 }),
        tone({ wave: 'triangle', f0: 230, f1: 80, dur: 0.06, gain: 0.16 })
      ]
    },

    /* Flatter and drier than a rifle: a machine gun is heard as a rate, not as
     * individual reports, so the transient matters more than the tail. */
    mg: {
      gain: 0.8, limit: 4, rateVar: 0.04,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.9, cut0: 2000, cut1: 640, dur: 0.075, gain: 0.5 }),
        tone({ wave: 'square', f0: 170, f1: 70, dur: 0.05, gain: 0.15 })
      ]
    },

    autocannon: {
      gain: 0.95, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'lowpass', q: 0.8, cut0: 3200, cut1: 420, dur: 0.14, gain: 0.55 }),
        tone({ wave: 'sine', f0: 150, f1: 46, dur: 0.12, gain: 0.32 })
      ]
    },

    /* Quad flak: brighter and faster than the autocannon it shares a rate with,
     * so a wall of it is audibly anti-air rather than more of the same. */
    flak: {
      gain: 0.9, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.3, cut0: 3400, cut1: 1100, dur: 0.11, gain: 0.5 }),
        tone({ wave: 'sine', f0: 210, f1: 78, dur: 0.09, gain: 0.24 })
      ]
    },

    /* ------------------------- tank guns ------------------------ */

    cannonLight: {
      gain: 1, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 2600, cut1: 260, dur: 0.28, gain: 0.62 }),
        tone({ wave: 'sine', f0: 115, f1: 38, dur: 0.24, gain: 0.42 })
      ]
    },

    cannonMed: {
      gain: 1, limit: 3,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 2000, cut1: 180, dur: 0.42, gain: 0.75 }),
        noise({ color: 'white', filter: 'highpass', cut0: 2600, dur: 0.05, gain: 0.3 }),
        tone({ wave: 'sine', f0: 90, f1: 29, dur: 0.38, gain: 0.5 })
      ]
    },

    cannonHeavy: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1500, cut1: 120, dur: 0.62, gain: 0.85 }),
        noise({ color: 'white', filter: 'highpass', cut0: 2200, dur: 0.06, gain: 0.34 }),
        tone({ wave: 'sine', f0: 72, f1: 23, dur: 0.55, gain: 0.6 })
      ]
    },

    /* The 16-inch triple. Nothing else in the edition is allowed to sound like
     * this, which is most of what makes a battleship feel like one. */
    cannonNaval: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1200, cut1: 85, dur: 1.0, gain: 0.95 }),
        noise({ color: 'white', filter: 'highpass', cut0: 1800, dur: 0.08, gain: 0.32 }),
        tone({ wave: 'sine', f0: 56, f1: 17, dur: 0.85, gain: 0.7 }),
        tone({ wave: 'sine', f0: 38, f1: 14, dur: 1.0, gain: 0.4, attack: 0.03 })
      ]
    },

    /* --------------------- indirect fire ------------------------ */

    /* A mortar is a hollow pop out of a tube, with almost no low end — it is the
     * one gun on the field that does not thump. */
    mortar: {
      gain: 0.95, limit: 3,
      layers: [
        tone({ wave: 'sine', f0: 340, f1: 72, dur: 0.24, gain: 0.45, attack: 0.004 }),
        noise({ color: 'pink', filter: 'lowpass', cut0: 1000, cut1: 220, dur: 0.2, gain: 0.3 })
      ]
    },

    howitzer: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 2200, cut1: 140, dur: 0.75, gain: 0.9 }),
        noise({ color: 'white', filter: 'highpass', cut0: 2400, dur: 0.07, gain: 0.38 }),
        tone({ wave: 'sine', f0: 95, f1: 25, dur: 0.65, gain: 0.6 })
      ]
    },

    /* ------------------------ rocketry -------------------------- */

    /* Rising filter rather than falling: a motor lighting and leaving, where a
     * gun is a pressure release that decays. */
    rocket: {
      gain: 0.85, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.7, cut0: 700, cut1: 2600, dur: 0.42, gain: 0.42, attack: 0.012 }),
        tone({ wave: 'sawtooth', f0: 430, f1: 120, dur: 0.3, gain: 0.12 })
      ]
    },

    missile: {
      gain: 0.9, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 0.6, cut0: 900, cut1: 3200, dur: 0.6, gain: 0.45, attack: 0.02 }),
        tone({ wave: 'sawtooth', f0: 170, f1: 540, dur: 0.5, gain: 0.1, attack: 0.03 })
      ]
    },

    /* Eight rockets in 1.2 seconds, then nine seconds of nothing. The shriek is
     * the warning that the salvo is coming. */
    mlrs: {
      gain: 0.9, limit: 3,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.4, cut0: 1300, cut1: 4400, dur: 0.48, gain: 0.44 }),
        tone({ wave: 'sawtooth', f0: 620, f1: 1600, dur: 0.4, gain: 0.13, attack: 0.02 })
      ]
    },

    /* -------------------- ordnance release ---------------------- */

    /* Deliberately near-inaudible on its own: a bomb leaving the bay is a clunk
     * and some airflow, and the B-52 releases twenty-seven of them. What the
     * player is supposed to hear is what happens where they land. */
    bombRelease: {
      gain: 0.55, limit: 2,
      layers: [
        noise({ color: 'pink', filter: 'bandpass', q: 0.8, cut0: 600, cut1: 1500, dur: 0.2, gain: 0.26, attack: 0.01 }),
        tone({ wave: 'sine', f0: 190, f1: 95, dur: 0.14, gain: 0.12 })
      ]
    },

    torpedo: {
      gain: 0.8, limit: 2,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 2200, cut1: 420, dur: 0.5, gain: 0.38, attack: 0.01 }),
        tone({ wave: 'sine', f0: 95, f1: 170, dur: 0.5, gain: 0.12, attack: 0.05 })
      ]
    },

    repair: {
      gain: 0.7, limit: 2,
      layers: [
        tone({ wave: 'sine', f0: 640, f1: 980, dur: 0.14, gain: 0.14, attack: 0.012 })
      ]
    },

    /* ------------------------- impacts -------------------------- */

    /* Four tiers, picked by how much explosive the mixer says landed. Bullets
     * get a spark, a 16-inch shell gets the full fireball with a debris tail. */

    impactTick: {
      gain: 0.6, limit: 5, rateVar: 0.14,
      layers: [
        noise({ color: 'white', filter: 'bandpass', q: 1.6, cut0: 4200, cut1: 1600, dur: 0.06, gain: 0.26 })
      ]
    },

    impactSmall: {
      gain: 0.9, limit: 4,
      layers: [
        noise({ color: 'white', filter: 'lowpass', cut0: 3000, cut1: 380, dur: 0.22, gain: 0.5 }),
        tone({ wave: 'sine', f0: 135, f1: 42, dur: 0.2, gain: 0.32 })
      ]
    },

    impactMed: {
      gain: 1, limit: 3,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1800, cut1: 150, dur: 0.5, gain: 0.7 }),
        tone({ wave: 'sine', f0: 82, f1: 25, dur: 0.44, gain: 0.5 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 900, dur: 0.35, gain: 0.1, attack: 0.04 })
      ]
    },

    impactBig: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1400, cut1: 75, dur: 0.95, gain: 0.85 }),
        tone({ wave: 'sine', f0: 62, f1: 16, dur: 0.85, gain: 0.65 }),
        /* Debris coming back down, well after the blast. */
        noise({ color: 'pink', filter: 'highpass', cut0: 800, dur: 0.6, gain: 0.14, attack: 0.05, delay: 0.12 })
      ]
    },

    /* ----------------------- unit deaths ------------------------ */

    /* A kill is louder and longer than the shot that caused it — the point is
     * that you can tell, without looking, that something just came apart. */

    wreckSmall: {
      gain: 1, limit: 3,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 2400, cut1: 200, dur: 0.55, gain: 0.7 }),
        tone({ wave: 'sine', f0: 110, f1: 30, dur: 0.5, gain: 0.45 }),
        noise({ color: 'white', filter: 'bandpass', q: 2.2, cut0: 2600, cut1: 1400, dur: 0.4, gain: 0.12, attack: 0.03, delay: 0.08 })
      ]
    },

    wreckLarge: {
      gain: 1, limit: 2,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1600, cut1: 90, dur: 1.1, gain: 0.9 }),
        tone({ wave: 'sine', f0: 70, f1: 18, dur: 1.0, gain: 0.62 }),
        tone({ wave: 'sine', f0: 44, f1: 15, dur: 1.3, gain: 0.32, attack: 0.06 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 700, dur: 0.8, gain: 0.16, attack: 0.06, delay: 0.15 })
      ]
    },

    /* A capital ship or a B-52 going down. Long, low, and unmistakable. */
    wreckCapital: {
      gain: 1, limit: 1,
      layers: [
        noise({ color: 'brown', filter: 'lowpass', cut0: 1300, cut1: 60, dur: 1.8, gain: 1 }),
        tone({ wave: 'sine', f0: 58, f1: 13, dur: 1.5, gain: 0.7 }),
        tone({ wave: 'sine', f0: 36, f1: 11, dur: 2.0, gain: 0.4, attack: 0.1 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 600, dur: 1.2, gain: 0.18, attack: 0.08, delay: 0.2 })
      ]
    },

    /* ------------------- the edition's own UI ------------------- */

    /* Battle start: a low horn over a rising swell. */
    uiStart: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'sawtooth', f0: 73, f1: 110, dur: 1.1, gain: 0.18, attack: 0.12 }),
        tone({ wave: 'sawtooth', f0: 110, f1: 146, dur: 1.0, gain: 0.1, attack: 0.2 }),
        noise({ color: 'brown', filter: 'lowpass', cut0: 200, cut1: 600, dur: 1.2, gain: 0.3, attack: 0.5 })
      ]
    },

    /* Major third then fifth, rising. */
    uiWin: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'triangle', f0: 294, f1: 294, dur: 0.22, gain: 0.16, attack: 0.01 }),
        tone({ wave: 'triangle', f0: 370, f1: 370, dur: 0.22, gain: 0.16, attack: 0.01, delay: 0.16 }),
        tone({ wave: 'triangle', f0: 440, f1: 440, dur: 0.9, gain: 0.18, attack: 0.01, delay: 0.32 }),
        tone({ wave: 'sine', f0: 147, f1: 147, dur: 1.1, gain: 0.14, attack: 0.02, delay: 0.32 })
      ]
    },

    /* The same shape inverted and flattened into a minor fall. */
    uiLose: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'triangle', f0: 330, f1: 330, dur: 0.24, gain: 0.14, attack: 0.01 }),
        tone({ wave: 'triangle', f0: 277, f1: 277, dur: 0.24, gain: 0.14, attack: 0.01, delay: 0.18 }),
        tone({ wave: 'triangle', f0: 220, f1: 218, dur: 1.2, gain: 0.16, attack: 0.02, delay: 0.36 }),
        tone({ wave: 'sine', f0: 110, f1: 108, dur: 1.4, gain: 0.14, attack: 0.04, delay: 0.36 })
      ]
    },

    /* Neither side won: unresolved on purpose. */
    uiDraw: {
      gain: 1, rateVar: 0,
      layers: [
        tone({ wave: 'triangle', f0: 262, f1: 262, dur: 0.3, gain: 0.14, attack: 0.01 }),
        tone({ wave: 'triangle', f0: 311, f1: 311, dur: 1.0, gain: 0.14, attack: 0.02, delay: 0.24 }),
        tone({ wave: 'sine', f0: 131, f1: 131, dur: 1.2, gain: 0.12, attack: 0.03, delay: 0.24 })
      ]
    }
  });

  /* Weapons that do not name an `sfx` fall back to their kind, so a new unit
   * always has a voice even before anyone has chosen one for it. */
  const BY_KIND = {
    tracer: 'mg',
    shell: 'cannonMed',
    missile: 'missile',
    bomb: 'bombRelease',
    torpedo: 'torpedo',
    repair: 'repair',
    melee: 'impactSmall'
  };

  W.SoundsEarth = {
    voices: VOICES,

    /* A distant rumble under the whole battle — wind over an artillery duel
     * happening somewhere you are not looking. */
    ambience: { color: 'brown', cut: 190, drift: 0.05, gain: 0.05 },

    weapon: function (def) {
      return def.sfx || BY_KIND[def.kind] || 'mg';
    },

    /* `size` is the fireball radius the simulation computed from splash and
     * damage, so the tiers below track how much actually went off rather than
     * which weapon fired it. */
    impact: function (size) {
      if (size <= 14) return 'impactTick';
      if (size <= 38) return 'impactSmall';
      if (size <= 78) return 'impactMed';
      return 'impactBig';
    },

    death: function (type) {
      if (type.radius >= 22 || type.cost >= 1000) return 'wreckCapital';
      if (type.radius >= 13) return 'wreckLarge';
      return 'wreckSmall';
    }
  };
})(window);
