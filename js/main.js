/* Game shell: phase machine, placement rules, battle loop. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;

  const EDITION_KEY = 'wow.edition';

  function Game() {
    this.canvas = document.getElementById('game');
    this.renderer = new W.Renderer(this.canvas);
    this.ui = new W.UI(this);

    this.phase = 'menu';
    this.terrain = null;
    this.armies = [[], []];
    this.playerTeam = 0;
    this.hotseat = false;
    this.seed = (Math.random() * 0xffffffff) >>> 0;

    /* Start on whichever edition was last played, falling back to Earth. */
    let remembered = null;
    try {
      remembered = window.localStorage && localStorage.getItem(EDITION_KEY);
    } catch (e) {
      remembered = null;
    }
    this.setEdition((remembered && W.Editions.byId(remembered) &&
      W.Editions.byId(remembered).available) ? remembered : 'earth');

    this.battle = null;
    this.speed = 1;
    this.paused = false;
    this.accumulator = 0;
    this.lastFrame = performance.now();

    this.placingType = null;
    this.ghost = null;
    this.hover = null;

    const self = this;
    window.addEventListener('resize', function () { self.onResize(); });
    /* Pasting a replay link while the game is already open only changes the
     * fragment — the browser does not reload — so pick it up here too. */
    window.addEventListener('hashchange', function () {
      if (location.hash.indexOf('r=') < 0) return;
      let loaded = false;
      try {
        loaded = self.loadFromHash();
      } catch (e) {
        loaded = false;
      }
      if (!loaded) self.ui.toast('That replay link could not be read');
    });
    this.onResize();
    /* A replay link goes straight into its battle; anything else opens the menu. */
    let launched = false;
    try {
      launched = this.loadFromHash();
    } catch (e) {
      launched = false;
    }
    if (!launched) {
      if (location.hash.indexOf('r=') >= 0) {
        this.openMenu();
        this.ui.toast('That replay link could not be read');
      } else {
        /* First stop is always the edition picker — it is the front door. */
        this.openEditionPicker();
      }
    }
    requestAnimationFrame(function (t) { self.frame(t); });
  }

  Game.prototype.onResize = function () {
    this.renderer.resize();
    if (this.terrain) {
      this.renderer.clampCamera();
    }
  };

  /* ========================== editions =========================== */

  /* Loads an edition's content and resets anything that belonged to the last one. */
  Game.prototype.setEdition = function (id) {
    const ed = W.Editions.activate(id);
    if (!ed) return false;
    this.edition = ed;
    this.mapId = ed.defaultMap;
    this.budget = ed.defaultBudget;
    this.armies = [[], []];
    this.battle = null;
    this.savedArmies = null;
    this.terrain = null;
    try {
      if (window.localStorage) localStorage.setItem(EDITION_KEY, id);
    } catch (e) { /* private browsing — the choice just will not persist */ }
    return true;
  };

  Game.prototype.openEditionPicker = function () {
    const self = this;
    this.phase = 'menu';
    this.ui.showPlacement(false);
    this.ui.showBattleControls(false);
    this.ui.setPhaseLabel('Choose edition');

    let html = '<h1>World of War</h1>';
    html += '<div class="build-tag">v' + W.UI.esc(W.WOW_VERSION || '?') +
      ' · build ' + W.UI.esc(W.WOW_BUILD || '?') + '</div>';
    html += '<p class="lede">Same battles, different worlds. Pick an edition.</p>';

    html += '<div class="edition-grid">';
    W.Editions.ALL.forEach(function (ed) {
      const cls = 'edition-card' + (ed.available ? '' : ' locked') +
        (ed.id === self.edition.id ? ' selected' : '');
      html += '<button class="' + cls + '"' +
        (ed.available ? ' data-edition="' + ed.id + '"' : ' disabled') + '>';
      html += '<span class="edition-emblem">' + ed.emblem + '</span>';
      html += '<span class="edition-body">';
      html += '<span class="edition-name">' + W.UI.esc(ed.short) + '</span>';
      html += '<span class="edition-tag">' + W.UI.esc(ed.tagline) + '</span>';
      html += '<span class="edition-blurb">' + W.UI.esc(ed.blurb) + '</span>';
      html += '</span>';
      if (!ed.available) html += '<span class="edition-soon">Coming soon</span>';
      html += '</button>';
    });
    html += '</div>';

    this.ui.showOverlay(html, function (panel) {
      panel.querySelectorAll('[data-edition]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.setEdition(b.getAttribute('data-edition'));
          self.openMenu();
        });
      });
    });
  };

  /* ============================ menu ============================= */

  Game.prototype.openMenu = function () {
    const self = this;
    this.phase = 'menu';
    this.ui.showPlacement(false);
    this.ui.showBattleControls(false);
    this.ui.setPhaseLabel('Setup');

    const ed = this.edition;
    let html = '<h1>' + W.UI.esc(ed.name) + '</h1>';
    /* Directly under the title so it is visible without scrolling on a phone —
     * the whole point is checking at a glance which build actually loaded when a
     * cached copy would otherwise look identical to a fresh one. */
    html += '<div class="build-tag">v' + W.UI.esc(W.WOW_VERSION || '?') +
      ' · build ' + W.UI.esc(W.WOW_BUILD || '?') +
      ' · <button class="linkish" id="ovEdition">change edition</button></div>';
    html += '<p class="lede">' + W.UI.esc(ed.blurb) + '</p>';

    html += '<div class="section-label">Battlefield</div><div class="map-grid">';
    W.Terrain.MAPS.forEach(function (m) {
      html += '<button class="map-card' + (m.id === self.mapId ? ' selected' : '') + '" data-map="' + m.id + '">' +
        '<span class="map-name">' + W.UI.esc(m.name) + '</span>' +
        '<span class="map-blurb">' + W.UI.esc(m.blurb) + '</span></button>';
    });
    html += '</div>';

    html += '<div class="section-label">Army budget</div><div class="chip-row">';
    ed.budgets.forEach(function (b) {
      html += '<button class="chip' + (b === self.budget ? ' selected' : '') + '" data-budget="' + b + '">' + U.formatCost(b) + '</button>';
    });
    html += '</div>';

    html += '<div class="section-label">Opponent</div><div class="chip-row">';
    html += '<button class="chip' + (!self.hotseat ? ' selected' : '') + '" data-mode="ai">Computer</button>';
    html += '<button class="chip' + (self.hotseat ? ' selected' : '') + '" data-mode="hotseat">Two players (same device)</button>';
    html += '</div>';

    if (ed.factions) {
      html += '<p class="faction-note">You command <strong>' + W.UI.esc(ed.teams[0]) +
        '</strong>; the ' + W.UI.esc(ed.teams[1]) + ' oppose you. Each side fields its own animals.</p>';
    }

    html += '<div class="overlay-actions">';
    html += '<button class="btn ghost" id="ovReroll">New terrain</button>';
    html += '<button class="btn primary" id="ovStart">Deploy army</button>';
    html += '</div>';
    html += '<p class="fineprint">Drag to pan · scroll or pinch to zoom · right-click or long-press to remove a unit</p>';

    this.ui.showOverlay(html, function (panel) {
      panel.querySelectorAll('[data-map]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.mapId = b.getAttribute('data-map');
          panel.querySelectorAll('[data-map]').forEach(function (o) { o.classList.remove('selected'); });
          b.classList.add('selected');
        });
      });
      panel.querySelectorAll('[data-budget]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.budget = parseInt(b.getAttribute('data-budget'), 10);
          panel.querySelectorAll('[data-budget]').forEach(function (o) { o.classList.remove('selected'); });
          b.classList.add('selected');
        });
      });
      panel.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.hotseat = b.getAttribute('data-mode') === 'hotseat';
          panel.querySelectorAll('[data-mode]').forEach(function (o) { o.classList.remove('selected'); });
          b.classList.add('selected');
        });
      });
      panel.querySelector('#ovEdition').addEventListener('click', function () {
        self.openEditionPicker();
      });
      panel.querySelector('#ovReroll').addEventListener('click', function () {
        self.seed = (Math.random() * 0xffffffff) >>> 0;
        self.buildTerrain();
        self.ui.toast('New terrain generated');
      });
      panel.querySelector('#ovStart').addEventListener('click', function () { self.startPlacement(); });
    });

    if (!this.terrain || this.terrain.mapId !== this.mapId) this.buildTerrain();
  };

  Game.prototype.buildTerrain = function () {
    this.terrain = new W.Terrain(this.mapId, this.seed);
    this.renderer.setTerrain(this.terrain);
    this.renderer.fit();
    this.armies = [[], []];
    this.battle = null;
  };

  /* ========================== placement ========================== */

  Game.prototype.startPlacement = function () {
    if (!this.terrain || this.terrain.mapId !== this.mapId) this.buildTerrain();
    this.armies = [[], []];
    this.battle = null;
    this.playerTeam = 0;
    this.phase = 'place';
    this.placingType = null;
    this.undoStack = [];

    this.ui.hideOverlay();
    this.ui.showPlacement(true);
    this.ui.showBattleControls(false);
    this.ui.buildRoster();
    this.enterPlacementFor(0);
  };

  Game.prototype.enterPlacementFor = function (team) {
    this.playerTeam = team;
    this.placingType = null;
    this.concealed = false;
    this.undoStack = [];
    this.ui.setPhaseLabel('Deploy — ' + W.Editions.teamName(team));
    this.ui.buildRoster();
    this.ui.refreshBudget();
    this.ui.refreshTallies();
    this.renderer.focusZone(team);
    this.warnAboutMap();
  };

  /* Tell the player up front if their zone cannot host part of the roster. */
  Game.prototype.warnAboutMap = function () {
    const t = this.terrain;
    if (t.zoneSeaFrac < 0.05) this.ui.toast('No water in your zone — naval units cannot deploy here.');
    else if (t.zoneLandFrac < 0.10) this.ui.toast('Almost no dry land — build a navy or an air force.');
  };

  Game.prototype.armyCost = function (team) {
    let sum = 0;
    const a = this.armies[team];
    for (let i = 0; i < a.length; i++) sum += Units.TYPES[a[i].type].cost;
    return sum;
  };

  Game.prototype.selectType = function (id) {
    if (this.phase !== 'place') return;
    this.placingType = this.placingType === id ? null : id;
    this.ui.refreshRosterSelection();
  };

  Game.prototype.cancelPlacement = function () {
    if (this.phase === 'place') {
      this.placingType = null;
      this.ghost = null;
      this.ui.refreshRosterSelection();
    }
  };

  /* Why a unit cannot go here — returns null when the spot is legal. */
  Game.prototype.placementError = function (typeId, x, y) {
    const type = Units.TYPES[typeId];
    const team = this.playerTeam;

    if (!this.terrain.inDeployZone(team, x)) return 'Outside your deployment zone';
    if (this.armyCost(team) + type.cost > this.budget) return 'Not enough budget';
    if (!this.terrain.passable(type.domain, x, y)) {
      return type.domain === Units.SEA ? 'Ships need open water'
        : type.domain === Units.LAND ? 'Cannot deploy on water or rock' : 'Off the battlefield';
    }
    const army = this.armies[team];
    for (let i = 0; i < army.length; i++) {
      const o = army[i];
      const ot = Units.TYPES[o.type];
      if ((ot.domain === Units.AIR) !== (type.domain === Units.AIR)) continue;
      const minD = (ot.radius + type.radius) * 1.1;
      if (U.dist2(o.x, o.y, x, y) < minD * minD) return 'Too close to another unit';
    }
    return null;
  };

  Game.prototype.onHover = function (screenPos) {
    if (this.phase !== 'place') { this.ghost = null; this.hover = null; return; }
    const w = this.renderer.screenToWorld(screenPos.x, screenPos.y);
    /* Same snap as placement, so the ghost sits exactly where the unit will land. */
    w.x = Math.round(w.x);
    w.y = Math.round(w.y);
    if (this.placingType) {
      this.ghost = { x: w.x, y: w.y, valid: this.placementError(this.placingType, w.x, w.y) === null };
      this.hover = null;
    } else {
      this.ghost = null;
      this.hover = this.unitAt(w);
    }
  };

  Game.prototype.unitAt = function (world) {
    const army = this.armies[this.playerTeam];
    let best = null, bestD = Infinity;
    for (let i = 0; i < army.length; i++) {
      const t = Units.TYPES[army[i].type];
      const d = U.dist2(army[i].x, army[i].y, world.x, world.y);
      const r = (t.radius + 8) * (t.radius + 8);
      if (d < r && d < bestD) { bestD = d; best = army[i]; }
    }
    return best;
  };

  Game.prototype.onTap = function (screenPos, isRight) {
    const world = this.renderer.screenToWorld(screenPos.x, screenPos.y);
    /* Snap to whole world units. Units are 9–26 across on a 2400x1400 field, so
     * this is invisible in play, and it lets a replay link store positions
     * exactly rather than approximating them. */
    world.x = Math.round(world.x);
    world.y = Math.round(world.y);
    if (this.phase !== 'place') return;
    if (isRight) { this.removeAt(world); return; }

    if (!this.placingType) {
      /* Tapping an existing unit re-selects its type for quick repeat placement. */
      const hit = this.unitAt(world);
      if (hit) { this.selectType(hit.type); this.ui.toast(Units.TYPES[hit.type].name + ' selected'); }
      return;
    }

    const err = this.placementError(this.placingType, world.x, world.y);
    if (err) { this.ui.toast(err); return; }

    this.armies[this.playerTeam].push({ type: this.placingType, x: world.x, y: world.y });
    this.undoStack.push({ action: 'add' });
    this.afterArmyChange();
  };

  Game.prototype.removeAt = function (world) {
    if (this.phase !== 'place') return;
    const hit = this.unitAt(world);
    if (!hit) return;
    const army = this.armies[this.playerTeam];
    const idx = army.indexOf(hit);
    army.splice(idx, 1);
    this.undoStack.push({ action: 'remove', entry: hit, index: idx });
    this.hover = null;
    this.afterArmyChange();
    this.ui.toast(Units.TYPES[hit.type].name + ' removed');
  };

  Game.prototype.undo = function () {
    if (this.phase !== 'place' || !this.undoStack || !this.undoStack.length) return;
    const step = this.undoStack.pop();
    const army = this.armies[this.playerTeam];
    if (step.action === 'add') army.pop();
    else army.splice(step.index, 0, step.entry);
    this.afterArmyChange();
  };

  Game.prototype.clearArmy = function () {
    if (this.phase !== 'place') return;
    this.armies[this.playerTeam] = [];
    this.undoStack = [];
    this.afterArmyChange();
  };

  Game.prototype.autoFill = function () {
    if (this.phase !== 'place') return;
    const team = this.playerTeam;
    const remaining = this.budget - this.armyCost(team);
    if (remaining <= 0) { this.ui.toast('Budget already spent'); return; }
    const generated = W.ArmyAI.generateArmy(this.terrain, team, remaining, (Math.random() * 0xffffffff) >>> 0);
    /* Keep whatever the player placed by hand; only add what fits around it. */
    const self = this;
    let added = 0;
    generated.forEach(function (e) {
      if (self.placementError(e.type, e.x, e.y) === null) {
        self.armies[team].push(e);
        added++;
      }
    });
    this.undoStack = [];
    this.afterArmyChange();
    this.ui.toast(added ? 'Added ' + added + ' units (' + generated.doctrine + ')' : 'No room left to auto-fill');
  };

  Game.prototype.afterArmyChange = function () {
    this.ui.refreshBudget();
    this.ui.refreshTallies();
    this.ui.refreshRosterSelection();
  };

  Game.prototype.ready = function () {
    if (this.phase !== 'place') return;
    if (!this.armies[this.playerTeam].length) { this.ui.toast('Place at least one unit'); return; }

    if (this.hotseat && this.playerTeam === 0) {
      const self = this;
      /* Blank the battlefield before the overlay opens, so Blue's deployment is
       * not sitting behind it while the device changes hands. */
      this.concealed = true;
      this.placingType = null;
      this.ghost = null;
      this.hover = null;
      const first = W.Editions.teamName(0), second = W.Editions.teamName(1);
      this.ui.showOverlay(
        '<h2>Pass the device</h2><p class="lede">' + W.UI.esc(first) + ' are locked in and hidden. ' +
        'Hand over to ' + W.UI.esc(second) + ' — you will deploy without seeing where they are.</p>' +
        '<div class="overlay-actions"><button class="btn primary" id="ovNext">Red is ready</button></div>',
        function (panel) {
          panel.querySelector('#ovNext').addEventListener('click', function () {
            self.ui.hideOverlay();
            self.enterPlacementFor(1);
          });
          panel.querySelector('#ovNext').textContent = second + ' ready';
        });
      return;
    }

    /* Keep an existing AI army so "Edit armies" lets you iterate against the same
     * opponent. A fresh setup clears both armies, which regenerates it. */
    if (!this.hotseat && !this.armies[1].length) {
      this.armies[1] = W.ArmyAI.generateArmy(this.terrain, 1, this.budget, (Math.random() * 0xffffffff) >>> 0);
    }
    this.startBattle();
  };

  /* =========================== battle ============================ */

  /* `seed` replays a previous battle exactly; omit it for a fresh one. */
  Game.prototype.startBattle = function (seed) {
    this.savedArmies = [this.armies[0].slice(), this.armies[1].slice()];
    this.battleSeed = seed != null ? (seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0);
    this.battle = new W.Battle(this.terrain, this.armies, this.battleSeed);
    this.phase = 'battle';
    /* Must clear here, not just on leaving the battle phase: "Replay battle" goes
     * straight from battle to battle, and a stale flag suppressed the result screen
     * for every battle after the first. */
    this.resultShown = false;
    this.paused = false;
    this.speed = 1;
    this.placingType = null;
    this.ghost = null;
    this.hover = null;
    this.renderer.decalCount = 0;
    if (this.renderer.decalCtx) {
      this.renderer.decalCtx.clearRect(0, 0, this.terrain.width, this.terrain.height);
    }

    this.ui.hideOverlay();
    this.ui.showPlacement(false);
    this.ui.showBattleControls(true);
    this.ui.setPhaseLabel('Battle');
    this.ui.dom.btnSpeed.textContent = '1×';
    this.ui.dom.btnPause.textContent = '❚❚';
    this.renderer.fit();
    this.ui.refreshTallies();
  };

  /* Same armies, same seed — the replay plays out shot for shot as it did before. */
  Game.prototype.restartBattle = function () {
    if (!this.savedArmies) return;
    this.armies = [this.savedArmies[0].slice(), this.savedArmies[1].slice()];
    this.startBattle(this.battleSeed);
  };

  Game.prototype.togglePause = function () {
    if (this.phase !== 'battle') return;
    this.paused = !this.paused;
    this.ui.dom.btnPause.textContent = this.paused ? '▶' : '❚❚';
  };

  Game.prototype.cycleSpeed = function () {
    if (this.phase !== 'battle') return;
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    this.ui.dom.btnSpeed.textContent = this.speed + '×';
  };

  Game.prototype.showResult = function () {
    const b = this.battle;
    const self = this;
    const winner = b.winner;
    const ed = this.edition;
    const title = winner === -1 ? 'Stalemate' : W.Editions.teamName(winner) + ' Victory';
    const cls = winner === 0 ? 'win-blue' : winner === 1 ? 'win-red' : 'win-draw';
    const words = ed.words || {};

    let html = '<h2 class="' + cls + '">' + title + '</h2>';
    html += '<p class="lede">' + W.UI.esc(b.reason) + ' · ' + formatTime(b.time) +
      ' · <span class="seed">seed ' + b.seed.toString(16) + '</span></p>';
    const wSurv = words.survivors || 'Survivors';
    const wLeft = words.remaining || 'Value left';
    const wLost = words.lost || 'Value lost';
    html += '<div class="result-grid">';
    for (let team = 0; team < 2; team++) {
      html += '<div class="result-col"><div class="result-team ' + (team === 0 ? 'blue' : 'red') + '">' +
        W.UI.esc(W.Editions.teamName(team)) + '</div>' +
        resultRow(wSurv, b.aliveUnits(team) + ' / ' + countTeam(b, team)) +
        resultRow(wLeft, U.formatCost(Math.round(b.remainingValue(team)))) +
        resultRow(wLost, U.formatCost(Math.round(b.lostValue[team]))) + '</div>';
    }
    html += '</div>';

    html += '<div class="share-row"><input id="ovLink" class="share-link" readonly>' +
      '<button class="btn ghost" id="ovCopy">Copy link</button></div>';
    html += '<p class="share-hint">Anyone who opens that link watches this exact battle.</p>';

    html += '<div class="overlay-actions">';
    html += '<button class="btn ghost" id="ovReplay">Replay battle</button>';
    html += '<button class="btn ghost" id="ovEdit">Edit armies</button>';
    html += '<button class="btn primary" id="ovMenu">New battle</button>';
    html += '</div>';

    this.ui.showOverlay(html, function (panel) {
      panel.querySelector('#ovReplay').addEventListener('click', function () { self.restartBattle(); });
      panel.querySelector('#ovEdit').addEventListener('click', function () { self.backToPlacement(); });
      panel.querySelector('#ovMenu').addEventListener('click', function () { self.openMenu(); });

      const input = panel.querySelector('#ovLink');
      const copyBtn = panel.querySelector('#ovCopy');
      let url = null;
      try {
        url = self.replayLink();
      } catch (err) {
        input.value = 'Could not build a link for this battle';
        copyBtn.disabled = true;
      }
      if (url) {
        input.value = url;
        copyBtn.addEventListener('click', function () {
          input.select();
          const done = function () { self.ui.toast('Replay link copied'); };
          /* Clipboard access needs a secure context and can still be refused, so
           * the field stays on screen and selected as a manual fallback. */
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, function () {
              self.ui.toast('Press Ctrl+C to copy the selected link');
            });
          } else {
            self.ui.toast('Press Ctrl+C to copy the selected link');
          }
        });
      }
    });
  };

  /* A shareable URL that reproduces the battle currently loaded. */
  Game.prototype.replayLink = function () {
    return W.Share.linkFor({
      editionId: this.edition.id,
      mapId: this.mapId,
      terrainSeed: this.terrain.seed,
      battleSeed: this.battleSeed,
      budget: this.budget,
      armies: this.savedArmies || this.armies
    });
  };

  /* Rebuilds a battle from a link payload. Returns false if there was nothing
   * usable in the URL, so the caller can fall back to the normal menu. */
  Game.prototype.loadFromHash = function () {
    let setup = null;
    try {
      setup = W.Share.fromHash(location.hash);
    } catch (e) {
      setup = null;
    }
    if (!setup) return false;
    if (!setup.armies[0].length && !setup.armies[1].length) return false;

    /* A link names its own edition, so following one can switch worlds. This has
     * to happen before validating, since the roster and field size come with it. */
    const wantEdition = setup.editionId || 'earth';
    const previousEdition = this.edition && this.edition.id;
    if (wantEdition !== previousEdition && !this.setEdition(wantEdition)) return false;

    /* Validate against a throwaway terrain first. Checking after committing would
     * leave a rejected link having already swapped the map and wiped the armies,
     * stranding the player on an empty battlefield. */
    let candidate;
    try {
      candidate = new W.Terrain(setup.mapId, setup.terrainSeed);
    } catch (e) {
      candidate = null;
    }
    if (!candidate) {
      if (previousEdition && previousEdition !== wantEdition) this.setEdition(previousEdition);
      return false;
    }
    const bad = setup.armies.some(function (army) {
      return army.some(function (e) {
        const type = Units.TYPES[e.type];
        return !type || type.hidden ||
          e.x < 0 || e.y < 0 || e.x > candidate.width || e.y > candidate.height ||
          !candidate.passable(type.domain, e.x, e.y);
      });
    });
    if (bad) {
      if (previousEdition && previousEdition !== wantEdition) this.setEdition(previousEdition);
      return false;
    }

    /* Everything checks out — now commit. */
    this.mapId = setup.mapId;
    this.seed = setup.terrainSeed;
    this.budget = setup.budget || 3000;
    this.buildTerrain();
    this.armies = [setup.armies[0].slice(), setup.armies[1].slice()];
    this.hotseat = false;
    this.ui.hideOverlay();
    this.ui.buildRoster();
    this.startBattle(setup.battleSeed);
    this.ui.toast('Replaying a shared battle');
    return true;
  };

  function countTeam(b, team) {
    let n = 0;
    for (let i = 0; i < b.units.length; i++) if (b.units[i].team === team) n++;
    return n;
  }

  function resultRow(label, value) {
    return '<div class="result-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function formatTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* Returns to placement with both armies intact so setups can be iterated on. */
  Game.prototype.backToPlacement = function () {
    this.armies = [this.savedArmies[0].slice(), this.savedArmies[1].slice()];
    this.battle = null;
    this.phase = 'place';
    this.renderer.decalCount = 0;
    if (this.renderer.decalCtx) this.renderer.decalCtx.clearRect(0, 0, this.terrain.width, this.terrain.height);
    this.ui.hideOverlay();
    this.ui.showPlacement(true);
    this.ui.showBattleControls(false);
    this.enterPlacementFor(0);
  };

  /* ============================ loop ============================= */

  Game.prototype.frame = function (now) {
    const self = this;
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.25) dt = 0.25;

    if (this.phase === 'battle' && this.battle && !this.paused && !this.battle.over) {
      this.accumulator += dt * this.speed;
      let steps = 0;
      const maxSteps = 8 * this.speed;
      while (this.accumulator >= W.Battle.DT && steps < maxSteps) {
        this.battle.step();
        this.accumulator -= W.Battle.DT;
        steps++;
        if (this.battle.over) break;
      }
      if (this.accumulator > W.Battle.DT * 6) this.accumulator = 0;

      this.ui.refreshTallies();
    }

    /* Kept outside the stepping block above: that block is skipped once the battle
     * is over (and while paused), so a result detected there could be missed. */
    if (this.phase === 'battle' && this.battle && this.battle.over && !this.resultShown) {
      this.resultShown = true;
      const finished = this.battle;
      /* Let the last explosions finish before the summary covers the field. */
      setTimeout(function () { if (self.battle === finished) self.showResult(); }, 1200);
    }

    /* In hotseat, each commander only ever sees their own army during placement,
     * and nothing at all while the device is being handed over. */
    let armyFilter = null;
    if (this.phase === 'place' && this.hotseat) {
      armyFilter = this.concealed ? -1 : this.playerTeam;
    }

    this.renderer.draw({
      phase: this.phase,
      battle: this.battle,
      armies: this.battle ? null : this.armies,
      armyFilter: armyFilter,
      team: this.playerTeam,
      placingType: this.placingType,
      ghost: this.ghost,
      hover: this.hover
    }, dt);

    requestAnimationFrame(function (t) { self.frame(t); });
  };

  window.addEventListener('load', function () {
    /* Also on the console, so the running build can be confirmed from devtools
     * without opening the menu. */
    if (window.console && console.info) {
      console.info('World of War v' + W.WOW_VERSION + ' (build ' + W.WOW_BUILD + ')');
    }
    W.game = new Game();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      /* Whether a worker was already driving this page before we registered. */
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        /* A newer build just took over. Reload once so the running page is not a
         * mix of old and new files — without this, an updated worker only takes
         * effect on some later visit the player never knowingly makes. */
        if (hadController && !reloading) { reloading = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        /* Ask outright rather than waiting for the browser's own update check. */
        reg.update();
      }).catch(function () { /* offline support is optional */ });
    }
  });
})(window);
