# XSD-to-Code Tooling Evaluation for NeTEx

Evaluated Feb 2026. The key discriminator is **substitution group support** — NeTEx uses them pervasively and most tools don't handle them.

## Summary table

| Tool | Output language | Subst. groups | Abstract types | Large XSD | Active | Verdict |
|---|---|---|---|---|---|---|
| **cxsd** | TypeScript .d.ts | No (planned) | Yes | Unknown | Low | Missing critical feature |
| **xsd2ts** | TypeScript classes | Unknown | Unknown | Broken | Dead (5yr) | Multi-file schemas broken |
| **Modelina** | TypeScript + others | No | No | Unknown | Active | Missing critical features |
| **xsdata** | Python | Yes | Yes | Optimized | Active (v26.2) | Best XSD tool, Python only |
| **xsd2jsonschema** | JSON Schema | Partial | Partial | Broken | Stable (dormant) | Broken for NeTEx |
| **Custom Java DOM (GraalVM)** | JSON Schema | Partial (annotations) | Yes | Proven (458 files) | N/A (project-specific) | Proven — the approach that works |
| **@kie-tools/xml-parser-ts-codegen** | TypeScript | Yes (unions) | Unknown | Unknown | Apache-backed | Not tested on arbitrary XSD |
| **xuri/xgen** | Go/C/Java/Rust/TS | Unknown | Unknown | Unknown | Active | Unproven at NeTEx scale |

## Detailed evaluations

### cxsd (npm)
- Direct XSD → TypeScript .d.ts + .js parser state machine
- Handles namespaces, derived types, automated dependency resolution
- **Substitution groups listed as "soon" — not implemented**
- Tested on 96-file schemas (~720KB XSD → 9 .d.ts files)
- ~193 weekly downloads, 28 open issues
- **Verdict**: Rejected for NeTEx due to missing substitution group support

### xsd2ts (npm)
- Programmatic API: `generateTemplateClassesFromXSD('./file.xsd')`, outputs TypeScript classes
- 44 GitHub stars, ~300-800 weekly downloads, UNLICENSED
- **Unmaintained**: no updates in 5 years, pinned to TypeScript 3.9.9
- **Multi-file schemas broken**: Issue #20 (open 16+ months) — cannot resolve types across `<xsd:include>` files. Fatal for NeTEx's 458-file schema set.
- No documented substitution group or abstract type support
- **Verdict**: Rejected — broken multi-file support alone disqualifies it for any non-trivial XSD

### Modelina (AsyncAPI)
- Modern, multi-language (TypeScript, Python, Java, etc.)
- Supports simple/complex types, sequences, choices, attributes, enums
- **Explicitly does not support substitution groups or abstract types**
- Also missing: named groups, full restriction support, namespace validation
- **Verdict**: Not suitable for NeTEx

### xsdata (Python)
- Full substitution group support via `useSubstitutionGroups` config
- Complex type inheritance, extension, large schema optimization
- Active (v26.2 released Feb 2026)
- **Python only — no TypeScript output**
- **Verdict**: Best XSD tool available, but requires language bridge for non-Python targets

### xsd2jsonschema (npm)
- Pure JavaScript, XSD → JSON Schema (draft 04/06/07)
- Last published 6 years ago (v0.3.7), ~1,286 weekly downloads
- **`xs:include` is a documented no-op** (TODO in source) — fatal for NeTEx's 458 include-based files. Only `xs:import` (cross-namespace) works.
- **Crashes on `xsd:simpleContent` with `xsd:extension`**: `Cannot read properties of undefined (reading 'addAttributeProperty')` — NeTEx uses this pattern extensively.
- Only works for simple single-file or import-only schemas. ISO 20022 (banking) uses imports, not includes, which is why it worked there.
- **Verdict**: Broken for NeTEx. Do not use.

