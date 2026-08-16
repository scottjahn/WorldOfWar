# World of War

A 2D top-down autobattler in the spirit of *Totally Accurate Battle Simulator*. Both sides
buy and place an army against a shared budget, then the battle runs itself and declares a
winner.

## Editions

One engine, several worlds. You pick an edition on the way in, and it decides the roster, the
maps, the field size, the budgets, what the two sides are called and what happens to a beaten
unit.

| Edition | | |
| --- | --- | --- |
| **Earth** | Modern combined arms | Infantry, armour, artillery, aircraft and a navy across land, air and sea. |
| **Animals** | Household Pets vs Killer Animals | All melee, no navy, a smaller field — and nobody dies. |
| **Space** | Rebel Alliance vs Imperial Navy | Starfighters and capital ships. One domain — everything flies. |
| **Prehistoric** | Before anyone invented the wheel | Dinosaurs, pterosaurs and marine reptiles across land, air and sea. |

**Animals** is asymmetric: each side has its own roster. Household Pets are cheap, numerous
and bite softly — a hamster can barely scratch a rhino, so a swarm needs its own heavies
(bulldogs, a pot-bellied pig, a genuinely armoured tortoise) to get through hide. Killer
Animals are big, fast and expensive, and can be dragged down by weight of numbers. Cats and
lynxes are the only cheap answers to anything airborne.

Snakes split along the same line. Non-venomous constrictors — a corn snake, a ball python, a
boa — are Household Pets, and they crush: a lot of damage that thick hide still blunts, which
is the Pets' weakness written into one unit. Venomous snakes are Killer Animals, and venom
does the opposite: a rattlesnake, a king cobra or a black mamba penetrates better than
anything else on the field and hits softer than a wolf for the price. Since the two sides
never share a roster, that crossover is tuned against pet armour and nothing else — venom is
a poor answer to a swarm of hamsters and the best answer in the edition to a tortoise, a
pot-bellied pig or a bulldog.

Despite the name nothing is killed: an animal whose stamina runs out turns tail and bolts off
the field.

**Space** is asymmetric too, and it collapses the domain split entirely: there is no land, air
or sea out there, so the three roster tabs become one **Fleet** shelf and every hull shares a
single domain. What replaces the split is unit **tags**. Small craft carry `fighter`, warships
carry `capital`, and each weapon says which it was built for — so a Star Destroyer's point
defence clears the fighter screen while its turbolasers stay on the enemy line of battle.

That is also what makes the two arms need each other. Laser cannons barely scratch capital
plating, so fighters carry proton torpedoes and ion cannons for the heavy work — and those
will not arm against a starfighter at all, and reload for seven or eight seconds, which is
exactly the window point defence exists to use. Get the bombers through and a Star Destroyer
dies fast; lose them on the way in and the turbolasers decide it.

Imperial hulls are individually tougher and their capitals hit hardest, but TIE fighters are
unshielded and die in droves. Rebel starfighters are shielded and punch far above their price
against a capital ship; their warships are thinner and rely on speed.

The **Death Star** costs 7,000 — more than three Star Destroyers, and out of reach below the
8,000 budget. Its superlaser ends a capital ship per shot, so a fleet built on warships simply
feeds it. Two things beat it, both the canonical ones: the superlaser will not arm against
small craft, so bringing no warships at all leaves the main gun silent; and its plating never
stopped a proton torpedo. Measured over seeded battles at comparable cost, it beats 8,000
points of Mon Calamari cruisers, and loses to a wing of forty-odd Y-wings — which is roughly
the same trade the films made.

Maps carry planets, asteroid belts, nebulae and drifting hulks. Nebula gas drags a hull down
to 60% speed, dust and debris to 90%, and nothing at all flies through a planet.

**Prehistoric** goes back to Earth's shape — three domains, and both sides buying from the
same list, so a battle is decided by composition and ground rather than by which faction you
were handed. Almost everything is melee, which changes what the domains mean. Marine reptiles
cannot leave the water and the herds cannot enter it, so on a map with a coast the two lists
would simply fight past each other. Three things bridge the gap: flyers ignore terrain
entirely, the big marine predators can take anything walking the shoreline, and Spinosaurus
is the one land animal that fishes.

