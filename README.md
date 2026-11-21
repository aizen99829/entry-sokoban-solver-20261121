[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

# Sokoban Solver

A push-optimal Sokoban solver built for make.fun's
[Build the best Sokoban solver, 21 November 2026](https://make.fun/bounty/sokoban-solver-01-run-20261121)
bounty. One run answers all 5 instances of a set in well under the 60-second
wall budget, deterministically.

## How it works

The competition's generator lays a 1-wide hallway with 1–4 rooms off it, each
room holding 3–4 boxes and as many goals, and a box pushed into the hallway
can never come back — so rooms are independent and a level's push-optimal
count is the sum of its rooms' optima. The solver exploits exactly that:

1. **Split** the level into rooms (connected floor off the hallway row).
2. **Solve each room push-optimally** with A\* over push macros: state =
   sorted box positions + player position, one walk BFS per state for the
   player's path to each push, a minimum-assignment box→goal heuristic
   (admissible: one push moves one box one cell), corner-deadlock pruning,
   and a transposition table. Node budgets are fixed work, never wall-clock.
3. **Stitch** the room solutions with BFS walks through the hallway. A room
   whose optimal solution traps the player inside (a box ends on its door
   goal) is re-solved with an exit requirement when that costs the same,
   otherwise it is scheduled last.

If room decomposition ever fails, the solver falls back to a whole-level
push A\* with a fixed node budget; a level that still cannot be solved gets
an empty (valid, 0-point) answer rather than crashing the run.

## Results (practice set)

| instance | pushes | P\* | points |
|----------|--------|-----|--------|
| i001 | 13 | 13 | 1000 |
| i002 | 16 | 16 | 1000 |
| i003 | 29 | 29 | 1000 |
| i004 | 47 | 47 | 1000 |
| i005 | 60 | 60 | 1000 |

**Practice score: 1,000,000** (all five instances push-optimal), total run
time ~0.55 s. Two runs produce byte-identical output. For comparison, the
house baseline (plain-astar 1.0.0) scores 200,000 on the same set.

## Run locally

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads `/input/<id>/level.txt` by default and writes
`/output/<id>/solution.txt` (creating the directory). Plain JavaScript in a
`.ts` file — no dependencies, no network, no clock reads.

## License

MIT.
