# NeTEx Rail Best Practices

Distilled from "Best Practices for using NeTEx with particular regard to Rail Services" by Mike Stallybrass (Stallybrass Associates LLP), January 2025. Based on operational experience in Norway and Sweden with Nordic Profile NeTEx for rail, ticketing, seat reservation, and SIRI real-time feeds.

## Core principle

NeTEx describes the **planned timetable** from the **individual passenger's** perspective — journey opportunities offered as an unbroken journey in the same seat. It is distinct from TAF/TAP TSI telematics, which describes infrastructure movements for aggregated sets of passengers.

- **NeTEx** = planned timetable (anonymous resource types)
- **SIRI** = operational implementation of that plan (named physical resources)

## Profiles

Two main profiles govern what NeTEx features are available:

| | Nordic Profile | EPIP |
|---|---|---|
| Frame types | 5 + VehicleScheduleFrame, FareFrame | 5 only (Resource, Site, Service, Timetable, ServiceCalendar) |
| Journey types | ServiceJourney, DeadRun, DatedServiceJourney | ServiceJourney only |
| Routes | Mandatory (2 per Line, one per direction) | Optional |
| JourneyPattern | JourneyPattern | ServiceJourneyPattern |
| Calendar | Individual DayTypes per day typical | UicOperatingPeriod + DayType typical |
| Versioning | Incremental versions | `version=0` for snapshots |

Blue text = Nordic-specific, bronze text = EPIP-specific in the source document.

## Package structure

A NeTEx **Package** is a self-contained zip of one or more XML files:
- **Shared file(s)**: prefixed with `_` (e.g., `_GOA_Shared.xml`). Contains data common to all lines.
- **Line-specific file(s)**: one per Line (e.g., `GOA_L5.xml`). Contains that Line's routes, journeys, patterns.

Each file has a `PublicationDelivery` wrapper containing either a single `Frame` or a `CompositeFrame` with shared `validityConditions`, `codespaces`, and `FrameDefaults`.

**Guiding principle**: use the simplest method of expressing something. Avoid `keyList`/`KeyValue` extensions — if the standard doesn't support it, enhance the standard rather than using local extensions.

## Frame types and their contents

### ResourceFrame (shared)
- **organisations**: Authority, Operator (with contact details, company numbers)
- **vehicleTypes**: for rail, a Train (set of elemental vehicles) or CompoundTrain
- **vehicles**: the TrainElements (coach types) with capacities, fare class, type (carriage, engine, sleeperCarriage, restaurantCarriage)

### SiteFrame (shared)
- **stopPlaces**: each with Name, GPS Centroid, list of Quays (platform/bus-stop)
- Omitted in Nordic Profile when using Norway's National Stop Register (NSR) — referenced externally

### ServiceFrame — shared flavour
- **Network**: umbrella for all Lines in the package
- **routePoints**: geographic location + projection to ScheduledStopPoint
- **destinationDisplays**: front-of-vehicle display text (referenced by first stop in JourneyPattern)
- **scheduledStopPoints**: each with Location, Label, VehicleModes
- **stopAssignments**: links ScheduledStopPoint → Quay (in SiteFrame or external)
- **notices**: optional shared notices

### ServiceFrame — line-specific flavour
- **routes**: ordered pointsInSequence of PointOnRoute → RoutePoint. Two per Line (one per direction). No need for a different route per JourneyPattern.
- **lines**: normally one Line definition per file, with TransportMode, PublicCode, OperatorRef, RepresentedByGroupRef → Network
- **journeyPatterns**: pointsInSequence of StopPointInJourneyPattern → ScheduledStopPoint, with ForAlighting/ForBoarding/RequestStop attributes and DestinationDisplayRef on first stop

### ServiceCalendarFrame (shared)
- **dayTypes**: flexible — can represent a single day or a complex pattern
- **operatingDays**: single CalendarDate each (used by DatedServiceJourneys)
- **operatingPeriods** / **UicOperatingPeriod**: FromDate, ToDate, ValidDayBits bitmask
- **dayTypeAssignments**: links DayType → OperatingDay/Date or OperatingPeriod

### TimetableFrame (line-specific)
- **vehicleJourneys**: ServiceJourney (passenger), DeadRun (empty movement, Nordic only), DatedServiceJourney, DatedVehicleJourney
- **trainNumbers**: TrainNumber.ForAdvertisement (commercial) and ForProduction (infrastructure)
- **serviceFacilitySets**: facilities available (Wi-Fi, catering, etc.)
- **journeyInterchanges**: guaranteed connections between journeys

