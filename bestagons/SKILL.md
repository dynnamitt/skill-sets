---
name: bestagons
description: >
  Hex grids done right. Vocabulary, math, and algorithms from Amit Patel's
  Red Blob Games guide, with current implementation pointers for Rust
  (`hexx`) and TypeScript (`honeycomb-grid`). Use this skill whenever the
  user works with hexagonal grids — turn-based strategy, board games (Catan,
  Wargame), worldgen and procedural maps, hex tiling, hexbin data viz, or
  any code involving axial / cube / offset / doubled coordinates,
  pointy-top vs flat-top orientation, hex-to-pixel conversion, hex
  pathfinding, or hex field-of-view. Also use when the user mentions
  hexx, honeycomb-grid, or asks "should I use a hex grid".
metadata:
  author: kdm
  version: "1.0.0"
---

# Bestagons

Hexagons are the bestagons because all six neighbors are equidistant, the
distance metric is symmetric, and they tile the plane more efficiently than
squares. The math is also less ugly than people fear — once you pick the
right coordinate system.

This skill is the working vocabulary from
[Red Blob Games' Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/)
(Amit Patel, last updated 2026-04-23), packaged with current library
pointers so you don't have to derive it from scratch.

## When to reach for a hex grid

- Six-way movement is more uniform than 4-way orthogonal or 8-way king's
  move (where diagonals are √2 longer but cost the same step).
- Distance is well-defined: `(|dq| + |dr| + |ds|) / 2`.
- Adjacency is symmetric — every neighbor is exactly one step away.
- Common in: turn-based strategy, wargames, Catan, hex-and-counter games,
  worldgen, scientific viz (hexbins beat squarebins for 2D density
  estimation because of isotropic spacing).

## The two decisions that drive everything else

**1. Orientation** — pointy-top or flat-top?

| | Pointy-top | Flat-top |
|---|---|---|
| Width | √3 · size | 2 · size |
| Height | 2 · size | √3 · size |
| Neighbors run | E/W rows | N/S columns |
| Use when | Maps that scroll vertically; classic wargame look | Maps that scroll horizontally; Catan look |

This affects neighbor tables and pixel math, **not** algorithmic correctness.

**2. Coordinate system** — Red Blob's recommendation:

> If you are only going to use rectangular maps, consider the Doubled or
> Offset system that matches your map orientation. For maps with any other
> shape, use Axial/Cube.

| System | Coords | Use for |
|---|---|---|
| **Axial** | `(q, r)` | Default. Everything algorithmic. Storage. |
| **Cube** | `(q, r, s)` with `q+r+s=0` | Algorithms that benefit from 3-axis symmetry: rotation, reflection, distance. |
| **Offset** | `(col, row)` | Rectangular maps as 2D arrays. 4 variants: `evenr`, `oddr`, `evenq`, `oddq`. |
| **Doubled** | `(col, row)` with `(col+row) mod 2 == 0` | Rectangular maps, easier algorithms than offset. |

The big win of axial/cube: you can add, subtract, scale, and rotate hex
coordinates like vectors. Offset can't do that.

## The reference layout

| Topic | File |
|---|---|
| Coordinate systems, conversions, rounding | [references/coordinates.md](references/coordinates.md) |
| Orientation, sizing, hex↔pixel | [references/geometry.md](references/geometry.md) |
| Neighbors, distance, line, range, ring, spiral, rotation, reflection, FOV, A* | [references/algorithms.md](references/algorithms.md) |
| Map shapes, storage strategies, wraparound | [references/storage.md](references/storage.md) |
| **hexx** (Rust crate, v0.24) | [references/hexx-rust.md](references/hexx-rust.md) |
| **honeycomb-grid** (TS/Node, v4.1.5) | [references/honeycomb-ts.md](references/honeycomb-ts.md) |
| **Lua / LÖVE (Love2D)** — Red Blob's CC0 lib + Love2D plumbing | [references/lua-love2d.md](references/lua-love2d.md) |

## Library picker

| Need | Rust | TS / Node | Lua / LÖVE |
|---|---|---|---|
| Coordinates, neighbors, distance | `hexx` | `honeycomb-grid` | Red Blob CC0 `lib.lua` |
| A* pathfinding | `hexx` (`algorithms` feature) | DIY on `honeycomb-grid` + a graph lib | DIY (~50 lines + binary heap) |
| Field of view | `hexx` (`algorithms` feature) | DIY | DIY (port Bob Nystrom shadowcasting) |
| Mesh generation (3D hex tiles) | `hexx` (`mesh` feature) | three.js + `honeycomb-grid` | n/a (LÖVE is 2D) — use `polygon_corners` |
| Wraparound maps | `hexx` `HexBounds` | DIY (mirror centers) | DIY |
| Dense storage | `hexx` `HexagonalMap` / `RombusMap` / `RectMap` | DIY indexing | Lua table with `q,r` string key, or flat array |
| Multi-resolution / chunking | `hexx` `to_lower_res` / `to_higher_res` | DIY | DIY |

The Lua story is bluntest: Red Blob's CC0 reference implementation
covers coords/conversions/layout/line drawing; everything else you
write yourself in 50–100 lines. There is no actively maintained Lua
hex grid library in 2026.

If you're targeting Bevy specifically, this repo also has a
[`bevy-ecs`](../bevy-ecs/) skill with ECS integration patterns — use
both together.

## Anti-patterns

- **Mixing offset and axial in the same codebase without converters at the
  boundary.** Pick axial as your internal representation; convert at I/O
  edges only.
- **Storing every hex in a `HashMap` when a dense map would be 15–100×
  faster.** If your shape is hexagonal/rectangular/parallelogram, use a
  dense flat-array map (hexx provides; for TS, write your own with a
  `(q, r) → index` function).
- **Reimplementing pixel↔hex math when the library already has
  `HexLayout` / `Orientation`.** It's not just `x = size * q` — it's a
  matrix, and you'll get the parity wrong.
- **Using only "diagonal" movement on a hex grid.** Hex diagonals exist
  (12 of them, distance 2) but the six edge-neighbors are already
  equidistant; that's the whole point.
- **Storing `(q, r, s)` as three fields without enforcing `q+r+s=0`.** Use
  axial `(q, r)` for storage and derive `s = -q-r` when you need it.

## Sources

- [Red Blob Games — Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/) — canonical reference, 2013–2026
- [Red Blob Games — Hexagons Implementation Guide](https://www.redblobgames.com/grids/hexagons/implementation.html) — code in many languages
- [hexx on docs.rs](https://docs.rs/hexx/) — Rust, v0.24
- [hexx on GitHub](https://github.com/ManevilleF/hexx)
- [honeycomb-grid on npm](https://www.npmjs.com/package/honeycomb-grid) — TypeScript, v4.1.5
- [honeycomb-grid on GitHub](https://github.com/flauwekeul/honeycomb)
- [Red Blob CC0 Lua reference](https://www.redblobgames.com/grids/hexagons/codegen/output/lib.lua) — drop-in for Lua / LÖVE
