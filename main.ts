// Sokoban solver — written from scratch in this build session.
//
// Approach: the generator lays a 1-wide hallway with 1-4 rooms off it, each
// room holding 3-4 boxes and as many goals, and a box pushed into the hallway
// can never come back, so rooms are independent. The solver:
//   1. splits the level into rooms (connected floor off the hallway row),
//   2. solves each room push-optimally with A* over push macros (player
//      position + sorted boxes; one walk BFS per state for the player's path
//      to each push; min-assignment box->goal heuristic; corner-deadlock
//      pruning; transposition table),
//   3. stitches the room solutions with BFS walks through the hallway.
// A room whose optimal solution traps the player inside (a box ends on its
// door goal) is solved again with an exit requirement when that costs the
// same, otherwise it is scheduled last.
// Determinism: fixed node budgets (work, never wall-clock), fixed neighbour
// orders, no randomness, no clock or environment reads. Only pushes matter
// for the score, so the search minimises pushes, not steps.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DIRS = [
  { dx: 0, dy: -1, ch: 'u' },
  { dx: 0, dy: 1, ch: 'd' },
  { dx: -1, dy: 0, ch: 'l' },
  { dx: 1, dy: 0, ch: 'r' },
];

const ROOM_BUDGET = 600000;
const LEVEL_BUDGET = 200000;

// ---------------------------------------------------------------- parsing
function parseLevel(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const H = lines.length;
  const W = Math.max(0, ...lines.map((l) => l.length));
  const grid = new Array(W * H).fill('#');
  let player = -1;
  const boxes = [];
  const goals = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = lines[y][x] ?? '#';
      const i = y * W + x;
      if (c === '#') grid[i] = '#';
      else if (c === ' ') grid[i] = ' ';
      else if (c === '.') { grid[i] = ' '; goals.push(i); }
      else if (c === '$') { grid[i] = ' '; boxes.push(i); }
      else if (c === '*') { grid[i] = ' '; boxes.push(i); goals.push(i); }
      else if (c === '@') { grid[i] = ' '; player = i; }
      else if (c === '+') { grid[i] = ' '; player = i; goals.push(i); }
      else grid[i] = '#';
    }
  }
  return { W, H, grid, player, boxes, goals };
}

// ------------------------------------------------------- room decomposition
function detectRooms(level) {
  const { W, H, grid, player } = level;
  const hallRow = Math.floor(player / W);
  const hallCells = [];
  for (let x = 0; x < W; x++) {
    const i = hallRow * W + x;
    if (grid[i] !== '#') hallCells.push(i);
  }
  const hallSet = new Set(hallCells);
  const seen = new Uint8Array(W * H);
  const rooms = [];
  for (let i = 0; i < W * H; i++) {
    if (grid[i] === '#' || hallSet.has(i) || seen[i]) continue;
    const cells = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % W, y = (c / W) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (grid[n] === '#' || hallSet.has(n) || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    const cellSet = new Set(cells);
    const boxes = level.boxes.filter((b) => cellSet.has(b));
    const goals = level.goals.filter((g) => cellSet.has(g));
    const portals = cells.filter((c) => {
      const x = c % W, y = (c / W) | 0;
      return DIRS.some((d) => {
        const nx = x + d.dx, ny = y + d.dy;
        return nx >= 0 && ny >= 0 && nx < W && ny < H && hallSet.has(ny * W + nx);
      });
    });
    rooms.push({ cells, cellSet, boxes, goals, portals });
  }
  return { hallRow, hallCells, hallSet, rooms };
}

// ------------------------------------------------------------------- BFS
// Walk BFS over cells where domain[c] is 1, treating boxes as obstacles.
// Returns distance and parent arrays over the whole grid.
function walkBfs(level, domain, boxes, from) {
  const { W, H } = level;
  const dist = new Int32Array(W * H).fill(-1);
  const parent = new Int32Array(W * H).fill(-1);
  const boxSet = new Set(boxes);
  const q = [from];
  dist[from] = 0;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const x = c % W, y = (c / W) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== -1 || !domain[n] || boxSet.has(n)) continue;
      dist[n] = dist[c] + 1;
      parent[n] = c;
      q.push(n);
    }
  }
  return { dist, parent };
}

