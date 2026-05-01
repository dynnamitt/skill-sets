---
name: concepts
description: Core WFC concepts — wave, superposition, entropy, observation, propagation, contradictions, backtracking.
---

# Concepts

## The wave

The "wave" is the data structure: a 2D (or 3D) grid where each cell
holds a **bitset of which patterns are still possible** at that cell.

```
wave[x][y] : BitSet[NumPatterns]
```

Initially every cell has every pattern possible (all bits set). The
algorithm runs until every cell has exactly one bit set — at which
point the cell has been **collapsed** to a single pattern.

A cell with zero bits set is a **contradiction**: no pattern fits there
given the choices made elsewhere.

"Superposition" and "wave function" are physics metaphors for "set of
remaining options" and "the whole bitset grid". They aren't load-bearing —
the algorithm is pure CSP.

## Entropy

Entropy quantifies how constrained a cell is, used to decide which cell
to collapse next. The principle: collapse the most-constrained cell
first, because that's where contradictions are most likely and you want
to find them early.

Three entropy measures, in increasing fidelity and cost:

**1. Option count.** Just count the bits. Cheapest, often good enough.

```
entropy(cell) = popcount(cell.options)
```

**2. Weighted Shannon entropy.** Account for tile weights:

```
entropy(cell) = log(W) - (sum_i w_i log w_i) / W
where W = sum of weights of remaining patterns
```

This is what Gumin's reference uses. It biases toward cells whose
remaining options are imbalanced (high-weight + low-weight mixture =
low entropy = collapse first).

**3. Option count with weight tiebreak + tiny noise.** The pragmatic
choice for most ports:

```
entropy(cell) = popcount(cell.options)
              + small_noise * random()  // break ties between cells
```

The noise prevents systematic bias toward upper-left cells when many
have the same option count.

**Practical recommendation:** start with option count + noise. Switch to
weighted entropy only if you see weight imbalance hurting output
quality.

## Observation

To "observe" a cell:

1. Pick the uncollapsed cell with lowest entropy (ties broken by noise).
2. Sample a pattern from that cell's remaining options, weighted by
   each pattern's frequency.
3. Set the cell's bitset to just that one pattern.
4. Push the cell onto the propagation worklist.

If multiple cells tie on lowest entropy, the noise term picks one
uniformly. If *no* cells are uncollapsed, the algorithm is done.

## Propagation

Propagation is constraint enforcement. After observing (or initial
constraints, like fixed border tiles), it's the job of the propagator
to **remove patterns from neighbors that are no longer compatible**.

Worklist-based propagation:

```
worklist = [observed_cell]
while worklist not empty:
    cell = worklist.pop()
    for each direction d in {N, E, S, W}:
        neighbor = cell + d
        for each pattern p in neighbor.options:
            if no pattern q in cell.options is compatible(q, p, d):
                neighbor.options.remove(p)
                if neighbor.options is empty: CONTRADICTION
                if not already queued: worklist.push(neighbor)
```

`compatible(q, p, d)` is precomputed: a 4D table
`compat[q][p][d] : bool` ("can pattern p sit `d` away from pattern
q?"). For tiled models this comes from the adjacency table; for
overlapping it's derived from the sample.

The fast trick (used by `fast-wfc`): instead of "is there *any*
compatible pattern in cell?", maintain **counters** per neighbor cell:
`compatible_count[neighbor][p][d]` = number of `q` in `cell.options`
that allow `p` at offset `d`. Decrement on removal; only when it
hits zero do you remove `p` from the neighbor. Turns inner loops from
O(patterns) into O(1) amortized.

## Contradictions

A contradiction is a cell whose options bitset becomes empty during
propagation. It means the choices made so far are inconsistent — there
is no completion of the grid that satisfies all constraints.

Three response strategies:

| Strategy | When |
|---|---|
| **Full restart** | Gumin's reference. Throw away the wave, start over with a different RNG seed. Simple, works for small grids. |
| **Local backtrack** | DeBroglie's default. Save snapshots at each observation; on contradiction, undo the last few observations and try a different pattern. Slower per step but converges on hard inputs. |
| **Constraint relaxation** | Allow some cells to violate adjacency. Cheap but produces visible glitches. |

For most projects: **start with restart. Switch to backtrack only if
restart loops infinitely.**

The contradiction rate is a sensitive function of:
- Grid size (more cells = more chances to fail)
- Pattern count (more patterns = more constraints to satisfy)
- Adjacency restrictiveness (every tile fitting next to itself = 0%
  contradictions but boring output; every tile having one valid
  neighbor = 99% contradictions)

A well-designed tile set has a contradiction rate under 5%. Above 30%,
your tile set has a structural problem — usually a cycle in the
adjacency graph that requires impossible global structure.

## Backtracking

DeBroglie-style backtrack:

```
stack = []
while not done:
    snapshot = wave.copy()  // or: snapshot = list of changes since last
    cell, pattern = observe()
    stack.push((snapshot, cell, pattern))
    if propagate() == CONTRADICTION:
        while stack:
            snapshot, cell, pattern = stack.pop()
            wave = snapshot
            cell.options.remove(pattern)
            if cell.options not empty:
                stack.push((snapshot, cell, ...))  // try a different pattern
                break  // resume forward
        else:
            FAIL  // exhausted; no valid layout exists
```

Key implementation note: snapshotting the entire wave is expensive.
Real implementations record **change logs** (which bits got cleared in
which cells) and replay them in reverse on backtrack.

## Pre-set constraints

Before the first observation, you usually want to constrain the wave:

- **Fixed border tiles** (e.g., "edge cells must be `grass_edge`"): set
  those cells' options bitsets manually, then propagate from each.
- **Fixed interior cells** ("there must be a door at (5, 7)"): same.
- **Forbidden patterns** ("no rotated lava"): clear those bits everywhere
  before starting.

Doing this *before* the main loop lets propagation eliminate
incompatible patterns globally up front, often dramatically reducing the
contradiction rate later.
