# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A library of Claude Code skills — self-contained reference guides that get loaded into context when activated. No build system, no tests, no source code. Pure markdown.

## Structure

Each skill lives in its own directory:

```
<skill-name>/
├── SKILL.md          # Entry point — activation triggers, key principles, inline guidance
└── references/       # Deep-dive docs linked from SKILL.md
    └── *.md
```

**Current skills:**
- `bestagons/` — Hex grids: Red Blob vocabulary + `hexx` (Rust), `honeycomb-grid` (TS), and Lua/LÖVE pointers
- `bevy-ecs/` — Bevy 0.18+ ECS architecture, systems, relationships, UI, animation
- `federated-search/` — React federated search UX with parallel async queries
- `netex-opinions/` — NeTEx XSD schema analysis, code generation, rail data modeling

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
