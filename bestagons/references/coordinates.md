---
name: coordinates
description: Hex coordinate systems (axial, cube, offset, doubled), conversions between them, and floating-point rounding.
---

# Coordinate Systems

Hex grids use four coordinate systems in common use. They are
interchangeable — pick one for storage, convert at the boundary when you
need a different system's strengths.

## Axial — `(q, r)`

The default. Two integers, both positive and negative. Pointy-top: `q`
increases east, `r` increases south-east. Flat-top: `q` increases
south-east, `r` increases south.

```
       q=0,r=-1   q=1,r=-1
              ╱ ╲ ╱ ╲
   q=-1,r=0  ┤ * ├  q=1,r=0       ( * = origin (0,0) )
              ╲ ╱ ╲ ╱
       q=-1,r=1   q=0,r=1
```

Vector-like: addition, subtraction, scalar multiplication all work directly
on `(q, r)` pairs.

## Cube — `(q, r, s)` with `q + r + s = 0`

The same hex as axial, with a redundant third coordinate. The constraint
makes algorithms that exploit three-axis symmetry simpler:

- **Distance**: `(|dq| + |dr| + |ds|) / 2` (no max needed)
- **Rotation by 60°**: cyclic permutation of components
- **Reflection**: swap two components

Many libraries (including hexx) store as axial and derive `s = -q - r`
on demand.

## Offset — `(col, row)`

Two integers that match screen rows and columns directly — natural for 2D
array storage. Four variants depending on which row/column gets shifted:

| Variant | Orientation | Shift |
|---|---|---|
| `oddr` | Pointy-top | Odd rows shifted right by ½ hex |
| `evenr` | Pointy-top | Even rows shifted right by ½ hex |
| `oddq` | Flat-top | Odd columns shifted down by ½ hex |
| `evenq` | Flat-top | Even columns shifted down by ½ hex |

Drawback: arithmetic on `(col, row)` is not vector arithmetic. Neighbor
offsets depend on parity (different table for even vs odd rows). Avoid
unless you really want the 2D-array storage.

## Doubled — `(col, row)` with `(col + row) mod 2 == 0`

Same screen-aligned shape as offset, but indexes hexes at half-resolution
so neighbors don't depend on parity. The constraint `(col + row) mod 2 == 0`
keeps every other slot empty.

| Variant | Orientation |
|---|---|
| `doublewidth` | Pointy-top |
| `doubleheight` | Flat-top |

Better than offset for algorithms; worse than axial because storage is
twice as wasteful.

## Conversions

### Axial ↔ Cube — trivial

```
cube_from_axial(q, r):     return (q, r, -q - r)
axial_from_cube(q, r, s):  return (q, r)
```

### Axial ↔ Offset — depends on orientation and parity

Pointy-top, `oddr` (odd rows shifted right):

```
offset_from_axial(q, r):
    col = q + (r - (r & 1)) / 2
    row = r

axial_from_offset(col, row):
    q = col - (row - (row & 1)) / 2
    r = row
```

Pointy-top, `evenr`: replace `(r & 1)` with `-(r & 1)` (i.e., shift the
opposite direction). `oddq` and `evenq` are flat-top equivalents with `q`
and `r` swapped roles. Red Blob's
[implementation page](https://www.redblobgames.com/grids/hexagons/implementation.html)
has all four written out — copy them, don't re-derive.

### Axial ↔ Doubled — straightforward

`doublewidth` (pointy-top):

```
doubled_from_axial(q, r):  return (2*q + r, r)
axial_from_doubled(c, r):  return ((c - r) / 2, r)
```

`doubleheight` (flat-top): swap.

## Rounding floating-point hex coordinates

Pixel-to-hex returns fractional `(q, r)` because the click landed inside
some hex but not at its center. To snap to the nearest integer hex, round
in cube space — naive per-component rounding breaks the `q + r + s = 0`
invariant.

```
hex_round(frac_q, frac_r):
    frac_s = -frac_q - frac_r

    q = round(frac_q)
    r = round(frac_r)
    s = round(frac_s)

    q_diff = abs(q - frac_q)
    r_diff = abs(r - frac_r)
    s_diff = abs(s - frac_s)

    # Reset the component with the largest rounding error to satisfy q+r+s=0
    if q_diff > r_diff and q_diff > s_diff:
        q = -r - s
    elif r_diff > s_diff:
        r = -q - s
    # else s is reset, but we don't need s in axial output

    return (q, r)
```

This produces the correct nearest hex for any fractional input. Both `hexx`
and `honeycomb-grid` do this internally — call their pixel-to-hex method
rather than rolling your own.

## Picking a system

| Situation | Use |
|---|---|
| Default | Axial |
| Algorithm-heavy code (rotation, reflection, distance) | Cube (often as a view into axial) |
| Display / 2D array storage of a rectangular map | Offset (matches screen) or doubled (cleaner math) |
| Anything else (hexagonal, parallelogram, triangle, irregular shapes) | Axial |

In practice: store axial, expose offset/doubled at the I/O boundary if
your map renderer wants `(col, row)`.