Anti-air is scarce on purpose. Most of a herd cannot reach a pterosaur at all — what can is a
leaping raptor, a sabre cat, an Allosaur or Tyrannosaur's head at three to six metres, a
Brachiosaur's neck at twelve, and the one unit in the edition with real standoff: a
Dilophosaurus, which spits venom nearly 200 units and is the only thing here that can hurt
something it is not touching. Reach still varies enormously without being ranged — an
Elasmosaurus swings a neck twice as long as anything else's bite, so it fights from the
second rank.

Snakes run the length of that roster too: Sanajeh raiding nests on the cheap end, Titanoboa
constricting in the swamp, and Palaeophis in the shallows — the cheapest thing in the water
that can take something walking the shoreline. All three crush rather than shear, so they are
strong against soft herbivores and blunted by an Ankylosaur's scutes.

Nothing is killed on screen. A beaten animal breaks and runs, the same as in Animals — a
Triceratops does not explode.

The major version tracks editions — 4.x ships Earth, Animals, Space and Prehistoric, and each
new edition bumps it again.

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

The side holding the west edge is red and the side holding the east is blue, in every edition.

In two-player mode the armies stay secret. Red deploys, the screen blanks for the hand-over,
and Blue then deploys without ever seeing Red's units or even Red's total spend — the tally
reads `???` until the battle starts. Deployments are only revealed when the shooting does.

## How a battle is decided

A battle ends when one side is wiped out. If 240 seconds pass, the winner is whoever has
more surviving army value — so a stalemate across impassable water still resolves.

Battles are **deterministic**. Every random choice in the simulation comes from one seeded
generator, so the same armies, terrain and seed always play out identically, shot for shot.
**Replay battle** reuses the seed, which makes a replay a genuine replay rather than a fresh
roll of the dice; the seed is shown on the result screen. Fighting again after **Edit armies**
draws a new seed, so you still get variety when you want it.

The guarantee holds across devices and browsers too — see *Deterministic maths* below.

### Replay links

The result screen carries a link back to the battle you just watched. Anyone who opens it
sees the same fight play out, shot for shot:

```
https://scottjahn.github.io/WorldOfWar/#r=AQEnOwnBrNMVorgLEgAMAAt…
```

The payload packs the map, the terrain seed, both armies and the battle seed — around 250
characters for a small battle and 900 for a 12,000-point one. Everything else regenerates on
the other end. Opening a link drops you straight into that battle, and **Edit armies** still
works from there, so a link doubles as a way to share an army design.

It lives in the URL *fragment* rather than a query string on purpose: the service worker
caches by full URL, so `?r=…` would make every shared link a cache miss and force a network
round trip before the game could start. A fragment is not part of the cache key.

