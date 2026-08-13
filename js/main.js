/* Game shell: phase machine, placement rules, battle loop. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;

  const BUDGETS = [1500, 3000, 6000, 12000];

  function Game() {
    this.canvas = document.getElementById('game');
    this.renderer = new W.Renderer(this.canvas);
    this.ui = new W.UI(this);

    this.phase = 'menu';
    this.terrain = null;
    this.armies = [[], []];
    this.budget = 3000;
    this.playerTeam = 0;
    this.hotseat = false;
    this.mapId = 'coast';
    this.seed = (Math.random() * 0xffffffff) >>> 0;

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
    this.onResize();
    this.openMenu();
    requestAnimationFrame(function (t) { self.frame(t); });
  }

  Game.prototype.onResize = function () {
    this.renderer.resize();
    if (this.terrain) {
      this.renderer.clampCamera();
    }
  };

  /* ============================ menu ============================= */

  Game.prototype.openMenu = function () {
    const self = this;
    this.phase = 'menu';
    this.ui.showPlacement(false);
    this.ui.showBattleControls(false);
    this.ui.setPhaseLabel('Setup');

    let html = '<h1>World of War</h1>';
    /* Directly under the title so it is visible without scrolling on a phone —
     * the whole point is checking at a glance which build actually loaded when a
     * cached copy would otherwise look identical to a fresh one. */
    html += '<div class="build-tag">v' + W.UI.esc(W.WOW_VERSION || '?') +
      ' · build ' + W.UI.esc(W.WOW_BUILD || '?') + '</div>';
    html += '<p class="lede">Build an army, place it, and watch the battle play itself out.</p>';

    html += '<div class="section-label">Battlefield</div><div class="map-grid">';
    W.Terrain.MAPS.forEach(function (m) {
      html += '<button class="map-card' + (m.id === self.mapId ? ' selected' : '') + '" data-map="' + m.id + '">' +
        '<span class="map-name">' + W.UI.esc(m.name) + '</span>' +
        '<span class="map-blurb">' + W.UI.esc(m.blurb) + '</span></button>';
    });
    html += '</div>';

    html += '<div class="section-label">Army budget</div><div class="chip-row">';
    BUDGETS.forEach(function (b) {
      html += '<button class="chip' + (b === self.budget ? ' selected' : '') + '" data-budget="' + b + '">' + U.formatCost(b) + '</button>';
    });
    html += '</div>';

    html += '<div class="section-label">Opponent</div><div class="chip-row">';
    html += '<button class="chip' + (!self.hotseat ? ' selected' : '') + '" data-mode="ai">Computer</button>';
    html += '<button class="chip' + (self.hotseat ? ' selected' : '') + '" data-mode="hotseat">Two players (same device)</button>';
    html += '</div>';

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
    this.ui.setPhaseLabel(team === 0 ? 'Deploy — Blue' : 'Deploy — Red');
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
      this.ui.showOverlay(
        '<h2>Pass the device</h2><p class="lede">Blue army is locked in and hidden. ' +
        'Hand over to the Red commander — you will deploy without seeing where Blue is.</p>' +
        '<div class="overlay-actions"><button class="btn primary" id="ovNext">Red is ready</button></div>',
        function (panel) {
          panel.querySelector('#ovNext').addEventListener('click', function () {
            self.ui.hideOverlay();
            self.enterPlacementFor(1);
          });
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
    const title = winner === -1 ? 'Mutual Destruction' : (winner === 0 ? 'Blue Victory' : 'Red Victory');
    const cls = winner === 0 ? 'win-blue' : winner === 1 ? 'win-red' : 'win-draw';

    let html = '<h2 class="' + cls + '">' + title + '</h2>';
    html += '<p class="lede">' + W.UI.esc(b.reason) + ' · ' + formatTime(b.time) +
      ' · <span class="seed">seed ' + b.seed.toString(16) + '</span></p>';
    html += '<div class="result-grid">';
    html += '<div class="result-col"><div class="result-team blue">Blue</div>' +
      resultRow('Survivors', b.aliveUnits(0) + ' / ' + countTeam(b, 0)) +
      resultRow('Value left', U.formatCost(Math.round(b.remainingValue(0)))) +
      resultRow('Value lost', U.formatCost(Math.round(b.lostValue[0]))) + '</div>';
    html += '<div class="result-col"><div class="result-team red">Red</div>' +
      resultRow('Survivors', b.aliveUnits(1) + ' / ' + countTeam(b, 1)) +
      resultRow('Value left', U.formatCost(Math.round(b.remainingValue(1)))) +
      resultRow('Value lost', U.formatCost(Math.round(b.lostValue[1]))) + '</div>';
    html += '</div>';

    html += '<div class="overlay-actions">';
    html += '<button class="btn ghost" id="ovReplay">Replay battle</button>';
    html += '<button class="btn ghost" id="ovEdit">Edit armies</button>';
    html += '<button class="btn primary" id="ovMenu">New battle</button>';
    html += '</div>';

    this.ui.showOverlay(html, function (panel) {
      panel.querySelector('#ovReplay').addEventListener('click', function () { self.restartBattle(); });
      panel.querySelector('#ovEdit').addEventListener('click', function () { self.backToPlacement(); });
      panel.querySelector('#ovMenu').addEventListener('click', function () { self.openMenu(); });
    });
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
