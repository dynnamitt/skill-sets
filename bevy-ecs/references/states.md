---
name: States & State Management
description: Bevy 0.18 state management — SubStates, ComputedStates, state-scoped entities, transition schedules, run conditions.
---

# States & State Management (0.18)

## Basic States

```rust
#[derive(States, Debug, Clone, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Loading,
    Menu,
    Playing,
    Paused,
}

// In plugin:
app.init_state::<GameState>()
    .add_systems(OnEnter(GameState::Playing), setup_game)
    .add_systems(OnExit(GameState::Playing), cleanup_game)
    .add_systems(Update, gameplay.run_if(in_state(GameState::Playing)));

// Transition:
fn start_game(mut next: ResMut<NextState<GameState>>) {
    next.set(GameState::Playing);
}
```

## SubStates

Hierarchical states that only exist when a parent state is active:

```rust
#[derive(SubStates, Debug, Clone, PartialEq, Eq, Hash, Default)]
#[source(GameState = GameState::Playing)]  // only exists during Playing
enum PlayingState {
    #[default]
    Exploring,
    Combat,
    Dialogue,
}

app.add_sub_state::<PlayingState>()
    .add_systems(OnEnter(PlayingState::Combat), enter_combat)
    .add_systems(Update, combat_logic.run_if(in_state(PlayingState::Combat)));
```

When `GameState` leaves `Playing`, `PlayingState` is automatically removed. Transitioning back to `Playing` resets it to `Default`.

## ComputedStates

Derived states computed from one or more source states — useful for cross-cutting concerns:

```rust
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
enum InGame {
    Active,
}

impl ComputedStates for InGame {
    type SourceStates = GameState;

    fn compute(source: GameState) -> Option<Self> {
        match source {
            GameState::Playing | GameState::Paused => Some(InGame::Active),
            _ => None,
        }
    }
}

app.add_computed_state::<InGame>()
    .add_systems(OnEnter(InGame::Active), setup_hud)
    .add_systems(OnExit(InGame::Active), teardown_hud);
```

`ComputedStates` can derive from tuples of multiple states: `type SourceStates = (GameState, NetworkState);`

## State-Scoped Entities

Entities auto-despawned when a state exits — no manual cleanup systems needed:

```rust
commands.spawn((
    EnemyBundle::new(),
    StateScoped(GameState::Playing),  // despawned when leaving Playing
));
```

Works with `States`, `SubStates`, and `ComputedStates`.

## Transition Schedules

Beyond `OnEnter`/`OnExit`, you can target specific transitions:

```rust
app.add_systems(
    OnTransition::<GameState>::from(GameState::Menu).to(GameState::Playing),
    start_new_game,
);
```

## Run Conditions

```rust
// State-based
.run_if(in_state(GameState::Playing))
.run_if(not(in_state(GameState::Paused)))

// Resource-based
.run_if(resource_exists::<MyResource>)
.run_if(resource_changed::<Score>)

// Custom closure
.run_if(|time: Res<Time>| time.elapsed_secs() > 5.0)

// Combined
.run_if(in_state(GameState::Playing).and(resource_changed::<Score>))
```
