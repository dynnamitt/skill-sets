---
name: graph-in-pane
description: Claude Code mod that draws Graphviz graphs of scripts, builds, .dot files and plans as images in a pane docked beside the chat
---

# graph-in-pane

A Claude Code mod (a plugin of function hooks) that shows Graphviz graphs as
real images in a pane docked to the right of the chat. It gives "code
inspection from 10,000 feet" for bash and TypeScript/JavaScript, and a live
box-and-arrow view of a plan while Claude works one out with you. The goal is
fewer terminal splits.

## Commands

| Command | Alias | What it draws |
|---|---|---|
| `/graph-tree <file\|dir>` | `/10kfv` (view) | The literal structure from tree-sitter: functions, calls, external commands, exits and own-file dependencies. Instant, uses no tokens. A `.dot` file is drawn as written and redrawn when it changes. |
| `/graph-flow <file\|dir>` | `/10kfo` (overview) | A 10,000 ft flow that Claude draws from the tree-sitter skeleton: phases, failure exits, every arrow backed by the code. |
| `/graph` | | Reopens the pane, showing the latest plan graph first. `/graph off` stops plan graphs. |

**In the pane**
- Press ctrl+x tab to focus the pane.
- Digits `1`–`9` open a numbered box: an own file, or a large function.
- `0` goes back along the breadcrumb.
- `m` pages through more boxes.

**Plan graphs**

While a planning skill (brainstorming, writing-plans) or plan mode is active,
Claude keeps a picture of the plan in the pane.

**Tools Claude can call**
- `show_graph`: draws DOT in the pane.
- `graph_skeleton`: returns the tree-sitter skeleton of a file or dir as JSON.

## Requirements

Any Linux distro. Each tool is looked up on `PATH`, then in the Homebrew,
`~/.cargo/bin` and `~/.local/bin` folders. A path can also be set in the
plugin's options (`/config`).

| Tool | Needed for | Arch | Fedora / Bazzite | Debian / Ubuntu |
|---|---|---|---|---|
| Graphviz `dot` | every graph | `pacman -S graphviz` | `brew install graphviz` (or `dnf install graphviz`) | `apt install graphviz` |
| `ast-grep` | `/graph-tree`, `/graph-flow` | `pacman -S ast-grep` | `brew install ast-grep` | `cargo install ast-grep` or `npm i -g @ast-grep/cli` |
| `tree-sitter` CLI + Neovim parsers | fallback when ast-grep is missing | `pacman -S tree-sitter-cli` | in the base image | `cargo install tree-sitter-cli` |

Notes:
- Run `ast-grep` by its full name. `sg` is a shadow-utils command on most
  distros.
- The fallback finds parser `.so` files through `nvim --headless`, or in
  `${XDG_DATA_HOME:-~/.local/share}/nvim/site/parser`.
- Images need a terminal with the kitty graphics protocol, such as kitty or
  Ghostty. Other terminals show a text outline of the graph instead.
- The pane docks on the right in the fullscreen layout from 110 columns. In
  a narrower window, plan graphs announce themselves on the status line:
  `plan graph updated · /graph`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install graph-in-pane --marketplace dynnamitt/skill-sets
```

From a shell:

```
claude plugin install graph-in-pane --marketplace dynnamitt/skill-sets
```

To develop it, run `claude --plugin-dir ~/code/skill-sets/graph-in-pane`. It
reloads on save. Run the tests with `claude plugin test graph-in-pane`.

## Design

- [docs/2026-10-25-design.md](docs/2026-10-25-design.md): intent, decisions,
  constraints.
- [docs/2026-10-25-plan.md](docs/2026-10-25-plan.md): the implementation plan.