### VehicleScheduleFrame (shared or line-specific)
- **blocks** / **TrainBlocks**: each Block covers a journey (or set of journeys) with one or more blockParts
- Links to TimetableFrame: Transmodel requires 1:1 JourneyPart↔BlockPart, but NeTEx short-circuits to Block↔Journey when only one part exists
- Line-specific if all vehicles captive to one line; otherwise shared
- Cannot describe static activities (refuelling, recharging) — movement data only

### DriverScheduleFrame
- Crew resource deployment — WIP, currently bus drivers only

## ID conventions

Pattern: `[codespace]:[entityType]:[uniqueId]`

- Characters: upper/lower letters, numerals, minus, underscore. No spaces, no language-specific characters (Ø, Å), no `%` or `@`.
- Human-readable IDs preferred over computer-generated UUIDs (aids debugging).
- Make IDs **informative but never parse them** — e.g., `GOA:DayType:2024-02-12-Mon` is readable but the date/weekday must not be extracted programmatically from the string.

## Versioning rules

- Increment version by **1** on each meaningful change. Avoid date/time-based version numbers.
- **Same-file references**: must include `version` attribute (magenta/pink in source examples).
- **Cross-file references** (within package): do **not** include version.
- **External package references**: do **not** include version, unless pinning a specific version (use `versionRef`).
- Snapshot packages (no persistence): use `version=0` (EPIP pattern).
- No multiple versions of the same entity in one package.
- Use `created` and `changed` attributes for timestamps, not version numbers.

## Calendar modeling

### Three approaches (simplest to most complex)

1. **One DayType per day** (Nordic typical): Each DayType represents a single date. DayTypeAssignment links each DayType to a Date. ServiceJourney references multiple DayTypeRefs.

