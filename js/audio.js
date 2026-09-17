/* Procedural audio: a small Web Audio synthesiser and the battle mixer.
 *
 * There are no sound files. Everything is synthesised from noise buffers and
 * oscillators at runtime, for the same reason the terrain and the unit shapes
 * are drawn rather than loaded: the whole game stays a handful of text files
 * that the service worker can cache in one go, and a new weapon needs a few
 * numbers rather than a trip to a sample library.
 *
 * What a sound *is* lives in an edition's table (js/sounds-earth.js). This file
 * only knows how to turn one of those descriptions into audio, where to place it
 * in the stereo field, and how to stop four hundred rifle shots a second from
 * turning into white noise. An edition with no table is simply silent.
 *
 * Nothing here is ever called from js/sim.js. The simulation pushes plain data
 * onto battle.events and the frame loop hands that list over, so a replay stays
 * identical whether the sound is on, off, or unsupported by the browser.
 */
(function (W) {
  'use strict';

  const STORE_KEY = 'wow.sound';

  /* Beyond this many overlapping voices the mix turns to mush and cheap phones
   * start dropping frames, so late arrivals in a busy tick are simply dropped. */
  const MAX_VOICES = 28;

  /* Noise buffers are generated once and shared by every voice. Two seconds is
   * long enough that looping is inaudible inside a sub-second burst. */
  const NOISE_SECONDS = 2;

  let ctx = null;
  let bus = null;            // everything except the ambient bed
  let master = null;
  let table = null;
  let unlocked = false;
  let voices = 0;
  let failed = false;

  let enabled = readPref();
  let bed = null;            // { src, filter, gain, lfo } while the bed is running
  let bedLevel = 0;

  const buffers = {};

  /* ------------------------- preferences -------------------------- */

  function readPref() {
    try {
      const v = window.localStorage && localStorage.getItem(STORE_KEY);
      /* Default on. Only an explicit 'off' silences it. */
      return v !== 'off';
    } catch (e) {
      return true;
    }
  }

  function writePref(on) {
    try {
      if (window.localStorage) localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
    } catch (e) { /* private browsing; the setting just will not stick */ }
  }

  /* --------------------------- context ---------------------------- */

  /* Browsers refuse to start an AudioContext until the user has interacted with
   * the page, so the context is built on demand and resumed from the first
   * gesture. Everything before that point is silently discarded. */
  function ensure() {
    if (failed || !enabled) return false;
    if (ctx) return true;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return false; }
    try {
      ctx = new AC();
    } catch (e) {
      failed = true;
      return false;
    }

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    /* A barrage of artillery and two hundred small arms land on the same few
     * milliseconds. Without this the peaks clip into a buzz. */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(master);

    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(comp);

    return true;
  }

  function resume() {
    unlocked = true;
    if (!enabled || failed) return;
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* --------------------------- noise ------------------------------ */

  function noiseBuffer(color) {
    if (buffers[color]) return buffers[color];
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);

    if (color === 'brown') {
      /* Integrated white noise: heavy low end, which is most of what an
       * explosion actually is. */
      let last = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      }
    } else if (color === 'pink') {
      /* Paul Kellet's economy pink filter — close enough for debris and hiss. */
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }

    buffers[color] = buf;
    return buf;
  }

  /* ---------------------------- voices ---------------------------- */

  /* One layer of a sound: a noise burst or an oscillator, its optional filter
   * sweep, and an attack/decay envelope. See js/sounds-earth.js for the fields. */
  function layer(l, start, dest, rate) {
    const dur = Math.max(0.01, (l.dur || 0.2));
    /* Everything below — filter sweep, envelope, source — is scheduled off this
     * one instant, so a layer's `delay` moves the whole layer rather than firing
     * the source into an envelope that has already decayed. */
    const t0 = start + (l.delay || 0);
    let node, offset = 0;

    if (l.type === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = l.wave || 'sine';
      const f0 = Math.max(8, (l.f0 || 220) * rate);
      const f1 = Math.max(8, (l.f1 != null ? l.f1 : l.f0 || 220) * rate);
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      node = osc;
    } else {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(l.color || 'white');
      src.loop = true;
      src.playbackRate.value = rate;
      /* Enter the buffer somewhere random: without this, every shot from a given
       * weapon is bit-for-bit the same waveform and a burst sounds like a loop
       * rather than like repeated fire. */
      offset = Math.random() * Math.max(0, NOISE_SECONDS - dur - 0.05);
      node = src;
    }

    const head = node;

    if (l.filter) {
      const f = ctx.createBiquadFilter();
      f.type = l.filter;
      f.Q.value = l.q != null ? l.q : 1;
      const c0 = Math.max(24, (l.cut0 || 1200) * rate);
      const c1 = Math.max(24, (l.cut1 != null ? l.cut1 : l.cut0 || 1200) * rate);
      f.frequency.setValueAtTime(Math.min(c0, 20000), t0);
      if (c1 !== c0) f.frequency.exponentialRampToValueAtTime(Math.min(c1, 20000), t0 + dur);
      node.connect(f);
      node = f;
    }

    const env = ctx.createGain();
    const peak = Math.max(0.0005, l.gain != null ? l.gain : 0.4);
    const atk = l.attack != null ? l.attack : 0.002;
    const hold = l.hold || 0;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    if (hold > 0) env.gain.setValueAtTime(peak, t0 + atk + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(env);
    env.connect(dest);

    if (offset > 0) head.start(t0, offset);
    else head.start(t0);
    head.stop(t0 + dur + 0.02);
    return (l.delay || 0) + dur;
  }

  /* `o` carries the per-event placement: gain, stereo pan, and a lowpass cutoff
   * that stands in for distance — far-off gunfire loses its top end long before
   * it loses its volume. */
  function playSpec(spec, o) {
    if (!spec || !spec.layers || !ensure()) return;
    if (voices >= MAX_VOICES) return;
    if (ctx.state === 'suspended') return;

    o = o || {};
    const level = (o.gain != null ? o.gain : 1) * (spec.gain != null ? spec.gain : 1);
    if (level < 0.012) return;

    const t0 = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.gain.value = level;

    let tail = out;
    if (o.muffle && o.muffle < 16000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(240, o.muffle);
      out.connect(f);
      tail = f;
    }
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      tail.connect(p);
      tail = p;
    }
    tail.connect(bus);

    /* A touch of pitch scatter so a repeated shot is not audibly a loop. */
    const varAmt = spec.rateVar != null ? spec.rateVar : 0.06;
    const rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * varAmt);

    let longest = 0;
    for (let i = 0; i < spec.layers.length; i++) {
      longest = Math.max(longest, layer(spec.layers[i], t0, out, rate));
    }

    voices++;
    setTimeout(function () { voices--; }, (longest + 0.1) * 1000);
  }

  /* --------------------------- placement -------------------------- */

  /* Where a world point sits relative to what is on screen. Returns null for
   * anything far enough outside the viewport to not be worth a voice. */
  function place(x, y, view) {
    const half = view.w / 2, halfH = view.h / 2;
    const sx = (x - view.x) * view.zoom + half;
    const sy = (y - view.y) * view.zoom + halfH;

    /* Distance *outside* the viewport, in screen widths. Anything visible is 0. */
    const dx = Math.max(0, Math.abs(sx - half) - half);
    const dy = Math.max(0, Math.abs(sy - halfH) - halfH);
    const off = Math.sqrt(dx * dx + dy * dy) / Math.max(180, half);
    if (off > 1.8) return null;

    /* Zoomed out means further away: quieter and duller across the board, which
     * is also what keeps a whole-map view from being louder than a close-up. */
    const near = Math.max(0.15, Math.min(1.2, view.zoom)) / 1.2;
    const gain = (0.45 + 0.55 * near) / (1 + off * 2.2);
    const pan = Math.max(-1, Math.min(1, (sx - half) / half)) * 0.72;
    const muffle = 800 + 15000 * near / (1 + off * 2.5);
    return { gain: gain, pan: pan, muffle: muffle };
  }

  /* ---------------------------- mixer ----------------------------- */

  const pending = [];

  /* Plays one frame's worth of battle events.
   *
   * Grouping is the whole point: twenty MG teams firing on the same tick is one
   * sound, slightly louder, not twenty voices fighting each other. Loud events
   * win the slots, so an artillery shell is never dropped in favour of the
   * rifle fire around it. */
  function flush() {
    if (!pending.length) return;
    /* Drained into a local first: if a Web Audio call throws part-way through,
     * the queue must not be left holding a frame that then compounds on the
     * next one. */
    const batch = pending.slice();
    pending.length = 0;

    batch.sort(function (a, b) { return b.gain - a.gain; });

    const total = {};
    for (let i = 0; i < batch.length; i++) {
      total[batch[i].name] = (total[batch[i].name] || 0) + 1;
    }

    const used = {};
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const n = (used[r.name] = (used[r.name] || 0) + 1);
      const limit = r.spec.limit != null ? r.spec.limit : 3;
      if (n > limit) continue;
      /* The loudest voice of a crowd carries the crowd: a modest bump, capped,
       * so a hundred simultaneous shots read as massed fire without the mix
       * simply pinning. */
      const crowd = n === 1 ? Math.min(1.7, 1 + Math.log(total[r.name]) * 0.22) : 1;
      playSpec(r.spec, { gain: r.gain * crowd, pan: r.pan, muffle: r.muffle, rate: r.rate });
    }
  }

  function queue(name, x, y, view, gain, rate) {
    const spec = table && table.voices[name];
    if (!spec) return;
    const p = place(x, y, view);
    if (!p) return;
    pending.push({
      name: name, spec: spec, gain: p.gain * (gain != null ? gain : 1),
      pan: p.pan, muffle: p.muffle, rate: rate || 1
    });
  }

  /* --------------------------- ambience --------------------------- */

  /* A low bed under the battle. Without it the field is silent between salvoes,
   * which reads as broken rather than as quiet. */
  function startBed() {
    if (bed || !table || !table.ambience || !ensure()) return;
    const a = table.ambience;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(a.color || 'brown');
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = a.cut || 220;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    /* Some beds are a hum rather than a rumble — a capital ship's engine room is
     * a pitch, not weather. This sits alongside the noise, not in place of it. */
    let drone = null;
    if (a.tone) {
      drone = ctx.createOscillator();
      drone.type = a.tone.wave || 'sine';
      drone.frequency.value = a.tone.f || 55;
      const dg = ctx.createGain();
      dg.gain.value = a.tone.gain != null ? a.tone.gain : 0.5;
      drone.connect(dg);
      dg.connect(gain);
      drone.start();
    }

    /* A slow wander on the cutoff, so it breathes instead of sitting there as a
     * dead tone. */
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = a.drift || 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = (a.cut || 220) * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    lfo.start();

    bed = { src: src, filter: filter, gain: gain, lfo: lfo, drone: drone, level: a.gain || 0.035 };
    rampBed();
  }

  function rampBed() {
    if (!bed || !ctx) return;
    const want = bedLevel * bed.level;
    bed.gain.gain.cancelScheduledValues(ctx.currentTime);
    bed.gain.gain.setValueAtTime(bed.gain.gain.value, ctx.currentTime);
    bed.gain.gain.linearRampToValueAtTime(want, ctx.currentTime + 0.6);
  }

  /* `immediate` is for the mute button and for swapping editions: both are
   * followed by suspending the context, and a suspended context's clock does not
   * advance — a scheduled fade would simply never arrive, leaving the old bed
   * connected and audible again the moment sound came back on. */
  function stopBed(immediate) {
    if (!bed) return;
    const b = bed;
    bed = null;
    try {
      b.gain.gain.cancelScheduledValues(ctx.currentTime);
      if (immediate) {
        b.gain.gain.value = 0;
        b.src.stop();
        b.lfo.stop();
        if (b.drone) b.drone.stop();
        b.gain.disconnect();
        return;
      }
      b.gain.gain.setValueAtTime(b.gain.gain.value, ctx.currentTime);
      b.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      b.src.stop(ctx.currentTime + 0.5);
      b.lfo.stop(ctx.currentTime + 0.5);
      if (b.drone) b.drone.stop(ctx.currentTime + 0.5);
    } catch (e) { /* already stopped */ }
    setTimeout(function () { try { b.gain.disconnect(); } catch (e) { /* gone */ } }, 800);
  }

  /* ----------------------------- API ------------------------------ */

  const Sound = {
    /* Loads an edition's sound table, or null to make the edition silent. */
    setTable: function (t) {
      table = t || null;
      if (!table) { stopBed(true); bedLevel = 0; }
    },

    has: function () { return !!table; },

    enabled: function () { return enabled && !failed; },

    setEnabled: function (on) {
      enabled = !!on;
      writePref(enabled);
      if (!enabled) {
        stopBed(true);
        if (ctx && ctx.suspend) ctx.suspend();
      } else if (unlocked) {
        resume();
        if (bedLevel > 0) startBed();
      }
      return enabled;
    },

    toggle: function () { return this.setEnabled(!enabled); },

    /* Call from any user gesture. Harmless to call repeatedly. */
    unlock: resume,

    /* A single named sound with no position — menu clicks, stings, warnings. */
    cue: function (name, opts) {
      if (!enabled || !table) return;
      const spec = table.voices[name];
      if (spec) playSpec(spec, opts || {});
    },

    /* How loud the ambient bed should be, 0–1. The battle loop drives this from
     * the phase and the pause state. */
    setAmbience: function (level) {
      level = Math.max(0, Math.min(1, level || 0));
      if (level === bedLevel) return;
      bedLevel = level;
      if (!enabled || !table || !table.ambience) return;
      if (level > 0) { startBed(); rampBed(); }
      else if (bed) rampBed();
    },

    /* One frame's battle events, placed against the renderer's camera.
     *
     * The caller clears the list itself, whether or not sound is on, so the
     * simulation never grows an unbounded queue behind a muted game. */
    battle: function (events, view) {
      if (!enabled || !table || !events.length || !ensure()) return;

      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        let name = null, gain = 1;

        if (e.kind === 'fire') {
          name = table.weapon(e.def);
        } else if (e.kind === 'impact') {
          name = table.impact(e.size, e.def);
        } else if (e.kind === 'death') {
          name = table.death(e.type, e.fled);
        } else if (e.kind === 'heal') {
          name = table.voices['repair'] ? 'repair' : null;
          gain = 0.7;
        }

        if (name) queue(name, e.x, e.y, view, gain);
      }

      flush();
    }
  };

  /* First gesture of any kind starts the context. `once` so the listeners drop
   * themselves; passive so they never delay a tap. */
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, resume, { once: true, passive: true });
  });

  /* A backgrounded tab should not still be firing artillery. */
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { if (ctx.suspend) ctx.suspend(); }
    else if (enabled && unlocked && ctx.resume) ctx.resume();
  });

  W.Sound = Sound;
})(window);
