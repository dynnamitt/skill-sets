---
name: honeycomb-ts
description: honeycomb-grid — TypeScript hex grid library. Hex factory, Grid class, traversers, directions. v4.1.5.
---

# honeycomb-grid (TypeScript / Node)

[honeycomb-grid](https://github.com/flauwekeul/honeycomb) is the
go-to TS/JS hex grid library. It separates **hex** (a single tile,
with coordinates and geometry) from **grid** (a collection of hexes
assembled from one or more **traversers**).

```bash
npm i honeycomb-grid
```

- Current version: **v4.1.5** (Nov 2023)
- TypeScript-native, runs in modern browsers and Node ≥ 16
- Internal coordinate system: axial (`q`, `r`); cube `s = -q - r` derived;
  conversions to offset and back are first-class

## Defaults

```typescript
const defaultHexSettings = {
  dimensions: { xRadius: 1, yRadius: 1 },
  orientation: Orientation.POINTY,
  origin: { x: 0, y: 0 },
  offset: -1,                 // -1 = odd rows/cols are offset; 1 = even
}
```

`offset: -1` corresponds to Red Blob's `oddr` (pointy) / `oddq` (flat).
Set `offset: 1` for `evenr` / `evenq`.

## Define a hex class

`defineHex(options)` is a factory returning a class configured for your grid:

```typescript
import { defineHex, Orientation } from 'honeycomb-grid'

const Tile = defineHex({
  dimensions: 30,                       // number, or { xRadius, yRadius }, or { width, height }
  orientation: Orientation.POINTY,      // or Orientation.FLAT
  origin: 'topLeft',                    // shorthand; or { x: 0, y: 0 }
  offset: -1,                           // 1 | -1
})

const t = new Tile({ q: 2, r: -1 })
console.log(t.x, t.y)                   // pixel center
```

`dimensions` accepts:
- a `number` — regular hex with that radius
- `{ xRadius, yRadius }` — non-uniform (stretched) hex
- `{ width, height }` — derive radii from a bounding box

Subclass to attach gameplay state:

```typescript
class GameTile extends defineHex({ dimensions: 30 }) {
  terrain: 'grass' | 'water' | 'mountain' = 'grass'
  unit: Unit | null = null
}
```

## Hex API

```typescript
const hex = new Tile({ q: 2, r: -1 })

// Coordinates
hex.q                          // axial (readonly)
hex.r                          // axial (readonly)
hex.s                          // cube, computed (-q - r)
hex.col                        // offset col
hex.row                        // offset row

// Geometry
hex.x                          // pixel center x
hex.y                          // pixel center y
hex.width                      // bounding-box width
hex.height                     // bounding-box height
hex.corners                    // Point[] of 6 vertices, relative to Hex(0,0)

// Settings (read from class prototype)
hex.dimensions                 // { xRadius, yRadius }
hex.orientation                // Orientation
hex.origin                     // Point
hex.offset                     // 1 | -1
hex.isPointy                   // boolean
hex.isFlat                     // boolean

// Methods
hex.clone(coords?)             // new instance, optionally at different coords
hex.equals(coords)             // hex equality, accepts any HexCoordinates form
hex.translate(delta)           // new hex shifted by partial-cube delta
hex.toString()                 // e.g. "Tile(2,-1)"
```

⚠️ **`hex.center` is deprecated** — use `hex.x` and `hex.y` instead. The
deprecated property doesn't return what most people expect (it ignores
`origin`).

## Build a grid

A `Grid` is a hex class plus an optional **traverser** (or list of traversers).

```typescript
import { Grid, rectangle, spiral } from 'honeycomb-grid'

// From a single traverser
const grid = new Grid(Tile, rectangle({ width: 10, height: 10 }))

// Multiple traversers run in sequence (concatenated)
const grid = new Grid(Tile, [
  rectangle({ width: 5, height: 5 }),
  spiral({ start: [10, 0], radius: 3 }),
])

// From an iterable of hexes / coordinates
const grid = new Grid(Tile, [{ q: 0, r: 0 }, { q: 1, r: 0 }])

// Copy an existing grid
const copy = new Grid(grid)

// From an iterable (infers hex class)
const grid = Grid.fromIterable(hexes)

// From serialized JSON
const grid = Grid.fromJSON(json)
```

### Properties

```typescript
grid.size                      // number of hexes
grid.pixelWidth                // bounding-box pixel width
grid.pixelHeight               // bounding-box pixel height
grid.hexPrototype              // the hex class prototype
```

### Iteration & functional methods

```typescript
for (const hex of grid) { /* ... */ }
grid.forEach(hex => render(hex))
grid.filter(hex => hex.terrain !== 'water')   // returns new Grid
grid.map(hex => hex.clone())                  // returns new Grid
grid.reduce((acc, hex) => acc + hex.cost, 0)
grid.toArray()
grid.toJSON()                                 // { hexSettings, coordinates }
```

### Lookup, distance, neighbors

```typescript
import { Direction } from 'honeycomb-grid'

grid.getHex({ q: 2, r: -1 })                  // Tile | undefined
grid.hasHex(someHex)                          // boolean
grid.distance(from, to)                       // number
grid.neighborOf(hex, Direction.NE)            // Tile (creates if outside)
grid.neighborOf(hex, Direction.NE, { allowOutside: false })  // Tile | undefined
grid.pointToHex({ x: 120, y: 80 })            // Tile (creates if outside)
grid.pointToHex(pt, { allowOutside: false })  // Tile | undefined
```

The `allowOutside` flag (default `true`) decides whether queries return a
freshly-constructed hex when the result isn't in the grid, or `undefined`.

### `traverse()` — extend or filter via traversers

