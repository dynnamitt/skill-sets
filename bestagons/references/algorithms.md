---
name: algorithms
description: Core hex grid algorithms — neighbors, distance, line drawing, range, ring, spiral, rotation, reflection, field of view, and pathfinding.
---

# Algorithms

All algorithms below assume axial `(q, r)` coordinates with cube
`s = -q - r` derived as needed. They work for both pointy-top and
flat-top — orientation only affects pixel display, not coordinate math.

## Neighbors

Six axial direction vectors, indexed clockwise starting from "east" (or
the equivalent direction for flat-top):

```
DIRECTIONS = [
    (+1,  0),  // E      (or SE for flat-top)
    (+1, -1),  // NE
    ( 0, -1),  // NW
    (-1,  0),  // W
    (-1, +1),  // SW
    ( 0, +1),  // SE     (or NE for flat-top)
]

neighbor(hex, dir):  return hex + DIRECTIONS[dir]
```

Twelve **diagonal** neighbors exist too (distance 2, between two edge
neighbors), used in some movement rules:

```
DIAGONALS = [(+2, -1), (+1, -2), (-1, -1), (-2, +1), (-1, +2), (+1, +1)]
```

## Distance

In cube coordinates, hex distance equals max-axis or half-Manhattan:

```
distance(a, b):
    return (abs(a.q - b.q) + abs(a.r - b.r) + abs(-a.q-a.r - (-b.q-b.r))) / 2
    # equivalent to:
    # return max(abs(a.q-b.q), abs(a.r-b.r), abs(a.s-b.s))
```

Both forms are correct; pick the cheaper one for your platform.

## Line drawing

Lerp from `a` to `b` in cube space, snap each step to the nearest hex:

```
line(a, b):
    N = distance(a, b)
    return [hex_round(lerp(a, b, 1.0/N * i)) for i in 0..=N]

lerp(a, b, t):
    return ((1-t)*a.q + t*b.q, (1-t)*a.r + t*b.r)
```

Edge case: when the line passes exactly through a vertex shared by two
hexes, `hex_round` picks one consistently. Nudge `a` or `b` by a tiny
epsilon before the lerp if you need both sides selected.

## Range — hexes within distance N

```
range(center, N):
    for dq in -N..=N:
        for dr in max(-N, -dq-N)..=min(N, -dq+N):
            yield center + (dq, dr)
```

Count: `1 + 3·N·(N+1) = 3N² + 3N + 1`. For N=5, that's 91 hexes.

**Intersecting two ranges** (movement budget overlap, etc.) — clip the
loops to both centers' bounds; result is a parallelogram-shaped region.

**Range with obstacles** — BFS / flood fill from `center`, marking hexes
visited and stopping at distance N:

```
field_of_movement(center, max_cost, cost_fn):
    visited = {center: 0}
    frontier = [center]
    while frontier:
        next_frontier = []
        for hex in frontier:
            for n in neighbors(hex):
                step = cost_fn(hex, n)
                new_cost = visited[hex] + step
                if new_cost <= max_cost and n not in visited:
                    visited[n] = new_cost
                    next_frontier.append(n)
        frontier = next_frontier
    return visited
```

## Ring — hexes at exactly distance N

Walk N steps in each of the 6 directions, starting at
`center + DIRECTIONS[4] * N` (one corner of the ring):

```
ring(center, N):
    if N == 0: return [center]
    hex = center + DIRECTIONS[4] * N
    results = []
    for side in 0..6:
        for step in 0..N:
            results.append(hex)
            hex = neighbor(hex, side)
    return results
```

Count at radius N: `6N` (for N > 0).

## Spiral — concatenated rings

```
spiral(center, N):
    yield center
    for k in 1..=N:
        yield from ring(center, k)
```

Useful for visiting all hexes within range in a deterministic, visually
pleasing order.

## Rotation around origin

60° rotation in cube space is a cyclic permutation:

```
rotate_cw_60(q, r, s):   return (-r, -s, -q)
rotate_ccw_60(q, r, s):  return (-s, -q, -r)
```

`n × 60°` rotations: apply the function `n` times.

**Around an arbitrary center**: subtract the center, rotate, add it back:

```
rotate_cw_60_around(hex, center):
    return center + rotate_cw_60(hex - center)
```

## Reflection

Mirror across an axis through the origin:

```
reflect_q(q, r, s):  return (q, s, r)   # swap r and s
reflect_r(q, r, s):  return (s, r, q)   # swap q and s
reflect_s(q, r, s):  return (r, q, s)   # swap q and r
```

Reflect across a non-origin axis: translate so the axis passes through
origin, reflect, translate back.

## Field of view

The serious approach is **shadow casting** — for each of the six
60°-wedges around the origin, walk outward casting shadows from opaque
hexes. Each ring's visibility is determined by the union of shadow
intervals from previous rings.

Implementation is fiddly. Use a library:

- Rust: `hexx::algorithms::fov::field_of_view`
- TS: roll your own or pull from
  [Bob Nystrom's article on roguelike FOV](http://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees/)

A cheap fallback: cast a hex line from origin to every hex in
`ring(origin, max_range)` and stop at the first opaque hex. Works, but
produces visible artifacts at long range.

## Pathfinding (A*)

Standard graph A* with hex distance as the heuristic:

```
a_star(start, goal, neighbors_fn, cost_fn):
    open = priority_queue()
    open.push(start, priority=0)
    came_from = {start: None}
    g_score = {start: 0}

    while open:
        current = open.pop()
        if current == goal:
            return reconstruct_path(came_from, current)

        for next_hex in neighbors_fn(current):
            new_g = g_score[current] + cost_fn(current, next_hex)
            if next_hex not in g_score or new_g < g_score[next_hex]:
                g_score[next_hex] = new_g
                priority = new_g + distance(next_hex, goal)
                open.push(next_hex, priority)
                came_from[next_hex] = current
    return None
```

`distance(a, goal)` is the hex distance — admissible because no path can
be shorter than the straight-line hex distance. Tie-break by inserting a
small epsilon (`priority + 0.001 * distance(...)`) to prefer paths that
make progress toward the goal.

For weighted terrain, multiply `cost_fn(a, b)` by the destination's terrain
weight. For one-way edges, make `cost_fn` asymmetric (return `infinity`
for blocked directions).

`hexx::algorithms::a_star` does all of this with the right hex distance
heuristic baked in.
