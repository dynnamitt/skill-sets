---
name: algorithm
description: Full WFC algorithm pseudocode with complexity notes, optimizations, and a worked walkthrough.
---

# The algorithm

This is the complete algorithm in detail, the way `fast-wfc` and
DeBroglie implement it. Cross-reference with
[concepts.md](concepts.md) for the underlying ideas.

## Inputs

```
N                  : grid width × height (cells)
P                  : number of distinct patterns
weights[p]         : float, frequency of pattern p
compat[p][q][d]    : bool, "p can sit at offset d from q"
                     (d ranges over {N, E, S, W} for 4-conn,
                      or 8 for 8-conn, or 24 for N=3 overlapping)
```

`compat` is precomputed once and shared across runs.

## State

```
wave[x][y]                  : BitSet[P]     // remaining patterns
collapsed[x][y]             : bool          // has a single pattern
entropy_heap                : priority queue of (entropy, x, y)
worklist                    : queue of cells to propagate from
compat_count[x][y][p][d]    : int           // optimization, see below
```

`compat_count[x][y][p][d]` counts how many patterns in cell `(x, y)`
are compatible with pattern `p` sitting at offset `d`. When this hits
zero, `p` can be eliminated from the neighbor at offset `d`.

## The loop

```
def run():
    initialize_wave()
    apply_initial_constraints()
    propagate()                     // resolve initial constraints
    while True:
        cell = pick_lowest_entropy()
        if cell is None: return SUCCESS
        if wave[cell].popcount() == 0: return CONTRADICTION
        pattern = weighted_random(wave[cell], weights)
        observe(cell, pattern)
        if propagate() == CONTRADICTION:
            if backtrack: revert one observation, try next pattern
            else: return CONTRADICTION  // caller restarts
```

### initialize_wave

Every cell starts with every pattern possible.

```
for each (x, y):
    wave[x][y] = ALL_ONES_BITSET
    collapsed[x][y] = False
    for each p, d:
        compat_count[x][y][p][d] = number_of_q_in_neighbor(d)
```

Initialization is O(N · P · D) where D is the number of directions.

### apply_initial_constraints

Set fixed cells, forbidden cells, edge constraints:

```
for each constraint (cell, allowed_patterns):
    for each p not in allowed_patterns:
        eliminate(cell, p)        // adds to worklist
```

`eliminate(cell, p)` clears bit `p` in `wave[cell]` and updates
`compat_count` for each neighbor in each direction.

### propagate

Worklist-based, runs until fixpoint:

```
def propagate():
    while worklist not empty:
        (cell, p_removed) = worklist.pop()
        for each direction d:
            neighbor = cell + d
            if neighbor out of bounds: continue
            for each pattern q where compat[q][p_removed][d]:
                compat_count[neighbor][q][d] -= 1
                if compat_count[neighbor][q][d] == 0 and q in wave[neighbor]:
                    eliminate(neighbor, q)
                    if wave[neighbor].popcount() == 0:
                        return CONTRADICTION
    return OK

def eliminate(cell, p):
    wave[cell].clear(p)
    update entropy_heap for cell
    worklist.push((cell, p))
```

The crucial optimization: **the inner loop iterates only over patterns
`q` that are compatible with `p_removed`.** Precompute, for each
`(p, d)`, the list of `q` that satisfy `compat[q][p][d]`. Then the
inner loop is the size of that list, not P.

### pick_lowest_entropy

```
def pick_lowest_entropy():
    while entropy_heap not empty:
        (entropy, x, y) = entropy_heap.pop_min()
        if collapsed[x][y]: continue   // stale heap entry
        if wave[x][y].popcount() == 1: collapsed[x][y] = True; continue
        return (x, y)
    return None  // all collapsed
```

Use a binary heap. Entries become stale when entropy changes; just
re-insert with the new value and let the `collapsed` check skip stale
ones.

### observe

```
def observe(cell, pattern):
    for each p in wave[cell] where p != pattern:
        eliminate(cell, p)
    collapsed[cell] = True
```

This pushes work onto the propagation queue but doesn't propagate
yet — `run()` calls `propagate()` next.

## Complexity

