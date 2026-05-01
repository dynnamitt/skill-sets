---
name: libraries-rust
description: Rust libraries for Wave Function Collapse — the wfc crate, fast-wfc bindings, and hierarchical variants.
---

# Rust libraries

The Rust ecosystem for WFC is sparse compared to C# (DeBroglie). The
`wfc` crate is the most-used native option; for serious workloads,
`fast-wfc` C++ bindings are still the fastest.

## `wfc` (gridbugs / stevenpetryk)

Crate: [`wfc`](https://crates.io/crates/wfc)

Pure-Rust implementation by Stephen Sherratt. Tiled and overlapping
models, restart-based contradiction handling, no backtracking. Used in
several roguelike-flavored games.

```toml
[dependencies]
wfc = "0.13"      # check crates.io for current version
wfc_image = "0.13"  # if you want to load from images
```

```rust
use wfc::*;
use wfc_image::*;
use std::num::NonZeroU32;

let input = image::open("sample.png")?.to_rgba8();
let pattern_size = NonZeroU32::new(3).unwrap();
let output_size = Size::new(64, 64);

let result = wfc_image::generate_image_with_rng(
    &input,
    pattern_size,
    output_size,
    &orientation::ALL,
    wrap::WrapXY,
    ForbidNothing,
    retry::NumTimes(10),
    &mut rand::thread_rng(),
)?;

result.save("output.png")?;
```

For the **tiled model**, you assemble a `PatternTable` manually:

```rust
let mut pattern_table = PatternTable::new();
for (i, tile_def) in tiles.iter().enumerate() {
    pattern_table.add_pattern(/* weight, allowed_neighbors per direction */);
}
let global_stats = GlobalStats::new(pattern_table);
let mut wfc = RunOwn::new(output_size, &global_stats, rng);
wfc.collapse_retrying(retry::NumTimes(10), rng)?;
```

Strengths:
- Pure Rust, no FFI.
- Reasonable performance for 64×64-ish grids.
- Clean API for retry strategies.
- `wfc_image` ergonomic for overlapping mode.

Weaknesses:
- No backtracking (only restart).
- Tiled-model authoring is verbose; no XML or RON loader for tile sets
  out of the box.
- 3D not supported.

## `fast-wfc` via FFI

[fast-wfc](https://github.com/math-fehr/fast-wfc) is a C++17 implementation
that's measurably faster than `wfc` on large grids. Wrap it via `cc`
crate or use existing bindings.

Use this when:
- Output is larger than ~128×128.
- The Rust solution drops below 1 grid/second.
- You're already linking against C++ for other reasons.

There is no widely-published `fast-wfc-rs` crate as of 2026; you'll
write the wrapper yourself, which is straightforward (it's a small
C++ codebase).

## `hierarchical-wfc`

For maps too large for monolithic WFC, hierarchical approaches generate
a coarse grid first then fill each cell with constrained WFC. Lior
Gaujac's research code on GitHub is the reference; there is no
canonical Rust crate. Implement it yourself by:

1. Defining a coarse tile set ("forest", "river", "town").
2. Running WFC on the coarse grid.
3. For each coarse cell, running WFC on a fine grid, with the borders
   of the fine grid constrained to match neighboring coarse cells.

DeBroglie's docs on "nested models" are the best plain-language guide
to this technique even if you implement in Rust.

## Bevy integration

WFC is CPU-bound; do **not** run it in a Bevy system on the main schedule.
Pattern:

```rust
use bevy::prelude::*;
use bevy::tasks::{AsyncComputeTaskPool, Task};
use futures_lite::future;

#[derive(Component)]
struct WfcJob(Task<Result<Grid, WfcError>>);

fn spawn_wfc(mut commands: Commands) {
    let pool = AsyncComputeTaskPool::get();
    let task = pool.spawn(async move {
        run_wfc()  // synchronous WFC inside async block
    });
    commands.spawn(WfcJob(task));
}

fn poll_wfc(
    mut commands: Commands,
    mut jobs: Query<(Entity, &mut WfcJob)>,
) {
    for (entity, mut job) in &mut jobs {
        if let Some(result) = future::block_on(future::poll_once(&mut job.0)) {
            // spawn tile entities from the grid
            commands.entity(entity).despawn();
        }
    }
}
```

For partial / streaming output, run WFC in a thread and send observed
cells over an `mpsc::channel`; consume in a Bevy system.

See the [`bevy-ecs`](../../bevy-ecs/) skill for ECS patterns.

## What about `bevy_wfc` / similar named crates?

Various community crates exist with names like `bevy_wfc`,
`tile_collapse`, `procgen`. Check crates.io for current state, stars,
and last commit. As of 2026 none have emerged as a clear standard;
treat them as starting points rather than production libraries.

## Recommendation

- **Prototyping / small grids**: `wfc` crate.
- **Production game / large grids**: write a C++ FFI wrapper around
  `fast-wfc`, or accept the C# solution and use Unity/Godot.
- **Bespoke 3D / complex constraints**: implement directly. The
  algorithm is ~500 lines of Rust; the value-add of a library is
  mostly the I/O and adjacency authoring layer.