Placement snaps to whole world units so positions store exactly. Units are 9–26 across on a
2400×1400 field, so the snap is invisible in play.

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
js/version.js         build identifier, shared by the page and the service worker
js/dmath.js           engine-independent trig, so replays reproduce on any browser
js/util.js            math, seeded RNG, value noise, binary heap, spatial hash
js/units.js           unit definition machinery and the active catalogue
js/roster-earth.js    Earth's army list
js/roster-animals.js  the Animals army list, split into two factions
js/roster-space.js    the Space army list, split into two navies
js/roster-prehistoric.js  the Prehistoric army list, shared by both herds
js/editions.js        what each edition is: roster, maps, budgets, side names, defeat style
js/terrain.js         map generation, passability, connectivity, A* pathfinding
js/sim.js             the battle: targeting, movement, weapons, projectiles, damage
js/ai.js              army generation (AI opponent and Auto-fill)
js/share.js           packs a battle into a replay link, and unpacks it again
js/render.js          canvas rendering, camera, unit artwork, effects
js/ui.js              roster, tallies, overlays, pointer input
js/main.js            phase machine and the frame loop
sw.js                 offline support (network-first, so edits always take effect)
```

### Adding an edition

1. Write `js/roster-<id>.js` exporting `W.Roster<Name>` — same unit definitions as anywhere
   else, plus `faction: 0 | 1` on each unit if the two sides field different things.
2. Add an entry to `EDITIONS` in `js/editions.js`: roster, maps (each with its own `water`
   shaper), field size in tiles, budgets, side names, and `defeat: 'destroy' | 'flee'`.
   `look: 'space'` swaps the renderer to a starfield palette; `singleDomain` and
   `bucketNames` collapse and rename the roster tabs.
3. Add a wire list to `WIRE` in `js/share.js` and append the id to `EDITION_WIRE`, so replay
   links can name its units.
4. Add the script tags to `index.html` and the paths to `ASSETS` in `sw.js`.
5. Bump the major version in `js/version.js`.

If the edition needs its own AI shopping lists, add them in `js/ai.js` and extend
`setEdition` there.

### Tuning it

Balance lives entirely in the roster files; every unit is one object with its stats, weapons
and cost. Nothing else needs to change to add a unit — give it a `shape` that `render.js`
already draws and it appears in the roster automatically, sorted by cost into its domain tab,
and filtered to its faction.

Weapons with `kind: 'melee'` resolve on contact with no projectile, and their `range` is
reach measured between the two bodies rather than between centres.

Weapons pick targets three ways. `targets` is the domain mask — a mount that omits `AIR`
cannot shoot back at aircraft. `prefersTag` and `onlyTag` do the same job over unit `tags`,
for editions with no domain split to sort by: `prefersTag` is a priority (point defence hunts
small craft first but will fire on anything), `onlyTag` is a restriction (a proton torpedo
will not arm against a starfighter at all). A unit whose heavy mounts are tag-restricted also
steers by them, so a bomber flies past the escorts to reach the warship it can actually hurt.

Two flags on a unit are worth knowing. `hidden: true` keeps it out of the roster and out of
the AI's shopping list, for things that are carried rather than bought. `squadron: { type,
count, respawn, reserve }` makes it launch aircraft at the start of the battle and top the
group back up from a finite pool. Carried units should cost 0 so the carrier's price is the
whole package — and note that a purchasable unit costing 0 would spin the AI's buy loop
without ever consuming budget, which is why hidden and zero-cost types are filtered out there.

Maps belong to their edition, in the `EDITIONS` entry in `js/editions.js`. Each one supplies
a `water` shaper (return `false` throughout for a map with no water at all) plus optional
`forestBias` and `rockBias` to push the ambient scatter toward woodland or bare rock.

Anything with a deliberate shape — a belt, a planet — needs a `carve(terrain, noise, rand)`
hook instead, which gets the tile grid and `terrain.disc()` to stamp into it. It runs after
the noise pass, which would otherwise paint straight over it, and before the deployment zones
are scrubbed clear, so a map cannot accidentally wall its own armies in. Push an entry onto
`terrain.props` for anything the renderer should draw as one object rather than as tiles;
that is how a planet comes out as a sphere instead of a few hundred boulders.

### Deterministic maths

IEEE-754 pins `+`, `-`, `*`, `/` and `sqrt` to a single correctly-rounded result, and
JavaScript never fuses multiply-add, so those give bit-identical answers in every engine.
`Math.sin`, `cos`, `atan2`, `hypot` and `pow` are **not** specified that way — each engine
ships its own approximation, and over a four-minute battle those last-bit differences compound
into visibly different outcomes.

So the simulation uses `js/dmath.js` instead: range reduction plus Taylor series built purely
from exactly-rounded operations. Measured against native `Math`, the worst error is 6.6e-10
for `sin`, 6.3e-9 for `cos`, 3.8e-10 for `atan2` and 2.3e-13 for `hypot` — far tighter than
anything the game can express. The one `Math.pow` call took a constant exponent, so it is now
a hard-coded literal.

**If you edit `js/sim.js`, use `M.sin` / `M.cos` / `M.atan2` / `M.hypot`, not `Math.*`.** A
single native trig call is enough to break cross-browser replay links. `sqrt`, `abs`, `floor`,
`round`, `min`, `max`, `imul` and `PI` are all exactly specified and safe to use directly.
`js/render.js` deliberately keeps native `Math`: drawing never feeds back into the simulation,
and native trig is faster.

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

### How an installed copy updates itself

Bumping `WOW_VERSION` is what drives this, so do not skip it.

`sw.js` pulls in `js/version.js` with `importScripts`, and names its cache after the version.
The browser byte-compares imported scripts during its update check, so a version bump counts
as a changed worker even when `sw.js` itself is untouched. The new worker installs,
`skipWaiting` and `clients.claim` hand it control, the page sees `controllerchange` and
reloads once, and the old cache is deleted on activation. The result is that a running copy
moves to the new build **as a unit** — you never end up with new HTML calling into old
scripts.

Registration passes `updateViaCache: 'none'`. Without it the default is `'imports'`, which
fetches `sw.js` past the HTTP cache but `version.js` *through* it — and Pages serves
`Cache-Control: max-age=600`, so an update could sit invisible for ten minutes.

If you deploy **without** bumping the version, files still refresh individually through the
network-first fetch handler, but there is no atomic swap: on a poor connection some files can
come from the network and others from cache, which is how a half-updated load happens.

## Packaging for Android

The app is already a PWA — manifest, service worker and icons all check out, and it is served
over HTTPS at <https://scottjahn.github.io/WorldOfWar/>.

**No install at all:** open that URL in Chrome on Android and use *Add to Home screen*. You
get a fullscreen icon that works offline. If you only want it on your own phone, stop here.

### Route A — PWABuilder (no toolchain)

[PWABuilder](https://www.pwabuilder.com) is a website: paste the URL, press **Package for
stores → Android**, and it hands back a signed APK plus a `signing.keystore`.

- Choose **APK** to sideload, or **AAB** for the Play Store.
- **Keep the keystore and its passwords.** Android will refuse any future update signed with
  a different key, and it cannot be recovered.
- Install with `adb install app-release-signed.apk`, or copy the APK to the phone and open it
  (allow "install unknown apps" for your file manager).

**The one thing that will bite you.** PWABuilder produces a Trusted Web Activity — a Chrome
window with no browser UI. Android only hides the address bar if it can verify the app owns
the domain, by fetching:

```
https://scottjahn.github.io/.well-known/assetlinks.json
```

That is the **domain root**, not this project's subpath — and it currently 404s, because on
GitHub Pages the root is served by a separate repo named exactly `scottjahn.github.io`. Until
that file exists the app still installs and plays, but with a URL bar across the top.

To fix it, create a repo called `scottjahn.github.io`, enable Pages on it, and commit the
`assetlinks.json` that PWABuilder gives you (it is in the download, under
`assetlinks.json` / "Digital Asset Links"):

```
scottjahn.github.io/
  .nojekyll
  .well-known/assetlinks.json
