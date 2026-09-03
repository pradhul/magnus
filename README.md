# Magnus

A grid puzzle game about a salvage rigger whose body became a magnet.

Magnus can **pull** and **push** anything ferrous. Force is mutual: light things
slide to him or away from him, heavy things move *him*. Unlike poles pull, like
poles push, iron can only be pulled, and glass is invisible to a field. Every
puzzle is one of those facts, applied.

Chapter 1, *Loading Bay 0*, is ten rooms of increasing difficulty. See
[`DESIGN.md`](DESIGN.md) for the storyline, the rules, the obstacle catalogue,
and a walkthrough of each room.

## Play

Open `index.html` in a browser. Nothing to install; Three.js is loaded from a CDN.

If your browser blocks scripts on `file://`, serve the folder instead:

```bash
python3 -m http.server 8765   # then open http://localhost:8765/
```

`?level=7` in the URL jumps straight to a room.

## Deploy to Render

The game is a static site (no server), so it fits Render's free static tier.
`render.yaml` describes the service; the level solver runs as the build step so
a broken room fails the deploy instead of shipping.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/pradhul/magnus)

Or manually: Render Dashboard → **New → Blueprint** → pick this repo. Every push
to `main` redeploys; pull requests get their own preview URL.

### Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk |
| **Shift** + direction | **Pulse** your field that way (or click a tile in your row/column) |
| Space | Flip your pole N ⇄ S |
| Z | Undo |
| R | Restart room |
| H | Hint |
| `[` `]` | Previous / next room |

Touch: use the on-screen d-pad; toggle **Pulse mode** to make it pulse instead of walk.

## Project layout

```
index.html        page shell, HUD, controls
src/engine.js     the rules — pure logic, runs in the browser and in Node
src/levels.js     the ten rooms as ASCII maps
src/render3d.js   Three.js view: geometry, lighting, animation of engine events
src/main.js       input, undo history, progress (localStorage), level flow
src/style.css
tools/solve.js    breadth-first solver: proves every room solvable, computes par
```

The renderer never decides anything. `engine.js` produces a new state plus a
list of events for every action; `render3d.js` animates those events. The game
is deterministic and turn-based, which is what makes undo exact and levels
verifiable.

## Verify the levels

```bash
node tools/solve.js            # all rooms: solvable? par correct?
node tools/solve.js 4          # one room, with an ASCII replay of the solution
```

The solver exits non-zero if a room is unsolvable or its recorded `par` is stale.

## Map legend

```
#  concrete wall        =  glass (field passes, bodies don't)
.  floor                _  pressure plate
~  acid trench (pit)    D  blast door (open while every plate is held)
A  steel anchor         X  exit
N  S  heavy pillars     @  Magnus start
i  iron crate           n  s  light magnet blocks
```
