# Route-planner vendor landscape (Nordic/Entur ingestion)

Brief profile of the proprietary scheduling/route-planner tools that Nordic PTOs and PTAs typically run upstream of Entur. For each product, two questions:

1. **Does the vendor advertise NeTEx export?** (first-party, community, or not at all)
2. **Does the vendor advertise Nordic PTO/PTA clients?** (already in the Entur ecosystem)

Scope: scheduling/timetabling/route-planning tools. Reservation and inventory systems are out of scope (see Turnit note at the end).

---

## Why this axis exists

A ServiceJourney in NeTEx carries refs — `OperatorRef`, `AuthorityRef`, `VehicleTypeRef`, `ResponsibilitySetRef` — to records that live in **ResourceFrame**. Planner scope is Journey reporting (ServiceJourney, JourneyPattern, passingTimes, DayTypes) and emitting the refs the journey needs to carry. The target records themselves (Operator, Authority, Organisation, VehicleType) are authored elsewhere: they're registry data under the operator's Entur codespace, not planner output. See [rail-best-practices.md §ResourceFrame (shared)](rail-best-practices.md) and [real-data-containers.md](real-data-containers.md).

This is separation of concerns, not a vendor defect. What it means in practice: between the planner export and the Entur submission there is a ResourceFrame-merge step that joins the planner's refs to the registry records, normalizes codespace prefixes, and fills shared TypeOfValue registries from reference data.

This axis captures which vendors already ship NeTEx (reducing the translation surface before the merge) vs. which require a full format conversion first.

---

## HASTUS (GIRO Inc., Canada)

**Scope.** Complete scheduling suite for bus, metro, tram, and passenger rail. Deployed in 25+ countries. Covers vehicle scheduling, crew scheduling, run-cutting, run-times, layovers, dwell times.

**Advertised NeTEx.** No first-party NeTEx export product page found on giro.ca. The existing converters are **community/customer-maintained**:

- `RuterNo/Hastus-NeTEx` (Ruter, Oslo) — in-house HASTUS→NeTEx converter on GitHub.
- `StichtingOpenGeo/Hastus-NeTEx` — MVP for HASTUS to CEN NeTEx in the Dutch profile.

**Nordic PTO/PTA.** Ruter (Oslo) is an attested user via the GitHub org above. Vendor marketing cites global deployments; a specific Nordic customer list is not foregrounded on giro.ca.

**Integration note.** HASTUS's data emphasis is schedules + vehicles + crew — as expected for a scheduling tool. Without a first-party NeTEx export, the integration layer carries both the format conversion (HASTUS native → NeTEx) and the usual ResourceFrame-merge. The Ruter and StichtingOpenGeo converters above handle the format step; ResourceFrame alignment is downstream of that.

---

## DGPro (DataGrafikk, Norway)

The user's shorthand "dgbus" refers to this product.

**Scope.** Route and operational planning software for bus/public transport. DataGrafikk has been a Norwegian supplier of public-transport software since the late 1980s.

**Advertised NeTEx.** Native NeTEx export advertised on datagrafikk.no (dedicated NeTEx tag page, plus the `nasjonale rutedata` tag for Norwegian national data delivery). Designed for the Nordic profile from inception rather than retrofitted.

**Nordic PTO/PTA.** Norwegian market focus; vendor self-describes as a leading supplier of software for the Norwegian public transport market.

**Integration note.** Lightest translation surface of the three named proprietary tools — Norwegian-national-delivery is the vendor's core business, not an afterthought. The ResourceFrame-merge still runs as usual; verify that codespace prefixes on emitted refs match the operator's Entur assignment.

---

## Trapeze FX (Trapeze Group / Modaxo / Trapeze Europe)

**Scope.** Fixed-route planning and scheduling for bus and rail. Trapeze Europe has offices in Germany, Denmark, and Norway.

