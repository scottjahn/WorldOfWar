# World of War

A 2D top-down autobattler in the spirit of *Totally Accurate Battle Simulator*. Both sides
buy and place an army against a shared budget, then the battle runs itself and declares a
winner.

No build step, no dependencies, no framework — plain HTML, CSS and Canvas 2D. It works on
desktop and mobile browsers, and installs as a PWA or packages into an APK.

## Running it

Serve the folder:

```bash
npx http-server . -p 8177 -c-1
```

Then open <http://localhost:8177>. To play on a phone on the same Wi-Fi, browse to your
machine's LAN address instead (e.g. `http://192.168.1.20:8177`).

Nothing here uses ES modules, `fetch` or XHR, so opening `index.html` directly from the
filesystem should also work; the service worker is skipped on `file://`. Serving it is the
reliable path, and it is required for offline install anyway.

## Playing

| Action | Desktop | Touch |
| --- | --- | --- |
| Place selected unit | Click | Tap |
| Remove a unit | Right-click | Long-press |
| Pan | Drag | Drag |
| Zoom | Scroll wheel | Pinch |
| Pause / resume | Space | ❚❚ button |

Pick a unit from the roster, then tap inside your highlighted deployment zone. The dashed
ring that follows the cursor is that unit's weapon range, which makes reach differences
obvious before you commit. **Auto-fill** spends whatever budget is left on a coherent army,
and **Undo** / **Clear** do what they say.

Choose **Computer** for a generated opponent, or **Two players** to hand the device over and
let a second commander deploy. After a battle you can replay it, edit both armies and fight
again, or start fresh.

In two-player mode the armies stay secret. Blue deploys, the screen blanks for the hand-over,
and Red then deploys without ever seeing Blue's units or even Blue's total spend — the tally
reads `???` until the battle starts. Deployments are only revealed when the shooting does.

## How a battle is decided

A battle ends when one side is wiped out. If 240 seconds pass, the winner is whoever has
more surviving army value — so a stalemate across impassable water still resolves.

Battles are **deterministic**. Every random choice in the simulation comes from one seeded
generator, so the same armies, terrain and seed always play out identically, shot for shot.
**Replay battle** reuses the seed, which makes a replay a genuine replay rather than a fresh
roll of the dice; the seed is shown on the result screen. Fighting again after **Edit armies**
draws a new seed, so you still get variety when you want it.

The guarantee holds on the same device and browser. Different JavaScript engines can round
trigonometry a hair differently, so a seed is not promised to reproduce across browsers.

## The combat model

Damage is `dmg × pen / (pen + armor)`, floored at 6%. That single relationship is what makes
army composition matter:

- **`pen`** decides whether a weapon can meaningfully hurt armour. Machine guns shred
  infantry and aircraft but bounce off a Heavy Tank.
- **`dmg`** decides how hard it hits once it gets through.

Weapons also declare which domains they can engage. A weapon with no air capability simply
cannot shoot back at aircraft — which is why a pure armour column loses to air power, and
why anti-air units earn their cost despite being useless against tanks.

Other systems that shape fights:

- **Terrain** — land units cannot cross water or rock, ships cannot beach, aircraft ignore
  both. Forest slows ground movement.
- **Reach** — artillery and capital ships outrange everything, but have a minimum range and
  are helpless once something closes.
- **Stealth** — submarines are invisible until they are almost touching, unless the looker
  has sonar (`asw`). Destroyers, patrol boats and attack helicopters can see them. A submarine
  actively holds station outside whatever range its current target could spot it from, so it
  kites a blind capital ship while torpedoing it. Against a sonar-equipped hunter no safe
  distance exists, and it has to take the fight.
- **Movement styles** — tanks and ships turn their hull to steer, helicopters hover and hold
  a standoff, and fixed-wing aircraft never stop: they fly attack runs, break off and come
  back around. They fire nose-on, so they trade sustained damage for speed and reach.
- **Carriers** — the Aircraft Carrier is the one unit that brings other units. It launches six
  F-14 Tomcats and replaces losses from six spare airframes on a timer. The Tomcats are not
  sold separately and cost nothing extra; the carrier's price is the whole package. It has no
  surface armament at all, so sinking it both removes the ship and stops the replacements.

Counters worth knowing, each measured over repeated seeded battles at equal cost: AT Teams
beat medium tanks but lose to heavies; rifle swarms overrun light tanks; jeeps overrun
artillery; flak tanks and SAMs shred anything with wings; battleships beat destroyers;
missile corvettes trade closely with destroyers.

