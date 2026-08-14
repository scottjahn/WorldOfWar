/* Deterministic maths for the simulation.
 *
 * IEEE-754 pins down +, -, *, / and sqrt to a single correctly-rounded result,
 * and JavaScript never fuses multiply-add, so those operations give bit-identical
 * answers in every conforming engine. Math.sin, Math.cos, Math.atan2, Math.hypot
 * and Math.pow are NOT specified that way — each engine ships its own
 * approximation. Over a four-minute battle those last-bit differences compound
 * into visibly different outcomes, which would make a shared replay link
 * reproduce only for people using the same browser.
 *
 * So the simulation uses these instead, built purely from exactly-rounded
 * operations. Accuracy is roughly 1e-9, far tighter than anything the game can
 * express, and identical everywhere.
 *
 * The renderer deliberately keeps native Math: drawing does not feed back into
 * the simulation, and native trig is faster.
 */
(function (W) {
  'use strict';

  /* Math.PI is an exact double literal, identical in every engine. */
  const PI = Math.PI;
  const TAU = PI * 2;
  const HALF_PI = PI / 2;
  const QUARTER_PI = PI / 4;
  const INV_TAU = 1 / TAU;

  /* Taylor coefficients. Written as divisions of exact integers so the constants
   * themselves are produced by correctly-rounded arithmetic rather than by me
   * transcribing decimal digits. */
  const S3 = 1 / 6, S5 = 1 / 120, S7 = 1 / 5040, S9 = 1 / 362880,
    S11 = 1 / 39916800, S13 = 1 / 6227020800;
  const C2 = 1 / 2, C4 = 1 / 24, C6 = 1 / 720, C8 = 1 / 40320,
    C10 = 1 / 3628800, C12 = 1 / 479001600;

  /* sin on the folded range [-PI/2, PI/2]. */
  function sinKernel(x) {
    const z = x * x;
    return x * (1 + z * (-S3 + z * (S5 + z * (-S7 + z * (S9 + z * (-S11 + z * S13))))));
  }

  /* cos on the folded range [0, PI/2]. */
  function cosKernel(x) {
    const z = x * x;
    return 1 + z * (-C2 + z * (C4 + z * (-C6 + z * (C8 + z * (-C10 + z * C12)))));
  }

  function sin(x) {
    if (!isFinite(x)) return NaN;
    /* Math.round is exactly specified, so this reduction is reproducible. */
    x = x - TAU * Math.round(x * INV_TAU);      // -> [-PI, PI]
    if (x > HALF_PI) x = PI - x;                // -> [-PI/2, PI/2]
    else if (x < -HALF_PI) x = -PI - x;
    return sinKernel(x);
  }

  function cos(x) {
    if (!isFinite(x)) return NaN;
    x = x - TAU * Math.round(x * INV_TAU);      // -> [-PI, PI]
    if (x < 0) x = -x;                          // cos is even -> [0, PI]
    if (x > HALF_PI) return -cosKernel(PI - x); // -> [0, PI/2]
    return cosKernel(x);
  }

  /* atan on [0, 1], after the caller has taken the reciprocal of larger inputs.
   * A second reduction through tan(PI/8) keeps the series argument under 0.415,
   * where the plain Taylor expansion converges fast enough to reach ~1e-9. */
  const TAN_EIGHTH = 0.41421356237309503;       // tan(PI/8) = sqrt(2) - 1

  function atanUnit(z) {
    let bias = 0;
    if (z > TAN_EIGHTH) {
      /* atan(z) = PI/4 + atan((z-1)/(z+1)) */
      z = (z - 1) / (z + 1);
      bias = QUARTER_PI;
    }
    const w = z * z;
    const series = z * (1 + w * (-(1 / 3) + w * (1 / 5 + w * (-(1 / 7) + w * (1 / 9 +
      w * (-(1 / 11) + w * (1 / 13 + w * (-(1 / 15) + w * (1 / 17 + w * (-(1 / 19)))))))))));
    return bias + series;
  }

  function atan(x) {
    const neg = x < 0;
    let a = neg ? -x : x;
    let r;
    if (a > 1) {
      /* atan(a) = PI/2 - atan(1/a); 1/Infinity is 0, which gives exactly PI/2. */
      r = HALF_PI - atanUnit(1 / a);
    } else {
      r = atanUnit(a);
    }
    return neg ? -r : r;
  }

  function atan2(y, x) {
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
    /* x is zero (or negative zero). */
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }

  /* Math.hypot is implementation-defined because of its overflow-safe scaling.
   * Battlefield coordinates are nowhere near the range where that matters. */
  function hypot(a, b) {
    return Math.sqrt(a * a + b * b);
  }

  W.DMath = {
    PI: PI, TAU: TAU, HALF_PI: HALF_PI,
    sin: sin, cos: cos, atan: atan, atan2: atan2, hypot: hypot,
    /* Exposed so tests can check the reduction paths directly. */
    _sinKernel: sinKernel, _cosKernel: cosKernel
  };
})(window);
