---
name: rust-alternatives
description: Lesser-known Rust hex grid crates (bestagon, hexing) and how they compare to hexx. Default to hexx unless one of these has a niche feature you need.
---

# Rust Alternatives to hexx

Two other Rust hex grid crates exist on crates.io as of early 2026.
Both are usable; neither is competitive with `hexx` on adoption,
breadth, or license. This file is for completeness — the default
recommendation in this skill is unchanged: **use hexx**.

## At a glance

| | [`hexx`](hexx-rust.md) | `bestagon` | `hexing` |
|---|---|---|---|
| Latest version | 0.24.0 (Feb 2026) | 0.10.0 (Jan 2026) | 0.3.3 (Aug 2024) |
| Total downloads | 106K | 7.1K | 11K |
| Recent weekly | ~24,800 | ~36 | ~57 |
| License | MIT / Apache-2.0 | MIT | **GPL-3.0** ⚠️ |
| Coord systems | axial + conversions to all | axial + cubic | axial |
| Orientation | pointy + flat | **flat only** | pointy + flat |
| A* pathfinding | yes (`algorithms` feature) | no | yes |
| Field of view | yes (`algorithms` feature) | no | yes |
| Field of movement | yes (`algorithms` feature) | no | yes |
| Mesh generation | yes (`mesh` feature) | no | no |
| Dense storage | `HexagonalMap`, `RombusMap`, `RectMap` | no | no |
| Multi-resolution | yes (`to_lower_res`/`to_higher_res`) | no | no |
| Wraparound | yes (`HexBounds`) | no | bounding only |
| Edge / node types | yes (`grid` feature) | yes (top-level modules) | no |
| Bevy integration | yes (feature flag) | yes (version-locked) | no |
| Noise generation | no | no | yes (`noise` crate) |

`hexx` matches or exceeds both alternatives on every feature, has
~10× the adoption and ~400× the recent downloads, and ships under
permissive MIT/Apache-2.0.

## bestagon — when to consider

[`bestagon`](https://gitlab.com/hankruiger/bestagon) — v0.10.0,
MIT, ~36 weekly downloads.

> An experimental engine for discrete stuff in a hexagonal grid.

Distinctive: makes the **half-edge / dual-graph view** central, with
`hex`, `edge`, and `node` as top-level modules (versus hexx, which
exposes `GridEdge` / `GridVertex` under an opt-in `grid` feature).
Useful if your domain reasons about the dual graph all the time —
roads following hex edges, junctions on hex vertices, river networks.

Hard limits:

- **Flat-top only.** No support for pointy-top.
- No A*, FOV, or field-of-movement — you'd write these yourself
- No mesh builders, no dense storage, no wraparound, no multi-resolution
- Bevy version is pinned per crate version (`bestagon 0.10` → `bevy 0.18`)
  — slows down Bevy updates

```toml
bestagon = "0.10"
```

```rust
use bestagon::prelude::*;

let hex = HexAx::new(0, 0);
let neighbours: Vec<HexAx> = hex.hexes().collect();
let point = hex.to_cartesian();         // flat-topped layout
```

**Pick this over hexx only if:** you need first-class edge/node modeling
and you're certain you'll never want pointy-top hexes — and even then,
hexx's `grid` feature probably covers it.

## hexing — when to consider

[`hexing`](https://github.com/CoCoSol007/hexing) — v0.3.3,
GPL-3.0, ~57 weekly downloads.

> A basic Rust library to manipulate hexagonal grids.

Despite calling itself "basic", hexing actually has rough feature parity
with hexx on algorithms (A*, FOV, field of movement) and adds something
hexx doesn't ship: **noise generation** for hex grids via the `noise`
crate. Useful for procedural worldgen if you'd otherwise wire that up
yourself.

Hard limits:

- **GPL-3.0 license.** Viral copyleft. Linking hexing into your binary
  obligates source disclosure under the same terms. For most commercial
  game projects this is a non-starter; for open-source GPL-compatible
  projects it's fine.
- 6 GitHub stars, ~57 weekly downloads — small community, slow issue
  turnaround
- Last published release was August 2024 (commits trickle in but no new
  release in ~18 months)
- No mesh, no dense storage, no multi-resolution, no Bevy integration

```toml
hexing = "0.3"
```

```rust
use hexing::HexPosition;

let pos = HexPosition::new(1, 2);
let pixel = pos.to_pixel_coordinates();
let dist = pos.distance(HexPosition::new(3, 4));

for ring_pos in pos.ring(2) { /* ... */ }
for spiral_pos in pos.spiral(2) { /* ... */ }
```

**Pick this over hexx only if:** your project is GPL-compatible AND you
specifically want hex-grid noise generation that hexx doesn't ship.
Otherwise, hexx + the `noise` crate directly gets you the same result
without the license burden.

## Decision

For new Rust hex-grid work in 2026, default to **hexx**. The other two
crates exist on crates.io but neither offers a feature hexx lacks that
isn't trivially DIY-able with hexx + a small adjacent crate.
