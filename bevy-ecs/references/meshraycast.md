---
name: MeshRayCast Gotchas
description: Bevy 0.18 MeshRayCast silent-failure modes — backface culling and MAIN_WORLD asset usage.
---

# MeshRayCast Gotchas (0.18)

`MeshRayCast` has two silent-failure modes that cause raycasts to miss entities:

**1. Backface culling (default on):** The Möller–Trumbore implementation rejects triangles where the ray hits the back face. This is independent of the material's `cull_mode` — rendering and raycasting have separate backface logic. Add the `RayCastBackfaces` marker component to entities that need hits from both sides:

```rust
use bevy::picking::mesh_picking::ray_cast::RayCastBackfaces;

commands.spawn((
    MyMesh,
    RayCastBackfaces,  // disable backface culling for raycasts
    Mesh3d(mesh_handle),
    MeshMaterial3d(material),
    Transform::default(),
));
```

Common case: procedural meshes with normals that can point away from the ray direction (e.g. gap/bridge geometry between hex tiles where vertex heights vary).

**2. Missing MAIN_WORLD asset usage:** Meshes must retain CPU vertex data via `RenderAssetUsages::MAIN_WORLD`. Without it, mesh data is extracted to GPU only and `MeshRayCast` silently returns no hits:

```rust
Mesh::new(
    PrimitiveTopology::TriangleList,
    RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
)
```

`MeshRayCastSettings` has NO backface option — it's per-entity only via the `RayCastBackfaces` component. `RayCastVisibility::Any` only controls visibility checks, not backface culling.
