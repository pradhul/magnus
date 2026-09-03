# Magnus — Design Notes

Magnus is a top-down grid puzzle game (think Bomberman's board, Sokoban's brain)
about a salvage rigger whose body became a magnet. Every mechanic is a property
of real magnets, simplified into a rule you can predict by looking at the board.

This document covers the Chapter 1 storyline, how Magnus moves, the obstacle
catalogue, the ten rooms of Chapter 1 and why they are in that order, and ideas
for later chapters. `README.md` covers how to run and play.

---

## 1. Premise

**Polar Foundry** builds superconducting crane magnets for ship-breaking yards.
Magnus is a rigger on the night shift. During a crane test in **Loading Bay 0**,
the electromagnet array surges and dumps its field into the nearest grounded
body — his. When he comes round, every ferrous thing in the bay is leaning
toward his hands, and the bay has gone into lockdown: blast doors down,
catwalks retracted, acid trench uncovered.

**Chapter 1 goal:** reach the control booth at the far end of the bay and lift
the lockdown before the foundry's failsafe floods the bay with coolant.

The chapter is ten rooms. Each room is one self-contained puzzle with a single
exit. The story is told in one line per room (the `story` field in
`src/levels.js`) — enough to give each room a reason to exist, never enough to
get in the way of the puzzle.

### Tone

Industrial, quiet, a little dry. Magnus does not speak; the rooms do. Every
obstacle is a piece of foundry equipment behaving exactly as physics says it
should, now that a man-sized magnet is walking through it.

---

## 2. The physics bible

These are the rules the engine implements (`src/engine.js`). Every level is
solvable using only these; there are no hidden exceptions.

| Real magnetism | Rule in Magnus |
| --- | --- |
| Fields act along lines of force | Magnus **pulses** in one of four directions. The field travels in a straight line and grabs the **first body** it meets. |
| Unlike poles attract, like poles repel | Magnus has a pole, **N** or **S**, and can flip it at will. A body with the opposite pole is pulled toward him; the same pole is pushed away. |
| Soft iron is attracted to either pole and cannot be repelled | **Iron** bodies are always pulled, never pushed. |
| Newton's third law: force is mutual | **Light** bodies move; **heavy** bodies move *Magnus* instead. |
| Momentum: a body keeps going until something stops it | Anything set in motion slides until it hits something solid (or falls into a pit). |
| Push against something immovable and you move | **Recoil**: repel a light block that is braced and cannot move, and Magnus flies backward. |
| Fields pass through non-ferrous materials | **Glass** lets the field through but blocks bodies. **Concrete** blocks both. |
| Iron shields | Only the first body in line feels the field. Whatever is behind it gets nothing. |

Two convenience rules keep it a puzzle rather than a physics sandbox:

- Magnus cannot push or carry anything by hand. All movement of objects is magnetic.
- Everything is turn-based. One key press is one action, so every level has a
  finite, searchable state space and perfect undo.

---

## 3. How Magnus moves

| Verb | Trigger | What happens |
| --- | --- | --- |
| **Walk** | Arrow key | One tile. Cannot enter walls, glass, pits, closed doors, or occupied tiles. |
| **Pull** | Pulse at a light body with the opposite pole (or any iron) | The body slides toward Magnus until it is adjacent to him or blocked. |
| **Push** | Pulse at a light body with the same pole | The body slides away until blocked. If it falls into a pit it sinks and **fills** the pit. |
| **Zip** | Pulse at a heavy iron anchor, or a heavy pillar with the opposite pole | Magnus flies *toward* it, over pits, and stops adjacent to it. |
| **Launch** | Pulse at a heavy pillar with the same pole | Magnus flies *away* from it until something stops him. |
| **Recoil** | Push a light block that cannot move | Magnus flies backward instead. |
| **Flip** | Space | Magnus's pole switches N ⇄ S. |

**Flight is dangerous.** Zips, launches and recoils carry Magnus over pits, but
he lands wherever the flight *ends*. If that tile is a pit, he falls (the game
rewinds one move). Reading where a flight will stop is the core skill of the
later rooms.

---

## 4. Obstacle catalogue

### Terrain

| Tile | Name | Bodies | Field | Notes |
| --- | --- | --- | --- | --- |
| `#` | Concrete wall | blocked | blocked | Also wood, rubber: dead material. |
| `.` | Floor | — | passes | |
| `~` | Acid trench (pit) | blocks walking; flight passes over | passes | A block that slides in sinks and becomes floor. Magnus who *stops* over one falls. |
| `=` | Glass | blocked | **passes** | The signature trick: act on things you cannot reach. |
| `_` | Pressure plate | — | passes | Held down by Magnus or any block. |
| `D` | Blast door | blocked while closed | blocked while closed | Open only while **every** plate in the room is held. Closes the instant a plate is released. |
| `X` | Exit | — | passes | Step on it to clear the room. |

