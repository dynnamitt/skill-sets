# NeTEx Code Generation Pipeline Patterns

Generic patterns for generating typed code from NeTEx XSD schemas, applicable to any target language. Updated with concrete patterns from the `netex-typescript-model` reference implementation.

## Recommended pipeline architecture

```
XSD (all 458 files)
  → Parse (recursive include/import resolution)
  → Build type registry (types, elements, groups, attributes, subst. groups, frames)
  → Stamp annotations (x-netex-role, x-netex-source, x-netex-atom, etc.)
  → Convert to intermediate representation (JSON Schema, AST, etc.)
  → Filter to enabled parts (by source file path)
  → Optionally prune to sub-graph (reachable from a root type)
  → Optionally collapse transparent wrappers
  → Generate target language code
  → Split into modules (by XSD source directory)
  → Generate documentation (TypeDoc, schema HTML viewer, etc.)
```

### Why load all, filter output

Loading all 458 XSD files is necessary because cross-references span parts. Filtering at parse time causes unresolved type errors. Instead: parse everything, track source file per definition, filter at output time. References to types in disabled parts become `unknown` placeholders — graceful degradation.

### Configuration-driven assemblies

Subset selection is driven by a single config file (`assembly-config.json`) with `parts.<key>.enabled` flags. Required parts (framework, GML, SIRI, service) are always included. The assembly name reflects enabled optional parts (e.g., `base`, `network`, `fares+network`, `network+timetable`). CLI flags accept both config keys (`part1_network`) and natural names (`network`).

## Two-stage pipeline (reference implementation)

The `netex-typescript-model` project decouples XSD parsing from TypeScript generation:

**Stage 1: XSD → JSON Schema (Java DOM via GraalVM)**
```
XSD (all files) → xsd-to-jsonschema.js (Java DOM) → JSON Schema (with x-netex-* annotations)
  → validate-generated-schemas.ts (JSON Schema validation against Draft 07 meta-schema)
  → build-schema-html.ts → netex-schema.html (self-contained interactive viewer)
```

**Stage 2: JSON Schema → TypeScript (Node.js)**
```
JSON Schema → primitive-ts-gen.ts → inject @see links into schema clone
  → json-schema-to-typescript → monolithic .ts
  → split-output.ts → per-category modules with cross-imports + barrel index.ts
  → tsc --noEmit -p tsconfig.generated.json (type-check)
```

The decoupling means Stage 1 runs on JDK 21+, Stage 2 on Node.js. The JSON Schema is the stable interface between them.

## Annotation enrichment layer

The converter stamps 10 per-definition and 1 per-property custom annotations on the JSON Schema. These drive downstream classification, viewer features, type resolution, and code generation.

### Per-definition annotations

| Annotation | Type | Purpose |
|---|---|---|
| `x-netex-source` | string | Origin XSD filename → source map for module splitting |
| `x-netex-assembly` | string | Assembly name (top-level, not per-def) |
| `x-netex-role` | string enum | 8-value structural classification (see real-data-containers.md) |
| `x-netex-atom` | string | Transparent wrapper detection: primitive type, `"simpleObj"`, or `"array"` |
| `x-netex-frames` | string[] | Frame membership list (on `frameMember` role only) |
| `x-netex-mixed` | boolean | `mixed="true"` flag (informational) |
| `x-netex-substitutionGroup` | string | Head element name for subst. group members |
| `x-netex-sg-members` | string[] | Concrete members list on subst. group heads |
| `x-netex-refTarget` | string | Target element for reference-role defs (e.g., `TransportTypeRef` → `"TransportType"`) |
| `x-netex-collapsed` | number | Count of inlined wrappers (top-level, set by `--collapse`) |

### Per-property annotations

| Annotation | Type | Purpose |
|---|---|---|
| `x-netex-choice` | string[] | Sibling property names from same `xsd:choice` group |
| `xml.attribute` | boolean | OpenAPI 3.x — marks XSD attribute-derived properties |

### How annotations drive downstream

- **Module splitting**: `x-netex-source` → category assignment by directory path
- **Role filtering**: `x-netex-role` → sidebar filter chips in schema viewer, BFS entity traversal
- **Type resolution**: `x-netex-atom` → collapse trivial wrappers; `"array"` → resolve list items (e.g., `AccessFacilityEnumeration[]`); `enumeration` role → stop at name rather than expanding to literal union
- **Entity relations**: `x-netex-refTarget` → resolve ref-typed properties to target entities in bipartite graphs
- **Sub-graph pruning**: `x-netex-substitutionGroup` + `x-netex-sg-members` → follow subst. group edges
- **Data faking**: `x-netex-choice` → emit only first alternative from each choice group
- **XML serialization**: `xml.attribute` → `$`-prefix for canonical names, `@_`-prefix for `fast-xml-parser` XMLBuilder

## Annotation propagation

NeTEx XSDs are rich with `xsd:annotation/xsd:documentation`. Propagating these to generated code (JSDoc, docstrings, XML comments) is the single highest-value post-generation enhancement.

### Where annotations appear

| XSD construct | Typical annotation content |
|---|---|
| `complexType` | Type-level description ("Type for a SCHEDULED STOP POINT") |
| `simpleType` | Enum/restriction description ("Allowed values for TRANSPORT MODE") |
| `element` (top-level) | Element description |
| `element` (within sequence/choice) | Property-level description |
| `attribute` | Attribute property description |

