---
name: geometry
description: Hex orientation, sizing, layout struct, and pixel↔hex conversion math.
---

# Geometry & Layout

The `(q, r)` coordinate system is screen-orientation-independent. Mapping
hexes to and from pixel space requires three additional pieces — wrapped
in what most libraries call a **layout** or **HexLayout**:

```
Layout = (orientation, size, origin)
```

- **orientation**: pointy-top or flat-top
- **size**: distance from hex center to a vertex (also called "radius" or "circumradius")
- **origin**: pixel position of `(q=0, r=0)`

Many libraries also let `size` be `(size_x, size_y)` for non-regular hexes
(stretched display).

## Orientation: pointy-top vs flat-top

A regular hexagon with center-to-vertex distance `size`:

| | Pointy-top | Flat-top |
|---|---|---|
| Width (corner to corner horizontally) | √3 · size | 2 · size |
| Height (corner to corner vertically) | 2 · size | √3 · size |
| Horizontal spacing between adjacent hexes | √3 · size | 3/2 · size |
| Vertical spacing between adjacent hexes | 3/2 · size | √3 · size |
| Vertex angles (degrees from center) | 30, 90, 150, 210, 270, 330 | 0, 60, 120, 180, 240, 300 |

Pointy-top has flat sides east and west; flat-top has flat sides north
and south.

## Hex → pixel (axial)

Pointy-top:

```
x = size * (√3 · q + (√3 / 2) · r)
y = size * (             3/2  · r)
```

Flat-top:

```
x = size * ( 3/2  · q              )
y = size * ((√3 / 2) · q + √3 · r)
```

Apply the layout's `origin` after: `screen = (x, y) + origin`.

## Pixel → hex (axial, fractional)

Invert the matrix above. Pointy-top:

```
q = ((√3 / 3) · px - (1 / 3) · py) / size
r = (                (2 / 3) · py) / size
```

Flat-top:

```
q = ( (2 / 3) · px                    ) / size
r = (-(1 / 3) · px + (√3 / 3) · py) / size
```

Then call `hex_round(q, r)` (see [coordinates.md](coordinates.md)) to snap
to the nearest integer hex.

## Hex corners

The six corners of a hex centered at `center`, given orientation and `size`:

```
corner(center, size, i) =
    center + (size * cos(angle_i), size * sin(angle_i))

where angle_i (radians) =
    pointy-top: π/180 * (60 * i - 30)
    flat-top:   π/180 * (60 * i)
```

Useful for drawing outlines, collision shapes, and mesh vertices.

## Common pitfalls

- **Forgetting the origin offset.** Hex `(0, 0)` is wherever you put it on
  screen; don't hard-code it to `(0, 0)` pixels unless that's what you
  want.
- **Confusing "size" with "width".** `size` is center-to-vertex, not
  corner-to-corner. Width and height are derived from it.
- **Stretched hexes that aren't actually regular.** If you pass
  `size = (sx, sy)` with `sx ≠ sy`, your hexes are no longer regular —
  distance metrics still work in hex space but pixel distances are
  distorted.
- **Mixing y-up and y-down conventions.** Game engines disagree (Bevy
  is y-up, screen coords are y-down). The formulas above assume y-down
  (screen pixel coordinates); flip the sign of `y` for y-up systems.

## What the libraries do

Both `hexx` (`HexLayout`) and `honeycomb-grid` (configured via
`defineHex({ dimensions, orientation })`) implement all of the above —
you give them orientation, size, origin, and call their `world_pos_to_hex`
/ `hex_to_world_pos` (hexx) or equivalent. Don't re-implement; the parity
edge cases will bite.
