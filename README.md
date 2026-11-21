[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121)

# Sokoban Solver

Push-optimal Sokoban solver for make.fun's "Build the best Sokoban solver,
21 November 2026" bounty. Splits each level into rooms off the hallway,
solves each room push-optimally with A* over push macros (min-assignment
box→goal heuristic, corner-deadlock pruning, transposition table), then
stitches the room solutions with BFS walks. Fixed work budgets, never
wall-clock — deterministic, byte-identical across runs. Reads
`/input/<id>/level.txt`, writes `/output/<id>/solution.txt`. Practice
score: 1,000,000 (all five instances push-optimal). MIT.