// Move string from `from` to `to` following parent links, or null.
function pathMoves(level, parent, from, to) {
  const { W } = level;
  const chars = [];
  let c = to;
  while (c !== from) {
    const p = parent[c];
    if (p < 0) return null;
    const dx = (c % W) - (p % W);
    const dy = ((c / W) | 0) - ((p / W) | 0);
    chars.push(dx === 1 ? 'r' : dx === -1 ? 'l' : dy === 1 ? 'd' : 'u');
    c = p;
  }
  chars.reverse();
  return chars.join('');
}

function canReachPortal(level, domain, player, boxes, portals) {
  if (!portals) return true;
  const { dist } = walkBfs(level, domain, boxes, player);
  return portals.some((p) => dist[p] >= 0);
}

// ------------------------------------------------------------- simulation
function simulate(level, boxesArr, player, moves) {
  const { W, H, grid } = level;
  const boxes = new Set(boxesArr);
  let p = player;
  let pushes = 0;
  for (let i = 0; i < moves.length; i++) {
    const d = DIRS.find((dd) => dd.ch === moves[i]);
    if (!d) return null;
    const x = p % W, y = (p / W) | 0;
    const nx = x + d.dx, ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return null;
    const np = ny * W + nx;
    if (grid[np] === '#') return null;
    if (boxes.has(np)) {
      const bx = nx + d.dx, by = ny + d.dy;
      if (bx < 0 || by < 0 || bx >= W || by >= H) return null;
      const nb = by * W + bx;
      if (grid[nb] === '#' || boxes.has(nb)) return null;
      boxes.delete(np);
      boxes.add(nb);
      pushes++;
    }
    p = np;
  }
  return { boxes, player: p, pushes };
}

// ------------------------------------------------------- heuristic (admissible)
// Minimum-cost assignment of boxes to goals, cost = cell distance ignoring
// other boxes. One push moves one box one cell, so the assignment sum drops
// by at most 1 per push: admissible, and 0 exactly at a solved state.
function heuristic(boxes, goalsSorted, distToGoal) {
  const n = boxes.length;
  const perm = [];
  for (let i = 0; i < n; i++) perm.push(i);
  let best = Infinity;
  for (;;) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = distToGoal.get(goalsSorted[perm[i]])[boxes[i]];
      if (d < 0) { sum = Infinity; break; }
      sum += d;
    }
    if (sum < best) best = sum;
    let i = n - 2;
    while (i >= 0 && perm[i] >= perm[i + 1]) i--;
    if (i < 0) break;
    let j = n - 1;
    while (perm[j] <= perm[i]) j--;
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    for (let a = i + 1, b = n - 1; a < b; a++, b--) {
      const t2 = perm[a]; perm[a] = perm[b]; perm[b] = t2;
    }
  }
  return best;
}

