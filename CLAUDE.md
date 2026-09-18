# Working on World of War

A static, zero-dependency vanilla-JS game. No build step, no package manager, no
test runner — `index.html` loads the scripts in order and that is the whole
pipeline. See [README.md](README.md) for how it is put together.

## Keep sound off while testing

**Run all local rendering and testing with sound disabled.** Turn it on only for
a test that genuinely needs it — checking a new weapon's voice, or the mixer
under load — and turn it off again afterwards.

The game ships with sound *on* by default, so a fresh browser profile will make
noise the moment a battle starts. Nobody wants an agent session firing
artillery, roaring dinosaurs or a Death Star superlaser through their speakers
while they are doing something else.

Either route works, and both persist in `localStorage` for that origin:

```js
// After the page has loaded — also writes the preference for later reloads.
Sound.setEnabled(false);
```

```js
// Before the app reads the preference: seed the key, then reload.
localStorage.setItem('wow.sound', 'off');
```

`js/audio.js` reads the preference once at load, so setting the key by hand only
takes effect on the next load. `Sound.setEnabled(false)` takes effect
immediately *and* writes the key. Either way the 🔊 button in the top bar
switches to 🔇, and nothing is synthesised at all — no `AudioContext` voices are
scheduled, even across a full battle.

### Why this costs nothing

Sound is downstream of everything. The simulation appends plain records to
`battle.events` and the frame loop hands that list to the mixer; nothing in
`js/sim.js` ever calls into `js/audio.js`. A battle plays out identically
whether sound is on, off, or unsupported by the browser — so a muted test is
testing exactly the same code path a noisy one would, minus the audio graph.

The frame loop clears `battle.events` every frame whether or not anything is
listening, so a muted run does not quietly grow a queue either.

## Verifying a change to the sound tables

If you do touch `js/sounds-*.js` or a roster's `sfx` tags, the check worth
running is that every voice actually resolves — a typo leaves a weapon silent,
and silence is hard to notice. Walk each edition's roster through its table's
resolvers and assert nothing comes back undefined:

```js
for (const [id, table] of Object.entries({
  earth: SoundsEarth, animals: SoundsAnimals,
  space: SoundsSpace, prehistoric: SoundsPrehistoric
})) {
  Editions.activate(id);
  for (const t of Object.values(Units.TYPES)) {
    for (const w of t.weapons) {
      if (!table.voices[table.weapon(w)]) console.error(id, t.name, w.name);
    }
  }
}
Editions.activate(game.edition.id);   // put the catalogue back
```

That needs no audio context and runs fine with sound off. The last line matters:
`activate` swaps `Units.TYPES` in place, so without it the loaded roster is left
on Prehistoric while the running game still believes it is on whatever the player
chose, and everything after that is nonsense.

The same shape checks the other two resolvers — `table.impact(size)` across a
spread of sizes, and `table.death(type, fled)` across every unit.

## Notes on the preview

`rAF` in the in-app browser pane stalls when the pane is hidden, and sometimes
while it is visible, which freezes the frame loop and therefore the battle. To
drive a battle deterministically, step it yourself rather than waiting on the
frame loop:

```js
for (let i = 0; i < 3600 && !game.battle.over; i++) game.battle.step();
```

A `ServiceWorker update()` failure in the console under `npx http-server` is a
pre-existing environment quirk, not a code fault — registration, install,
activation and caching all succeed.
