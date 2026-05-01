---
name: libraries-typescript
description: TypeScript / JavaScript libraries for Wave Function Collapse — wavefunctioncollapse npm package and mxgmn ports.
---

# TypeScript / JavaScript libraries

The JS ecosystem has a few WFC implementations. None are as polished
as DeBroglie (C#), but they're sufficient for browser demos, level
generators in web games, and texture synthesis pipelines.

## `wavefunctioncollapse` (npm)

Package: [`wavefunctioncollapse`](https://www.npmjs.com/package/wavefunctioncollapse)
by Kevin Chapelier. The most-installed and most-actively-maintained JS
implementation. Both tiled and overlapping models.

```bash
npm install wavefunctioncollapse
```

```typescript
import { OverlappingModel } from 'wavefunctioncollapse';
import sharp from 'sharp';   // or any image library that gives you raw pixels

const sample = await sharp('sample.png').raw().toBuffer({ resolveWithObject: true });

const model = new OverlappingModel(
  sample.data,           // Uint8Array of RGBA
  sample.info.width,
  sample.info.height,
  3,                     // N
  64, 64,                // output W, H
  true,                  // periodic input
  false,                 // periodic output
  8,                     // symmetry (1, 2, 4, 8)
  0,                     // ground
);

const success = model.generate(() => Math.random(), 10000 /* limit */);
if (!success) throw new Error('contradiction; retry');

const out = Buffer.alloc(64 * 64 * 4);
model.graphics(out);
await sharp(out, { raw: { width: 64, height: 64, channels: 4 } })
  .toFile('output.png');
```

For the **tiled model**, use `SimpleTiledModel` and pass a list of
tiles plus an adjacency definition. The API mirrors mxgmn's XML format
fairly directly.

### Strengths

- Pure JS, runs in browsers and Node.
- Both models supported.
- Reasonable performance for ~64×64 grids in a browser tab.

### Weaknesses

- No backtracking — only retry.
- TypeScript types are decent but the API is C#-flavored (capital-cased
  fields, JSON adjacency tables).
- No streaming / partial output API.

## mxgmn JS ports

Several authors have ported [Maxim Gumin's reference](https://github.com/mxgmn/WaveFunctionCollapse)
to JS. They tend to be educational rather than production-ready; check
recent commit activity before depending on them.

The reference C# is unusually clear, so **transpiling it yourself is a
viable option** if no existing library fits — it's about 600 lines.

## Browser performance

Pure-JS WFC is fast enough for:
- ≤ 64 × 64 grids
- ≤ 100 patterns (tiled model)
- N=3 overlapping with ~50–200 unique patterns

For larger grids:
- Run in a **Web Worker** to keep the main thread responsive.
- Stream observed cells back via `postMessage` and render
  incrementally; don't wait for the full result.
- Consider WebAssembly: compile `fast-wfc` (C++) to WASM via Emscripten
  for ~5–10× speedup on large grids.

## Three.js / 3D

WFC outputs a 2D or 3D grid of tile IDs. Mapping to Three.js meshes
is your problem. Common pattern:

```typescript
const grid = await wfcSolver(/* ... */);

const group = new THREE.Group();
for (let z = 0; z < grid.depth; z++) {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tileId = grid.get(x, y, z);
      if (tileId === EMPTY) continue;
      const mesh = tileMeshes[tileId].clone();
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
  }
}
scene.add(group);
```

For thousands of tiles, use `InstancedMesh` per tile type rather than
cloning.

## Recommendation

- **Browser demo / small game**: `wavefunctioncollapse` npm package.
- **Production web game with large maps**: WASM-compile `fast-wfc`,
  call from JS via a worker.
- **Just learning the algorithm**: port mxgmn's reference yourself —
  fastest way to actually understand the propagation step.
