/* Shared parts of every edition's sound table.
 *
 * The two builders are the vocabulary the tables are written in; js/audio.js
 * turns what they produce into audio.
 *
 *   noise(o)  a burst of white/pink/brown noise, optionally swept through a
 *             filter. This is the body of almost everything physical: cut0 ->
 *             cut1 falling is an explosion or an impact, rising is a motor, a
 *             jet, or air moving.
 *   tone(o)   an oscillator sweeping f0 -> f1. Under a gun it is the thump you
 *             feel rather than hear; on its own it is a beep, a horn or a cry.
 *
 * Shared fields, all optional:
 *   dur      how long the layer lasts, in seconds (default 0.2)
 *   gain     peak level of its envelope (default 0.4)
 *   attack   seconds to reach that peak (default 0.002 — a hard transient)
 *   hold     seconds to sit at the peak before decaying (default 0)
 *   delay    seconds to wait before the whole layer starts (default 0)
 *   filter   'lowpass' | 'highpass' | 'bandpass', swept cut0 -> cut1
 *   q        filter resonance (default 1)
 *
 * On the spec around them: `gain` scales the whole sound, `limit` is how many
 * may play on one frame before the rest fold into a crowd, and `rateVar` is how
 * much the pitch scatters shot to shot.
 *
 * UI holds the cues that are the same everywhere — placing a unit is placing a
 * unit in any world. The cues with a voice of their own (the call to battle and
 * the three ways a battle can end) belong to the edition, and each table defines
 * its own on top of these.
 */
(function (W) {
  'use strict';

  function noise(o) { o.type = 'noise'; return o; }
  function tone(o) { o.type = 'tone'; return o; }

  const UI = {
    uiPlace: {
      gain: 1, rateVar: 0.03,
      layers: [
        tone({ wave: 'sine', f0: 240, f1: 130, dur: 0.09, gain: 0.2 }),
        noise({ color: 'pink', filter: 'lowpass', cut0: 1400, cut1: 500, dur: 0.06, gain: 0.14 })
      ]
    },

    uiRemove: {
      gain: 1, rateVar: 0.03,
      layers: [
        tone({ wave: 'sine', f0: 150, f1: 300, dur: 0.08, gain: 0.13 }),
        noise({ color: 'pink', filter: 'highpass', cut0: 1600, dur: 0.05, gain: 0.1 })
      ]
    },

    uiSelect: {
      gain: 1, rateVar: 0.02,
      layers: [tone({ wave: 'sine', f0: 900, f1: 900, dur: 0.05, gain: 0.09, attack: 0.004 })]
    },

    /* Buzzy and flat, so "you cannot put it there" never reads as a confirmation. */
    uiDeny: {
      gain: 1, rateVar: 0,
      layers: [tone({ wave: 'square', f0: 180, f1: 140, dur: 0.16, gain: 0.11, attack: 0.006 })]
    }
  };

  W.SoundsCommon = {
    noise: noise,
    tone: tone,
    UI: UI
  };
})(window);