### Heavy bodies (fixed — they move Magnus)

| Tile | Name | Attract | Repel |
| --- | --- | --- | --- |
| `A` | Steel anchor (riveted iron) | Zip toward it, either pole | never |
| `N` | North pillar | Zip when Magnus is S | Launch when Magnus is N |
| `S` | South pillar | Zip when Magnus is N | Launch when Magnus is S |

### Light bodies (movable — Magnus moves them)

| Tile | Name | Attract | Repel |
| --- | --- | --- | --- |
| `i` | Iron crate ("Fe") | Pulled, either pole | never — you cannot push iron |
| `n` | North block | Pulled when Magnus is S | Pushed when Magnus is N |
| `s` | South block | Pulled when Magnus is N | Pushed when Magnus is S |

### Derived obstacles (combinations that create puzzles)

- **The brake.** A block sitting in a launch path stops the flight early. Pull
  it first and the launch overshoots into a pit.
- **The stopper.** A block slides until blocked; a wall, glass pane, or another
  block placed one tile past a plate makes the block stop *on* the plate.
- **The shield.** An iron crate in front of a magnet block takes the whole
  pulse. Since iron can only be pulled toward you, it has to be pulled out of
  the row from a different angle.
- **Through the window.** A plate behind glass can only be pressed by a block
  that is already behind the glass, and that block can only move along the
  rows Magnus can stand in.
- **Spent bridge.** Filling a pit consumes the block. If the room needs it on a
  plate later, it cannot also be the bridge.

---

## 5. Chapter 1 — the ten rooms

Difficulty grows along two axes: how many rules a room needs, and how far ahead
you must plan (par). Every room is verified by `node tools/solve.js`, which
performs a breadth-first search over the whole state space and reports the
shortest solution.

| Room | Teaches | Rules used | Par |
| --- | --- | --- | --- |
| 1-1 The Twitch | Heavy iron pulls *you* | zip | 3 |
| 1-2 Dead Weight | Light iron comes to you; plates hold doors | pull | 9 |
| 1-3 The Trench | Sunk iron makes floor; first body in line | pull, fill | 11 |
| 1-4 Poles | Like poles push; flip your pole; align in two axes | pull, flip, push, fill | 14 |
| 1-5 The Window | Fields pass glass; bodies don't | pull, push, flip, stopper | 11 |
| 1-6 Launch | Pillars throw you; flight ends where it's stopped | launch, zip, flip | 6 |
| 1-7 Recoil | Push what can't move and you move | pull, push, flip, recoil | 11 |
| 1-8 Shield | The first body takes the whole field | pull, push, fill | 13 |
| 1-9 Counterweights | Two plates, two bodies, one field | pull, push, stopper, shield | 16 |
| 1-10 The Booth | Everything at once | launch, brake, fill, window, recoil | 20 |

Rooms 1–3 are the tutorial (one new idea each, nothing to get wrong). Rooms
4–7 each introduce a rule that *changes what Magnus is*: he can push, he can
act through walls, he can fly, he can throw himself. Rooms 8–10 introduce no
new rules; they ask you to combine the ones you have and to sequence them.

### Room notes and intended solutions

Solutions below are the solver's shortest paths. `pulse:right` means Shift +
Right; `toggle` is Space.

**1-1 The Twitch.** A steel anchor across a two-wide trench. The only thing to
do is stand in its row and pulse. Magnus flies over the trench and stops beside
it. Lesson: heavy things move *you*.
`pulse:right, down, down`

**1-2 Dead Weight.** A crate, a plate next to Magnus, a door. Pulling brings
the crate to the tile *beside* him, so he has to stand so that tile is the
plate. Standing on the plate himself opens the door but he cannot then walk
through it — the door closes the moment he steps off.
`pulse:right, down, right ×5, down, down`

**1-3 The Trench.** Two crates in a row beyond a two-wide trench. The first
pull takes only the nearer crate (shielding), which drops into the far pit
column. The second pull brings the other crate into the near column. Bridge
built, both crates gone.
`right ×3, pulse:right, pulse:right, right ×3, down, right, right`

