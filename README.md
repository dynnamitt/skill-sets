# skill-sets

A library of [Claude Code](https://claude.ai/code) skills — self-contained reference guides loaded into context on activation.

## Skills

| Skill | Description |
|-------|-------------|
| `bestagons` | Hex grids — Red Blob vocabulary with `hexx` (Rust), `honeycomb-grid` (TS), Lua/LÖVE pointers |
| `bevy-ecs` | Bevy 0.18+ ECS architecture, systems, relationships, UI, animation |
| `federated-search` | React federated search UX with parallel async queries |
| `netex-opinions` | NeTEx XSD schema analysis, code generation, rail data modeling |
| `wave-function-collapse` | WFC procgen — tiled/overlapping models, observe/propagate/backtrack, library pointers |
| `xbox-bluetooth-linux` | Xbox controller Bluetooth (BLE) on Linux — protocol triage, btmon evidence, Intel combo-card limits, dongle + single-session pairing workaround |

## Plugins

| Plugin | Description |
|--------|-------------|
| `graph-in-pane` | Claude Code mod: Graphviz graphs of scripts, builds, `.dot` files and plans in a pane docked beside the chat (`/graph-tree`, `/graph-flow`, `/10kfv`, `/10kfo`) |

Install from a Claude Code terminal session:

```
/plugin install graph-in-pane --marketplace dynnamitt/skill-sets
```

## Structure

```
<skill>/
├── SKILL.md        # Entry point — triggers, principles, inline guidance
└── references/     # Deep-dive docs linked from SKILL.md
```

A plugin (mod) folder instead holds `.claude-plugin/plugin.json`, `hooks/` (a TypeScript hooks module), `types/`, `tests/` and `docs/`; the repo root's `.claude-plugin/marketplace.json` lists it.
