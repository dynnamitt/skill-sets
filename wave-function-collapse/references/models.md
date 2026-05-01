---
name: models
description: The two WFC models — tiled (simpletiled) and overlapping — when to use each, and how their adjacency rules are derived.
---

# The two WFC models

WFC has two input formats. Both feed the same observe/propagate solver;
they differ only in how the **set of patterns** and the **compatibility
table** are produced.

## Tiled model (simpletiled)

**Inputs:**
- A set of tiles (small images, 3D meshes, or abstract IDs).
- An adjacency table: for each ordered pair `(tile_a, tile_b, direction)`,
  whether `tile_b` is allowed `direction` away from `tile_a`.
- Optional weights per tile.
- Optional symmetry hints per tile (which rotations and reflections are
  distinct).

**Pattern = tile.** The wave grid stores "which tile per cell".

### Authoring adjacencies

Three common approaches:

**1. Edge labels.** Each tile has labels for its N/E/S/W edges; two
tiles can be adjacent if their facing edges have matching labels.
Easiest to author. Used in DeBroglie's `AdjacentModel` and most Unity
implementations.

```
tile "grass_corner_NE":
    edges: { N: "grass", E: "grass", S: "grass_dirt", W: "grass_dirt" }

# automatically derived:
# can sit next to any tile whose facing edge matches.
```

**2. Explicit list.** Hand-write a table of `(tile_a, tile_b, direction)`
triples. Most flexible, most tedious. Used in mxgmn's reference XML.

```xml
<neighbor left="bridge 1" right="bridge 0"/>
<neighbor left="bridge 0" right="line"/>
```

**3. Sample-based.** Provide a small example image; extract every
adjacency that occurs in it. Lazy but effective.

### Symmetry

Most game tiles have rotational and reflective symmetry that you don't
want to hand-author 8 times. Tiled-model libraries support symmetry
classes:

| Class | Distinct rotations | Notes |
|---|---|---|
| `X` | 1 | Fully symmetric (e.g., grass center) |
| `T` | 4 | T-shape: 4 rotations, no reflection |
| `I` | 2 | Line: rotates by 180°, reflects to itself |
| `L` | 4 | L-shape: 4 rotations |
| `\` | 2 | Diagonal: 2 rotations |
| `F` | 8 | Asymmetric: 4 rotations × 2 reflections |

The library expands a single tile + class into the full set of variants
automatically, sharing weight equally.

### When to use tiled

- You're making a game with hand-drawn tiles.
- The "look" is a design decision; rules are explicit.
- You want predictable, reviewable constraints.

## Overlapping model

**Inputs:**
- A sample image (raster, with discrete colors).
- An integer `N` (typically 2 or 3): the side of the patch.

**Pattern = an N×N patch from the sample.** Compatibility between two
patterns at offset `d` is "do they agree on the cells they share?"

### Pattern extraction

```
patterns = []
weights = {}
for x in 0 .. sample.W - N + 1:
    for y in 0 .. sample.H - N + 1:
        patch = sample[x..x+N, y..y+N]
        for variant in rotations_and_reflections(patch):
            if variant in patterns:
                weights[variant] += 1
            else:
                patterns.append(variant)
                weights[variant] = 1
```

For an `N=3` overlapping model on a 32×32 sample with all 8 symmetries,
you typically get 100–500 unique patterns. The number explodes with
larger `N`.

### Compatibility (overlapping)

Two patterns `p` and `q` are compatible at offset `(dx, dy)` if their
overlapping region (an `(N - |dx|) × (N - |dy|)` rectangle) is identical:

```
def compatible(p, q, dx, dy):
    for x in max(0, dx) .. min(N, N + dx):
        for y in max(0, dy) .. min(N, N + dy):
            if p[x][y] != q[x - dx][y - dy]:
                return False
    return True
```

For `N = 3`, you check `(2N-1)² - 1 = 24` offsets per pair (excluding
zero offset). Precompute the full table once: it's `patterns × patterns
× 24` booleans.

### Output

Each cell of the wave is one pattern (an `N×N` patch). To render to a
W×H pixel image, **take the top-left pixel of each cell's pattern**.
The seam tiles are the rightmost and bottom rows of the output, which
need a slightly different lookup. Most libraries handle this for you.

### When to use overlapping

- You have a small sample image and want a larger image in the same
  style.
- You don't want to hand-author tile adjacencies.
- The "look" includes texture-level detail, not just discrete tiles.

### Why overlapping is harder

- Patterns proliferate. A 32×32 sample at `N=3` is fine; a 256×256
  sample at `N=3` is millions of bytes of compatibility table.
- Contradiction rate is higher because constraints are more intricate.
- Output is harder to art-direct: you can't say "use less of this
  pattern" without re-cropping the sample.

For these reasons, most game projects use the tiled model. Overlapping
shines for one-shot texture synthesis.

## Choosing N (overlapping only)

| `N` | Behavior |
|---|---|
| 2 | Captures 2-step structure. Patterns may look noisy / incoherent. |
| **3** | The default. Captures most local structure including diagonals and small features. |
| 4 | More faithful to sample but pattern count explodes; contradictions become very common. |
| 5+ | Effectively memorizing the sample. Output looks like patchy collage. |

Stick with `N=3`.

## Boundary conditions

Both models need a decision on edges:

| Mode | Behavior |
|---|---|
| **Periodic** (toroidal) | Wave wraps. Output tiles seamlessly. Contradiction rate slightly higher because no edge to "absorb" inconsistency. |
| **Non-periodic** | Wave has hard edges. You usually want to constrain edge cells to a specific border tile, or allow any pattern. |

For game maps, non-periodic with constrained borders is most common.
For texture synthesis, periodic is often the goal.