```typescript
// Extend grid with hexes from another traverser, keeping only those already in the grid
const visible = grid.traverse(spiral({ start: player.coords, radius: 5 }))

// Bail out as soon as a traverser yields a hex outside the grid
const path = grid.traverse(line({ start, stop }), { bail: true })
```

`traverse()` always returns a **new** Grid — Grids are immutable in that
sense.

## Direction enum

```typescript
enum Direction { N, NE, E, SE, S, SW, W, NW }
```

8 values cover both orientations. The library picks the right 6 based on
the hex's orientation:

| Orientation | Valid neighbor directions |
|---|---|
| `POINTY` | `NE`, `E`, `SE`, `SW`, `W`, `NW` |
| `FLAT` | `N`, `NE`, `SE`, `S`, `SW`, `NW` |

Calling `neighborOf` with `Direction.N` on a pointy hex (or `Direction.E`
on a flat hex) is a developer error — there is no neighbor in that
direction.

## Traversers

A traverser is a function `(createHex, cursor?) => Iterable<Hex>`. They
compose: pass an array to `new Grid(Cls, [...])` or `grid.traverse([...])`
and the cursor of the previous traverser becomes the start of the next.

| Traverser | Signature | Yields |
|---|---|---|
| `rectangle({ width, height, start?, direction? })` | also `rectangle(cornerA, cornerB)` | `width × height` rectangle, only 90° corners for N/E/S/W directions |
| `spiral({ radius, start?, rotation? })` | — | Center + concentric rings out to `radius` (use this for **hexagonal** grids) |
| `ring({ center, radius, rotation? })` | also `{ center, start?, rotation? }` | Hexes at exactly `radius` from `center` |
| `line({ start?, direction, length })` | also `{ start?, stop }` | Hex line, by vector or between two points |
| `move(direction)` | — | A single step from the cursor |
| `fromCoordinates(...coords)` | — | An explicit list |
| `concat(traversers[])` | — | Run several in sequence |
| `repeat(n, traverser)` | — | Repeat a traverser `n` times |
| `repeatWith(traverser, ...wrappers)` | — | Repeat with mutation between iterations |

⚠️ There is **no** `hexagon` traverser despite older docs hinting at one
— use `spiral({ radius })` for hexagonal-shaped grids.

```typescript
// Hexagonal grid of radius 5 centered at origin
const grid = new Grid(Tile, spiral({ radius: 5 }))

// Rectangle from corner to corner (offset coords)
const grid = new Grid(Tile, rectangle({ col: 0, row: 0 }, { col: 9, row: 9 }))

// A line from A to B (uses lerp + cube_round internally)
const path = new Grid(Tile, line({ start: a, stop: b }))

// Compose: rectangle, then spiral, then a line
const grid = new Grid(Tile, [
  rectangle({ width: 10, height: 10 }),
  spiral({ start: [12, 0], radius: 3 }),
  line({ direction: Direction.E, length: 5 }),
])
```

## Free coordinate functions

For one-off conversions without instantiating hexes:

```typescript
import {
  toCube, completeCube, hexToOffset, hexToPoint,
  offsetToCube, pointToCube, round, translate, equals,
} from 'honeycomb-grid'

const cube = toCube(prototype, { col: 3, row: 2 })
const offset = hexToOffset({ q: 2, r: -1, isPointy: true, offset: -1 })
const pixel = hexToPoint(prototype, { q: 2, r: -1 })
const snapped = round({ q: 2.4, r: -1.7, s: -0.7 })
const moved = translate({ q: 0, r: 0 }, { q: 1, r: -1 })
```

Plus utility predicates `isAxial`, `isOffset`, `isPoint`, `isTuple`, and
`tupleToCube`, `offsetFromZero`.

## What honeycomb-grid does NOT ship

The library is intentionally focused on coordinates, geometry, and
traversal. It does **not** include:

- A* / Dijkstra pathfinding
- Field of view / line of sight
- Mesh generation (use three.js or pixi.js with `hex.corners`)
- Wraparound maps
- Multi-resolution / chunking

For pathfinding, pair with a graph library and feed it the hex grid:

```typescript
import { Grid, spiral, Direction } from 'honeycomb-grid'

function neighbors(grid, hex) {
  // 6 directions; library returns undefined when allowOutside:false
  return [Direction.NE, Direction.E, Direction.SE, Direction.SW, Direction.W, Direction.NW]
    .map(dir => grid.neighborOf(hex, dir, { allowOutside: false }))
    .filter((n): n is typeof hex => n !== undefined && !n.blocked)
}

function heuristic(grid, a, b) {
  return grid.distance(a, b)
}
```

For FOV, port a hex shadowcasting algorithm (Bob Nystrom's
[hex variant](http://journal.stuffwithstuff.com/2015/09/07/what-the-hero-sees/))
or fall back to ray-cast-per-ring using the `line` traverser.

## v3 → v4 migration

v4 is a near-total rewrite. v3 code does **not** drop in. Highlights:

- `extendHex` → `defineHex`
- Hex instances are immutable — methods like `clone` and `translate`
  return new hexes; mutate via `Grid.map`/`filter`
- Traversers are first-class composable functions, not methods on Grid
- Internal coordinate system shifted to axial-first
- `Grid` constructor accepts traverser arrays directly; no chained
  `.traverse()` setup required
- `Direction` enum has 8 values (compass) — was orientation-specific in v3

There's no v3 → v4 shim; plan a migration if you're upgrading.

## Where to look next

- [Source](https://github.com/flauwekeul/honeycomb)
- [Site](https://abbekeultjes.nl/honeycomb)
- [npm](https://www.npmjs.com/package/honeycomb-grid)
