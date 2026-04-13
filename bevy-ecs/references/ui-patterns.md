---
name: Bevy UI Patterns
description: Bevy flexbox-like UI development — marker component pattern, setup/update cycle, Node styling.
---

# UI Development in Bevy

Bevy uses a flexbox-like layout system. Follow the marker component pattern:

**1. Create marker components:**

```rust
#[derive(Component)]
pub struct HealthBar;

#[derive(Component)]
pub struct ScoreDisplay;
```

**2. Setup in Startup:**

```rust
pub fn setup_ui(mut commands: Commands) {
    commands.spawn((
        HealthBar,
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(10.0),
            top: Val::Px(10.0),
            width: Val::Px(200.0),
            height: Val::Px(20.0),
            ..default()
        },
        BackgroundColor(Color::srgba(0.8, 0.2, 0.2, 0.9)),
    ));
}
```

**3. Update in Update:**

```rust
pub fn update_health_ui(
    health: Query<&Health, With<Player>>,
    mut ui: Query<&mut Node, With<HealthBar>>,
) {
    if let (Ok(health), Ok(mut node)) = (health.get_single(), ui.get_single_mut()) {
        node.width = Val::Px(health.percentage() * 200.0);
    }
}
```
