---
name: wave-function-collapse
description: >
  Wave Function Collapse (WFC) for procedural content generation —
  Maxim Gumin's 2016 algorithm for generating images, tilemaps, and
  level layouts from a small set of adjacency constraints or a sample
  image. Covers the two models (tiled, overlapping), the core
  observe/propagate/backtrack loop, entropy heuristics, and current
  library pointers for Rust, TypeScript, C#, and C++. Use this skill
  whenever the user is generating tilemaps, dungeons, terrain, textures,
  city/building layouts, or any grid content from local adjacency rules,
  or mentions WFC, mxgmn, DeBroglie, fast-wfc, Model Synthesis,
  MarkovJunior, Townscaper, Bad North, Caves of Qud, or "constraint-based
  procgen". Also use when the user asks "should I use WFC or noise" /
  "WFC vs Model Synthesis" / "why does my WFC keep producing
  contradictions".
metadata:
  author: kdm
  version: "1.0.0"
---

# Wave Function Collapse

WFC is **constraint propagation on a grid, with weighted random choice
to break ties**. The "wave function" framing is marketing — it's an
arc-consistency algorithm (think AC-3) wrapped around a CSP, with the
solver biased toward inputs that look like the training sample.

The algorithm is by [Maxim Gumin](https://github.com/mxgmn/WaveFunctionCollapse)
(2016). The C# reference implementation is the canonical source; nearly
every other library is a port or re-derivation of it.

## When to reach for WFC

- You have a **small example** (a sample image, a tile set with adjacency
  rules) and want larger output that "looks like" it locally.
- The constraints are **local and grid-based**: cell `(x, y)` only
  cares about its neighbors.
- You want output that's **always valid** by construction (every
  adjacency holds), not "valid in expectation" like noise-based methods.
- Examples in the wild: Townscaper (Oskar Stålberg), Bad North,
  Caves of Qud (overworld), Proc Skater, Brick Block, dozens of
  game-jam entries.

## When NOT to reach for WFC

- **Global constraints** (reachability, "exactly one boss room",
  symmetry): WFC alone won't enforce these. You need to wrap WFC with
  rejection sampling, post-processing, or a different algorithm.
- **Large outputs** (>100×100 cells with rich tile sets): WFC scales
  poorly. Use [Model Synthesis](references/alternatives.md) or
  hierarchical/chunked WFC.
- **You want continuous variation** (rolling hills, gradients): use
  Perlin/Simplex noise. WFC is for discrete tile choices.
- **Strong stylistic control** is needed: WFC is famously hard to
  art-direct. Prefer hand-authored grammars or
  [MarkovJunior](references/alternatives.md).

## The two models

WFC has two flavors that share the same solver but differ in how
adjacency rules are derived.

| | **Tiled (simpletiled)** | **Overlapping** |
|---|---|---|
| Input | Tile set + explicit adjacency table | Sample image |
| Rule source | Hand-authored | Auto-extracted from N×N patches |
| Output unit | One tile per cell | One pattern per cell, render center pixel |
| Use for | Hand-crafted tilesets, dungeons, level kits | Texture synthesis, "procgen this image" |
| Sample size | Tens of tiles | Tens to hundreds of unique N×N patterns |

**Use tiled when you have a tile set.** Use overlapping when you have
an image you want to extend. Most game uses are tiled.

See [references/models.md](references/models.md) for the precise
definition of each.

## The core loop

```
while not all cells collapsed:
    cell = pick lowest-entropy uncollapsed cell  # observe
    if cell has zero options: contradiction → backtrack or restart
    pattern = weighted random choice from cell's options  # collapse
    cell.options = {pattern}
    propagate: for every neighbor, remove options inconsistent with cell
              repeat until no more options change (AC-3 fixpoint)
```

That's the whole algorithm. Three subtleties:

1. **"Lowest entropy"** is usually approximated by smallest option count
   (with a tiny weight-based tiebreaker), not real Shannon entropy.
2. **Propagation** is the expensive part. A naïve implementation is
   O(cells × patterns²); fast implementations cache compatibility tables
   and use a worklist.
3. **Contradictions** are common. Strategies: full restart (Gumin's
   reference), local backtrack (DeBroglie), or constraint relaxation.
   See [references/algorithm.md](references/algorithm.md).

## The reference layout

