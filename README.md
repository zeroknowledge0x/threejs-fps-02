# Harbor Line

A round-based tactical first-person shooter in the browser, built on three.js 0.187.0 with no
build step: `game/` is plain static files a server hands out as ES modules.

Tide squad attacks a fish-market compound at dusk; Salt squad holds it. Rounds are won by
detonating the charge at A or B, by defusing it, or by clearing the other squad. Money is earned
each round and spent in a buy menu, and the bots walk routes, hold angles and shoot back.

## Play it

```sh
node serve.ts --port 8080      # Node 22, standard library only
# open http://localhost:8080
```

Controls: `WASD` move, mouse look, click fire, `R` reload, `Ctrl` crouch, `Space` jump,
`B` open the buy menu in the buy phase (`1`-`6` to pick), `E` hold to plant the charge,
`G` throw the frag.

## Layout

| Path | What it is |
| --- | --- |
| `game/src/main.js` | Boot, the fixed 60 Hz step, the render loop, shooting, the round wiring |
| `game/src/world.js` | The map: Harbor Line, its lanes, sites, routes and lights |
| `game/src/bots.js` | The five bots: bodies, sight, aim, movement, routes |
| `game/src/rounds.js` | The round machine: buy phase, clock, charge, economy, win conditions |
| `game/src/player.js` | Player movement: acceleration, crouch, gravity, collision |
| `game/src/weapon.js` | The arsenal table and the view model |
| `game/src/hud.js` | The DOM HUD: health, ammo, clock, scores, kill feed, buy menu |
| `game/src/input.js` | Keyboard, mouse and pointer lock |
| `game/src/palette.js` | The look plan: six greys, one accent, two team tints |
| `main.ts` | Hands in the entry: copies `game/` and `screenshots/`, writes `dossier.json` |
| `shots.json` | The capture queries behind `screenshots/` (`?shot=…&seed=1`) |

## Screenshots

`screenshots/` holds four real renders of this code, taken from the game's own deterministic shot
harness, all at 1280x720 and all of the same round: the queries in `shots.json` pose the round,
render two frames, and stop.

| File | The frame it poses |
| --- | --- |
| `1-fight.jpg` | The cover: a burst of fire down the west quay, the lit site board behind the defender |
| `2-title.jpg` | The opening card, with the two squads already walking up the mid hall behind it |
| `3-plant.jpg` | The charge planted at A, its state line in the HUD |
| `4-lost.jpg` | The other ending, with Salt three rounds up and the next round a click away |