### Intermediate representation mapping

| XSD | JSON Schema | TypeScript | Python | Java |
|---|---|---|---|---|
| `xsd:documentation` | `description` field | JSDoc `/** ... */` | Docstring | Javadoc |

### `$ref` + description gotcha (JSON Schema route)

In JSON Schema Draft 07, `$ref` causes sibling keywords to be ignored per spec. When an element references a complex type AND has its own documentation, you cannot write:

```json
{ "$ref": "#/definitions/FooType", "description": "This element is..." }
```

Instead, wrap in `allOf`:

```json
{ "allOf": [{ "$ref": "#/definitions/FooType" }], "description": "This element is..." }
```

This is the most common pitfall when adding description propagation to an existing XSD-to-JSON-Schema converter. Without wrapping, some tools (e.g., `json-schema-to-typescript`) read the sibling description anyway, but others silently drop it. The `allOf` wrapping is spec-correct and universally safe.

**Warning**: Adding `allOf` wrappers increases the number of schema nodes and can trigger stack overflows in tools that recursively resolve circular `$ref` chains. Test with the full NeTEx schema set, not just small examples.

### JSDoc @see links

`primitive-ts-gen.ts` injects `@see` links into each definition's JSDoc pointing to the published JSON Schema HTML viewer. The persisted JSON Schema stays clean — only the TypeScript output gets the links. This creates a two-way bridge: TypeDoc → schema viewer (via @see), schema viewer → TypeDoc (via generated navigation).

## Output splitting by XSD directory

A monolithic output file for NeTEx base config produces ~3,000 definitions / ~49,000 lines (with annotations). Splitting by XSD source directory yields natural modules:

| Module | Source pattern | Expected % |
|---|---|---|
| reusable | `netex_framework/netex_reusableComponents/` | ~45% |
| responsibility | `netex_framework/netex_responsibility/` | ~29% |
| generic | `netex_framework/netex_genericFramework/` | ~16% |
| siri | `siri/` or `siri_utility/` | ~6% |
| core | Everything else (utility, frames, service, root) | ~4% |
| network | `netex_part_1/` | Incremental when Part 1 enabled |
| timetable | `netex_part_2/` | Incremental when Part 2 enabled |
| fares | `netex_part_3/` | Incremental when Part 3 enabled |
| new-modes | `netex_part_5/` | Incremental when Part 5 enabled |

Output: per-category module files with cross-imports + barrel `index.ts` re-exporting all modules.

### Cross-module imports

When splitting, types in one module reference types in another. Two approaches for resolving cross-module imports:

**A. Schema-level $ref graph**: Walk JSON Schema `$ref` chains to find cross-category dependencies. Misses inlined references that the code generator resolves (e.g., `allOf` extension flattening).

**B. Text scanning (more reliable)**: After generation, scan each code block for type name references (e.g., PascalCase identifiers in TypeScript). Match against the global type→module map. Produces correct imports even when the code generator inlines or flattens schema references.

Approach B is more robust for `json-schema-to-typescript` because it aggressively inlines `allOf`/extension types.

## Source file tracking

During XSD parsing, record which source file each definition comes from:

```
TypeName → sourceFile mapping:
  "ScheduledStopPointStructure" → "netex_part_1/.../netex_scheduledStopPoint_version.xsd"
  "DataManagedObjectStructure" → "netex_framework/netex_genericFramework/.../netex_dataManaged_version.xsd"
```

This mapping enables:
1. Subset filtering (only emit definitions from enabled parts)
2. Module splitting (group definitions by source directory)
3. Documentation (link generated types back to XSD source)

The `x-netex-source` annotation persists this mapping into the JSON Schema so Stage 2 consumers can use it without re-parsing XSD.

## Two-pass parsing

NeTEx XSDs use `xsd:group` compositions that may be referenced before they are defined (alphabetical file loading order doesn't guarantee definition order). A two-pass approach solves this:

- **Pass 1**: Collect all `xsd:group` and `xsd:attributeGroup` definitions, build element registry, substitution group reverse map, and frame registry
- **Pass 2**: Convert `complexType`, `simpleType`, and `element` definitions (group references are now resolvable), run classification cascade, stamp annotations

This is simpler and more reliable than topological sorting or lazy resolution.

## Sub-graph pruning

For focused outputs (e.g., generating types for just `VehicleType` and its dependencies):

- `--sub-graph <TypeName>` prunes the schema to definitions reachable from a root type
- Reachability follows: `$ref` chains, `allOf` inheritance, substitution group edges (`x-netex-sg-members`)
- `--collapse` inlines transparent wrappers (definitions stamped with `x-netex-atom`) into their parent types, producing a more compact output

Example: `base@ResourceFrame@tiny` assembly uses sub-graph pruning from `ResourceFrame` with collapse enabled.

## Documentation outputs

The reference implementation produces three documentation artifacts:

1. **JSON Schema HTML viewer** — self-contained page per assembly with sidebar search, role-based filter chips, per-definition sections with syntax-highlighted JSON, interactive explorer panel (graph diagram, relations bipartite graph, interface/type guard/factory code generation, sample data with Flat/XmlShaped/XML toggle)
2. **TypeDoc** — per-assembly HTML documentation generated from the split TypeScript modules, with `@see` links to the schema viewer
3. **Docs index** — landing page listing all assemblies with descriptions, stats, and links to both TypeDoc and schema viewer. Deployed to GitHub Pages via CI.