**1-4 Poles.** A single-tile gap in a wall, and a south block sitting two rows
below it. Magnus (N) pulls the block up into the gap's row from above, walks
around to its left, flips to S so they share a pole, and pushes it into the
pit. The right-hand side is fringed with pits so a recoil shortcut lands in
acid.
`up, right, right, pulse:down, left, down, toggle, pulse:right, right ×5, up, right`

**1-5 The Window.** Two north blocks behind a glass wall, two plates, one door.
The top plate is against the far wall, so pushing (N) parks the block on it.
The bottom plate has a second pane of glass as a stopper, so *pulling* (S)
parks that block. One room, both poles, no way to touch either block.
`up, up, right, pulse:right, down, down, toggle, pulse:right, down ×3`

**1-6 Launch.** Two north pillars. From the start, pulsing at the pillar beside
you (both N) launches you the length of the room. Then flip to S so the second
pillar *pulls* you back across a longer trench, and drop to the exit.
`pulse:left, down, down, toggle, pulse:left, down`

**1-7 Recoil.** A north block in the wrong row, a long trench, an exit on the
far side, and a pit under the landing tile in the block's own row. Pull the
block up into the exit's row (as S), flip back, push it against the far wall,
then push again — it cannot move, so Magnus flies the other way across the
trench.
`up, right, right, toggle, pulse:down, left, down, toggle, pulse:right, pulse:right, up`

**1-8 Shield.** Iron crate, then a north block, then a pit, all in one row.
Pulsing brings the crate to you and leaves the block unreachable. Instead pull
the crate one tile, step around it through the gap above, and pulse from beside
the block so the pit gets filled.
`right, pulse:right, up, right, right, down, right, pulse:right, right ×6`

**1-9 Counterweights.** One plate on your side of a glass wall, one behind it.
Your crate shields the block behind the glass, so pulling the crate off the row
does two jobs: it lines the crate up above its own plate, and it clears the
line to the block. Push the block onto the far plate; drop the crate onto the
near one from below; walk through the door.
`pulse:right, down, right, right, up, pulse:right, down ×3, left, pulse:up, right ×3, down, down`

**1-10 The Booth.** Four beats in one room:
1. *Launch and brake.* Pulse at the pillar to launch; the south block ahead
   stops you short of the far pit. (Pull it first and the launch overshoots
   into acid — the game rewinds.)
2. *Bridge.* Flip to S and push the block into the pit to open the way down.
3. *Two plates.* Pull the crate onto its plate; push the block behind the glass
   onto its plate (which is against a wall). Door opens.
4. *Recoil.* In the cellar, pin the last block against the wall and push again
   to fly over the final trench onto the exit.
`pulse:left, toggle, pulse:right, right, right, down ×3, pulse:left, up, left ×3, toggle, pulse:left, down ×3, pulse:right, pulse:right`

---

## 6. Designing a new room

1. Write the map in `src/levels.js` using the legend above. Put exactly one `@`
   and one `X`.
2. Run `node tools/solve.js N`. It prints the shortest solution and an ASCII
   replay, and fails if the room is unsolvable.
3. Read the solution. If it skips the idea the room is meant to teach, the room
   has a shortcut — usually a walk-around or a recoil. Close it with walls, or
   put a pit where the shortcut's flight would land.
4. Copy the solver's par into the level's `par` field. The solver fails the
   check if par is stale, so it is safe to tweak maps later.

Good rooms have one idea and one wrong-looking right answer. The solver is the
referee; if it finds a solution you did not intend, that is information, not a
bug — decide whether the room is better with or without it.

---

## 7. Beyond Chapter 1 (ideas, not commitments)

Each of these is a single new rule that would open a new family of puzzles:

- **Electromagnet coils.** Floor tiles that, while powered by a plate, act as an
  anchor or pillar. Turn heavy bodies on and off remotely.
- **Polarity flip pads.** Walking over one flips Magnus's pole whether he wants
  it or not. Forces route planning around your own state.
- **Dampened zones.** Rubber-lined floor where the field does not propagate.
  Safe rooms — and rooms where the only way through is momentum.
- **Chain pulls.** A magnet block that is itself a magnet: pulling it drags
  the block behind it along.
- **Magnetized enemies.** Patrolling drones with a fixed pole. Repel them into
  pits, or pull them into your own path by mistake. The first thing in the
  game that moves on its own turn.
- **Curie heaters.** Hot tiles that demagnetise any block that stops on them,
  turning `n`/`s` into `i`. Irreversible, so ordering matters.
- **Free-flight chapter.** The original first-person idea from the initial
  README could return as an interlude built on a real physics engine, once the
  vocabulary has been taught on the grid.
