# busphoto.eu — Real-World Fleet Data for ResourceFrame

Community-edited bus photo + vehicle database (since 2002, volunteer editors per country/city, UI in ~35 languages incl. Norsk). The one concrete enthusiast source that links **fleet number ↔ registration plate ↔ model code ↔ operator** for Norwegian buses. Useful for seeding `Vehicle` / `VehicleType` / `VehicleModel` test data and for cross-checking. **Not authoritative** — no API, no export, no licence for reuse of images.

Observations below sampled Oct 2026 (Norway index + Oslo, Bergen, Trondheim, Stavanger, Drammen, Kristiansand, Tromsø, Skien).

## Site structure and URLs

| Page | URL | robots.txt |
|------|-----|-----------|
| Country index (Norway = 19) | `/country/19/` | allowed |
| City/system (operators per city) | `/city/{id}/` | **disallowed** |
| Vehicle | `/vehicle/{id}/` | allowed |
| Model | `/model/{id}/` | allowed |
| Photo | `/photo/{id}/?vid={vehicleId}` | allowed |
| Fleet lists | `/list.php?cid=` city, `did=` facility, `mid=` model, `rid=` country (combinable) | **disallowed** (`/list`) |
| Search / model index | `/search`, `/vsearch`, `/models` | **disallowed** |

"Facility" = one operator legal entity **within one city**. The same company appears as separate facilities in each city (e.g. Vy Buss AS in Oslo, Bergen, Trondheim each have their own `did`).

## Vehicle page → NeTEx (verified against NeTEx v2.0 XSD)

| busphoto field | NeTEx element | Notes |
|----------------|---------------|-------|
| `# 3334` in title | `Vehicle/OperationalNumber` | Fleet number (VehicleCodeGroup) |
| License Plate # | `Vehicle/RegistrationNumber` | Key for Statens vegvesen lookup |
| VIN | `Vehicle/ChassisNumber` | +v2.0 element — no KeyList needed |
| Built | (`Vehicle/BuildDate`) | `xsd:date`, so a bare year doesn't fit — omit rather than invent `2023-01-01`; take `RegistrationDate` from vegvesen |
| Facility | `Vehicle/TransportOrganisationRef` (`OperatorRef`) | Legal entity, possibly historical — see below |
| Model | `VehicleModel/Manufacturer` | Often **only the make** ("Golden Dragon") |
| Remarks | `VehicleModel/Name` | Often holds the **real model code** (`XML6121JE`) |
| Current state | validity / omit | "In operation" is editor-maintained, can lag |
| City | — | Not a Vehicle property; depot is a separate concern |

`Vehicle` links its type via `TransportTypeRef` (substitute `VehicleTypeRef`) and its model via `VehicleModelRef`. `VehicleType` carries `Length`, `PropulsionType` (`combustion`/`electric`/`electricAssist`/`hybrid`/…), `FuelType`, `LowFloor`, `HasLiftOrRamp`, and `capacities/PassengerCapacity` (`SeatingCapacity`, `StandingCapacity`, `WheelchairPlaceCapacity`, `PushchairCapacity`).

**busphoto never gives** length, propulsion, floor type or capacities. Don't derive them from a model code — get them from the Statens vegvesen plate lookup (length, seats/standing, fuel/energy, Euro class) or the operator/PTA announcement. Only then assign a Bus Nordic class (see [bus-nordic.md](bus-nordic.md)).

## Norway coverage

- **176 places**, keyed by **pre-2020 municipality names** (Skedsmo, Nøtterøy, Re, Fjell) — not current counties, not Entur codespaces. Catch-all: "Norway, others".
- **Density follows local photographers, not network size.** Top contributor per city (Oct 2026): Bergen 256 photos, Trondheim 228, Oslo 62, Tromsø 41, Drammen 37, Stavanger 5, Kristiansand 3.

| Tier | Places | Expect |
|------|--------|--------|
| Dense | Oslo (56 facilities), Bergen (40), Trondheim (26) | Current operators present incl. Vy Buss AS; most vehicles with plates |
| Medium | Drammen, Tromsø, Stavanger (24) | Historical entities dominate; current contract holder may be missing |
| Thin | Most of the 176 | A few legacy operators, years-old photos, or nothing |

- **Facility status flag (Operating / Liquidated) is unreliable.** Long-gone or renamed entities still show "Operating": Nettbuss (renamed Vy 2019), Veolia Transport Sør, Connex Vest, NSB Biltrafikk. A city list is *who has run buses there*, never *who holds today's contract*.
- **Current contract holders are often absent** outside the dense tier (e.g. no Vy Buss AS facility in Stavanger, Kristiansand or Skien).
- Some facilities are named after private individuals (sole proprietors) — don't copy those names into test data or docs.

## Access rules

- **Respect robots.txt**: no crawling of `/city`, `/list`, `/search`, `/models`. Bulk fleet-list scraping is out.
- **Allowed**: manual browsing; occasional fetch of individual `/vehicle/{id}/` or `/model/{id}/` pages at human pace.
- **Images**: "Using any images from this website without authors' permission is prohibited." Never download, embed or republish photos. Link to the photo page at most. For reusable images use Wikimedia Commons (per-file licence + author).
- For a dataset, ask the admins (feedback page) for permission/export rather than scraping.

## Trust ladder

1. **Statens vegvesen kjøretøyregister** (per plate) — make, model, length, capacities, fuel, first registration. Authoritative.
2. **Entur NeTEx/SIRI for the PTA codespace** (Ruter `RUT`, Skyss `SKY`, AtB `ATB`, Kolumbus `KOL`, …) — authoritative Operator records/IDs; SIRI-VM `VehicleRef` gives fleet numbers.
3. **PTA / operator contract announcements, Doffin tenders** — who runs what, fleet counts, propulsion requirements.
4. **busphoto.eu** — fleet-number ↔ plate ↔ model-code linkage. Cross-check before use.
5. Guesses — label as such. **Never name a source you have not checked exists** (no "bussfoto.no-style sites").

## Workflow: real Vehicle records for a Norwegian operator

1. Find the current operator for the area via the PTA or Entur (rung 2–3), not busphoto's city list.
2. Look up that operator's legal-entity name in a dense-tier city, or a known vehicle page.
3. Per vehicle page: take fleet number, plate, VIN, build year, make + model code (Remarks).
4. Per plate: Statens vegvesen → length, capacities, fuel/propulsion, low-floor.
5. Group vehicles by model code + specs → one `VehicleType` (+ `VehicleModel`) each; assign Bus Nordic class from length/floor/standing.
6. Operator ID from the PTA codespace in Entur data, not invented.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `VehicleModel/Name = "Golden Dragon"` | Make goes in `Manufacturer`; model code from Remarks |
| Inferring diesel/high-floor/Class II from a model code | Plate lookup first; class last |
| VIN in `KeyList` | `Vehicle/ChassisNumber` (NeTEx v2.0) |
| `OperatorRef` from a facility marked "Operating" | Current operator from PTA/Entur |
| Crawling `/city/` or `list.php` | Disallowed; manual or permission |
| Copying photos into a demo | Link out or use Commons |
