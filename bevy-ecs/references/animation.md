# Animation (Bevy 0.18)

Graph-based animation system: `AnimationGraph` holds clip/blend nodes, `AnimationPlayer` drives playback,
`AnimationTransitions` handles crossfading. Procedural clips use `AnimatableCurve` + `animated_field!`.

**Registry examples:** `~/.cargo/registry/src/index.crates.io-*/bevy-0.18.*/examples/animation/`

## Animation Graph & Player

```rust
use bevy::animation::{animated_field, AnimatedBy, AnimationTargetId};
use bevy::prelude::*;

// Single clip graph
let (graph, node_index) = AnimationGraph::from_clip(clip_handle);

// Multiple clips (e.g. GLTF animations)
let (graph, node_indices) = AnimationGraph::from_clips([clip0, clip1, clip2]);
// node_indices: Vec<AnimationNodeIndex>

// Start playback
let mut player = AnimationPlayer::default();
player.play(node_index).repeat();

// Attach to entity
commands.spawn((
    AnimationGraphHandle(graphs.add(graph)),
    player,
    // ... other components
));
```

## AnimationClip & Curves (Procedural)

Build clips from code using `AnimatableCurve` and `animated_field!`:

```rust
let target_name = Name::new("MyEntity");
let target_id = AnimationTargetId::from_name(&target_name);

let mut clip = AnimationClip::default();

// Keyframe curve (uneven timing)
clip.add_curve_to_target(
    target_id,
    AnimatableCurve::new(
        animated_field!(Transform::translation),
        UnevenSampleAutoCurve::new(
            [0.0, 1.0, 2.0].into_iter().zip([
                Vec3::ZERO,
                Vec3::new(0.0, 2.0, 0.0),
                Vec3::ZERO,
            ])
        ).expect("valid samples"),
    ),
);

// Easing curve (smooth A→B transition)
clip.add_curve_to_target(
    target_id,
    AnimatableCurve::new(
        animated_field!(Transform::rotation),
        EasingCurve::new(
            Quat::IDENTITY,
            Quat::from_rotation_y(std::f32::consts::FRAC_PI_2),
            EaseFunction::CubicInOut,
        )
        .reparametrize_linear(interval(0.0, 2.0).unwrap())
        .unwrap()
        .ping_pong()  // auto-reverse
        .unwrap(),
    ),
);

// Multiple curves on same target are fine (translation + rotation + scale)
clip.add_curve_to_target(
    target_id,
    AnimatableCurve::new(
        animated_field!(Transform::scale),
        UnevenSampleAutoCurve::new(
            [0.0, 0.5, 1.0].into_iter().zip([
                Vec3::splat(1.0),
                Vec3::splat(1.5),
                Vec3::splat(1.0),
            ])
        ).unwrap(),
    ),
);

// Explicit duration (if longer than last keyframe)
clip.set_duration(3.0);
```

### Targeting Nested Entities

For entities in a hierarchy, build the target ID from the full path of `Name` components:

```rust
let parent = Name::new("robot");
let arm = Name::new("arm");
let hand = Name::new("hand");

// Targets the "hand" entity nested under robot → arm → hand
let hand_target = AnimationTargetId::from_names([parent, arm, hand].iter());
```

## Entity Setup for Animation

Every animated entity needs three things:

```rust
let entity = commands.spawn((
    target_name,          // Name component (matches AnimationTargetId)
    AnimationGraphHandle(graph_handle),
    player,
    // ... mesh, material, transform, etc.
)).id();

// REQUIRED: AnimationTargetId + AnimatedBy on every animated entity
commands.entity(entity).insert((
    animation_target_id,
    AnimatedBy(entity),   // points to the entity holding the AnimationPlayer
));

// For child entities in a hierarchy:
commands.entity(child).insert((
    child_target_id,
    AnimatedBy(root_entity),  // always points to the player-holding entity
));
```

## ActiveAnimation Control

`player.play()` returns `&mut ActiveAnimation` for fluent configuration:

