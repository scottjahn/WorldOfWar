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

  /* Format 2 added the edition byte; format 1 payloads are all Earth. */
  const FORMAT = 2;
  const HEADER = 17;
  const UNIT_BYTES = 5;

  /* Fixed wire ordering for unit types.
   *
   * APPEND ONLY — never reorder or remove an entry. The index is what goes in the
   * link, so shuffling this list silently turns every existing link into a
   * different army. New units go on the end; if a link references an index this
   * build does not know, decoding fails cleanly rather than guessing. */
  const WIRE = {
    earth: [
      'rifles', 'mgteam', 'atteam', 'mortar', 'jeep', 'apc', 'lighttank', 'medtank',
      'heavytank', 'flaktank', 'sam', 'spg', 'mlrs', 'repair', 'pillbox', 'coastalgun',
      'drone', 'gunship', 'attackheli', 'fighter', 'bomber', 'patrolboat', 'corvette',
      'destroyer', 'battleship', 'carrier', 'f14', 'submarine'
    ],
    animals: [
      'hamster', 'pigeon', 'rabbit', 'budgie', 'housecat', 'ferret', 'terrier', 'parrot',
      'bulldog', 'tortoise', 'guarddog', 'pig',
      'vulture', 'hyena', 'boar', 'lynx', 'wolf', 'eagle', 'cheetah', 'crocodile',
      'lion', 'bear', 'rhino',
      'cornsnake', 'ballpython', 'boa', 'rattlesnake', 'cobra', 'mamba'
    ],
    space: [
      'z95', 'awing', 'xwing', 'ywing', 'gr75', 'bwing', 'yt1300', 'ionplatform',
      'cr90', 'nebulonb', 'mc30', 'mc80', 'xwingw',
      'tie', 'tieint', 'tiebomber', 'gunboat', 'shuttle', 'golan', 'gozanti',
      'tiedef', 'raider', 'arquitens', 'victory', 'isd', 'tiew', 'deathstar'
    ],
    prehistoric: [
      'compsognathus', 'gallimimus', 'velociraptor', 'parasaurolophus', 'dilophosaurus',
      'pachycephalosaurus', 'smilodon', 'stegosaurus', 'allosaurus', 'ankylosaurus',
      'triceratops', 'mammoth', 'spinosaurus', 'trex', 'brachiosaurus',
      'meganeura', 'microraptor', 'rhamphorhynchus', 'pteranodon', 'quetzalcoatlus',
      'ammonite', 'ichthyosaur', 'archelon', 'dunkleosteus', 'elasmosaurus',
      'mosasaurus', 'megalodon',
      'sanajeh', 'titanoboa', 'palaeophis'
    ]
  };

  /* Edition ordering is itself a wire format — append only, same as the unit lists. */
  const EDITION_WIRE = ['earth', 'animals', 'space', 'prehistoric'];

  function wireFor(editionId) { return WIRE[editionId] || []; }

  function indexFor(editionId) {
    const list = wireFor(editionId);
    const map = {};
    list.forEach(function (id, i) { map[id] = i; });
    return map;
  }

  /* Surfaces a mismatch during development rather than shipping broken links. */
  function auditRegistry(editionId) {
    const ed = editionId || (W.Editions.current() && W.Editions.current().id) || 'earth';
    const map = indexFor(ed);
    const missing = Object.keys(W.Units.TYPES).filter(function (id) {
      return map[id] === undefined;
    });
    if (missing.length && window.console) {
      console.warn('share.js: unit types missing from the "' + ed +
        '" wire list (links cannot encode them): ' + missing.join(', '));
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
    const editionId = setup.editionId ||
      (W.Editions.current() && W.Editions.current().id) || 'earth';
    const edIndex = EDITION_WIRE.indexOf(editionId);
    if (edIndex < 0) throw new Error('unknown edition: ' + editionId);

    const ed = W.Editions.byId(editionId);
    const maps = (ed && ed.maps) || W.Terrain.MAPS;
    const mapIndex = maps.findIndex(function (m) { return m.id === setup.mapId; });
    if (mapIndex < 0) throw new Error('unknown map: ' + setup.mapId);

    const typeIndex = indexFor(editionId);
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
    view.setUint8(16, edIndex);

    let o = HEADER;
    [a, b].forEach(function (army) {
      army.forEach(function (e) {
        const idx = typeIndex[e.type];
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
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const format = bytes.length ? view.getUint8(0) : 0;
    /* Format 1 predates editions and is always Earth; its header is a byte shorter. */
    if (format !== FORMAT && format !== 1) return null;
    const header = format === 1 ? 16 : HEADER;
    if (bytes.length < header) return null;

    const editionId = format === 1 ? 'earth' : EDITION_WIRE[view.getUint8(16)];
    const ed = editionId && W.Editions.byId(editionId);
    if (!ed || !ed.available) return null;

    const maps = ed.maps || [];
    const mapIndex = view.getUint8(1);
    if (mapIndex >= maps.length) return null;

    const countA = view.getUint16(12, true);
    const countB = view.getUint16(14, true);
    const total = countA + countB;
    if (bytes.length !== header + total * UNIT_BYTES) return null;

    const wire = wireFor(editionId);
    const armies = [[], []];
    let o = header;
    for (let team = 0; team < 2; team++) {
      const n = team === 0 ? countA : countB;
      for (let i = 0; i < n; i++) {
        const id = wire[view.getUint8(o)];
        if (!id) return null;
        armies[team].push({
          type: id,
          x: view.getUint16(o + 1, true),
          y: view.getUint16(o + 3, true)
        });
        o += UNIT_BYTES;
      }
    }

    return {
      editionId: editionId,
      mapId: maps[mapIndex].id,
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
    wireFor: wireFor,
    EDITION_WIRE: EDITION_WIRE,
    FORMAT: FORMAT
  };
})(window);
