---
name: Bevy Relationships API Reference
description: Complete trait signatures, EntityCommands methods, spawner types, and derive rules for Bevy 0.18 relationships.
---

# Bevy Relationships API Reference (0.18)

## Traits

### `Relationship` (derive macro available)

Marks a component on a "source" entity referencing a single target entity.

**Associated type:** `RelationshipTarget`

**Required methods:**
- `get(&self) -> Entity` — target entity
- `from(entity: Entity) -> Self` — construct from entity
- `set_risky(&mut self, entity: Entity)` — change target (internal use)

**Auto-maintained hooks:** `on_insert()`, `on_replace()` — keep bidirectional link consistent.

### `RelationshipTarget` (derive macro available)

Component on a "target" entity holding all sources that relate to it.

**Associated types:**
- `Relationship` — the paired relationship type
- `Collection` — a `RelationshipSourceCollection` (usually `Vec<Entity>`)

**Associated constant:** `LINKED_SPAWN: bool` — cascade despawn/clone when `true`

**Methods:** `iter()`, `len()`, `is_empty()`, `collection()`, `with_capacity(usize)`

**Hooks:** `on_replace()`, `on_despawn()` (cascade when `LINKED_SPAWN`)

### Derive Macro Rules

Both derive on structs with:
- Single unnamed field: `struct Foo(Entity)`
- Single named field: `struct Foo { target: Entity }`
- Named struct with `#[relationship]` annotation on entity field; extra fields must impl `Default`

```rust
#[derive(Component)]
#[relationship(relationship_target = Children)]
pub struct ChildOf {
    #[relationship]
    pub parent: Entity,
    internal: u8, // must impl Default
}

#[derive(Component)]
#[relationship_target(relationship = ChildOf, linked_spawn)]
pub struct Children(Vec<Entity>);
```

## Built-in: ChildOf / Children

```rust
pub struct ChildOf(pub Entity);   // Relationship
pub struct Children(Vec<Entity>); // RelationshipTarget, LINKED_SPAWN = true
```

`ChildOf` method: `parent() -> Entity`

## EntityCommands — Child Methods

| Method | Description |
|--------|-------------|
| `with_child(bundle)` | Spawn one child |
| `with_children(\|spawner\| { .. })` | Spawn multiple via `ChildSpawnerCommands` |
| `add_child(entity)` | Reparent existing entity |
| `add_children(&[Entity])` | Reparent multiple |
| `insert_child(index, entity)` | Insert at index |
| `insert_children(index, &[Entity])` | Insert multiple at index |
| `detach_child(entity)` | Unlink (no despawn) |
| `detach_children(&[Entity])` | Unlink multiple |
| `detach_all_children()` | Unlink all |
| `despawn_children()` | Despawn all children |
| `replace_children(&[Entity])` | Replace all children |

## EntityCommands — Generic Relationship Methods

All take a type parameter `R: Relationship` or `S: RelationshipTarget`.

| Method | Description |
|--------|-------------|
| `with_related::<R>(bundle)` | Spawn one related entity |
| `with_related_entities::<R>(\|s\| { .. })` | Spawn multiple via `RelatedSpawnerCommands` |
| `add_one_related::<R>(entity)` | Relate existing entity |
| `add_related::<R>(&[Entity])` | Relate multiple |
| `insert_related::<R>(index, entity)` | Insert at index (ordered) |
| `remove_related::<R>(&[Entity])` | Remove relationships |
| `detach_all_related::<R>()` | Remove all of type R |
| `replace_related::<R>(&[Entity])` | Replace all |
| `despawn_related::<S>()` | Despawn via target type S |

## Spawners

### `RelatedSpawner<'w, R>` — direct World access

```rust
let mut spawner = RelatedSpawner::new(&mut world, target_entity);
spawner.spawn(SomeBundle { .. }); // returns EntityWorldMut
spawner.spawn_empty();
```

### `RelatedSpawnerCommands<'w, R>` — deferred via Commands

Used inside `with_related_entities` closures. Returns `EntityCommands`.

**Type aliases:**
- `ChildSpawner` = `RelatedSpawner<ChildOf>`
- `ChildSpawnerCommands` = `RelatedSpawnerCommands<ChildOf>`

## Traversal Iterators

All yield `Entity`.

### `AncestorIter` — walk up any relationship chain

```rust
fn system(q: Query<&ChildOf>) {
    for ancestor in AncestorIter::new(&q, entity) { .. }
}
```

### `DescendantIter` — breadth-first traversal

```rust
fn system(q: Query<&Children>) {
    for desc in DescendantIter::new(&q, root) { .. }
}
```

### `DescendantDepthFirstIter` — depth-first traversal

Same API as `DescendantIter`, different traversal order.
