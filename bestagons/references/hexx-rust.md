---
name: hexx-rust
description: hexx — Rust hex grid crate. Coordinates, layouts, algorithms, mesh builders, dense storage, and multi-resolution chunking. v0.24.
---

# hexx (Rust)

[hexx](https://docs.rs/hexx/) is the canonical Rust hex grid crate.
Coordinates, layouts, algorithms, mesh builders, multi-resolution
chunking, and several dense storage maps. Inspired by the Red Blob
Games hex guide.

```toml
[dependencies]
hexx = "0.24"
```

Bevy users add `features = ["bevy"]` to get `Reflect`/`Component` derives
and platform collections — see the
[`bevy-ecs` skill in this repo](../../bevy-ecs/) for ECS patterns.

## Feature flags

| Flag | Default | What it adds |
|---|---|---|
| `algorithms` | yes | A* pathfinding, field of movement, field of view |
| `mesh` | yes | `PlaneMeshBuilder`, `ColumnMeshBuilder`, `HeightMapMeshBuilder` |
| `grid` | yes | `GridVertex`, `GridEdge` for face/vertex/edge coordinates |
| `serde` | yes | `Serialize`/`Deserialize` on `Hex` and directions |
| `bevy` | — | Bevy `Reflect`/`Component` derives |
| `rayon` | — | Parallel iterators |

## Core types

```rust
use hexx::{Hex, HexLayout, HexOrientation, EdgeDirection, VertexDirection};
use hexx::shapes;       // hexagon, parallelogram, triangle, flat_rectangle
use hexx::HexBounds;    // wraparound + bounding
use hexx::storage::{HexagonalMap, RombusMap, RectMap};
```

Internal coordinate system: **axial**. Conversions to cube, doubled,
hexmod, and offset are provided.

## Hex API

```rust
let h = Hex::new(2, -1);

// Navigation
h.neighbor(EdgeDirection::FLAT_TOP)        // single neighbor
h.all_neighbors()                          // [Hex; 6]
h.diagonal_neighbor(EdgeDirection::FLAT_TOP)
h.main_direction_to(other)                 // dominant direction toward other

// Distance
h.unsigned_distance_to(other)              // u32
h.length()                                 // distance from origin

// Iteration
h.line_to(target)                          // impl Iterator<Item = Hex>
h.range(radius)                            // all hexes within radius
h.ring(radius)                             // hexes at exactly radius
h.rings(min..max)                          // multiple concentric rings
h.spiral_range(radius)                     // spiral outward
h.wedge(direction, range)                  // 60° wedge slice

// Transformations
h.rotate_cw(n)                             // n × 60° clockwise
h.rotate_cw_around(center, n)              // around arbitrary center
h.reflect_x()                              // axis reflection
h.reflect_y()
```

## Layout — pixel↔hex conversion

```rust
let layout = HexLayout {
    orientation: HexOrientation::Pointy,
    origin: Vec2::ZERO,
    hex_size: Vec2::splat(32.0),
    ..Default::default()
};

let pixel = layout.hex_to_world_pos(Hex::new(2, -1));
let hex = layout.world_pos_to_hex(Vec2::new(120.0, 80.0));   // returns Hex (rounded)
```

`HexOrientation::Pointy` and `HexOrientation::Flat` cover the two
orientations. `hex_size` accepts non-uniform `(x, y)` for stretched
display.

## Algorithms (`algorithms` feature)

```rust
use hexx::algorithms::{a_star, field_of_movement, fov};

// A* with cost function. Returns Option<Vec<Hex>>.
let path = a_star(start, end, |from, to| cost(from, to));

// All hexes reachable within budget. Returns HashMap<Hex, u32>.
let reachable = field_of_movement(start, budget, |from, to| cost(from, to));

// Line-of-sight FOV. Returns HashSet<Hex>.
let visible = fov::field_of_view(origin, range, |hex| is_opaque(hex));
```

## Shape generators

```rust
shapes::hexagon(Hex::ZERO, radius)          // circular region
shapes::parallelogram(min, max)
shapes::triangle(size)
shapes::flat_rectangle([min_q, max_q, min_r, max_r])
```

All return iterators yielding `Hex`. Use them to seed maps:

```rust
let map: HashMap<Hex, Cell> = shapes::hexagon(Hex::ZERO, 20)
    .map(|h| (h, Cell::default()))
    .collect();
```

## Dense storage maps

Faster than `HashMap<Hex, T>` for known shapes. Use a flat array with
shape-aware indexing.

| Type | Shape | Speedup vs HashMap |
|---|---|---|
| `HexagonalMap<T>` | Hexagonal radius `R` | ~15× |
| `RombusMap<T>` | Parallelogram `Q × R` | ~100× |
| `RectMap<T>` | Rectangle `W × H` | ~15× |

```rust
use hexx::storage::HexagonalMap;
let map = HexagonalMap::new(Hex::ZERO, radius, |hex| compute_value(hex));
let v = map[some_hex];
```

Worth it for grids > ~100 hexes that don't change shape at runtime.

## Wraparound — `HexBounds`

```rust
let bounds = HexBounds::new(Hex::ZERO, radius);
if !bounds.is_in_bounds(h) {
    let wrapped = bounds.wrap(h);   // mirror-centers approach internally
}
```

## Multi-resolution / chunking

For large grids, group fine hexes into coarser parent hexes:

```rust
const CHUNK_RADIUS: u32 = 5;

let chunk = hex.to_lower_res(CHUNK_RADIUS);     // fine → coarse
let center = chunk.to_higher_res(CHUNK_RADIUS); // coarse → fine center
let local = hex.to_local(CHUNK_RADIUS);         // fine → local-to-chunk
let children = center.range(CHUNK_RADIUS);      // all fine hexes in chunk
```

**Invariant**: every hex in `center.range(CHUNK_RADIUS)` maps back to
`chunk` via `to_lower_res(CHUNK_RADIUS)`.

Chunk size: `Hex::range_count(radius)` — for `radius=5`, 91 hexes/chunk.

```rust
let grid = shapes::hexagon(Hex::ZERO, MAP_RADIUS);
let mut chunks: HashMap<Hex, Vec<Hex>> = HashMap::new();
for hex in grid {
    chunks.entry(hex.to_lower_res(CHUNK_RADIUS))
        .or_default()
        .push(hex);
}
```

Examples in the hexx repo: `chunks.rs` (color-coded visualization),
`resolution_grid.rs` (interactive overlay).

## Mesh builders (`mesh` feature)

For 3D rendering. Output includes vertex positions, normals, and UVs.

```rust
use hexx::{PlaneMeshBuilder, ColumnMeshBuilder, HeightMapMeshBuilder};

// Flat hex face
let mesh = PlaneMeshBuilder::new(&layout).build();

// 3D hexagonal column (walls + top + bottom)
let mesh = ColumnMeshBuilder::new(&layout, height)
    .without_bottom_face()
    .build();

// Heightmap with per-vertex heights
let mesh = HeightMapMeshBuilder::new(&layout, &heights)
    .with_colors(&colors)
    .build();
```

Result is a `MeshInfo` struct — convert to your renderer's mesh format
(Bevy `Mesh::from(mesh_info)`, or pass vertices/indices to wgpu/three.js).

## Where to look next

- [Source](https://github.com/ManevilleF/hexx) — examples directory has
  `chunks.rs`, `mesh_builder.rs`, `pathfinding.rs`, `field_of_view.rs`,
  `resolution_grid.rs`, `wrap_around.rs`
- [docs.rs/hexx](https://docs.rs/hexx/) — full API