| Step | Cost |
|---|---|
| Init | O(N · P · D) |
| Each observe + propagate (amortized) | O(P · D) per cell touched |
| Full run, no backtrack | O(N · P · D) typical, O(N² · P · D) worst |
| Backtracking | exponential worst case; in practice modest |

**Memory** is dominated by the wave (N · P bits) and the `compat_count`
table (N · P · D ints). For a 64×64 grid with 100 patterns and 4
directions, that's roughly 6 MB for `compat_count` (int16) plus 50 KB
for the wave. The compatibility table itself is `P² · D` bools (40 KB).

## Worked walkthrough

3×3 grid, 4 patterns A/B/C/D, 4 directions, all weights 1.

Adjacencies (`x` direction only, symmetric for `y`):
- A — A, A — B
- B — A, B — C
- C — B, C — D
- D — C

```
Initial wave (each cell has {A, B, C, D}):
[ABCD] [ABCD] [ABCD]
[ABCD] [ABCD] [ABCD]
[ABCD] [ABCD] [ABCD]

Observe (1, 1) → pick A. Wave becomes:
[ABCD] [ABCD] [ABCD]
[ABCD] [   A] [ABCD]
[ABCD] [ABCD] [ABCD]

Propagate: A's E/W neighbors must be in {A, B}; N/S same.
[ABCD] [AB  ] [ABCD]
[AB  ] [   A] [AB  ]
[ABCD] [AB  ] [ABCD]

Now (0, 1) and (2, 1) and (1, 0) and (1, 2) all have entropy 2.
Their neighbors at (0, 0), (0, 2), (2, 0), (2, 2) still have all four —
their entropy is still 4, so they won't be picked next.

Pick lowest-entropy cell, say (1, 0) → {A, B}, sample B.
[ABCD] [B   ] [ABCD]
[AB  ] [   A] [AB  ]
[ABCD] [AB  ] [ABCD]

Propagate B's neighbors: B can sit next to {A, C}.
(0, 0) ← {A, B} ∩ {A, C} = {A}
(2, 0) ← {A, B} ∩ {A, C} = {A}
(1, 1) was already A, OK.
(1, -1) out of bounds.

Wave:
[A   ] [B   ] [A   ]
[AB  ] [   A] [AB  ]
[ABCD] [AB  ] [ABCD]

Continue. Each observation cascades through propagation. With this
particular adjacency graph, contradictions are unlikely; richer rule
sets generate them frequently.
```

## Optimizations beyond the basics

**Precomputed allowed lists.** For each `(p, d)`, store
`allowed[p][d] = list of q where compat[q][p][d]`. The propagation
inner loop iterates this list, not all P patterns.

**Bitset propagation.** Instead of looping patterns, OR together the
"things that could appear at neighbor[d]" bitsets across cell's options:
`new_neighbor_options = union over q in cell.options of bitset(allowed[q][d])`.
Then AND with the neighbor's current options. Very cache-friendly.

**SIMD.** `fast-wfc` uses SIMD on the `compat_count` decrement.

**Hierarchical / chunked WFC.** For maps too large for direct WFC,
generate a coarse grid first (each cell = a region), then fill each
region with constrained WFC where edges of regions become hard
boundaries. Lior Gaujac's hierarchical-WFC and DeBroglie's chunking
APIs do this.

**Async / streaming.** For Bevy/Unity, run the solver on a background
thread/task and stream collapsed cells back to the renderer; do not
spin the main thread. WFC is decidable per cell — partial results are
visualizable.

## Debugging tips

When output looks wrong or contradictions are frequent:

1. **Render the wave at each step.** Tile each cell as a stack/blend
   of its remaining options. You'll see where over-constraint pinches.
2. **Log which adjacency caused each elimination.** Most contradictions
   trace back to one or two over-restrictive edges.
3. **Try with `N=2` (overlapping)** as a sanity check before going to
   `N=3`. If `N=2` produces noise, your sample is too small.
4. **Reduce tile count.** Half the tiles, see if it works. Bisect to
   find the offending tile.
5. **Check symmetry expansion.** Often the bug is in how rotations are
   applied to the adjacency table.
