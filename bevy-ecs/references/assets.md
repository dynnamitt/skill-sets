---
name: Asset Loading
description: Bevy 0.18 asset loading — Handle lifecycle, loading states, AssetEvent, custom asset types, loading screen pattern.
---

# Asset Loading (0.18)

## Loading Assets

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    let texture: Handle<Image> = asset_server.load("textures/player.png");
    let scene: Handle<Scene> = asset_server.load("models/enemy.glb#Scene0");

    commands.spawn((
        Mesh3d(asset_server.load("models/player.glb#Mesh0")),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color_texture: Some(texture.clone()),
            ..default()
        })),
    ));
}
```

`load()` is non-blocking and deduplicating — calling it twice with the same path returns the same handle.

## Handle States

Check loading progress via `AssetServer`:

```rust
fn check_loading(server: Res<AssetServer>, handle: Res<MyHandle>) {
    match server.load_state(&handle.0) {
        LoadState::Loading => { /* still loading */ }
        LoadState::Loaded => { /* ready to use */ }
        LoadState::Failed(err) => { error!("Failed: {err}"); }
        _ => {}
    }
}
```

For checking an asset with all its dependencies: `server.is_loaded_with_dependencies(&handle)`.

## AssetEvent

React to asset lifecycle changes:

```rust
fn handle_asset_events(mut events: MessageReader<AssetEvent<Image>>) {
    for event in events.read() {
        match event {
            AssetEvent::Added { id } => info!("Image {id:?} loaded"),
            AssetEvent::Modified { id } => info!("Image {id:?} modified"),
            AssetEvent::Removed { id } => info!("Image {id:?} removed"),
            AssetEvent::Unused { id } => info!("Image {id:?} no longer referenced"),
            _ => {}
        }
    }
}
```

## Loading Screen Pattern

Track multiple handles, transition state when all loaded:

```rust
#[derive(Resource)]
struct LoadingAssets(Vec<UntypedHandle>);

fn start_loading(mut commands: Commands, server: Res<AssetServer>) {
    let handles = vec![
        server.load::<Image>("textures/atlas.png").untyped(),
        server.load::<Scene>("models/level.glb").untyped(),
        server.load::<AudioSource>("audio/music.ogg").untyped(),
    ];
    commands.insert_resource(LoadingAssets(handles));
}

fn check_all_loaded(
    server: Res<AssetServer>,
    loading: Res<LoadingAssets>,
    mut next_state: ResMut<NextState<GameState>>,
) {
    let all_loaded = loading.0.iter().all(|h| server.is_loaded_with_dependencies(h.id()));
    if all_loaded {
        next_state.set(GameState::Playing);
    }
}
```

## Custom Asset Types

```rust
#[derive(Asset, TypePath)]
struct LevelData {
    name: String,
    spawn_points: Vec<Vec3>,
}

#[derive(Default)]
struct LevelLoader;

impl AssetLoader for LevelLoader {
    type Asset = LevelData;
    type Settings = ();
    type Error = std::io::Error;

    async fn load(
        &self,
        reader: &mut dyn AssetReader,
        _settings: &(),
        _load_context: &mut LoadContext<'_>,
    ) -> Result<LevelData, Self::Error> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        // parse bytes into LevelData...
        Ok(LevelData { name: "test".into(), spawn_points: vec![] })
    }

    fn extensions(&self) -> &[&str] {
        &["level"]
    }
}

// Register in plugin:
app.init_asset::<LevelData>()
    .init_asset_loader::<LevelLoader>();
```

## Gotchas

- `Handle::default()` is a valid but empty handle — don't confuse with an unloaded asset
- Dropping all `Handle<T>` clones for an asset makes it eligible for unloading (reference-counted)
- Assets loaded from files are cached by path — mutating a loaded asset does NOT write back to disk
