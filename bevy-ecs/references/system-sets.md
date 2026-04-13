---
name: System Sets & Scheduling
description: Bevy 0.18 SystemSet grouping, FixedUpdate schedule, configure_sets, run conditions, per-schedule configuration.
---

# System Sets & Scheduling (0.18)

## Defining System Sets

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum GameSet {
    Input,
    Physics,
    Rendering,
}
```

## Configuring Sets

```rust
app.configure_sets(
    Update,
    (GameSet::Input, GameSet::Physics, GameSet::Rendering).chain(),
)
.add_systems(Update, (
    handle_keyboard.in_set(GameSet::Input),
    handle_mouse.in_set(GameSet::Input),
    apply_gravity.in_set(GameSet::Physics),
    move_entities.in_set(GameSet::Physics),
    update_sprites.in_set(GameSet::Rendering),
));
```

### Run Conditions on Sets

Apply a run condition once to a set instead of repeating it on every system:

```rust
app.configure_sets(
    Update,
    GameSet::Physics.run_if(in_state(GameState::Playing)),
);
```

### Ordering Without Sets

For simple cases, direct ordering is fine:

```rust
app.add_systems(Update, (
    read_input,
    apply_movement.after(read_input),
    update_camera.after(apply_movement),
));

// Or chain them:
app.add_systems(Update, (read_input, apply_movement, update_camera).chain());
```

## FixedUpdate Schedule

Runs at a fixed timestep (default 64 Hz) — use for physics and deterministic gameplay:

```rust
app.add_systems(FixedUpdate, (
    apply_velocity,
    detect_collisions,
    resolve_collisions,
).chain());

// In FixedUpdate systems, use Time<Fixed>:
fn apply_velocity(mut query: Query<(&Velocity, &mut Transform)>, time: Res<Time<Fixed>>) {
    for (vel, mut transform) in &mut query {
        transform.translation += vel.0 * time.delta_secs();
    }
}
```

**Gotcha:** Set configuration does NOT carry across schedules. You must configure sets separately for each schedule:

```rust
// These are independent — configuring for Update does NOT affect FixedUpdate
app.configure_sets(Update, GameSet::Physics.run_if(in_state(GameState::Playing)));
app.configure_sets(FixedUpdate, GameSet::Physics.run_if(in_state(GameState::Playing)));
```

## Nested Sets

Sets can contain other sets for hierarchical organization:

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum CombatSet {
    DamageCalc,
    DeathCheck,
    Cleanup,
}

app.configure_sets(Update, (
    CombatSet::DamageCalc,
    CombatSet::DeathCheck,
    CombatSet::Cleanup,
).chain().in_set(GameSet::Physics));
```
