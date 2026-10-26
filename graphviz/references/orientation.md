---
name: orientation
description: Choosing rankdir (TB vs LR) for a Graphviz graph from the frame it will be shown in — kitty vsplit/hsplit panes, full windows, docs pages — and from the graph's own shape.
---

# TB or LR

`rankdir` sets the direction ranks flow: `TB` (top→bottom, the default), `LR`, `BT`, `RL`.
Graphviz says **TB**, not TD — `TD` is Mermaid's spelling. Graphviz silently treats any
unknown value as TB, so `rankdir=TD` happens to work and a typo like `rankdir=LT` silently
doesn't.

## Rule of thumb: match the frame

The long axis of the frame should carry the long axis of the graph — usually its depth
(number of sequential steps).

| Frame | Shape | rankdir |
|---|---|---|
| kitty `vsplit` pane (windows side by side) | tall, narrow | **TB** |
| kitty `hsplit` pane (windows stacked) | wide, short | **LR** |
| full terminal / landscape monitor | wide | **LR** for pipelines; TB for trees |
| portrait monitor, phone, PDF page | tall | **TB** |
| bottom panel / status strip (few rows) | very wide | **LR**, plus `rank=same` groups to stay one row high |

In kitty, `launch --location=vsplit` puts the new window **beside** the current one (a
vertical split line); `hsplit` puts it **below**. Other tools name splits the other way
round (tmux `split-window -h` is side by side), so judge by the pane's shape, not the word.

## Better: let the graph's shape decide too

A pipeline is deep and narrow; a fan-out (one job spawning ten) is shallow and wide. Rotate
by what the drawing turns into, not only by the frame:

- deep chain in a wide pane → LR
- wide fan-out in a wide pane → TB (the ten siblings sit side by side)
- wide fan-out in a tall pane → LR (siblings stack vertically)

So measure instead of guessing: lay the graph out both ways with `-Tdot`, read the root
`bb="x0,y0,x1,y1"` (points), and keep the rankdir that needs the least shrinking to fit the
pane. Only when both fit at natural size does the frame rule above break the tie.
`scripts/dotcat --dir auto` (the default) and `dotlive.sh` both do this.

```bash
for r in TB LR; do dot -Grankdir=$r -Tdot g.gv | grep -m1 -o 'bb="[^"]*"'; done
# bb="0,0,215.75,252"   TB: 216×252 pt
# bb="0,0,376.5,144"    LR: 377×144 pt
```

`-Grankdir=…` on the command line overrides a `rankdir` written in the file, so the auto
pick skips files that set one explicitly — the author already chose.

## Keeping a long LR graph from wrapping into a strip

- `ranksep=0.3 nodesep=0.2` tighten the spacing (inches).
- Put short labels in nodes; move detail into `tooltip=` (SVG) or a legend.
- For a 20-step chain, LR is still too long for most panes: break it into phases with
  `subgraph cluster_<phase>` and lay the clusters out TB, or use `unflatten -l 3` on fan-outs.

## Web pages and docs

Don't pick Graphviz there at all: Markdown on GitHub/GitLab and most docs sites render
Mermaid natively, so use the `mermaid-diagrams` skill (`flowchart TD` / `flowchart LR`).
For a responsive page, prefer TD — page width is the scarce axis on phones.
