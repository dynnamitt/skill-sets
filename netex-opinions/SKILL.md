---
name: netex-opinions
description: >
  Domain knowledge about NeTEx (Network Timetable Exchange) XSD schema structure,
  code generation challenges, tooling landscape, and rail data modeling best
  practices. Use when working with NeTEx XSD schemas, generating code from NeTEx
  in any language, understanding NeTEx part structure, evaluating XSD-to-code
  tools, dealing with NeTEx cross-dependencies and subset selection, or modeling
  rail timetables, train formations, and service disruptions in NeTEx.
---

# NeTEx Domain Knowledge

Reference material from analysis of NeTEx 2.0 XSD schemas, code generation tooling (Feb 2026), and rail service data modeling best practices (Jan 2025).

## NeTEx XSD structure

See [references/xsd-structure.md](references/xsd-structure.md) for:
- Part inventory (458 files across 8 directories)
- Cross-dependency chains between parts
- Include/import patterns, namespaces, and aggregator files
- The `netex_service/` dependency web (critical for subset selection)
- SIRI structural dependency analysis
- XSD complexity features that challenge code generation

## Code generation tooling landscape

See [references/tooling-evaluation.md](references/tooling-evaluation.md) for:
- Evaluation of 8 XSD-to-code tools across languages (including the proven Java DOM/GraalVM converter)
- Why substitution group support is the key discriminator for NeTEx
- The 10 `x-netex-*` annotation stamps and their downstream uses
- Risk assessment per tool
- Recommendations for different target languages
- Documentation propagation pitfalls (JSON Schema `$ref` + `description`)

## Generation pipeline patterns

See [references/pipeline-patterns.md](references/pipeline-patterns.md) for:
- Recommended pipeline architecture (load all → filter output) with configuration-driven assemblies
- Two-stage reference implementation (Java DOM → JSON Schema → TypeScript)
- Annotation enrichment layer (10 per-definition + 1 per-property `x-netex-*` stamps)
- Sub-graph pruning (`--sub-graph`, `--collapse`) for focused outputs
- Annotation propagation strategy (`xsd:documentation` → JSDoc/docstrings, `@see` links)
- Output splitting by XSD source directory (natural module boundaries) with barrel exports
- Cross-module import resolution approaches
- Documentation outputs (schema HTML viewer, TypeDoc, docs index)

## Real data container heuristics

See [references/real-data-containers.md](references/real-data-containers.md) for:
- How to distinguish top-tier NeTEx entities from structural scaffolding (`_VersionStructure`, `_RelStructure`, etc.)
- Three converging signals: frame membership, `DataManagedObject` inheritance, substitution groups
- Formalized 8-role classification system (`x-netex-role` priority cascade)
- Supporting annotations: `x-netex-frames`, `x-netex-atom`, `x-netex-refTarget`, `x-netex-sg-members`
- Machine-applicable classification rules (suffix-based + frame parsing)
- Why frame XSDs are the authoritative "top-tier entity" registry
- Implications for code generation (role-based filtering, atom collapsing, flatten scaffolding)

## Rail data modeling best practices

See [references/rail-best-practices.md](references/rail-best-practices.md) for:
- Package structure (shared vs line-specific files) and frame types with their contents
- ID conventions (`[codespace]:[entityType]:[uniqueId]`) and versioning rules
- Profile differences between Nordic Profile and EPIP
- Calendar modeling approaches (DayTypes, UicOperatingPeriod, OperatingPeriod) and daylight saving
- ServiceJourney/JourneyPattern/passingTimes structure and best practices
- Train formation hierarchy (CompoundTrain → Train → TrainComponent → TrainElement)
- DatedServiceJourneys for stable IDs in ticketing and seat reservation
- Separation of concerns between timetable, rolling stock, and crew
- Rail-specific patterns: splits/joins, reversals, cross-border, over-midnight

## Bus Nordic procurement standard

