/* Replay links: packs a whole battle into a URL fragment.
 *
 * A battle is fully reproducible from the map, the terrain seed, both armies and
 * the battle seed (see js/dmath.js for why that holds across browsers), so the
 * link only has to carry those. Everything else — terrain, unit stats, AI
 * behaviour — is regenerated on the other end.
 *
 * Layout, little-endian:
 *   0      format version
 *   1      map index into Terrain.MAPS
 *   2..5   terrain seed   (uint32)
 *   6..9   battle seed    (uint32)
 *   10..11 budget         (uint16)
 *   12..13 team 0 count   (uint16)
 *   14..15 team 1 count   (uint16)
 *   16..   per unit: type index (uint8), x (uint16), y (uint16)
 *
 * That is 16 + 5n bytes, so a typical 3,000-point battle is about 310 URL
 * characters and a 12,000-point one about 890.
 */
(function (W) {
  'use strict';

  const FORMAT = 1;
  const HEADER = 16;
  const UNIT_BYTES = 5;

  /* Fixed wire ordering for unit types.
   *
   * APPEND ONLY — never reorder or remove an entry. The index is what goes in the
   * link, so shuffling this list silently turns every existing link into a
   * different army. New units go on the end; if a link references an index this
   * build does not know, decoding fails cleanly rather than guessing. */
  const TYPE_WIRE = [
    'rifles', 'mgteam', 'atteam', 'mortar', 'jeep', 'apc', 'lighttank', 'medtank',
    'heavytank', 'flaktank', 'sam', 'spg', 'mlrs', 'repair', 'pillbox', 'coastalgun',
    'drone', 'gunship', 'attackheli', 'fighter', 'bomber', 'patrolboat', 'corvette',
    'destroyer', 'battleship', 'carrier', 'f14', 'submarine'
  ];

  const TYPE_INDEX = {};
  TYPE_WIRE.forEach(function (id, i) { TYPE_INDEX[id] = i; });

  /* Surfaces a mismatch during development rather than shipping broken links. */
  function auditRegistry() {
    const missing = Object.keys(W.Units.TYPES).filter(function (id) {
      return TYPE_INDEX[id] === undefined;
    });
    if (missing.length && window.console) {
      console.warn('share.js: unit types missing from TYPE_WIRE (links cannot encode them): ' +
        missing.join(', '));
    }
    return missing;
  }

  function toBase64Url(bytes) {
    let s = '';
    /* Chunked so a large army cannot blow the argument limit of fromCharCode. */
    for (let i = 0; i < bytes.length; i += 4096) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* setup: { mapId, terrainSeed, battleSeed, budget, armies: [[{type,x,y}], [...]] } */
  function encode(setup) {
    const mapIndex = W.Terrain.MAPS.findIndex(function (m) { return m.id === setup.mapId; });
    if (mapIndex < 0) throw new Error('unknown map: ' + setup.mapId);

    const a = setup.armies[0], b = setup.armies[1];
    const total = a.length + b.length;
    const buf = new ArrayBuffer(HEADER + total * UNIT_BYTES);
    const view = new DataView(buf);

    view.setUint8(0, FORMAT);
    view.setUint8(1, mapIndex);
    view.setUint32(2, setup.terrainSeed >>> 0, true);
    view.setUint32(6, setup.battleSeed >>> 0, true);
    view.setUint16(10, Math.min(65535, setup.budget | 0), true);
    view.setUint16(12, a.length, true);
    view.setUint16(14, b.length, true);

    let o = HEADER;
    [a, b].forEach(function (army) {
      army.forEach(function (e) {
        const idx = TYPE_INDEX[e.type];
        if (idx === undefined) throw new Error('unit type not in wire registry: ' + e.type);
        view.setUint8(o, idx);
        /* Positions are whole world units by the time they reach an army, so this
         * round-trips exactly and the replay matches the original battle. */
        view.setUint16(o + 1, U16(e.x), true);
        view.setUint16(o + 3, U16(e.y), true);
        o += UNIT_BYTES;
      });
    });
    return toBase64Url(new Uint8Array(buf));
  }

  function U16(v) {
    v = Math.round(v);
    if (!(v >= 0)) return 0;          // also catches NaN
    return v > 65535 ? 65535 : v;
  }

  /* Returns a setup object, or null if the payload is not a battle this build can
   * reconstruct. Every field is treated as untrusted. */
  function decode(text) {
    let bytes;
    try {
      bytes = fromBase64Url(text);
    } catch (e) {
      return null;
    }
    if (bytes.length < HEADER) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint8(0) !== FORMAT) return null;

    const mapIndex = view.getUint8(1);
    if (mapIndex >= W.Terrain.MAPS.length) return null;

    const countA = view.getUint16(12, true);
    const countB = view.getUint16(14, true);
    const total = countA + countB;
    if (bytes.length !== HEADER + total * UNIT_BYTES) return null;

    const armies = [[], []];
    let o = HEADER;
    for (let team = 0; team < 2; team++) {
      const n = team === 0 ? countA : countB;
      for (let i = 0; i < n; i++) {
        const id = TYPE_WIRE[view.getUint8(o)];
        if (!id || !W.Units.TYPES[id]) return null;
        armies[team].push({
          type: id,
          x: view.getUint16(o + 1, true),
          y: view.getUint16(o + 3, true)
        });
        o += UNIT_BYTES;
      }
    }

    return {
      mapId: W.Terrain.MAPS[mapIndex].id,
      terrainSeed: view.getUint32(2, true) >>> 0,
      battleSeed: view.getUint32(6, true) >>> 0,
      budget: view.getUint16(10, true),
      armies: armies
    };
  }

  /* Absolute URL for this battle, with the payload in the fragment.
   *
   * The fragment matters: the service worker caches by full URL, so a query
   * string would make every shared link a cache miss and force a network round
   * trip before the game could start. A fragment is not part of the cache key. */
  function linkFor(setup) {
    let base = location.origin + location.pathname;
    base = base.replace(/index\.html$/, '');
    return base + '#r=' + encode(setup);
  }

  /* Reads a payload out of a location hash, if one is there. */
  function fromHash(hash) {
    const m = /[#&]r=([A-Za-z0-9\-_]+)/.exec(hash || '');
    return m ? decode(m[1]) : null;
  }

  W.Share = {
    encode: encode,
    decode: decode,
    linkFor: linkFor,
    fromHash: fromHash,
    auditRegistry: auditRegistry,
    TYPE_WIRE: TYPE_WIRE,
    FORMAT: FORMAT
  };
})(window);
