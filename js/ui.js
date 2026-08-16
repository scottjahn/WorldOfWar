/* DOM UI: roster shop, army tallies, overlays, and all pointer input.
 *
 * Input model (identical on desktop and touch): a quick tap places or removes a
 * unit; a drag pans the camera; wheel or pinch zooms. Nothing depends on hover,
 * so everything works with a finger. */
(function (W) {
  'use strict';

  const U = W.Util;
  const Units = W.Units;

  /* Tab captions when the edition does not override them. */
  const DEFAULT_TABS = { land: 'Land', air: 'Air', sea: 'Sea' };

  function UI(game) {
    this.game = game;
    this.dom = {
      app: document.getElementById('app'),
      phaseLabel: document.getElementById('phaseLabel'),
      costA: document.getElementById('costA'),
      costB: document.getElementById('costB'),
      subA: document.getElementById('subA'),
      subB: document.getElementById('subB'),
      tallyA: document.getElementById('tallyA'),
      tallyB: document.getElementById('tallyB'),
      roster: document.getElementById('roster'),
      rosterList: document.getElementById('rosterList'),
      rosterDetail: document.getElementById('rosterDetail'),
      rosterHandle: document.getElementById('rosterHandle'),
      actionbar: document.getElementById('actionbar'),
      budgetSpent: document.getElementById('budgetSpent'),
      budgetCap: document.getElementById('budgetCap'),
      budgetFill: document.getElementById('budgetFill'),
      overlay: document.getElementById('overlay'),
      overlayPanel: document.getElementById('overlayPanel'),
      battleControls: document.getElementById('battleControls'),
      btnPause: document.getElementById('btnPause'),
      btnSpeed: document.getElementById('btnSpeed'),
      btnRestart: document.getElementById('btnRestart'),
      btnFit: document.getElementById('btnFit'),
      btnMenu: document.getElementById('btnMenu'),
      btnUndo: document.getElementById('btnUndo'),
      btnClear: document.getElementById('btnClear'),
      btnAuto: document.getElementById('btnAuto'),
      btnReady: document.getElementById('btnReady'),
      toast: document.getElementById('toast')
    };
    this.activeDomain = 'land';
    this.toastTimer = 0;
    this.bind();
  }

  UI.prototype.bind = function () {
    const self = this, g = this.game, d = this.dom;

    d.btnMenu.addEventListener('click', function () { g.openMenu(); });
    d.btnFit.addEventListener('click', function () { g.renderer.fit(); });
    d.btnUndo.addEventListener('click', function () { g.undo(); });
    d.btnClear.addEventListener('click', function () { g.clearArmy(); });
    d.btnAuto.addEventListener('click', function () { g.autoFill(); });
    d.btnReady.addEventListener('click', function () { g.ready(); });
    d.btnPause.addEventListener('click', function () { g.togglePause(); });
    d.btnSpeed.addEventListener('click', function () { g.cycleSpeed(); });
    d.btnRestart.addEventListener('click', function () { g.restartBattle(); });

    const tabs = d.roster.querySelectorAll('.tab');
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        for (let k = 0; k < tabs.length; k++) tabs[k].classList.remove('active');
        this.classList.add('active');
        self.activeDomain = this.getAttribute('data-domain');
        self.buildRoster();
      });
    }

    /* Collapse / expand the roster drawer on small screens. The matching class on
     * #app lets the action bar follow the drawer down. */
    d.rosterHandle.addEventListener('click', function () {
      const collapsed = d.roster.classList.toggle('collapsed');
      d.app.classList.toggle('roster-collapsed', collapsed);
    });

    this.bindPointer();

    window.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); g.togglePause(); }
      else if (e.key === 'Escape') { g.cancelPlacement(); }
      else if (e.key.toLowerCase() === 'f') { g.renderer.fit(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); g.undo(); }
    });
  };

  /* ------------------------- pointer handling ---------------------- */

  UI.prototype.bindPointer = function () {
    const self = this, g = this.game;
    const canvas = g.canvas;
    const pointers = new Map();
    let dragging = false, moved = 0;
    let last = { x: 0, y: 0 };
    let pinchDist = 0;
    let downAt = 0;
    let longPressTimer = null;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      moved = 0;
      downAt = performance.now();

      if (pointers.size === 1) {
        dragging = true;
        last = p;
        /* Long press acts as right-click on touch: remove the unit under the finger. */
        longPressTimer = setTimeout(function () {
          if (moved < 12) {
            g.removeAt(g.renderer.screenToWorld(p.x, p.y));
            longPressTimer = null;
            dragging = false;
          }
        }, 520);
      } else if (pointers.size === 2) {
        clearTimeout(longPressTimer); longPressTimer = null;
        dragging = false;
        const pts = Array.from(pointers.values());
        pinchDist = U.dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) {
        /* Hover preview on desktop only. */
        if (e.pointerType === 'mouse') g.onHover(pos(e));
        return;
      }
      const p = pos(e);
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, p);
      moved += U.dist(prev.x, prev.y, p.x, p.y);

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const d = U.dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
        if (pinchDist > 0) {
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          g.renderer.zoomAt(mid.x, mid.y, d / pinchDist);
        }
        pinchDist = d;
        return;
      }

      if (dragging && moved > 10) {
        const cam = g.renderer.cam;
        cam.x -= (p.x - prev.x) / cam.zoom;
        cam.y -= (p.y - prev.y) / cam.zoom;
        g.renderer.clampCamera();
      }
      if (e.pointerType === 'mouse') g.onHover(p);
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      clearTimeout(longPressTimer); longPressTimer = null;

      const wasQuick = performance.now() - downAt < 500;
      if (dragging && moved < 12 && wasQuick && pointers.size === 0) {
        g.onTap(p, e.button === 2);
      }
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) dragging = false;
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      g.removeAt(g.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top));
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const p = pos(e);
      g.renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.14 : 1 / 1.14);
    }, { passive: false });
  };

  /* --------------------------- roster shop ------------------------- */

  UI.prototype.buildRoster = function () {
    const list = this.dom.rosterList;
    const g = this.game;
    const self = this;

    /* Only show domains this side actually fields — the Animals edition has no
     * navy at all, so a Sea tab would be an empty shelf. */
    const allowed = W.Editions.rosterFor(g.playerTeam);
    const buckets = ['land', 'air', 'sea'].filter(function (b) {
      return Units.ORDER[b].some(function (id) { return allowed.indexOf(id) >= 0; });
    });
    /* An edition can rename the shelves it uses — Space fields no aircraft and no
     * navy, so its one tab reads "Fleet" rather than "Land". */
    const ed = W.Editions.current();
    const names = (ed && ed.bucketNames) || {};
    const tabs = this.dom.roster.querySelectorAll('.tab');
    for (let i = 0; i < tabs.length; i++) {
      const d = tabs[i].getAttribute('data-domain');
      tabs[i].classList.toggle('hidden', buckets.indexOf(d) === -1);
      tabs[i].textContent = names[d] || DEFAULT_TABS[d];
    }
    this.dom.roster.querySelector('.roster-tabs').style.gridTemplateColumns =
      'repeat(' + Math.max(1, buckets.length) + ', 1fr)';
    if (buckets.indexOf(this.activeDomain) === -1) this.activeDomain = buckets[0] || 'land';
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-domain') === this.activeDomain);
    }

    list.innerHTML = '';
    const ids = Units.ORDER[this.activeDomain].filter(function (id) {
      return allowed.indexOf(id) >= 0;
    });

    ids.forEach(function (id) {
      const type = Units.TYPES[id];
      const card = U.el('button', 'unit-card');
      card.setAttribute('data-id', id);

      const icon = U.el('canvas', 'unit-icon');
      icon.width = 44; icon.height = 44;
      W.Renderer.drawIcon(icon.getContext('2d'), type, g.playerTeam, 44);

      const info = U.el('div', 'unit-info');
      info.appendChild(U.el('div', 'unit-name', type.name));
      info.appendChild(U.el('div', 'unit-role', type.role));

      const cost = U.el('div', 'unit-cost', U.formatCost(type.cost));

      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(cost);

      card.addEventListener('click', function () { g.selectType(id); });
      list.appendChild(card);
    });

    this.refreshRosterSelection();
  };

  UI.prototype.refreshRosterSelection = function () {
    const g = this.game;
    const cards = this.dom.rosterList.querySelectorAll('.unit-card');
    const remaining = g.budget - g.armyCost(g.playerTeam);
    for (let i = 0; i < cards.length; i++) {
      const id = cards[i].getAttribute('data-id');
      cards[i].classList.toggle('selected', id === g.placingType);
      cards[i].classList.toggle('unaffordable', Units.TYPES[id].cost > remaining);
    }
    this.showDetail(g.placingType);
  };

  UI.prototype.showDetail = function (id) {
    const box = this.dom.rosterDetail;
    if (!id) {
      box.innerHTML = '<div class="detail-empty">Select a unit, then tap inside your deployment zone to place it.</div>';
      return;
    }
    const t = Units.TYPES[id];
    const ed = W.Editions.current();
    /* With one domain the "Domain" row would read the same on every card, so the
     * slot goes to the thing that actually varies — what kind of hull it is. */
    const single = !!(ed && ed.singleDomain);
    const domainName = t.domain === Units.AIR ? 'Air' : t.domain === Units.SEA ? 'Sea' : 'Land';
    const classOf = function (u) {
      const tags = u.tags || [];
      return tags.indexOf('fighter') >= 0 ? 'Small craft'
        : tags.indexOf('capital') >= 0 ? 'Warship' : '—';
    };

    let html = '';
    html += '<div class="detail-head"><span class="detail-name">' + esc(t.name) + '</span>';
    html += '<span class="detail-cost">' + U.formatCost(t.cost) + '</span></div>';
    html += '<div class="detail-desc">' + esc(t.desc) + '</div>';
    html += '<div class="stat-grid">';
    html += single ? stat('Class', classOf(t)) : stat('Domain', domainName);
    html += stat('Hull', Math.round(t.hp));
    html += stat('Armour', t.armor);
    html += stat('Speed', t.move === 'static' ? 'Immobile' : Math.round(t.speed));
    html += '</div>';

    t.weapons.forEach(function (w) {
      html += '<div class="weapon">';
      html += '<div class="weapon-name">' + esc(w.name) + '</div>';
      if (w.kind === 'repair') {
        html += '<div class="weapon-line">Repairs ' + w.dmg + ' hull/s · range ' + w.range + '</div>';
      } else {
        const dps = (w.dmg * w.salvo) / Math.max(0.05, w.cd);
        const targets = [];
        if (w.targets & Units.LAND) targets.push('Land');
        if (w.targets & Units.SEA) targets.push('Sea');
        if (w.targets & Units.AIR) targets.push('Air');
        html += '<div class="weapon-line">' + Math.round(w.dmg) + ' dmg · ' + w.pen + ' pen · ' + Math.round(dps) + ' dps</div>';
        html += '<div class="weapon-line">Range ' + w.range + (w.minRange ? ' (min ' + w.minRange + ')' : '') +
          (w.splash ? ' · splash ' + w.splash : '') + '</div>';
        if (single) {
          /* Everything can shoot at everything out here, so what matters is what
           * the mount was aimed at when it was bolted on — and, for ordnance
           * that will not arm against the wrong target at all, what it refuses. */
          if (w.onlyTag) {
            html += '<div class="weapon-line targets">Only engages ' +
              tagWord(w.onlyTag) + '</div>';
          } else if (w.prefersTag) {
            html += '<div class="weapon-line targets">Trained on ' +
              tagWord(w.prefersTag) + '</div>';
          }
        } else {
          html += '<div class="weapon-line targets">Engages: ' + (targets.join(' · ') || 'None') + '</div>';
        }
      }
      html += '</div>';
    });

    if (t.stealth) html += '<div class="trait">Submerged — only sonar-equipped units can see it.</div>';
    if (t.asw) html += '<div class="trait">Sonar — can detect submarines.</div>';
    if (t.move === 'static') html += '<div class="trait">Cannot move once deployed.</div>';
    if (t.move === 'fixedwing') {
      html += '<div class="trait">' + (single
        ? 'Attack runs — never holds station. It makes a pass, breaks off and comes round again.'
        : 'Fixed-wing — cannot slow down or hover.') + '</div>';
    }
    if (t.squadron) {
      const carried = Units.TYPES[t.squadron.type];
      if (carried) {
        html += '<div class="trait">Carries ' + t.squadron.count + ' × ' + esc(carried.name) +
          ', with ' + t.squadron.reserve + ' in reserve.</div>';
      }
    }

    box.innerHTML = html;
  };

  function tagWord(tag) {
    return tag === 'fighter' ? 'small craft' : tag === 'capital' ? 'warships' : tag;
  }

  function stat(label, value) {
    return '<div class="stat"><span class="stat-label">' + label + '</span><span class="stat-value">' + value + '</span></div>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --------------------------- status bars ------------------------- */

  UI.prototype.refreshTallies = function () {
    const g = this.game;
    const d = this.dom;
    const ed = W.Editions.current();

    /* Side names come from the edition — "PETS" and "WILD", not "RED" and "BLUE". */
    const short = (ed && ed.teamsShort) || ['RED', 'BLUE'];
    d.tallyA.querySelector('.tally-name').textContent = short[0];
    d.tallyB.querySelector('.tally-name').textContent = short[1];

    const words = (ed && ed.words) || {};
    const leftWord = words.unitsLeft || 'left';

    for (let team = 0; team < 2; team++) {
      const costEl = team === 0 ? d.costA : d.costB;
      const subEl = team === 0 ? d.subA : d.subB;
      let cost, count, sub;

      if (g.battle) {
        count = g.battle.aliveUnits(team);
        cost = Math.round(g.battle.remainingValue(team));
        sub = count + ' ' + leftWord;
      } else {
        const army = g.armies[team];
        cost = g.armyCost(team);
        count = army.length;
        sub = count + (count === 1 ? ' unit' : ' units');
        /* Hide the opponent's spend exactly when their army is hidden on the map,
         * so the tally never leaks what hotseat placement is concealing. */
        if (g.phase === 'place' && team !== g.playerTeam && g.hotseat) {
          cost = '???'; sub = 'hidden';
        }
      }
      costEl.textContent = typeof cost === 'number' ? U.formatCost(cost) : cost;
      subEl.textContent = sub;
    }

    d.tallyA.classList.toggle('active', g.phase === 'place' && g.playerTeam === 0);
    d.tallyB.classList.toggle('active', g.phase === 'place' && g.playerTeam === 1);
  };

  UI.prototype.refreshBudget = function () {
    const g = this.game;
    const spent = g.armyCost(g.playerTeam);
    this.dom.budgetSpent.textContent = U.formatCost(spent);
    this.dom.budgetCap.textContent = U.formatCost(g.budget);
    const frac = U.clamp(spent / g.budget, 0, 1);
    this.dom.budgetFill.style.width = (frac * 100) + '%';
    this.dom.budgetFill.classList.toggle('full', spent >= g.budget);
  };

  UI.prototype.setPhaseLabel = function (text) {
    this.dom.phaseLabel.textContent = text;
  };

  UI.prototype.toast = function (msg) {
    const t = this.dom.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  };

  /* Keep the roster clear of the zone being deployed into: Red holds the east
   * edge, so their panel goes left. See the .roster-left rules in the stylesheet. */
  UI.prototype.setRosterSide = function (team) {
    this.dom.app.classList.toggle('roster-left', team === 1);
  };

  UI.prototype.showPlacement = function (show) {
    this.dom.roster.classList.toggle('hidden', !show);
    this.dom.actionbar.classList.toggle('hidden', !show);
  };

  UI.prototype.showBattleControls = function (show) {
    this.dom.battleControls.classList.toggle('hidden', !show);
  };

  /* ---------------------------- overlays --------------------------- */

  UI.prototype.hideOverlay = function () {
    this.dom.overlay.classList.add('hidden');
  };

  UI.prototype.showOverlay = function (html, wire) {
    this.dom.overlayPanel.innerHTML = html;
    this.dom.overlay.classList.remove('hidden');
    if (wire) wire(this.dom.overlayPanel);
  };

  UI.esc = esc;
  W.UI = UI;
})(window);