Submarines gut anything without sonar — including battleships, which they out-range while
staying invisible — and lose badly to everything with it: destroyers, patrol boats and
attack helicopters. Screen your capital ships.

Outcomes between closely matched units can turn on starting formation, so treat any single
battle as one sample rather than proof.

## Layout

```
index.html            markup and panel structure
css/style.css         dark tactical UI, responsive down to phones
js/util.js            math, seeded RNG, value noise, binary heap, spatial hash
js/units.js           the unit catalogue — every stat, weapon and cost
js/terrain.js         map generation, passability, connectivity, A* pathfinding
js/sim.js             the battle: targeting, movement, weapons, projectiles, damage
js/ai.js              army generation (AI opponent and Auto-fill)
js/render.js          canvas rendering, camera, unit artwork, effects
js/ui.js              roster, tallies, overlays, pointer input
js/main.js            phase machine and the frame loop
sw.js                 offline support (network-first, so edits always take effect)
```

### Tuning it

Balance lives entirely in `js/units.js`; every unit is one object with its stats, weapons and
cost. Nothing else needs to change to add a unit — give it a `shape` that `render.js` already
draws and it appears in the roster automatically, sorted by cost into its domain tab.

Two flags on a unit are worth knowing. `hidden: true` keeps it out of the roster and out of
the AI's shopping list, for things that are carried rather than bought. `squadron: { type,
count, respawn, reserve }` makes it launch aircraft at the start of the battle and top the
group back up from a finite pool. Carried units should cost 0 so the carrier's price is the
whole package — and note that a purchasable unit costing 0 would spin the AI's buy loop
without ever consuming budget, which is why hidden and zero-cost types are filtered out there.

Maps are the shaper functions in `Terrain.prototype.generate`. Add an entry to `Terrain.MAPS`
and a branch there.

Two performance notes worth preserving if you edit the simulation:

- `Terrain.buildComponents` flood-fills each domain into connected regions so "can I even
  walk there?" is an O(1) check. Without it, a unit stranded on an island runs a full-budget
  A* every second for the whole battle — that alone cost ~100× the rest of the simulation.
- Target acquisition is throttled for *all* units, including ones that found nothing. A unit
  that skips the throttle re-scans every enemy 60 times a second, which is quadratic.

At the largest budget (129 units) a simulation tick costs ~0.09 ms and a frame draw ~0.7 ms,
so even 4× speed leaves the frame budget almost untouched.

## Versions and stale caches

The title screen shows the running build in its bottom corner (`v1.3.0 · build …`), and the
same string is logged to the console at startup. If that number is not what you just
deployed, you are looking at a cached copy rather than a broken deploy.

`js/version.js` is the single source of truth. **Bump `WOW_VERSION` and `WOW_BUILD` whenever
you deploy** — the service worker reads the same file via `importScripts` and names its cache
after the version, so a bump retires every older cache on the next activation. Skipping the
bump makes the number on screen meaningless.

The worker answers from cache as soon as the network looks slower than three seconds, while
the request keeps running in the background and refreshes the cache. A bad connection
therefore costs you at most one launch on the previous build rather than pinning you to it
forever. The page also calls `registration.update()` on load and reloads once when a newer
worker takes over.

To force a clean slate on a device that is stuck, open devtools → Application → Service
Workers → Unregister, then reload. On Android Chrome, clear the site's storage from the
padlock menu.

## Packaging for Android

The app is already a PWA (`manifest.webmanifest` + `sw.js` + icons), so:

- **Install directly** — open it in Chrome on Android and use "Add to Home screen". It then
  runs fullscreen and works offline.
- **Build an APK** — host the folder over HTTPS and run it through
  [PWABuilder](https://www.pwabuilder.com), which wraps it as a signed APK/AAB.
- **Capacitor** — for a store build with native shell control:

  ```bash
  npm install @capacitor/cli @capacitor/core @capacitor/android
  npx cap init "World of War" com.example.worldofwar --web-dir=.
  npx cap add android
  npx cap open android
  ```

## Known limits

- Direct-fire weapons ignore line of sight, so units can shoot over rock outcrops.
- Splash damage never harms friendlies, which keeps artillery usable but is generous.
- Massed Aircraft Carriers are the strongest naval purchase in a pure same-unit fight; they
  are only kept honest by mixed fleets, where swapping a carrier for escorts measures about
  the same. Worth a price rise if you play a lot of naval battles.
- Naval doctrines win disproportionately on water-heavy maps, because land units simply have
  no way to touch a ship.
- Seeds reproduce a battle on the same browser, not necessarily across different ones.
- No sound.
