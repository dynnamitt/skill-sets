---
name: alternatives
description: Alternatives to WFC — Model Synthesis, MarkovJunior, plain CSP solvers, and when each is a better fit.
---

# Alternatives to WFC

WFC is one point in a wide design space of constraint-based procgen.
For many problems WFC is a poor fit and a different algorithm is
strictly better. This file is the cheat sheet for "what should I
actually use".

## Model Synthesis (Paul Merrell, 2007)

[Paul Merrell — Model Synthesis](https://paulmerrell.org/model-synthesis/)

**Predates WFC by 9 years.** Same idea (propagate adjacency
constraints, collapse cells), but with a different solver order:
Merrell **fills cell-by-cell in scan order**, with a small backtrack
window when a contradiction arises. WFC's "always pick lowest entropy"
is a refinement — but the lower contradiction rate of Model Synthesis's
ordered approach often makes it more practical.

**Use Model Synthesis instead of WFC when:**
- Output is large (>100×100 or 3D voxels). Model Synthesis scales
  better because the local backtrack window doesn't grow with grid
  size.
- Contradiction rate with WFC is intolerable.
- You want bounded memory (Merrell's algorithm doesn't need the full
  wave; it only tracks a sliding window).

**Use WFC instead of Model Synthesis when:**
- You want output to look "natural" from any direction, not biased by
  the scan order.
- Outputs are small enough that contradictions are rare.

Boris the Brave's implementation is in DeBroglie under
`OrderedConstraintSolver`. There is no widely-distributed Rust crate.

Paul Merrell's [more-recent papers](https://paulmerrell.org/research/)
extend Model Synthesis with hierarchical and probabilistic variants
that beat WFC on most benchmarks.

## MarkovJunior (Maxim Gumin, 2022)

[mxgmn/MarkovJunior](https://github.com/mxgmn/MarkovJunior)

Probabilistic graph-rewriting language. Not constraint propagation —
**rule-based replacement**. You write rules like "find any 3×3 patch
matching pattern A and rewrite it to pattern B".

**Use MarkovJunior instead of WFC when:**
- You need **multi-step / hierarchical generation**: e.g., scatter
  rooms → connect with corridors → place doors → place items.
- You need **goal-directed output**: e.g., the level must be
  reachable from spawn to exit.
- WFC's "every cell at once" model can't express your structure
  naturally.

The cost: writing MarkovJunior programs is more like programming a
shader than authoring tiles. Steeper learning curve.

## Plain constraint satisfaction (CSP / SAT / SMT)

If your problem is "find a grid layout satisfying these rules", that's
literally a CSP. Off-the-shelf solvers can be radically faster than
WFC for hard inputs:

- **Google OR-Tools** (CP-SAT): the heavyweight champion for discrete
  combinatorial problems. Python and C++ APIs.
- **MiniZinc** with Gecode/Chuffed: declarative, great for prototyping
  rule sets.
- **Z3**: SMT solver, excellent if rules involve arithmetic / integer
  variables, not just adjacency.

**Use a CSP solver instead of WFC when:**
- Rules are structurally complex: "exactly N rooms of size ≥ M, all
  reachable from spawn, ratio of corridors to rooms ≤ 0.4".
- You actually want **proven optimal** layouts ("the maximum-fun
  dungeon under these constraints").
- WFC keeps contradicting and you suspect the rules have no solution.

CSP solvers will **prove unsatisfiability** in seconds where WFC just
spins forever.

The trade-off: solvers don't bias toward "looks like sample input"
without extra work. You'll spend time encoding aesthetic constraints
that WFC gets for free from the sample.

## Hand-authored grammars

Shape grammars (CGA, CityEngine), L-systems, replacement rules — older
than WFC by decades, still effective for structured output:

- **Plant / tree generation**: L-systems.
- **City / building generation**: shape grammars.
- **Dungeon layout**: room-and-corridor algorithms (BSP, Voronoi,
  cellular automata) often outperform WFC.

**Use a grammar instead of WFC when** the output has explicit
hierarchical structure. WFC produces "fields"; grammars produce
"trees".

## Cellular automata

For cave-like layouts, bubble structures, organic blobs:

```
init: random fill 45% wall
loop 5 times:
    new[x][y] = wall if count_walls_in_3x3(x, y) >= 5 else floor
```

Five lines of code, looks great. WFC is overkill for this.

## Noise + threshold

For terrain, biomes, clouds, noisy continuous fields:
- Perlin / Simplex / OpenSimplex noise.
- Worley (cellular) noise for crackly textures.

WFC can't do gradients. Noise can't do discrete adjacencies. Combine
them: noise for elevation, WFC for tile selection within elevation
bands.

## When to use what — decision table

| Problem | Best fit |
|---|---|
| Tilemap from a tile set, local rules, small grid | **WFC tiled** |
| Texture synthesis from a small sample | **WFC overlapping** |
| Tilemap, large grid (>100×100), too many contradictions | **Model Synthesis** |
| Multi-step generation: rooms → corridors → items | **MarkovJunior** or hand-authored pipeline |
| Provably-correct layout under complex global constraints | **CSP solver** (OR-Tools, MiniZinc) |
| Cave / blob / organic layout | **Cellular automata** |
| Heightmap, biome blend, clouds | **Noise** |
| Plant / city / building structure | **Shape grammar / L-system** |
| Reachability requirement on top of WFC output | **DeBroglie's `PathConstraint`** or post-process with rejection sampling |

## "WFC is constraint solving in disguise"

Karth & Smith's [2017 paper](https://adamsmith.as/papers/wfc_is_constraint_solving_in_disguise.pdf)
formalizes WFC as a CSP. The practical insight: **you can usually do
better than WFC by stating your problem as a CSP and using a real
solver.** WFC's main appeal is that the "specify constraints by
example" interface is cheap; if you don't have a sample to
specify-by-example *with*, you're already doing constraint solving and
should pick the right tool.

## Sources

- [Paul Merrell — Model Synthesis (2007)](https://paulmerrell.org/model-synthesis/)
- [Paul Merrell — Comparing Model Synthesis and WFC (2021)](https://paulmerrell.org/wp-content/uploads/2021/07/comparison.pdf)
- [Maxim Gumin — MarkovJunior](https://github.com/mxgmn/MarkovJunior)
- [Karth & Smith — WFC is constraint solving in disguise (2017)](https://adamsmith.as/papers/wfc_is_constraint_solving_in_disguise.pdf)
- [Google OR-Tools — CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
- [Boris the Brave — When to use WFC](https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/)