// ------------------------------------------------------------- A* over pushes
// cfg: domain (walkable cells), destCells (cells a box may be pushed onto),
// boxes0, goals, entries (starting player cells), portals (exit check),
// budget (max expansions), requireExit.
function pushAStar(level, cfg) {
  const { W, H, grid } = level;
  const { domain, destCells, boxes0, goals, entries, portals, budget } = cfg;
  const requireExit = !!cfg.requireExit;
  const goalsSorted = [...goals].sort((a, b) => a - b);
  const goalSet = new Set(goalsSorted);
  const n = boxes0.length;
  if (n === 0) {
    return { pushes: 0, moves: '', startCell: entries[0], endPlayer: entries[0], endBoxes: [] };
  }
  const distToGoal = new Map();
  for (const g of goalsSorted) {
    distToGoal.set(g, walkBfs(level, destCells, [], g).dist);
  }
  const keyOf = (boxes, player) => boxes.join(',') + '|' + player;
  const isGoalState = (boxes) => {
    for (let i = 0; i < n; i++) if (boxes[i] !== goalsSorted[i]) return false;
    return true;
  };
  const cornerDead = (c) => {
    if (goalSet.has(c)) return false;
    const x = c % W, y = (c / W) | 0;
    const wall = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H || grid[yy * W + xx] === '#';
    return (wall(x, y - 1) && wall(x - 1, y)) || (wall(x, y - 1) && wall(x + 1, y)) ||
           (wall(x, y + 1) && wall(x - 1, y)) || (wall(x, y + 1) && wall(x + 1, y));
  };
  // Binary min-heap ordered by (f, h, insertion counter): fully deterministic.
  const heap = [];
  const heapLess = (a, b) => (a.f !== b.f ? a.f < b.f : (a.h !== b.h ? a.h < b.h : a.c < b.c));
  const heapPush = (el) => {
    heap.push(el);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!heapLess(heap[i], heap[p])) break;
      const t = heap[i]; heap[i] = heap[p]; heap[p] = t;
      i = p;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heapLess(heap[l], heap[m])) m = l;
        if (r < heap.length && heapLess(heap[r], heap[m])) m = r;
        if (m === i) break;
        const t = heap[i]; heap[i] = heap[m]; heap[m] = t;
        i = m;
      }
    }
    return top;
  };
  const closed = new Map();
  let counter = 0;
  const boxes0s = [...boxes0].sort((a, b) => a - b);
  const h0 = heuristic(boxes0s, goalsSorted, distToGoal);
  if (h0 === Infinity) return null;
  for (const e of [...entries].sort((a, b) => a - b)) {
    const key = keyOf(boxes0s, e);
    if (closed.has(key)) continue;
    closed.set(key, { g: 0, parent: null, moves: '' });
    heapPush({ f: h0, h: h0, g: 0, c: counter++, key, boxes: boxes0s, player: e });
  }
  let expansions = 0;
  while (heap.length) {
    const cur = heapPop();
    const rec = closed.get(cur.key);
    if (!rec || rec.g !== cur.g) continue; // stale heap entry
    if (isGoalState(cur.boxes) && (!requireExit || canReachPortal(level, domain, cur.player, cur.boxes, portals))) {
      const segs = [];
      let k = cur.key;
      let rootKey = k;
      while (k !== null) {
        const r = closed.get(k);
        segs.push(r.moves);
        rootKey = k;
        k = r.parent;
      }
      segs.reverse();
      return {
        pushes: cur.g,
        moves: segs.join(''),
        startCell: parseInt(rootKey.split('|')[1], 10),
        endPlayer: cur.player,
        endBoxes: cur.boxes,
      };
    }
    if (++expansions > budget) return null;
    const { dist, parent } = walkBfs(level, domain, cur.boxes, cur.player);
    const boxSet = new Set(cur.boxes);
    for (let bi = 0; bi < n; bi++) {
      const b = cur.boxes[bi];
      const bx = b % W, by = (b / W) | 0;
      for (const d of DIRS) {
        const dx = bx + d.dx, dy = by + d.dy;
        const sx = bx - d.dx, sy = by - d.dy;
        if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const dest = dy * W + dx;
        if (!destCells[dest] || boxSet.has(dest)) continue;
        const stance = sy * W + sx;
        if (dist[stance] < 0) continue;
        if (cornerDead(dest)) continue;
        const nb = [...cur.boxes];
        nb[bi] = dest;
        nb.sort((a, b2) => a - b2);
        const h = heuristic(nb, goalsSorted, distToGoal);
        if (h === Infinity) continue;
        const g2 = cur.g + 1;
        const key2 = keyOf(nb, b);
        const old = closed.get(key2);
        if (old && old.g <= g2) continue;
        const seg = pathMoves(level, parent, cur.player, stance) + d.ch;
        closed.set(key2, { g: g2, parent: cur.key, moves: seg });
        heapPush({ f: g2 + h, h, g: g2, c: counter++, key: key2, boxes: nb, player: b });
      }
    }
  }
  return null;
}

