# Route-planner vendor landscape (Nordic/Entur ingestion)

Brief profile of the proprietary scheduling/route-planner tools that Nordic PTOs and PTAs typically run upstream of Entur. For each product, two questions:

1. **Does the vendor advertise NeTEx export?** (first-party, community, or not at all)
2. **Does the vendor advertise Nordic PTO/PTA clients?** (already in the Entur ecosystem)

Scope: scheduling/timetabling/route-planning tools. Reservation and inventory systems are out of scope (see Turnit note at the end).

---

## Why this axis exists

A ServiceJourney in NeTEx references entities that live in **ResourceFrame** — Operator, Authority, Organisation, VehicleType, TypeOfValue, and supporting registries. See [rail-best-practices.md §ResourceFrame (shared)](rail-best-practices.md) and [real-data-containers.md](real-data-containers.md) for what ResourceFrame holds and the `x-netex-frames` classification.

A planner can emit a perfectly valid TimetableFrame and still fail Entur ingestion if the ResourceFrame IDs its ServiceJourneys reference are missing, inconsistent with the operator's codespace, or not registered in the Nordic Organisation registry. **No scheduling vendor is built around the CEN organisational registry** — they are built around schedules, vehicles, and crew. Integrating planner output with Entur therefore almost always involves a ResourceFrame enrichment step downstream of the planner.

This axis captures which vendors already ship NeTEx (reducing the gap) vs. which require a full translation layer.

---

## HASTUS (GIRO Inc., Canada)

**Scope.** Complete scheduling suite for bus, metro, tram, and passenger rail. Deployed in 25+ countries. Covers vehicle scheduling, crew scheduling, run-cutting, run-times, layovers, dwell times.

**Advertised NeTEx.** No first-party NeTEx export product page found on giro.ca. The existing converters are **community/customer-maintained**:

- `RuterNo/Hastus-NeTEx` (Ruter, Oslo) — in-house HASTUS→NeTEx converter on GitHub.
- `StichtingOpenGeo/Hastus-NeTEx` — MVP for HASTUS to CEN NeTEx in the Dutch profile.

**Nordic PTO/PTA.** Ruter (Oslo) is an attested user via the GitHub org above. Vendor marketing cites global deployments; a specific Nordic customer list is not foregrounded on giro.ca.

**Gap note.** HASTUS's data emphasis is schedules + vehicles + crew. Operator/Authority identity and Organisation registry alignment land on the integration team, not the HASTUS export.

---

## DGPro (DataGrafikk, Norway)

The user's shorthand "dgbus" refers to this product.

**Scope.** Route and operational planning software for bus/public transport. DataGrafikk has been a Norwegian supplier of public-transport software since the late 1980s.

**Advertised NeTEx.** Native NeTEx export advertised on datagrafikk.no (dedicated NeTEx tag page, plus the `nasjonale rutedata` tag for Norwegian national data delivery). Designed for the Nordic profile from inception rather than retrofitted.

**Nordic PTO/PTA.** Norwegian market focus; vendor self-describes as a leading supplier of software for the Norwegian public transport market.

**Gap note.** The lightest-risk of the three named proprietary tools — the Norwegian-national-delivery use case is the vendor's core business, not an afterthought. Still verify that the specific codespace and Organisation IDs used match the operator's Entur registration.

---

## Trapeze FX (Trapeze Group / Modaxo / Trapeze Europe)

**Scope.** Fixed-route planning and scheduling for bus and rail. Trapeze Europe has offices in Germany, Denmark, and Norway.

**Advertised NeTEx.** Trapeze publishes marketing material positioning NeTEx as the future data-transfer standard; AVLC platforms in their suite advertise NeTEx + SIRI support. Bulk scheduling export historically flows through TSDE (Trapeze Standard Data Exchange), where GTFS is the long-established default and NeTEx is the newer output. Treat Trapeze NeTEx as vendor-advertised but verify the profile (CEN vs. Nordic vs. EPIP) per installation.

**Nordic PTO/PTA.** Nordic presence asserted by the vendor via DK/NO offices. A specific named list of Nordic PTO/PTA customers is not publicly detailed in collateral — flag for verification at procurement/integration time.

**Gap note.** TSDE exporters historically optimised for GTFS field coverage. Expect ResourceFrame enrichment — Authority vs. Operator split, typesOfValue, Organisation registry — to be a post-export step rather than a turnkey feature.

---

## nPlan (Entur) — non-proprietary, listed for completeness

**Belongs in this axis** because it is a route-planner-that-exports-to-Entur, but it does **not** fit the "proprietary vendor with licensing" framing. nPlan is first-party Entur open-source tooling, not vendor software.

**Scope.** Lightweight timetable editor built by Entur for small PTOs that don't have dedicated scheduling software. Two components, both open source on github.com/entur:

- `uttu` — backend (Java).
- `enki` — frontend (React).

**Advertised NeTEx.** Native NeTEx is the primary output; datasets are ingested directly by Entur's `marduk` pipeline.

**Nordic PTO/PTA.** Used by minor Norwegian PTOs with one or two lines — the "no dedicated scheduling tool" segment.

**Gap note.** Because nPlan is operated inside the Entur ecosystem, the ResourceFrame-ID alignment problem is largely absent: codespace, Operator, and Authority references are provisioned through the same Entur infrastructure.

---

## Turnit (out of scope)

Turnit OÜ (Estonia) produces rail sales, reservation, and inventory systems. It is not a scheduling/planning tool — it consumes service data rather than producing the canonical timetable. Listed here only so readers know why it is absent from the table below.

---

## Summary comparison

| Vendor | NeTEx export | Nordic PTO/PTA footprint | ResourceFrame gap risk |
|---|---|---|---|
| HASTUS (GIRO) | Community/customer converters (no first-party product page found) | Ruter attested; broader list not foregrounded | High — integration layer owns Operator/Authority/Organisation |
| DGPro (DataGrafikk) | Native, vendor-advertised | Norwegian market focus, self-described leader | Low — Nordic profile is core business |
| Trapeze FX | Vendor-advertised (TSDE pipeline; profile varies per install) | Nordic offices DK/NO; named customer list not public | Medium — GTFS legacy, NeTEx newer |
| nPlan (Entur, OSS) | Native | Small Norwegian PTOs | Negligible — operated inside Entur ecosystem |

---

## Closing note: the ResourceFrame-data provisioning gap

Regardless of which tool above produces the timetable:

- A ServiceJourney referencing `OperatorRef`, `AuthorityRef`, `VehicleTypeRef`, or `ResponsibilitySetRef` is only valid if those IDs exist in a ResourceFrame delivered alongside (or pre-registered in the Entur Organisation registry under the operator's codespace).
- Codespace prefixes (`[codespace]:[entityType]:[uniqueId]`, per [rail-best-practices.md](rail-best-practices.md)) must match the operator's Entur assignment — planner-internal IDs typically do not.
- TypeOfValue registries (TypeOfService, Notice, TypeOfProductCategory) are rarely populated by schedulers and must come from a shared Nordic/operator reference dataset.

**Practical consequence:** even with a NeTEx-native planner, plan for a thin ResourceFrame-enrichment/merge stage between the planner export and the Entur submission. This is where the skill's pipeline patterns ([pipeline-patterns.md](pipeline-patterns.md)) and entity-role classification ([real-data-containers.md](real-data-containers.md)) become directly useful.
