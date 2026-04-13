---
name: Bevy Entity Relationships
description: Bevy 0.18 entity relationship system — defining custom relationships, ChildOf/Children hierarchy, spawning, managing, and traversing relationship graphs.
---

# Bevy ECS Relationships (0.18)

Entity relationships link a **source** entity to a **target** entity via specialized components.
The system is bidirectional and hook-maintained: inserting a `Relationship` component on the
source automatically populates the `RelationshipTarget` on the target.

## Defining Custom Relationships

Derive both sides. The source struct holds one `Entity` field; the target holds a `Vec<Entity>`.

```rust
#[derive(Component)]
#[relationship(relationship_target = Followers)]
struct FollowedBy(Entity);

#[derive(Component)]
#[relationship_target(relationship = FollowedBy)]
struct Followers(Vec<Entity>);
```

Named structs: annotate the entity field with `#[relationship]`; extra fields must impl `Default`.

Add `linked_spawn` on the target to cascade despawn/clone:

```rust
#[derive(Component)]
#[relationship_target(relationship = OwnedBy, linked_spawn)]
struct Inventory(Vec<Entity>);
```

## Built-in Hierarchy: ChildOf / Children

```rust
// ChildOf(Entity) — Relationship, Children(Vec<Entity>) — RelationshipTarget (linked_spawn)
let parent = commands.spawn(Transform::default()).id();
let child = commands.spawn((Transform::default(), ChildOf(parent))).id();
```

Despawning parent cascades to all descendants.

## Spawning Patterns

```rust
// Single child
commands.spawn(SomeBundle { .. }).with_child(OtherBundle { .. });

// Multiple children
commands.spawn(SomeBundle { .. }).with_children(|spawner| {
    spawner.spawn(ChildA);
    spawner.spawn(ChildB);
});

// Generic relationship
commands.spawn(Target).with_related::<FollowedBy>(SourceBundle { .. });
commands.spawn(Target).with_related_entities::<FollowedBy>(|s| {
    s.spawn(SourceA);
    s.spawn(SourceB);
});
```

## Managing Existing Entities

```rust
// Hierarchy
commands.entity(parent).add_child(child);
commands.entity(parent).add_children(&[c1, c2]);
commands.entity(parent).detach_child(child);       // unlink, no despawn
commands.entity(parent).despawn_children();         // despawn all children

// Generic
commands.entity(target).add_one_related::<R>(source);
commands.entity(target).remove_related::<R>(&[source]);
commands.entity(target).detach_all_related::<R>();
```

## Traversal

```rust
fn walk_ancestors(q: Query<&ChildOf>, entity: Entity) {
    for ancestor in AncestorIter::new(&q, entity) { /* ... */ }
}

fn walk_descendants(q: Query<&Children>, root: Entity) {
    // Breadth-first
    for desc in DescendantIter::new(&q, root) { /* ... */ }
    // Depth-first
    for desc in DescendantDepthFirstIter::new(&q, root) { /* ... */ }
}
```

## Full API Reference

See [relationships-api.md](relationships-api.md) for complete trait signatures, all EntityCommands
methods, spawner types, and derive macro rules.
