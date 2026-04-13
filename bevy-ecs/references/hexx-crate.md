# hexx Crate Reference (v0.24)

Hex grid library providing coordinates, layouts, mesh builders, algorithms, and multi-resolution chunking. Used via `hexx = { version = "0.24", features = ["bevy"] }`.

## Feature Flags

| Flag | Default | What it adds |
|------|---------|-------------|
| `algorithms` | yes | A* pathfinding, field of movement, field of view |
| `mesh` | yes | PlaneMeshBuilder, ColumnMeshBuilder, HeightMapMeshBuilder |
| `grid` | yes | GridVertex, GridEdge face/vertex/edge coordinates |
| `bevy` | - | Reflect/Component derives, platform collections |
| `serde` | yes | Serialize/Deserialize on Hex and directions |
| `rayon` | - | Parallel iterators |

## Core Types

```rust
use hexx::{Hex, HexLayout, EdgeDirection, VertexDirection};
use hexx::shapes;       // hexagon, parallelogram, triangle, rectangle
use hexx::GridVertex;   // vertex shared by 3 hexes (grid feature)
use hexx::GridEdge;     // edge shared by 2 hexes (grid feature)
```

## Resolutions and Chunks

hexx has built-in multi-resolution support for spatial subdivision:

```rust
const CHUNK_RADIUS: u32 = 5;

// Map a fine-resolution hex to its containing chunk
let chunk = hex.to_lower_res(CHUNK_RADIUS);

// Get the center of a chunk in fine resolution
let center = chunk.to_higher_res(CHUNK_RADIUS);

// Get local coordinates within a chunk
let local = hex.to_local(CHUNK_RADIUS);

// Iterate all hexes in a chunk
let children = center.range(CHUNK_RADIUS);
```

**Key invariant:** Every hex in `center.range(CHUNK_RADIUS)` maps back to the same chunk via `to_lower_res(CHUNK_RADIUS)`.

**Chunk sizing:** `Hex::range_count(radius)` gives the number of hexes per chunk. For `radius=5`: 91 hexes/chunk. For a `MAP_RADIUS=20` grid (1261 hexes), that's ~14 chunks.

### Example: grouping hexes by chunk

```rust
let grid = shapes::hexagon(Hex::ZERO, MAP_RADIUS);
let mut chunks: HashMap<Hex, Vec<Hex>> = HashMap::new();
for hex in grid {
    chunks.entry(hex.to_lower_res(CHUNK_RADIUS))
        .or_default()
        .push(hex);
}
// Each chunk key is a coarse-resolution hex
// Each chunk value contains ~91 fine-resolution hexes
```

hexx ships examples: `chunks.rs` (color-coded chunk visualization) and `resolution_grid.rs` (interactive multi-resolution overlay).

## Dense Storage Maps

Faster alternatives to `HashMap<Hex, T>` for known grid shapes:

| Type | Shape | Speed vs HashMap |
|------|-------|-----------------|
| `HexagonalMap<T>` | Circular (hexagon) | ~15x |
| `RombusMap<T>` | Parallelogram | ~100x |
| `RectMap<T>` | Rectangle | ~15x |

```rust
use hexx::storage::HexagonalMap;
let map = HexagonalMap::new(Hex::ZERO, radius, |hex| compute_height(hex));
let height = map[some_hex];
```

These use flat arrays with index math instead of hashing. Worth it for grids > ~100 hexes.

## Mesh Builders

```rust
use hexx::{PlaneMeshBuilder, ColumnMeshBuilder, HeightMapMeshBuilder};

// Flat hex face (used by hex-terrain for HexFace)
let mesh_data = PlaneMeshBuilder::new(&layout).build();

// 3D hexagonal column (walls + top + bottom)
let mesh_data = ColumnMeshBuilder::new(&layout, height)
    .without_bottom_face()
    .build();

// Heightmap (per-vertex heights + colors)
let mesh_data = HeightMapMeshBuilder::new(&layout, &heights)
    .with_colors(&colors)
    .build();
```

## Shape Generators

```rust
shapes::hexagon(center, radius)      // circular region (used by hex-terrain)
shapes::parallelogram(min, max)      // parallelogram region
shapes::triangle(size)               // triangular region
shapes::flat_rectangle([w, h])       // rectangular region
```

## Algorithms (requires `algorithms` feature)

```rust
use hexx::algorithms::{a_star, field_of_movement, fov};

// A* pathfinding with cost function
let path = a_star(start, end, |from, to| cost(from, to), |hex| heuristic(hex));

// All reachable hexes within budget
let reachable = field_of_movement(start, budget, |from, to| cost(from, to));

// Line-of-sight field of view
let visible = fov::field_of_view(origin, range, |hex| is_opaque(hex));
```

## Hex Algorithms (on Hex type directly)

```rust
hex.neighbor(EdgeDirection::FLAT_TOP)  // adjacent hex
hex.all_neighbors()                    // [Hex; 6]
hex.range(radius)                      // all hexes within radius
hex.ring(radius)                       // hexes at exactly radius distance
hex.rings(min..max)                    // multiple rings
hex.wedge(dir, range)                  // angular slice
hex.spiral_range(radius)               // spiral outward iteration
hex.line_to(target)                    // hex line drawing
hex.unsigned_distance_to(other)        // hex distance
hex.rotate_cw(n)                       // clockwise rotation
hex.reflect_x()                        // axis reflection
```
