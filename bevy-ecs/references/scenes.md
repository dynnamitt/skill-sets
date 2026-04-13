---
name: Scenes & Serialization
description: Bevy 0.18 scene system — DynamicScene save/load, RON format, BSN macro, SceneSpawner, Reflect requirements.
---

# Scenes & Serialization (0.18)

## Overview

Bevy can serialize entities + components to files and load them back. Two approaches exist in 0.18:

| Approach | Format | File support | Status in 0.18 |
|----------|--------|-------------|-----------------|
| DynamicScene | RON (`.scn.ron`) | Full save/load | Mature, stable |
| BSN | Bevy Scene Notation | `bsn!` macro only | File loader deferred to future release |

**Required feature:** `bevy_scene` (not in Bevy's `default-features = false` subset — must be added explicitly).

## Saving a Scene

```rust
use bevy::scene::DynamicSceneBuilder;

fn save_scene(world: &World) {
    let mut builder = DynamicSceneBuilder::from_world(world);

    // Extract specific entities
    builder.extract_entities([entity_a, entity_b].into_iter());
    // Or extract all entities matching a filter
    builder.extract_resources();

    let scene = builder.build();

    // Serialize to RON string
    let type_registry = world.resource::<AppTypeRegistry>();
    let registry = type_registry.read();
    let serialized = scene
        .serialize(&registry)
        .expect("scene serialization failed");
    // Write `serialized` to a .scn.ron file
}
```

## Loading a Scene

```rust
fn load_scene(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Load and spawn as children of a root entity
    commands.spawn(DynamicSceneRoot(
        asset_server.load("scenes/my_level.scn.ron"),
    ));
}
```

`DynamicSceneRoot` spawns scene entities as **children** of the entity it's attached to. For world-root spawning, use `SceneSpawner` directly.

## SceneSpawner (manual control)

```rust
fn spawn_via_spawner(
    mut spawner: ResMut<SceneSpawner>,
    asset_server: Res<AssetServer>,
) {
    let handle: Handle<DynamicScene> = asset_server.load("scenes/level.scn.ron");
    let instance_id = spawner.spawn_dynamic(handle);
    // Store instance_id to track/despawn later
}
```

Query spawned instances with `SceneInstance` to find which entities belong to a scene.

## RON File Format

```ron
(
  resources: {},
  entities: {
    4294967297: (
      components: {
        "bevy_transform::components::transform::Transform": (
          translation: (1.0, 2.0, 3.0),
          rotation: (0.0, 0.0, 0.0, 1.0),
          scale: (1.0, 1.0, 1.0),
        ),
        "my_crate::Health": (
          current: 100.0,
          max: 100.0,
        ),
      },
    ),
  },
)
```

Component keys are **full type paths**. Entity IDs are serialized but remapped on load (you get new entity IDs).

## Reflect Requirements

Components must opt in to scene serialization:

```rust
#[derive(Component, Reflect)]
#[reflect(Component)]  // required — registers reflect-based spawn/insert
pub struct Health {
    pub current: f32,
    pub max: f32,
}

// Register in plugin:
app.register_type::<Health>();
```

Without `#[reflect(Component)]` and `register_type`, the component is invisible to the scene system.

Bevy's built-in components (`Transform`, `Visibility`, `Name`, etc.) already have this.

## BSN Macro (0.18)

The `bsn!` macro allows in-code scene construction with hierarchy syntax:

```rust
use bevy::scene::bsn;

let scene = bsn! {
    Mesh3d(cube_mesh),
    MeshMaterial3d(material),
    Transform::from_xyz(0.0, 1.0, 0.0),
    children: [
        { PointLight { intensity: 1000.0, ..default() } }
    ]
};
```

**Note:** `bsn!` is for programmatic scene building. The corresponding `.bsn` file format and asset loader are **not yet available** in 0.18 — they were deferred to a future release.

## Gotchas

- Entity IDs are **remapped** on load — don't store raw `Entity` values in components intended for serialization; use string names or custom identifiers instead
- `Handle<T>` fields in components do **not** serialize their asset data — only the asset path. The asset must be loadable via `AssetServer` at deserialization time
- `DynamicScene` captures a **snapshot** — later component changes aren't tracked
- Resources need explicit `extract_resources()` — they're not included by default
- Scenes loaded via `DynamicSceneRoot` spawn entities as **children**, which affects `GlobalTransform` computation
- The `bevy_scene` feature pulls in `bevy_asset` and `bevy_reflect` — both must be available
