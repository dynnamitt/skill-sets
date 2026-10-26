# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A library of Claude Code skills — self-contained reference guides that get loaded into context when activated — plus Claude Code plugins (mods). Skills are pure markdown with no build system; a plugin folder holds TypeScript hooks and its own tests.

## Structure

Each skill lives in its own directory:

```
<skill-name>/
├── SKILL.md          # Entry point — activation triggers, key principles, inline guidance
├── references/       # Deep-dive docs linked from SKILL.md
│   └── *.md
└── scripts/          # Optional helper scripts
```

**Current skills:**
- `bestagons/` — Hex grids: Red Blob vocabulary + `hexx` (Rust), `honeycomb-grid` (TS), and Lua/LÖVE pointers
- `bevy-ecs/` — Bevy 0.18+ ECS architecture, systems, relationships, UI, animation
- `federated-search/` — React federated search UX with parallel async queries
- `graphviz/` — DOT diagrams in the terminal: install, kitty-fitted rendering, TB/LR by pane, live progress views (+ `scripts/`)
- `netex-opinions/` — NeTEx XSD schema analysis, code generation, rail data modeling
- `wave-function-collapse/` — WFC procgen: tiled/overlapping models, observe/propagate/backtrack
- `xbox-bluetooth-linux/` — Xbox controller Bluetooth (BLE) on Linux: triage, btmon, adapters, pairing workaround (+ `scripts/`)

**Plugins (mods):** listed in `.claude-plugin/marketplace.json` at the repo root.
- (none currently)

A plugin folder:

```
<plugin-name>/
├── .claude-plugin/plugin.json   # Manifest (name, version, types, userConfig)
├── hooks/hooks.json             # { "modules": ["./register.tsx"] }
├── hooks/register.tsx           # The hooks module: the only file touching $ and $.state
├── hooks/lib/                   # Pure functions, or functions taking a Host
├── types/index.d.ts             # Self-contained state contract (no imports)
├── tests/*.test.ts(x)           # `claude plugin test <plugin-name>`
└── docs/                        # Design and plan
```

Check a plugin with `claude plugin validate <plugin-name>` and `claude plugin test <plugin-name>`. `.claude-plugin/types/` is engine-written and git-ignored.

## Conventions

- Every `.md` file (including `SKILL.md`) uses YAML frontmatter with `name` and `description` fields
- `SKILL.md` starts with activation triggers (when the skill should fire), then key principles, then links to references
- Reference files are self-contained on a single topic — one concept per file
- Code blocks use language specifiers (`rust`, `tsx`, `graphql`, `xml`, etc.)
- Cross-references use relative markdown links: `[references/foo.md](references/foo.md)`

## Adding a New Skill

1. Create `<skill-name>/SKILL.md` with frontmatter (`name`, `description`) and activation triggers
2. Create `<skill-name>/references/` with topic-specific deep dives
3. Keep individual files focused — split rather than grow

## Editing Guidelines

- Maintain the progressive-disclosure pattern: SKILL.md gives the 80% answer, references give the 20% deep dive
- Ground content in real implementations, standards docs, or library APIs — not generic advice
- Include version numbers and dates where applicable so content can be assessed for staleness