See [references/bus-nordic.md](references/bus-nordic.md) for:
- Bus class definitions (A, B, I, II, III) from ECE R 107 with Nordic capacity/length/floor-type tables
- NeTEx mapping: VehicleType + FacilitySet + AccessibilityAssessment + PassengerCapacity (the "vehicle functional profile" axis)
- Complete requirements checklist (mandatory vs optional) across 10 chapters
- Safety, seating, accessibility, information systems, and driver environment specs
- Nordic-specific additions beyond EU baseline (alcolock, climate ranges, USB, NCS contrast, ITxPT S01)
- Finland-specific minimum seat/door counts for Class I

## Key insights

1. **SIRI is structurally required** — `NeTEx_publication.xsd` unconditionally imports 3 SIRI files. Any code generator starting from that entry point needs SIRI present. Only 12 files / 2,204 lines — negligible overhead.

2. **Subset selection is hard** — `netex_service/netex_all.xsd` includes all parts unconditionally. The filter files (`netex_filter_frame.xsd`) have hard dependencies on Part 1. Generating code for a subset requires either synthetic aggregators or load-all-filter-output.

3. **Substitution groups are the key challenge** — Every major NeTEx element is a substitution group member. Most XSD-to-code tools don't handle them. The proven approach is annotation-based: stamp `x-netex-substitutionGroup`/`x-netex-sg-members` during parsing for classification and sub-graph pruning, even if full `oneOf`/`anyOf` union generation isn't yet implemented.

4. **Part 4 was never published** — NeTEx skips from Part 3 to Part 5. Not an error.

5. **Cross-references require all files present** — Even when generating for a single part, the full XSD set must be available because parts reference types from other parts and the framework.

6. **XSD annotations are the documentation goldmine** — Most NeTEx types, elements, and attributes have `xsd:annotation/xsd:documentation`. Any code generation pipeline should propagate these to output (JSDoc, docstrings, XML comments). Expect ~3x increase in output volume when annotations are preserved. Many upstream downloads strip annotations for size — keep them.

7. **Type distribution is heavily framework-weighted** — Of ~3,000 base definitions (framework + SIRI only, no domain parts), ~92% come from `netex_framework/` (reusable components: 45%, responsibility: 30%, generic framework: 15%), ~6% from SIRI, ~5% core/service. Domain parts add modest incremental counts. This distribution matters for splitting generated output into manageable modules.

8. **NeTEx XSD naming convention reveals natural module boundaries** — `*_support.xsd` (180 files) defines base types/enums, `*_version.xsd` (198 files) defines concrete elements. The directory structure (`netex_framework/netex_reusableComponents/`, `netex_framework/netex_responsibility/`, etc.) maps cleanly to output module boundaries.

9. **NeTEx data is passenger-journey-centric** — It describes journey opportunities from the individual passenger's perspective, not infrastructure movements. The related but distinct TAF/TAP TSI standard covers the infrastructure provider's view. In Transmodel, a VEHICLE can be a bus, ferry, or an entire train — even one with many coaches is still a single VEHICLE.

10. **DatedServiceJourneys are essential for ticketing** — ServiceJourney IDs are inherently unstable in rail; infrastructure or rolling-stock changes after publication can force ID changes. DatedServiceJourneys provide the stable ID layer for reservations and SIRI real-time, with backwards references to track what was replaced during disruptions.

11. **VehicleScheduleFrame enables separation of concerns** — Decouples rolling-stock management from the passenger timetable, critical in rail where Operators, Rolling Stock Providers, and Infrastructure Providers manage their data independently. TrainBlocks describe the complete formation (including coaches from other ServiceJourneys sharing the physical train).

12. **Each transport mode brings a different ResourceFrame metadata axis** — Rail depth is in *composition/formation* (CompoundTrain → Train → TrainComponent → TrainElement), bus depth is in *functional compliance profiles* per ECE R 107 class (Bus Nordic 2.0), and *spatial layout* (deck plans) cuts across all three modes. Bus Nordic's class-to-requirement matrix maps to VehicleType + FacilitySet + AccessibilityAssessment + PassengerCapacity. Ferry's mode-specific metadata axis has not yet been explored (as of Apr 2025).
