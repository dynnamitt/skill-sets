---
name: Idiomatic Option/Result Transforms
description: Rust Option/Result combinator patterns for Bevy systems — ? propagation, .and_then() flattening, transform table.
---

# Idiomatic Option/Result Transforms in Systems

Bevy systems constantly return `Option` and `Result` from queries, resource lookups,
and entity access. Prefer combinators and `?` over nested `match`/`if let` trees.
([Effective Rust — Item 5](https://www.lurklurk.org/effective-rust/transform.html))

**Use `?` propagation for guard-heavy helpers:**

```rust
// Return Option<()> and use ? for early exits
fn process_hex(grid: &HexGrid, hex: Hex, entities: &HexEntities) -> Option<()> {
    let &entity = entities.get(&hex)?;        // replaces if-let + return
    let disc = grid.get(entity).ok()?;        // Result → Option via .ok()
    disc.is_active().then_some(())?;           // bool guard
    // ... side effects only if all guards pass
    Some(())
}
```

**Flatten nested `if let` with `.and_then()`:**

```rust
// BAD: pyramid of doom
if let Some(res) = opt_res.as_ref() {
    if let Some(&entity) = res.map.get(&hex) {
        if let Ok(name) = query.get(entity) {
            println!("{name}");
        }
    }
}

// GOOD: chained combinators
if let Some(name) = opt_res.as_ref()
    .and_then(|r| r.map.get(&hex))
    .and_then(|&e| query.get(e).ok())
{
    println!("{name}");
}
```

**Common transforms in Bevy code:**

| Have | Want | Use |
|------|------|-----|
| `Option<T>` | `Result<T, E>` | `.ok_or(err)` / `.ok_or_else(\|\| err)` |
| `Result<T, E>` | `Option<T>` | `.ok()` |
| `&Option<T>` | `Option<&T>` | `.as_ref()` |
| `Option<T>` | `T` (or default) | `.unwrap_or(default)` / `.unwrap_or_default()` |
| `Option<T>` | `Option<U>` | `.map(\|t\| ...)` / `.and_then(\|t\| ...)` |
| `bool` guard | `Option<()>` | `.then_some(())` for use with `?` |

**Performance:** These combinators are `#[inline]` generics — they compile to identical
machine code as hand-written `match` expressions, with zero runtime cost.
