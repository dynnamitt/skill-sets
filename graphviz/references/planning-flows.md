---
name: planning-flows
description: Using Graphviz while planning complex flows — migrations, rollouts, multi-step pipelines, state machines — with phases as clusters, explicit decision and rollback paths, and a plan graph that doubles as a progress view.
---

# Planning complex flows

Prose plans hide ordering mistakes: two steps that both "come after the migration", a
rollback that has no path back, a parallel branch nobody joins. Drawing the plan as a graph
before executing it surfaces those, and the same file later shows progress.

## Shape of a plan graph

- **Phases → clusters** (`subgraph cluster_p1 { label="1 · Prepare" }`), laid out in order.
- **Steps → boxes**; verbs in labels ("Backfill orders", not "Orders").
- **Decisions / gates → diamonds** with labelled outcomes (`go`, `no-go`). Every gate
  needs every outcome drawn — a missing `no-go` edge is a missing part of the plan.
- **Rollback → red dashed edges** back to a safe state, `constraint=false` so they don't
  reshape the forward flow.
- **Parallel work** → fan-out/join (`shape=point` join) — the join makes the dependency
  explicit ("deploy waits for *both* backfill and dual-write").
- **Open questions → `shape=note`** nodes attached with dotted edges to the step they block.
- **Critical path** → `penwidth=2` on its edges; everything else stays thin.

```dot
digraph migrate {
  graph [rankdir=LR, fontname="Sans", fontsize=11, newrank=true, nodesep=0.3]
  node  [shape=box, style="rounded,filled", fillcolor="#f5f5f5", color="#9e9e9e", fontname="Sans", fontsize=10]
  edge  [color="#757575", fontname="Sans", fontsize=9]

  subgraph cluster_prep { label="1 · Prepare"; schema [label="Add new columns"]; dual [label="Dual-write"] }
  subgraph cluster_move { label="2 · Move";    backfill [label="Backfill"]; verify [label="Verify counts"] }
  subgraph cluster_cut  { label="3 · Cut over"; gate [shape=diamond, label="checks\ngreen?"]; read [label="Read from new"]; drop [label="Drop old columns"] }
  q1 [shape=note, label="Backfill rate limit?\n(ask DBA)", fillcolor="#fff8e1"]

  schema -> dual -> backfill -> verify -> gate [penwidth=2]
  gate -> read [label="go", penwidth=2]
  read -> drop [penwidth=2]
  gate -> dual [label="no-go", style=dashed, color="#e53935", constraint=false]
  q1 -> backfill [style=dotted, arrowhead=none]
}
```

## Working with the plan

- Show it in a side pane (`scripts/dotcat plan.gv`); a `vsplit` pane next to the
  conversation gives TB, a wide `hsplit` strip gives LR ([orientation.md](orientation.md)).
- Iterate on the `.gv` like code: re-render after each change and look at what moved.
- When execution starts, keep node ids stable and drive colours from state
  ([live-updates.md](live-updates.md)) — the plan becomes the progress view.
- If the plan will be published to a docs site or PR description, port it to Mermaid there
  (`mermaid-diagrams` skill); keep Graphviz for the terminal.
