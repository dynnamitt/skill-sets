---
name: libraries-csharp
description: C# / Unity / Godot libraries for Wave Function Collapse — DeBroglie (Boris the Brave) and Maxim Gumin's reference implementation.
---

# C# / Unity / Godot libraries

C# has the most mature WFC ecosystem because both Gumin's reference
and DeBroglie are written in it. **DeBroglie is the recommended
default** for anything beyond a tutorial.

## DeBroglie (Boris the Brave)

Repo: [BorisTheBrave/DeBroglie](https://github.com/BorisTheBrave/DeBroglie)
(MIT). NuGet: `DeBroglie`.

The most feature-complete WFC library in any language. Author Adam
Newgas (Boris the Brave) writes excellent posts that double as the
documentation:

- [WFC explained](https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/)
- [WFC tips and tricks](https://www.boristhebrave.com/2020/02/08/wave-function-collapse-tips-and-tricks/)
- [DeBroglie docs](https://boristhebrave.github.io/DeBroglie/)

```csharp
using DeBroglie;
using DeBroglie.Models;
using DeBroglie.Topo;
using DeBroglie.Constraints;

var topology = new GridTopology(20, 20, periodic: false);
var model = new AdjacentModel();

// Author tiles by edge labels
model.AddAdjacency(new[] { tileA, tileB }, new[] { tileC }, 1, 0, 0);
model.SetFrequency(tileA, 1.0);
model.SetFrequency(tileB, 0.5);

var propagator = new TilePropagator(model, topology, new TilePropagatorOptions
{
    BackTrackDepth = -1,            // unlimited backtracking
    Constraints = new ITileConstraint[]
    {
        new BorderConstraint { Tiles = new[] { borderTile } },
        new PathConstraint(new[] { pathTile }),
    },
});

var status = propagator.Run();
if (status != Resolution.Decided) throw new InvalidOperationException();
var output = propagator.ToValueArray<Tile>();
```

### What DeBroglie does that nothing else does

- **Backtracking** out of the box, not just restart.
- **Path / connectivity constraints** (`PathConstraint`,
  `EdgedPathConstraint`): "the result must contain a connected path
  through these tiles", "no isolated rooms".
- **Count constraints**: "exactly 3 boss rooms".
- **Border constraints**: "all edges must be wall tiles".
- **Hex topologies** built in.
- **3D** topologies built in.
- **Symmetry handling**: rotation/reflection groups for tiles.
- **Partial output streaming** for incremental renders.

### Unity integration

Use the NuGet package via [NuGetForUnity](https://github.com/GlitchEnzo/NuGetForUnity)
or compile the .NET Standard library directly into `Assets/Plugins/`.
Run the solver in a `Task.Run` to keep the game thread responsive,
poll `Resolution` each frame, render observed tiles incrementally as
they collapse.

### Godot integration

For Godot 4 (C# build), the same NuGet approach works. For GDScript,
either:
- Wrap DeBroglie in a small C# bridge node and call it from GDScript.
- Use a community GDScript port (search the asset library; quality
  varies).

## Maxim Gumin's reference

Repo: [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)
(MIT). The original 2016 implementation. Tiled and overlapping models;
no backtracking, no constraints, no symmetry beyond simple rotations.

Use this when:
- You want to **read the algorithm** in its purest form (~600 lines C#).
- You're porting WFC to a new language and want a faithful reference.
- You're producing image output specifically (it has tile-rendering
  built in for the demo gallery).

Don't use it for production game integration — DeBroglie has
strictly more features and is actively maintained.

## MarkovJunior (also Gumin)

Repo: [mxgmn/MarkovJunior](https://github.com/mxgmn/MarkovJunior).
Gumin's successor algorithm: probabilistic graph-rewriting rules. Not
WFC, but in the same procgen lineage and often a better fit when WFC's
local-only constraints are too restrictive.

If WFC is "tile based on local neighbors", MarkovJunior is "rewrite
patterns until you reach a goal". Use it when you need:
- Multi-step generation (caves → rooms → corridors → doors)
- Hierarchical structure
- Goal-directed output ("must contain at least one boss room reachable
  from spawn")

## Other C# / Unity options

| Library | Notes |
|---|---|
| `selfsame/unitwfc` | Unity port of mxgmn's reference. Educational, possibly stale. |
| Various Asset Store packages | Quality varies wildly. Vet before depending. |
| Custom port of DeBroglie | If you need it in pure GDScript or a Unity build that excludes .NET, port the relevant subset yourself. |

## Recommendation

- **Default for any C# project**: **DeBroglie**. It's the only library
  that handles realistic game requirements (paths, borders, counts).
- **Learning the algorithm**: read mxgmn's reference, then DeBroglie's
  source for how to do it well.
- **Need MarkovJunior-style hierarchical / goal-directed generation**:
  use MarkovJunior; don't try to bend WFC into doing it.