```

Verification is cached, so reinstall the app after publishing it.

### Route B — Capacitor (files bundled inside the APK)

Worth it if you want the game to work offline from first launch with no network at all, and
no domain verification. The cost is a real Android toolchain, none of which is installed here:
**JDK 17** and **Android Studio** (SDK + build tools, a few GB).

```bash
npm install @capacitor/cli @capacitor/core @capacitor/android
```

```bash
npx cap init "World of War" io.github.scottjahn.worldofwar --web-dir=dist
```

Copy the game files into `dist/` (everything except `.git`, `node_modules`, `android` and
`dist` itself), then:

```bash
npx cap add android
```

```bash
npx cap open android
```

Build from Android Studio, or `cd android && ./gradlew assembleDebug`.

With Capacitor the service worker is unnecessary — the files are local already — but it does
no harm.

### Which one

PWABuilder unless you specifically need offline-from-first-launch or a customised native
shell. It takes minutes instead of an afternoon, and updates ship by pushing to Pages rather
than by rebuilding the app.

## Known limits

- Direct-fire weapons ignore line of sight, so units can shoot over rock outcrops.
- Splash damage never harms friendlies, which keeps artillery usable but is generous.
- Massed Aircraft Carriers are the strongest naval purchase in a pure same-unit fight; they
  are only kept honest by mixed fleets, where swapping a carrier for escorts measures about
  the same. Worth a price rise if you play a lot of naval battles.
- Naval doctrines win disproportionately on water-heavy maps, because land units simply have
  no way to touch a ship.
- Replay links encode the roster by index, so adding a unit is safe (append to `TYPE_WIRE` in
  `js/share.js`) but reordering or removing one silently invalidates every existing link.
- Changing unit stats changes how old links play out. The link stores the battle, not the
  balance patch it was fought under.
- No sound.