| Topic | File |
|---|---|
| Entropy, propagation, contradictions, backtracking | [references/concepts.md](references/concepts.md) |
| Tiled vs overlapping models in detail | [references/models.md](references/models.md) |
| Pseudocode and complexity for the full algorithm | [references/algorithm.md](references/algorithm.md) |
| Rust — `wfc`, `fast-wfc` bindings, hierarchical variants | [references/libraries-rust.md](references/libraries-rust.md) |
| TypeScript / JS — `wavefunctioncollapse`, mxgmn ports | [references/libraries-typescript.md](references/libraries-typescript.md) |
| C# / Unity — DeBroglie (Boris the Brave), mxgmn reference | [references/libraries-csharp.md](references/libraries-csharp.md) |
| C++ / Python — `fast-wfc` and friends | [references/libraries-cpp.md](references/libraries-cpp.md) |
| Alternatives — Model Synthesis, MarkovJunior, plain CSP | [references/alternatives.md](references/alternatives.md) |

## Library picker

| Need | Rust | TypeScript | C# / Unity | C++ / Python |
|---|---|---|---|---|
| Tiled model, simple use | `wfc` crate | `wavefunctioncollapse` (npm) | DeBroglie | `fast-wfc` (Py: `pyfastwfc`) |
| Overlapping model | `wfc` crate | `wavefunctioncollapse` (npm) | DeBroglie or mxgmn ref | `fast-wfc` |
| Backtracking (not just restart) | DIY | DIY | **DeBroglie** | DIY |
| Path / connectivity constraints | DIY | DIY | **DeBroglie** (built-in) | DIY |
| 3D voxel tiles | `wfc` (with care) | DIY | DeBroglie (Unity) | DIY |
| Performance-critical, fast | `wfc` (compiled) | tolerable for ≤64² grids | DeBroglie (decent) | **`fast-wfc`** |
| "Textbook clear, hackable" | mxgmn port | mxgmn port | **mxgmn reference** (C#) | mxgmn port |

**The pragmatic answer:** if you're prototyping and don't care about
language, use **DeBroglie** — it's the most feature-complete and the
docs are excellent. If you need raw speed, use **`fast-wfc`** (C++,
with Python bindings). For pure Rust without bindings, `wfc` works but
expect to write your own tile authoring layer.

## Anti-patterns

- **Confusing "more tiles" with "more variety".** Each new tile multiplies
  the constraint table and the contradiction rate. Start with the
  smallest set that produces interesting output, then grow.
- **Forgetting tile rotations and reflections.** A wall tile usually
  needs 4 rotations × 2 reflections = 8 variants, all sharing weight.
  The tiled model libraries support `symmetry` flags for this; use them.
- **Treating contradictions as bugs to silence.** Contradictions are a
  signal that your constraint set is over- or under-determined. Look at
  *which* cell contradicted and *which* neighbor pinched it.
- **Using WFC for things noise does better.** Heightmaps, biome blends,
  cloud cover — these are noise problems. Use WFC where the *adjacency
  rules* are the design.
- **Full-grid WFC for big maps.** WFC's cost is roughly cubic in grid
  size during propagation pathological cases. Chunk into rooms /
  regions / corridors and stitch, or use Model Synthesis.
- **Conflating "WFC" with "the overlapping model".** The overlapping
  model is one of two; the simpler tiled model is usually what game
  developers actually want.

## Related skills in this repo

- [`bestagons`](../bestagons/) — if you're doing WFC on a hex grid, the
  neighbor table from there plugs straight into the propagation step.
- [`bevy-ecs`](../bevy-ecs/) — for Bevy integrations, run the solver
  in a `Task` and stream results back via a channel; don't do it
  synchronously in a system.

## Sources

- [Maxim Gumin — WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) — canonical C# reference, MIT
- [Maxim Gumin — MarkovJunior](https://github.com/mxgmn/MarkovJunior) — Gumin's successor algorithm
- [Boris the Brave — DeBroglie](https://github.com/BorisTheBrave/DeBroglie) — feature-complete C# library
- [Boris the Brave — WFC explained](https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/) — best plain-language explanation
- [Boris the Brave — WFC tips and tricks](https://www.boristhebrave.com/2020/02/08/wave-function-collapse-tips-and-tricks/)
- [Mathieu Olivier — fast-wfc](https://github.com/math-fehr/fast-wfc) — C++ implementation, with Python bindings
- [Paul Merrell — Model Synthesis (2007)](https://paulmerrell.org/model-synthesis/) — predecessor to WFC, often more practical
- [Oskar Stålberg — Townscaper devlog](https://www.youtube.com/watch?v=Uxeo9c-PX-w) — WFC in production
- [Isaac Karth & Adam Smith — WFC is constraint solving (2017)](https://adamsmith.as/papers/wfc_is_constraint_solving_in_disguise.pdf) — academic framing
