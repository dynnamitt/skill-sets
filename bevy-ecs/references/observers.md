---
name: Observers & Lifecycle Hooks
description: Bevy 0.18 observer pattern — Trigger-based reactive logic, OnAdd/OnInsert/OnRemove hooks, custom events, entity-targeted observers.
---

# Observers & Lifecycle Hooks (0.18)

## Observer Pattern

Observers are one-shot reactive handlers that fire in response to triggers — unlike systems, they don't run every frame.

### Global Observers

Respond to any entity matching the trigger:

```rust
app.add_observer(on_enemy_spawned);

fn on_enemy_spawned(trigger: Trigger<OnAdd, Enemy>, mut commands: Commands) {
    let entity = trigger.target();
    commands.entity(entity).insert(HealthBar::default());
}
```

### Entity-Targeted Observers

Scoped to a specific entity:

```rust
commands.spawn(Enemy::new()).observe(|trigger: Trigger<OnRemove, Health>| {
    info!("Entity {:?} lost its Health component", trigger.target());
});
```

## Built-in Triggers

| Trigger | Fires when |
|---|---|
| `OnAdd` | Component added for the first time |
| `OnInsert` | Component inserted (including overwrites) |
| `OnRemove` | Component about to be removed |
| `OnReplace` | Component about to be replaced (before `OnInsert`) |

`OnAdd` fires only on first insertion. `OnInsert` fires on every insertion including the first — so `OnAdd` + `OnInsert` both fire on initial add.

## Custom Triggers

Define custom events and trigger them explicitly:

```rust
#[derive(Event)]
struct Damage {
    amount: f32,
}

// Fire at a specific entity
commands.trigger_targets(Damage { amount: 25.0 }, target_entity);

// Fire globally (no target)
commands.trigger(Damage { amount: 10.0 });

// Handle it
app.add_observer(on_damage);

fn on_damage(
    trigger: Trigger<Damage>,
    mut query: Query<&mut Health>,
) {
    if let Ok(mut health) = query.get_mut(trigger.target()) {
        health.current -= trigger.event().amount;
    }
}
```

## Execution Order

- **On add**: Hooks fire first, then observers
- **On remove**: Observers fire first, then hooks

Hooks are lower-level (registered on the component type itself via `component_hooks()`); observers are the higher-level API you'll use in most cases.

## When to Use What

| Pattern | Use when |
|---|---|
| **Observer** | One-shot reaction to a specific event (spawn setup, death handling, damage) |
| **System** | Continuous per-frame logic (movement, AI, rendering updates) |
| **Events** (`MessageReader`) | Broadcasting data that multiple systems need to process independently |

Rule of thumb: if you'd write a system with `Added<T>` or `RemovedComponents<T>` queries, an observer on `OnAdd`/`OnRemove` is usually cleaner.