2. **UicOperatingPeriod** (EPIP typical): One DayType per ServiceJourney, linked via DayTypeAssignment to a UicOperatingPeriod with `ValidDayBits` bitmask (1=runs, 0=doesn't). Period length = string length.

3. **OperatingPeriod with qualifiers**: Start/end date + undated pattern (weekdays, monthly, etc.) refined by multiple DayTypeAssignments that add/subtract dates. Order of qualifier application is critical. **Best practice: avoid unless there's a firm business reason** — they become unmanageable with short-term changes. An OperatingPeriod can always be converted to a flat list of dates, but not vice versa.

### Daylight saving

To avoid ambiguity with times between 01:00–02:59 on clock-change dates: express all post-midnight times as previous-day times + DayOffset of 1. Effectively, the operational day runs 03:00→03:00, not 00:00→24:00. This is already common practice for late-night services.

## ServiceJourney structure

Mandatory elements:
1. **JourneyPatternRef** (with `version` — same file, different frame)
2. **passingTimes**: one TimetabledPassingTime per StopPointInJourneyPattern

Optional but recommended:
- Name, Description, PrivateCode (database identifier)
- TransportMode + TransportSubMode (at both Line and ServiceJourney level — critical for rail disruptions where some journeys become `bus`/`railReplacementBus`)
- dayTypes (unless using DatedServiceJourneys)
- OperatorRef, LineRef, CompoundTrainRef

### passingTimes

Each TimetabledPassingTime references a StopPointInJourneyPattern (not a stop directly). It contains:
- ArrivalTime + DepartureTime (one omitted if ForBoarding=false or ForAlighting=false)
- ArrivalDayOffset / DepartureDayOffset for post-midnight times

### JourneyPattern

- References a Route (same file) and contains ordered pointsInSequence
- Each point is a **StopPointInJourneyPattern** (or **TimingPointInJourneyPattern** in Nordic, for non-stop timing points like border crossings)
- First stop: `ForAlighting=false`, plus DestinationDisplayRef
- Last stop: `ForBoarding=false`
- Request stops: `RequestStop=true`
- Shared across multiple ServiceJourneys — each StopPointInJourneyPattern must be referenced exactly once per journey's passingTimes

## Train formation hierarchy

```
CompoundTrain (top-level VEHICLE TYPE)
 └─ TrainInCompoundTrain (ordered front→back, with OperationalOrientation)
     └─ Train (deployment unit — cannot be split operationally)
         └─ TrainComponent (wrapper: adds Label, OperationalOrientation)
             └─ TrainElement (coach type: capacities, fare class, facilities)
```

### Key rules

- **Always use CompoundTrain as top level**, even for a single Train
- **CompoundTrain must be powered** — individual Trains need not be
- **OperationalOrientation**: `forwards` or `backwards` relative to the vehicle's design drawings (A-end vs B-end)
- **Components ordered front→back** in the direction of travel
- **Label convention**: Label present → seats reservable. No Label → not reservable. `status=inactive` → not available for passenger use (locked coach, etc.)
- **TrainElements**: defined in the `vehicles` group of ResourceFrame, referenced by TrainComponents. Best practice: always define in the separate vehicles group, not inline.

### Simplified forms (when detail isn't needed)

- **TrainSize.NumberOfCars**: just the car count, no component detail
- **TrainSize.TrainSizeType**: `short` / `normal` / `long` (e.g., 4-car = short, 8-car = normal, 12-car = long)

### Formation changes mid-journey

The CompoundTrain morphs at:
- **Reversals**: components reordered (orientation changes)
- **Coach locking/unlocking**: status changes without physical vehicle change
- **Couchette day/night switch**: capacity changes at configuration switch point
- Each change requires a new JourneyPart break and updated CompoundTrain

## DatedServiceJourneys (DSJ)

### Why they exist

ServiceJourney IDs are **inherently unstable** in rail. After publication, infrastructure changes or rolling-stock availability can force the ServiceJourney to be replaced (new ID). Over 70% of a heavy-rail planner's work is post-publication adjustments. If ticket sales or seat reservations are recorded against the ServiceJourney ID, they break.

### How they work

DSJ is a **link class**, not a fully populated entity:
- References a **ServiceJourney** (with version)
- References an **OperatingDay** (single date)
- Optionally references a **TrainBlock** (rolling-stock assignment)

The ServiceJourney itself becomes **undated** — its `dayTypes` block is empty. One DSJ is created per operating day.

### ID stability under disruption

When a timetable change forces a new ServiceJourney (new ID + version):
- The DSJ's **ID stays the same** — only `version`, `changed`, and `ServiceJourneyRef` are updated
- For radical changes (e.g., train replaced by bus-train-bus), original DSJ is replaced by new DSJs
- Each replacement DSJ contains **backwards references** to the original (via `replacedJourneys` wrapper — CEN-approved format)

### What to avoid

- **NormalDatedServiceJourney**: exists in schema but not recommended. Instead, any DSJ with `version=0` and no `ServiceAlteration` is an unchanged journey.

## Separation of concerns

Rail services often involve multiple organisations:

| Concern | Frame | Owner |
|---|---|---|
| Passenger timetable | TimetableFrame | Operator |
| Rolling stock deployment | VehicleScheduleFrame | Rolling Stock Provider |
| Crew scheduling | DriverScheduleFrame | Operator / subcontractor |
| Infrastructure paths | (outside NeTEx — TAF/TAP TSI) | Infrastructure Provider |

TrainBlock always describes the **complete** formation of each TrainBlockPart, including coaches from other ServiceJourneys sharing the same physical train. This is what drives on-station displays showing the full train.

On parallel JourneyPartCouples (split/join segments), a single shared TrainBlockPart + CompoundTrain serves all linked JourneyParts.

## Rail-specific patterns

### Splits and joins
- **JourneyPart** breaks wherever trains split, join, or reverse
- Parallel JourneyParts linked via **JourneyPartCouple**
- JourneyPartCouple members may be on different OperatingDays (calendar offset — the only way to detect this is by comparing the OperatingDay references, as there's no explicit attribute)

### Cross-border services
- **TimingPointInJourneyPattern** (Nordic only) for non-stop border points where the infrastructure provider changes
- JourneyPart break at border even though no passenger stop exists
- Trains 3962–3965 retained alongside passenger ServiceJourneys 93/94 to maintain the infrastructure provider view

### Over-midnight journeys
- ArrivalDayOffset / DepartureDayOffset on TimetabledPassingTime
- OperatingDay for DSJ refers to the departure date of the first segment

## Source

Stallybrass, M. (2025). "Best Practices for using NeTEx with particular regard to Rail Services." Stallybrass Associates LLP. Examples based on GoAhead Nordic (Norway) and Vy (Sweden/Norway) operational data from 2020–2024.