**Advertised NeTEx.** Trapeze publishes marketing material positioning NeTEx as the future data-transfer standard; AVLC platforms in their suite advertise NeTEx + SIRI support. Bulk scheduling export historically flows through TSDE (Trapeze Standard Data Exchange), where GTFS is the long-established default and NeTEx is the newer output. Treat Trapeze NeTEx as vendor-advertised but verify the profile (CEN vs. Nordic vs. EPIP) per installation.

**Nordic PTO/PTA.** Nordic presence asserted by the vendor via DK/NO offices. A specific named list of Nordic PTO/PTA customers is not publicly detailed in collateral — flag for verification at procurement/integration time.

**Integration note.** TSDE exporters historically optimised for GTFS field coverage, so the NeTEx translation surface is larger than on a NeTEx-native tool — verify the profile (CEN vs. Nordic vs. EPIP) per install. ResourceFrame-merge runs as normal afterwards.

---

## nPlan (Entur) — non-proprietary, listed for completeness

**Belongs in this axis** because it is a route-planner-that-exports-to-Entur, but it does **not** fit the "proprietary vendor with licensing" framing. nPlan is first-party Entur open-source tooling, not vendor software.

**Scope.** Lightweight timetable editor built by Entur for small PTOs that don't have dedicated scheduling software. Two components, both open source on github.com/entur:

- `uttu` — backend (Java).
- `enki` — frontend (React).

**Advertised NeTEx.** Native NeTEx is the primary output; datasets are ingested directly by Entur's `marduk` pipeline.

**Nordic PTO/PTA.** Used by minor Norwegian PTOs with one or two lines — the "no dedicated scheduling tool" segment.

**Integration note.** Because nPlan is operated inside the Entur ecosystem, the ResourceFrame-merge is largely implicit: codespace, Operator, and Authority references are provisioned through the same Entur infrastructure that ingests the output.

---

## Turnit (out of scope)

Turnit OÜ (Estonia) produces rail sales, reservation, and inventory systems. It is not a scheduling/planning tool — it consumes service data rather than producing the canonical timetable. Listed here only so readers know why it is absent from the table below.

---

## Summary comparison

| Vendor | NeTEx export | Nordic PTO/PTA footprint | Translation surface before merge |
|---|---|---|---|
| HASTUS (GIRO) | Community/customer converters (no first-party product page found) | Ruter attested; broader list not foregrounded | High — no first-party NeTEx; format conversion is part of the integration layer |
| DGPro (DataGrafikk) | Native, vendor-advertised | Norwegian market focus, self-described leader | Low — NeTEx-native, Nordic profile is core business |
| Trapeze FX | Vendor-advertised (TSDE pipeline; profile varies per install) | Nordic offices DK/NO; named customer list not public | Medium — GTFS-optimised legacy; verify profile per install |
| nPlan (Entur, OSS) | Native | Small Norwegian PTOs | Negligible — operated inside Entur ecosystem |

---

## Closing note: the ResourceFrame-merge step

Regardless of which tool above produces the timetable:

- A ServiceJourney's refs (`OperatorRef`, `AuthorityRef`, `VehicleTypeRef`, `ResponsibilitySetRef`) only resolve if the target records exist in a ResourceFrame delivered alongside — typically authored from the operator's Entur-codespace registry, not the planner.
- Codespace prefixes (`[codespace]:[entityType]:[uniqueId]`, per [rail-best-practices.md](rail-best-practices.md)) on emitted refs must match the operator's Entur assignment; planner-internal IDs typically do not.
- TypeOfValue registries (TypeOfService, Notice, TypeOfProductCategory) are shared reference data, not planner output.

**Practical consequence:** the planner export and the Entur submission are never the same artifact. The merge step between them joins planner-emitted refs to registry records and normalizes codespaces — this is where the skill's pipeline patterns ([pipeline-patterns.md](pipeline-patterns.md)) and entity-role classification ([real-data-containers.md](real-data-containers.md)) are directly useful.