```rust
// Fluent API on play
player.play(index)
    .set_speed(2.0)
    .set_repeat(RepeatAnimation::Count(3))
    .repeat();  // shorthand for RepeatAnimation::Forever

// Access a playing animation later
if let Some(active) = player.animation_mut(node_index) {
    active.pause();
    active.resume();
    active.replay();           // restart from beginning

    let t = active.seek_time();
    active.seek_to(t + 0.5);  // jump forward

    let spd = active.speed();
    active.set_speed(spd * 0.5);

    active.set_repeat(RepeatAnimation::Never);   // play once then stop
    active.set_repeat(RepeatAnimation::Count(2)); // play N times
    active.set_repeat(RepeatAnimation::Forever);  // loop indefinitely

    let paused = active.is_paused();
}
```

## AnimationTransitions (Crossfading)

Smooth blending between clips. **When using transitions, always start animations through
`AnimationTransitions`, not directly via `AnimationPlayer`.**

```rust
use std::time::Duration;

fn setup_scene_once_loaded(
    mut commands: Commands,
    animations: Res<MyAnimations>,
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
) {
    for (entity, mut player) in &mut players {
        let mut transitions = AnimationTransitions::new();

        // Start first animation (Duration::ZERO = no fade-in)
        transitions
            .play(&mut player, animations.idle, Duration::ZERO)
            .repeat();

        commands.entity(entity)
            .insert(AnimationGraphHandle(animations.graph.clone()))
            .insert(transitions);
    }
}

// Switch animation with crossfade
fn switch_animation(
    mut query: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    animations: Res<MyAnimations>,
) {
    for (mut player, mut transitions) in &mut query {
        transitions
            .play(&mut player, animations.run, Duration::from_millis(250))
            .repeat();
    }
}
```

## GLTF Animations

Load animation clips from `.glb`/`.gltf` files:

```rust
const MODEL: &str = "models/character.glb";

fn setup(asset_server: Res<AssetServer>, mut graphs: ResMut<Assets<AnimationGraph>>) {
    // Load specific animation clips by index
    let (graph, indices) = AnimationGraph::from_clips([
        asset_server.load(GltfAssetLabel::Animation(0).from_asset(MODEL)), // idle
        asset_server.load(GltfAssetLabel::Animation(1).from_asset(MODEL)), // walk
        asset_server.load(GltfAssetLabel::Animation(2).from_asset(MODEL)), // run
    ]);

    // Load the scene
    commands.spawn(SceneRoot(
        asset_server.load(GltfAssetLabel::Scene(0).from_asset(MODEL)),
    ));

    // Store graph + indices in a resource for later use
    // (the AnimationPlayer is auto-added when the scene loads)
}
```

**GLTF scenes auto-spawn `AnimationPlayer`** — detect with `Added<AnimationPlayer>` query
to attach the graph and start animations (see transitions example above).

## Animation Events

Custom events fired at specific timestamps in a clip, handled by observers:

```rust
use bevy::animation::AnimationEvent;

#[derive(AnimationEvent, Clone)]
struct FootstepEvent {
    volume: f32,
}

// Add events to a clip at specific times
let mut clip = AnimationClip::default();
clip.set_duration(1.0);
clip.add_event(0.25, FootstepEvent { volume: 0.8 });
clip.add_event(0.75, FootstepEvent { volume: 1.0 });

// Handle with observer (register on App)
app.add_observer(on_footstep);

fn on_footstep(event: On<FootstepEvent>) {
    println!("Footstep at volume {}", event.volume);
}
```

## Gotchas

- **`AnimatedBy` is required** on every entity that should be animated — without it, the animation
  system silently skips the entity
- **`AnimationTargetId` must match `Name` components** — use `from_name()` for root entities,
  `from_names()` for hierarchy paths. Mismatched names = no animation
- **Don't mix `AnimationTransitions` with direct `AnimationPlayer::play()`** — if using transitions,
  always go through `transitions.play(&mut player, ...)`, otherwise the transition system gets confused
- **Curves shorter than other curves in the same clip** won't repeat independently — use separate
  clips for different-duration animations
- **GLTF `AnimationPlayer` is auto-added** — query with `Added<AnimationPlayer>` to detect when
  the scene is ready, then attach the graph
- **`set_duration()`** — only needed if the clip should last longer than the last keyframe/event
