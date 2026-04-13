# Real Data Container Heuristics

How to distinguish top-tier NeTEx entities (things users care about) from structural scaffolding (XSD plumbing).

## The naming convention

For any concept `Xxx`, the XSD may define:

| Suffix | XSD construct | Role |
|---|---|---|
| `Xxx` | `element` | Concrete, usable XML tag |
| `Xxx_` | `element` (abstract) | Substitution group head (polymorphic slot) |
| `Xxx_VersionStructure` | `complexType` | Property blueprint for the element |
| `Xxx_BaseStructure` | `complexType` | Common base shared with derived views |
| `Xxx_DerivedViewStructure` | `complexType` | Denormalized projection for embedding |
| `Xxx_RelStructure` | `complexType` | Collection wrapper (holds a list of `Xxx`) |
| `XxxRef` / `XxxRefStructure` | `element` / `complexType` | Reference by ID |

The element `Xxx` and its type `Xxx_VersionStructure` always come in pairs. XSD requires both because substitution groups are element-level while type inheritance is complexType-level — parallel hierarchies serving different purposes.

## Three converging signals for top-tier status

No single `isTopLevel="true"` flag exists. Top-tier status is established by:

### 1. Frame membership (most authoritative)

Frames are NeTEx's containers. Each frame type explicitly declares which elements can be direct children:

- **ResourceFrame** — organisations, typesOfValue, vehicleTypes, equipments, ...
- **ServiceFrame** — Network, routePoints, routes, lines, scheduledStopPoints, ...
- **TimetableFrame** — vehicleJourneys, ServiceJourney, ...
- **SiteFrame** — stopPlaces, parkings, topographicPlaces, ...
- **FareFrame** — fareStructureElements, tariffs, prices, ...
- **GeneralFrame** — catch-all for arbitrary members

If an element can live directly inside a frame, it is a top-tier entity. The frame XSDs (e.g. `netex_resourceFrame_version.xsd`) are the authoritative source.

### 2. Inheritance from DataManagedObject

Top-tier entities almost always descend from:

```
EntityInVersion
  └─ DataManagedObject
       └─ (domain parent)
            └─ Xxx_VersionStructure
```

`DataManagedObject` grants: versioning, responsibility sets, key-value metadata, validity conditions. If something inherits from it, it's designed to be a managed, referenceable, versionable entity.

### 3. Substitution group membership

Abstract elements ending in `_` (like `Place_`, `DataManagedObject_`, `TypeOfValue_`) are substitution group heads. Concrete elements declare `substitutionGroup="SomeHead_"` to participate. When a frame references `DataManagedObject_`, any element in that group can appear there.

## Classification heuristics (machine-applicable)

| Rule | Classifies as |
|---|---|
| Concrete element (no `abstract="true"`) with `substitutionGroup` | Usable entity |
| Referenced from a frame `_RelStructure` | **Top-tier** (frame member) |
| Extends `DataManagedObject` chain | Managed, versionable entity |
| Name ends in `_VersionStructure` | Scaffolding (type definition) |
| Name ends in `_RelStructure` | Scaffolding (collection wrapper) |
| Name ends in `_RefStructure` | Scaffolding (reference type) |
| Name ends in `_DerivedViewStructure` | Scaffolding (denormalized view) |
| Name ends in `_` | Scaffolding (abstract substitution group head) |

The combination **concrete element + in a frame + extends DataManagedObject** is the NeTEx definition of top-tier.

## Formalized role system (`x-netex-role`)

The `netex-typescript-model` converter implements the above heuristics as a priority cascade, stamped per-definition as the `x-netex-role` annotation:

| Priority | Rule | Role | Description |
|---|---|---|---|
| 1 | `*_VersionStructure`, `*_BaseStructure` | `structure` | Property blueprint for elements |
| 2 | `*_RelStructure` | `collection` | Collection wrapper (holds a list) |
| 3 | `*_RefStructure`, `*RefStructure` | `reference` | Reference by ID |
| 4 | `*_DerivedViewStructure` | `view` | Denormalized projection for embedding |
| 5 | Has `enum` property | `enumeration` | Enumerated value type |
| 6 | Element with `abstract="true"` | `abstract` | Substitution group head |
| 7 | In frame registry | `frameMember` | Direct child of a frame (gets `x-netex-frames` list) |
| 8 | Concrete element + substitutionGroup + extends DataManagedObject | `entity` | Top-tier managed entity |
| 9 | Name ends in `Ref` + exists in elements | `reference` | Catch-all for reference elements |
| 10 | Name starts with `Abstract` | `abstract` | Catch-all for abstract types |

Priority order matters — the first matching rule wins. Types that match none receive no role (unclassified).

### Supporting annotations

| Annotation | Set on | Purpose |
|---|---|---|
| `x-netex-frames` | `frameMember` defs | Which frames contain this member (e.g., `["ResourceFrame", "ServiceFrame"]`) |
| `x-netex-atom` | Transparent wrappers | Primitive type, `"simpleObj"` (multi-prop simpleContent), or `"array"` (xsd:list) |
| `x-netex-refTarget` | `reference` defs | Target element name (e.g., `TransportTypeRef` → `"TransportType"`) |
| `x-netex-substitutionGroup` | Subst. group members | Head element name (e.g., `"Place_"`) |
| `x-netex-sg-members` | Subst. group heads | List of concrete member names |

### Atom detection

Transparent wrappers are detected via two passes:
1. **simpleContent wrappers**: Types with a lowercase `value` property. Single-property → primitive type string; multi-property → `"simpleObj"`.
2. **Inline primitive structs**: Types where every own property is an inline primitive (no `$ref`, no `allOf`). Same split.
3. **xsd:list types**: Stamped as `"array"` — resolved to their item type (e.g., `AccessFacilityEnumeration[]`).

## Implications for code generation

- **Generate everything but organize** — emit all types, but mark or group them so consumers know what's a real entity vs plumbing. The `x-netex-role` annotation enables role-based filtering in viewers and potentially in generated output.
- **Frame parsing builds the entity registry** — parsing frame type definitions is the most robust way to produce a canonical list of top-tier entities. The frame registry is built during XSD parsing and stamped as `x-netex-frames`.
- **`_RelStructure` and `_RefStructure` are noise for most consumers** — these are XML serialization artifacts. In TypeScript/JSON, collections are arrays and references are string IDs. Consider flattening or hiding these.
- **Atom collapsing simplifies output** — definitions stamped with `x-netex-atom` can be inlined into their parent types (via `--collapse`), eliminating trivial wrapper indirection. Particularly effective for sub-graph outputs.
- **JAXB sidesteps the problem** — it generates classes for every type mechanically, and Java developers expect deep hierarchies. TypeScript/Python users expect a flatter, more curated surface.

## Documentation sources

- **Frame XSDs** — the normative, machine-readable source for frame membership
- **UML diagrams** in `xsd/NeTEx_UML/` — show conceptual entity relationships
- **CEN/TS 16614 parts 1-5** — formally classify entities (partially paywalled)
- **NeTEx GitHub** (`NeTEx-CEN/NeTEx`) — no single "top-tier entity" registry exists; frame membership is the closest equivalent