### Custom Java DOM converter via GraalVM (project-specific — `netex-typescript-model`)
- XSD → JSON Schema Draft 07 using Java standard library DOM APIs (`DocumentBuilderFactory`, `org.w3c.dom.Node`) via GraalVM JavaScript interop, paired with `json-schema-to-typescript` for final TypeScript output
- Plain JavaScript (`xsd-to-jsonschema.js`), no modules, no npm. Runs on stock JDK 21+ with GraalJS polyglot dependencies resolved by Maven
- **Two-pass architecture**: pass 1 collects groups, raw type entries, element registry, substitution group reverse map, and frame registry; pass 2 converts types and stamps annotations
- Handles: `complexType`, `simpleType`, `element`, `group`, `attributeGroup`, `complexContent` (extension/restriction), `simpleContent`, `sequence`, `choice`, `all`
- **Stamps 10 per-definition `x-netex-*` annotations**: `x-netex-source`, `x-netex-assembly`, `x-netex-role` (8-value classification), `x-netex-atom` (transparent wrapper detection), `x-netex-frames` (frame membership), `x-netex-mixed`, `x-netex-substitutionGroup`, `x-netex-sg-members`, `x-netex-refTarget`, `x-netex-collapsed`. Plus 1 per-property: `x-netex-choice` (choice group siblings). Also stamps OpenAPI 3.x `xml: { attribute: true }` on attribute-derived properties
- **Substitution groups partially modeled**: reads `substitutionGroup` attributes, builds reverse registry, stamps `x-netex-substitutionGroup`/`x-netex-sg-members` annotations. Used for entity classification (rule 8) and sub-graph pruning. **Not yet generating `oneOf`/`anyOf` union types** for polymorphic element references
- **Sub-graph pruning**: `--sub-graph <TypeName>` prunes schema to definitions reachable from a root type (follows `$ref`, `allOf`, substitution group edges). `--collapse` then inlines transparent wrappers (atom-stamped definitions)
- **Assembly-driven**: `--parts` flag accepts config keys (`part1_network`) or natural names (`network`) for subset selection. Configuration flows from `assembly-config.json`
- **Proven results**: 458 XSD files → 2,963+ JSON Schema definitions → TypeScript, zero compile errors
- **Known limitations**: polymorphic substitution group unions (no `oneOf`/`anyOf`), `xsd:any`/`xsd:anyAttribute` (ignored), attribute `use="required"` (not tracked — all optional), `mixed` content (flagged but not modeled), `xsd:redefine` (not supported, NeTEx doesn't use it), namespace-qualified names stripped (no collision in practice)
- **Verdict**: The proven approach for NeTEx → TypeScript. Substitution group union generation is the main open enhancement (tracked as GitHub issue).

### @kie-tools/xml-parser-ts-codegen (npm)
- Generates TypeScript types + metadata from XSD
- Handles substitution groups via union types
- **Explicitly warns: not tested against arbitrary XSD files**
- Only validated against DMN, SceSim, BPMN, PMML schemas
- **Verdict**: Promising but risk of failure on NeTEx complexity

### xuri/xgen (Go CLI)
- Generates Go/C/Java/Rust/TypeScript from XSD
- Active maintenance, BSD-3 licensed
- Limited documentation on multi-file XSD handling
- **Verdict**: Unknown viability, needs testing

## Recommended pipelines by target language

### TypeScript
**Primary**: Custom Java DOM XSD→JSON Schema converter (GraalVM interop) → `json-schema-to-typescript` — proven at NeTEx scale (458 files → 2,963+ definitions → zero compile errors). Two-stage pipeline with 10 `x-netex-*` annotations enriching the intermediate schema. Key `json-schema-to-typescript` options: `unreachableDefinitions: true`, `format: false` (skip prettier for speed), `additionalProperties: false`. See `netex-typescript-model` for the reference implementation.
**Alternative**: Same converter → `json-schema-to-zod` (gets both types and runtime validation)
**Backup**: `xuri/xgen -l=TypeScript` (untested at NeTEx scale)
**Do not use**: `xsd2jsonschema` (broken `xs:include`, crashes on `simpleContent`)

### Python
**Primary**: `xsdata` — the clear winner, full feature support

### Java
**Primary**: JAXB via `cxf-xjc-plugin` — proven at scale by `netex-java-model`

### Go / Rust / C
**Primary**: `xuri/xgen` — only option with multi-language support

## Key risks for NeTEx code generation

1. **Substitution groups** — The proven approach is annotation-based: stamp `x-netex-substitutionGroup`/`x-netex-sg-members` during parsing, use for classification and sub-graph pruning, but don't yet generate `oneOf`/`anyOf` unions. Full polymorphic references remain an open enhancement.
2. **Circular references** — JSON Schema handles via `$ref` cycles. `json-schema-to-typescript` handles the resulting `$ref` cycles gracefully. Deeply circular NeTEx types (frames containing frames) may produce overly permissive types.
3. **Scale** — 458 XSD files is large. Tools proven on <100 files may hit performance or memory issues. The custom Java DOM converter + `json-schema-to-typescript` handles the full set in seconds.
4. **Namespace isolation** — NeTEx uses a single namespace for all parts but imports GML and SIRI. Tools must handle mixed namespace schemas. In practice, stripping namespace prefixes works because NeTEx and SIRI/GML use distinct naming conventions.
5. **Extension depth** — Deep inheritance chains (Entity → DataManagedObject → specific types) stress type resolution.
6. **Group resolution ordering** — `xsd:group` definitions must be collected before complex types that reference them. A two-pass approach (collect groups first, then convert types) solves this.
7. **Disabled-part cross-references** — When generating a subset, types from disabled parts are referenced but missing. Emitting placeholder `{}` definitions (which compile as `unknown` in TypeScript) provides graceful degradation.
8. **Choice group fidelity** — `xsd:choice` groups are flattened to optional properties in JSON Schema (no `oneOf`). The `x-netex-choice` per-property annotation preserves sibling information for downstream consumers (e.g., data fakers that emit only the first alternative).

## Documentation propagation pitfalls

When propagating `xsd:annotation/xsd:documentation` through a JSON Schema intermediate representation:

1. **`$ref` + sibling `description` in JSON Schema Draft 07** — Draft 07 specifies that `$ref` causes all sibling keywords to be ignored. However, `json-schema-to-typescript` reads `description` from `$ref` siblings anyway. To be safe (and spec-correct), wrap as `{ allOf: [{ $ref: "..." }], description: "..." }`. This is critical for property-level descriptions on elements that reference complex types.

2. **XML parser output format** — When `xsd:documentation` has an `xml:lang` attribute, XML parsers typically produce `{ "#text": "...", "@_xml:lang": "en" }` instead of a plain string. Handle both forms: `typeof doc === "string" ? doc : doc["#text"]`.

3. **Output volume increase** — Expect ~3x line count increase when annotations are preserved (e.g., 15K → 49K lines). The added documentation is valuable but may require splitting output into multiple files for ergonomics.
