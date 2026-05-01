---
name: libraries-cpp
description: C++ and Python libraries for Wave Function Collapse — fast-wfc and Python bindings.
---

# C++ / Python libraries

The C++ ecosystem revolves around `fast-wfc`. Python users typically
go through bindings rather than pure-Python implementations, which are
too slow for any non-trivial output.

## `fast-wfc` (math-fehr)

Repo: [math-fehr/fast-wfc](https://github.com/math-fehr/fast-wfc) (MIT).
Header-only C++17 library by Mathieu Olivier. The fastest open-source
WFC implementation, often 10–100× faster than naïve ports because it
uses the **propagator counter** trick (see
[concepts.md](concepts.md) — `compat_count[neighbor][p][d]`).

```cpp
#include "fastwfc/wfc.hpp"
#include "fastwfc/overlapping_wfc.hpp"

OverlappingWFCOptions options = {
    /* periodic_input */ true,
    /* periodic_output */ false,
    /* out_height */ 64,
    /* out_width */ 64,
    /* symmetry */ 8,
    /* ground */ false,
    /* pattern_size */ 3,
};
OverlappingWFC<Color> wfc(input_image, options, seed);

std::optional<Array2D<Color>> result = wfc.run();
if (!result) {
    // contradiction; retry with new seed
}
```

For the tiled model, use `TilingWFC` and provide a tile set + adjacency
list.

### Strengths

- Fastest available WFC. 256×256 overlapping output in seconds.
- Header-only — drop into any C++17 project.
- Clean separation between solver core and overlapping/tiled adapters.

### Weaknesses

- No backtracking (restart only).
- No path / count / border constraints.
- Author moved on; the repo is "done" rather than "maintained".
- Hand-authoring tile sets is verbose.

## Python bindings

Several wrappers exist; quality varies. As of 2026 there is no single
canonical PyPI package — search PyPI for `wfc`, `fast-wfc`,
`pywavefunctioncollapse` and check the last release date.

If none of the existing wrappers fit, writing your own with
[`pybind11`](https://pybind11.readthedocs.io/) or
[`nanobind`](https://github.com/wjakob/nanobind) is straightforward
(50–100 lines).

For pure-Python implementations: **don't, except for learning.** A
50×50 WFC in Python is seconds-to-minutes; the same in C++ is
milliseconds.

## When to drop down to C++

- Output ≥ 128 × 128.
- Output ≥ 100 patterns.
- Real-time generation (e.g., procedurally generating new chunks as
  the player explores).
- Many runs needed (e.g., Monte Carlo rejection sampling).

For any of these in Rust, JS, or Python, FFI to `fast-wfc` is usually
faster than rewriting the optimization in the host language.

## Compiling fast-wfc to WebAssembly

For browser games needing top-tier WFC performance:

```bash
emcc -O3 -std=c++17 \
     -s MODULARIZE=1 -s EXPORT_ES6=1 \
     -s ALLOW_MEMORY_GROWTH=1 \
     wfc_wrapper.cpp -o wfc.js
```

Wrap the API in a small JS shim that handles `Uint8Array` ↔
`Array2D<Color>` marshalling. A Web Worker around this gets you
DeBroglie-class performance in the browser for tile-heavy games.

## Recommendation

- **C++ project**: `fast-wfc`, header-only. Add backtracking yourself
  if you need it (it's a couple hundred lines on top of the existing
  solver).
- **Python user**: write a `nanobind` wrapper around `fast-wfc`. Pure
  Python is too slow.
- **Performance-critical browser game**: WASM-compile `fast-wfc`.
- **Need DeBroglie-level features but must stay in C++**: port the
  constraints layer from DeBroglie. Or accept a `fast-wfc` solver core
  + your own constraint layer on top.
