---
name: lua-love2d
description: Lua / LÖVE (Love2D) hex grids — Red Blob's CC0 reference implementation as the canonical starting point, plus Love2D drawing and input plumbing.
---

# Lua / LÖVE (Love2D)

Unlike the Rust and TypeScript ecosystems, **there is no actively
maintained idiomatic Lua hex grid library** in 2026. The honest answer
for Lua and LÖVE projects is:

1. Vendor [**Red Blob's CC0 reference Lua library**](https://www.redblobgames.com/grids/hexagons/codegen/output/lib.lua)
   — generated from the canonical guide, no rights reserved
2. Wire it to LÖVE's `love.graphics` for drawing and `love.mouse` for
   input
3. Crib from the older community libraries (HexaMoon, HEXAGÖN) only as
   historical reference — they're fine code, but unmaintained

This is actually a strength: hex grid math is small, the Red Blob lib
is ~470 lines covering everything in this skill, and you control the
whole stack.

## Red Blob's CC0 Lua reference (the canonical starting point)

```bash
curl -O https://www.redblobgames.com/grids/hexagons/codegen/output/lib.lua
```

License: **CC0 / Public Domain**. Drop it into your project as
`hex.lua` and `require('hex')`. Lua ≥ 5.3 works with native bitops; on
5.2 / luau use the `bit32` shim already included.

### Core types

The library is straight Lua tables — no OOP wrapper. Mutability is
your responsibility (most functions return new tables).

```lua
local hex = Hex(1, -2, 1)            -- cube; asserts q+r+s == 0
local pt = Point(120, 80)            -- {x, y}
local off = OffsetCoord(3, 5)        -- {col, row}
local d = DoubledCoord(6, 4)         -- {col, row}, col+row even
```

### Hex algebra

```lua
hex_add(a, b)                        -- a + b
hex_subtract(a, b)                   -- a - b
hex_scale(a, k)                      -- k * a
hex_rotate_left(a)                   -- 60° counter-clockwise
hex_rotate_right(a)                  -- 60° clockwise
hex_length(h)                        -- distance from origin
hex_distance(a, b)                   -- hex distance
```

### Neighbors

```lua
-- hex_directions[1..6] are the 6 axial unit vectors,
-- hex_diagonals[1..6] are the 6 diagonal vectors.
-- Direction is 0-indexed in arguments (added to 1 internally).
local d = hex_direction(0)            -- first direction
local n = hex_neighbor(hex, 0)        -- one step in direction 0
local diag = hex_diagonal_neighbor(hex, 2)
```

### Line drawing

```lua
local cells = hex_linedraw(a, b)     -- table of hexes from a to b inclusive
for _, h in ipairs(cells) do
  -- ...
end
```

Uses lerp + `hex_round` with the standard ε-nudge for vertex-aligned
lines.

### Rounding fractional hexes

```lua
local snapped = hex_round(Hex(2.4, -1.7, -0.7))
```

Does the cube_round dance to maintain `q + r + s = 0`.

### Offset and doubled conversions

```lua
EVEN = 1
ODD = -1

-- Offset (4 variants total):
qoffset_from_cube(ODD, h)            -- flat-top, oddq
qoffset_to_cube(ODD, off)
roffset_from_cube(ODD, h)            -- pointy-top, oddr
roffset_to_cube(ODD, off)

-- Doubled (2 variants):
qdoubled_from_cube(h)                -- flat-top
qdoubled_to_cube(d)
rdoubled_from_cube(h)                -- pointy-top
rdoubled_to_cube(d)
```

### Layout — pixel ↔ hex

`Layout` packages orientation + size + origin. The library ships two
predefined orientation matrices (you almost never construct
`Orientation` yourself):

```lua
local layout_pointy = Orientation(
  math.sqrt(3.0), math.sqrt(3.0) / 2.0, 0.0, 3.0 / 2.0,    -- forward
  math.sqrt(3.0) / 3.0, -1.0 / 3.0, 0.0, 2.0 / 3.0,        -- backward
  0.5                                                       -- start_angle
)
local layout_flat = Orientation(
  3.0 / 2.0, 0.0, math.sqrt(3.0) / 2.0, math.sqrt(3.0),
  2.0 / 3.0, 0.0, -1.0 / 3.0, math.sqrt(3.0) / 3.0,
  0.0
)

local layout = Layout(layout_pointy, Point(32, 32), Point(400, 300))

local pixel = hex_to_pixel(layout, hex)              -- center of the hex on screen
local frac  = pixel_to_hex_fractional(layout, pt)    -- fractional hex
local hex   = pixel_to_hex_rounded(layout, pt)       -- snapped hex

-- 6 vertices of a hex, in screen coords:
local corners = polygon_corners(layout, hex)         -- {Point, Point, ..., Point}
```

## LÖVE (Love2D) wiring

LÖVE's coordinate system is y-down (matches the formulas above) and
its renderer takes flat number lists for polygons. With Red Blob's lib
in place, the full Love2D loop is small:

```lua
local hex = require 'hex'

local layout
local grid = {}                       -- map from "q,r" → tile
local cell_size = 32

function love.load()
  layout = Layout(layout_pointy, Point(cell_size, cell_size), Point(400, 300))

  -- Hexagonal map of radius 5
  local R = 5
  for q = -R, R do
    for r = math.max(-R, -q-R), math.min(R, -q+R) do
      local h = Hex(q, r, -q-r)
      grid[q .. ',' .. r] = { hex = h, terrain = 'grass' }
    end
  end
end

function love.draw()
  for _, cell in pairs(grid) do
    local corners = polygon_corners(layout, cell.hex)
    local pts = {}
    for _, c in ipairs(corners) do
      pts[#pts + 1] = c.x
      pts[#pts + 1] = c.y
    end
    love.graphics.setColor(0.2, 0.6, 0.2)
    love.graphics.polygon('fill', pts)
    love.graphics.setColor(0, 0, 0)
    love.graphics.polygon('line', pts)
  end

  -- Highlight hex under cursor
  local mx, my = love.mouse.getPosition()
  local hovered = pixel_to_hex_rounded(layout, Point(mx, my))
  if grid[hovered.q .. ',' .. hovered.r] then
    local corners = polygon_corners(layout, hovered)
    local pts = {}
    for _, c in ipairs(corners) do
      pts[#pts + 1] = c.x
      pts[#pts + 1] = c.y
    end
    love.graphics.setColor(1, 1, 0, 0.5)
    love.graphics.polygon('fill', pts)
  end
end
```

### LÖVE-specific gotchas

- **Camera transforms**: when you `love.graphics.translate(cx, cy)` or
  `scale(z)` for a camera, the layout's `origin` is in **world** space,
  not screen space. Apply the inverse transform to mouse coords before
  calling `pixel_to_hex_rounded`:

  ```lua
  local mx, my = love.mouse.getPosition()
  local wx = (mx - love.graphics.getWidth() / 2) / camera.zoom + camera.x
  local wy = (my - love.graphics.getHeight() / 2) / camera.zoom + camera.y
  local hex = pixel_to_hex_rounded(layout, Point(wx, wy))
  ```

- **Storage keys**: Lua tables can't use Hex tables as keys directly
  (each table is its own identity). Use `q .. ',' .. r` strings, or
  encode as `q * MAX_R + r` integers if `q` and `r` are bounded.

- **Performance**: for grids over a few thousand hexes, rendering each
  hex with `love.graphics.polygon` is the bottleneck, not the hex
  math. Batch with a `SpriteBatch` of hex-shaped quads, or pre-render
  the static layer to a `Canvas`.

- **Pixel rounding**: LÖVE's defaults antialias polygon edges. For
  pixel-art hex tiles, set `love.graphics.setLineStyle('rough')` and
  draw integer-aligned coordinates.

## Algorithms NOT in Red Blob's lib

The CC0 lib stops at coordinates and conversions. For higher-level
algorithms, write them in Lua using the primitives — they're all small:

```lua
-- All hexes within distance N (range)
function hex_range(center, N)
  local results = {}
  for dq = -N, N do
    for dr = math.max(-N, -dq-N), math.min(N, -dq+N) do
      results[#results + 1] = hex_add(center, Hex(dq, dr, -dq-dr))
    end
  end
  return results
end

-- Ring at exactly distance N
function hex_ring(center, N)
  if N == 0 then return { center } end
  local results = {}
  local h = hex_add(center, hex_scale(hex_direction(4), N))
  for side = 0, 5 do
    for step = 1, N do
      results[#results + 1] = h
      h = hex_neighbor(h, side)
    end
  end
  return results
end

-- A* — use a heap library like lua-priority-queue, with hex_distance as heuristic
```

For pathfinding with LÖVE, [`jumper`](https://github.com/Yonaba/Jumper)
is a popular Lua library — but it assumes square grids. Either adapt
its core to hex neighbors, or write a small A* directly (~50 lines)
using a binary heap.

## Older community libraries (use as inspiration only)

| Library | Last pushed | Stars | Status |
|---|---|---|---|
| [**HexaMoon**](https://github.com/icrawler/HexaMoon) | Feb 2014 | 31 | Pure Lua, axial, pointy-top only. GPL-2.0. Unmaintained but functional. |
| [**HEXAGÖN**](https://github.com/olivier-grech/hexagon) | Jun 2019 | 19 | LÖVE-specific drawing helpers. Unmaintained. |
| [**hexpress/hexgrid.lua**](https://github.com/jmiskovic/hexpress/blob/master/hexgrid.lua) | Sep 2024 | 129 (parent app) | Single-file utility from a touchscreen music app. Cube coords, well-written, includes `spiralIter`. Repo is a synth, not a library. |

If you want a quick-look implementation of spiral iteration or
neighbor lookup beyond what Red Blob ships, hexpress's `hexgrid.lua`
is the most modern and idiomatic Lua of the three — but copy what you
need rather than depending on the upstream.

## Picking storage for a LÖVE game

| Map | Storage |
|---|---|
| Small fixed map (≤ ~100 hexes) | `grid["q,r"] = tile` |
| Bounded rectangular | 2D array indexed by offset coords |
| Bounded hexagonal | Flat array indexed by `(q + R) * stride + (r + R)` |
| Sparse / streaming | Hash by string key, evict on chunk unload |

Lua tables are fast for the first three; the string-key form has ~50ns
hash overhead per access, which is fine until you're iterating a
million hexes per frame.

## Where to look next

- [Red Blob — Hexagons Implementation Guide](https://www.redblobgames.com/grids/hexagons/implementation.html) — the page that generates the Lua lib (and 8 other languages)
- [Red Blob — Lua source](https://www.redblobgames.com/grids/hexagons/codegen/output/lib.lua)
- [LÖVE wiki — `love.graphics.polygon`](https://love2d.org/wiki/love.graphics.polygon)
- [awesome-love2d](https://github.com/love2d-community/awesome-love2d) — community library list (no current hex grid entry)
