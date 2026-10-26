---
name: graphviz
description: >
  Graphviz / DOT diagrams rendered in the terminal — writing DOT, installing Graphviz on any
  distro (incl. Bazzite / Fedora Atomic), sizing images to fit a kitty (or Ghostty/WezTerm)
  pane, picking TB vs LR from the pane shape (vsplit → TB, hsplit → LR), and redrawing a live
  progress/state diagram without flicker. Use this skill whenever a shell, automation or build
  script (build.sh, deploy.sh, bootstrap, Makefile, CI workflow) narrates sequential and
  parallel steps through walls of echo banners, comments or `& … wait` — draw the flow instead
  of reading prose; when planning a complex flow (migration, rollout, pipeline, state machine);
  when analysing an unfamiliar or complex codebase (module/crate/package dependencies, call or
  data flow, import cycles); and whenever the user mentions dot, .gv files, Graphviz, neato,
  sfdp, rankdir or kitty icat — even if they only ask to "show the flow" or "map it out".
  Not for diagrams that end up on web pages, READMEs or docs sites: use mermaid-diagrams there.
---

# Graphviz in the terminal

Checked 2026-10 against Graphviz 16.0 and kitty 0.48/0.49.

## When this fires

- **Scripts that explain themselves in prose.** A build/deploy/bootstrap script, Makefile or
  CI workflow whose banners and comments describe what runs in order, what runs in parallel,
  and what happens on failure. Draw it: one diagram replaces the prose and exposes missing
  joins and unhandled failures → [references/flows-from-scripts.md](references/flows-from-scripts.md)
- **Planning a complex flow** — migrations, rollouts, multi-stage pipelines, state machines.
  Phases as clusters, gates as diamonds, rollback edges drawn → [references/planning-flows.md](references/planning-flows.md)
- **Analysing a complex codebase** — generated dependency graphs (filtered hard), import
  cycles, and small hand-drawn "how does X actually flow" graphs → [references/codebase-graphs.md](references/codebase-graphs.md)

**Web pages, READMEs, PR descriptions, docs sites → use the `mermaid-diagrams` skill
instead.** GitHub, GitLab and most docs generators render Mermaid natively; a Graphviz PNG
there is a static image that nobody can edit. Graphviz wins in the terminal, for large
auto-laid-out graphs, and when a tool already emits DOT.

## Setup

`dot -V` — if missing, install the `graphviz` package (`pacman -S`, `apt install`,
`dnf install`, `brew install`). On **Bazzite** / Fedora Atomic use Homebrew (preinstalled) or
a distrobox, not `dnf` → [references/install.md](references/install.md)

## Show a graph in the terminal

Script paths are relative to this skill's directory.

```bash
scripts/dotcat flow.gv              # sized to this pane, TB/LR chosen automatically
scripts/dotcat --dir LR flow.gv     # force a direction
some-tool --dot | scripts/dotcat    # from stdin
```

`dotcat` renders at the pane's pixel size with graph text as tall as terminal text, and on a
dark terminal background re-colours the graph to blend in (`--theme dark|light` to force) —
keep `.dot` sources neutral and let the theme happen at render time. Outside a graphics
terminal it writes `graph.png` and prints the path. Doing it by hand, feed `icat` the PNG on
stdin, not as a path → [references/terminal-display.md](references/terminal-display.md)
(sizing, dark themes, Ghostty/WezTerm/sixel, tmux, SSH, `dot -Tkitty`).

## TB or LR

Graphviz spells it `rankdir=TB` (Mermaid's `TD`). Put the graph's long axis on the frame's
long axis:

| Frame | rankdir |
|---|---|
| kitty `vsplit` pane (side by side → tall) | **TB** |
| kitty `hsplit` pane (stacked → wide) | **LR** |
| full landscape terminal | LR for pipelines, TB for trees |

But the graph's own shape can flip it: a wide fan-out in a wide pane wants TB. When you can
measure, lay it out both ways and keep the one that shrinks least — `dotcat` does this unless
the file sets `rankdir` → [references/orientation.md](references/orientation.md)

## Live progress without glitches

For a state or progress diagram that updates while a script runs:

1. **Declare every node up front**; not-yet-run steps are grey `pending`, never absent.
2. **Pin the layout once** (`dot -Tdot > laid.gv`); render each frame with `neato -n2` after
   appending `node [fillcolor=…]` overrides — geometry stays identical, frames take ms.
3. **Swap images, don't clear**: draw the new frame under a second `--image-id`, then delete
   the old one (`\e_Ga=d,d=I,i=<old>,q=2\e\\`), inside a synchronized update
   (`\e[?2026h` … `\e[?2026l`). `icat --clear` or re-using one id blanks a frame.
4. **Own the screen**: alt screen, hidden cursor, `--place` at a fixed cell, step output to a
   log file — anything printed scrolls the frame. Re-measure on `SIGWINCH`.

`scripts/dotlive.sh` is a bash library doing all of it (states pending/running/done/failed/
skipped; parallel jobs supported via state files and a poller) →
[references/live-updates.md](references/live-updates.md)

```bash
. scripts/dotlive.sh
live_start pipeline.gv
live_set build running; live_draw
make build >>"$LIVE_LOG" 2>&1 && live_set build done || live_set build failed
live_stop
```

## Modeling cheatsheet

| Flow element | DOT |
|---|---|
| sequence | `a -> b -> c` |
| parallel fan-out / join | `prev -> {a b c} -> join`; `join [shape=point, width=0.08]` |
| decision | `q [shape=diamond]`; label every outcome edge |
| failure path | dashed red edges to one `fail` sink, `constraint=false`; `{rank=same; ok; fail}` |
| retry / loop | back edge with `constraint=false` (or a self-loop with a label) |
| phase / sub-script / service | `subgraph cluster_<name> { label="…" }` — name must start with `cluster` |
| restylable edges | `strict digraph` so a repeated `a -> b [color=…]` merges |

Defaults worth always setting: `fontname="Sans"` on graph/node/edge (the default is
Times-Roman), `shape=box, style="rounded,filled"`, small `nodesep`/`ranksep` for terminals.
Ids with `-`, `.`, `/` or `:` need quotes (`a:b` is port syntax) →
[references/dot-language.md](references/dot-language.md)

## Principles

- **One question per graph.** 6–25 nodes. Larger means clusters, filtering, or two graphs.
- **Name nodes after real things** — the script's function, the banner's phase, the code's
  `module::fn` — so the reader can find them.
- **Draw every outcome** of a gate and every failure route; the missing edges are usually
  the finding.
- **Keep the `.gv` next to the thing it describes** and treat it like code: re-render after
  each change.

## References

- [references/install.md](references/install.md) — distros, Bazzite/Atomic, fonts, plugin errors
- [references/terminal-display.md](references/terminal-display.md) — kitty sizing math, icat flags, other terminals, tmux/SSH
- [references/orientation.md](references/orientation.md) — TB vs LR by frame and by graph shape
- [references/live-updates.md](references/live-updates.md) — flicker-free progress views, parallel steps
- [references/dot-language.md](references/dot-language.md) — syntax, attributes, clusters, ranks, HTML labels, engines
- [references/flows-from-scripts.md](references/flows-from-scripts.md) — shell/CI/Make flows → DOT, worked example
- [references/planning-flows.md](references/planning-flows.md) — plan graphs: phases, gates, rollback, open questions
- [references/codebase-graphs.md](references/codebase-graphs.md) — dependency tools per ecosystem, gvpr/tred/sccmap/unflatten