// ------------------------------------------------------------- room solving
function solveRoom(level, det, room) {
  const { W, H } = level;
  const domain = new Uint8Array(W * H);
  for (const c of room.cells) domain[c] = 1;
  for (const c of det.hallCells) domain[c] = 1;
  const destCells = new Uint8Array(W * H);
  for (const c of room.cells) destCells[c] = 1;
  const entrySet = new Set();
  for (const p of room.portals) {
    const x = p % W, y = (p / W) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nn = ny * W + nx;
      if (det.hallSet.has(nn)) entrySet.add(nn);
    }
  }
  const entries = [...entrySet].sort((a, b) => a - b);
  const base = {
    domain, destCells, boxes0: room.boxes, goals: room.goals,
    entries, portals: room.portals, budget: ROOM_BUDGET, requireExit: false,
  };
  const res = pushAStar(level, base);
  if (!res) return null;
  if (canReachPortal(level, domain, res.endPlayer, res.endBoxes, room.portals)) {
    return { ...res, exit: true };
  }
  const res2 = pushAStar(level, { ...base, requireExit: true });
  if (res2 && res2.pushes === res.pushes) return { ...res2, exit: true };
  return { ...res, exit: false };
}

// ------------------------------------------------------------- level solving
function solveLevel(text) {
  const level = parseLevel(text);
  const { W, H, grid } = level;
  const det = detectRooms(level);
  const allFloor = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) allFloor[i] = grid[i] !== '#' ? 1 : 0;
  const goalSet = new Set(level.goals);
  const solved = (boxes) => {
    if (boxes.size !== goalSet.size) return false;
    for (const b of boxes) if (!goalSet.has(b)) return false;
    return true;
  };
  let ok = det.rooms.length > 0;
  let countedBoxes = 0, countedGoals = 0;
  for (const room of det.rooms) {
    if (room.boxes.length !== room.goals.length) ok = false;
    if (room.boxes.length > 0 && room.portals.length === 0) ok = false;
    countedBoxes += room.boxes.length;
    countedGoals += room.goals.length;
  }
  if (countedBoxes !== level.boxes.length || countedGoals !== level.goals.length) ok = false;
  if (ok) {
    const sols = [];
    for (const room of det.rooms) {
      if (room.boxes.length === 0) { sols.push(null); continue; }
      const sol = solveRoom(level, det, room);
      if (!sol) { ok = false; break; }
      sols.push(sol);
    }
    if (ok) {
      const order = det.rooms.map((_, i) => i).sort((a, b) => {
        const ea = sols[a] ? sols[a].exit : false;
        const eb = sols[b] ? sols[b].exit : false;
        return ea === eb ? a - b : (ea ? -1 : 1);
      });
      let boxes = new Set(level.boxes);
      let player = level.player;
      let moves = '';
      for (const ri of order) {
        const sol = sols[ri];
        if (!sol) continue;
        const { parent } = walkBfs(level, allFloor, [...boxes], player);
        const walk = pathMoves(level, parent, player, sol.startCell);
        if (walk === null) { ok = false; break; }
        const simW = simulate(level, [...boxes], player, walk);
        if (!simW) { ok = false; break; }
        boxes = simW.boxes;
        player = simW.player;
        moves += walk;
        const simR = simulate(level, [...boxes], player, sol.moves);
        if (!simR) { ok = false; break; }
        boxes = simR.boxes;
        player = simR.player;
        moves += sol.moves;
      }
      if (ok && solved(boxes)) return moves;
      ok = false;
    }
  }
  // Fallback: whole-level push A* (small levels only; budget-capped).
  const res = pushAStar(level, {
    domain: allFloor, destCells: allFloor, boxes0: level.boxes,
    goals: level.goals, entries: [level.player], portals: null,
    budget: LEVEL_BUDGET, requireExit: false,
  });
  if (res) {
    const sim = simulate(level, level.boxes, level.player, res.moves);
    if (sim && solved(sim.boxes)) return res.moves;
  }
  return '';
}

// --------------------------------------------------------------------- main
for (const id of readdirSync(IN_DIR).sort()) {
  let moves = '';
  try {
    moves = solveLevel(readFileSync(join(IN_DIR, id, 'level.txt'), 'utf8'));
  } catch (e) {
    moves = '';
  }
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'solution.txt'), moves + '\n');
}
