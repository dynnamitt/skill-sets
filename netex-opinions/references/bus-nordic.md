# Bus Nordic 2.0 — Nordic Bus Procurement Standard

Version 2.0, December 2023. Joint standard by Nordic transit authorities (SL, Sveriges Bussforetag, Ruter, Svensk Kollektivtrafik, HSL/HRT, Kollektivtrafikkforeningen, Transport). Published at www.partnersamverkan.se.

Defines common functional requirements for public transit buses used in procurement tenders. Built on **ECE R 107** as the EU minimum baseline. A compliant bus should be accepted by any Nordic transit authority.

## NeTEx mapping

Bus Nordic fits the **vehicle functional profile** axis in ResourceFrame — not *how vehicles compose* (rail: CompoundTrain/formation) but *what capabilities and equipment a vehicle class must provide*. Deck plans / spatial layout is a separate axis that cuts across all modes (buses, trains, ferries). Maps to:

- **VehicleType** — class (A/B/I/II/III), length, floor type, capacity
- **FacilitySet / ServiceFacilitySet** — equipment inventory (USB, WiFi, CCTV, climate, alcolock, PIS/ITxPT)
- **AccessibilityAssessment** — reserved seats, wheelchair areas, contrast marking, button heights, ramps
- **PassengerCapacity** — seated/standing/wheelchair breakdown (class-dependent)

The class-to-requirement mapping is the unique content: *which* facilities are mandatory vs optional for *which* bus class.

## Bus classes (ECE R 107)

**Small (<=22 pax + driver):**

| Class | Standing | Seatbelts |
|-------|----------|-----------|
| A | Yes (seats + standing area) | Driver only |
| B | No (seated only) | All seats + wheelchair |

**Large (>22 pax + driver):**

| Class | Standing | Seatbelts | Typical use |
|-------|----------|-----------|-------------|
| I | Yes (frequent boarding) | Driver only | Urban/city |
| II | Limited standing | All seats + wheelchair | Suburban/intercity |
| III | No (seated only) | All seats + wheelchair | Long-distance/coach |

## Bus type reference table

### Class A & I — urban/suburban

| Class | Length | Capacity | Floor | Doors |
|-------|--------|----------|-------|-------|
| A | <=9.5m | <=22 pax (~10 seats) | Low-floor/low-entry | 1-2 |
| I | <=9.5m | 30-50 pax (~20-30 seats) | Low-floor/low-entry | 1-2 |
| I | <=13.5m | 50-80 pax (~25-40 seats) | Low-floor/low-entry | 2-3 |
| I | <=15m | ~100 pax (>40 seats) | Low-floor/low-entry | 2-3 |
| I | <=18.75m | ~120 pax (>40 seats) | Low-floor/low-entry | 3-4 |
| I (high cap) | <=18.75m | <160 pax (30-40 seats) | Low-floor | 4 |

### Class II — suburban/intercity

| Class | Length | Capacity | Floor | Doors |
|-------|--------|----------|-------|-------|
| II | <=9.5m | 30-50 pax (~20-30 seats) | Low-entry/normal | 1-2 |
| II | <=13.5m | 50-70 pax (~35-45 seats) | Low-entry/normal | 2-3 |
| II | <=15m | 70-80 pax (~45-55 seats) | Low-entry/normal | 2-3 |
| II | <=18.75m | ~110 pax (~60 seats) | Low-entry/normal | 2-3 |

### Class B & III — long-distance/coach

| Class | Length | Capacity | Floor | Doors |
|-------|--------|----------|-------|-------|
| B | <=9.5m | <=22 seated | Normal | 1-2 |
| III | <=13m | 35-50 seated | Normal | 1-2 |
| III | <=15m | 50-65 seated | Normal | 1-2 |

### Floor types

- **Low-floor (lavgulv):** Step-free throughout entire length. Seats face both directions.
- **Low-entry (laventre):** Step-free between doors 1 and 2; raised rear section with internal steps.
- **Normal floor:** Standard height, may have wheelchair lift per R 107.

## Requirements by chapter

Items marked *[OPT]* are optional; all others are mandatory. The checklist in Chapter 2 is used during tenders — purchasers tick off which options to include.

### 5 — Safety

- **Seatbelts:** Class B/II/III all seated + wheelchair. 2-point and 3-point approved. 3-point min length 290 cm.
- **Belt alarm:** Audiovisual reminder on belted buses.
- **CCTV prep:** All buses pre-wired for full-coverage CCTV (passenger area + front door + driver area).
- **CCTV recording** *[OPT]*: Full video, min 120h digital storage, subject to local privacy law.
- **Real-time cameras:** Driver sees doors 1-3 on screens when doors open. Split screens OK.
- **Visual aids:** Driver monitors areas outside all exit doors (mirror/camera). Active at stops and when departing.
- **Right-side vision:** Extra mirror or device for cyclists/traffic on right side.
- **Articulated bus vision:** Driver sees door sides on front and rear sections regardless of angle.
- **Reverse camera:** Auto-activating, all buses.
- **Reverse alarm:** White noise. Driver can override.
- **Alcolock:** EU-approved system, all buses.
- **Snow chains:** Must accommodate use and onboard storage.
- **Emergency equipment:** Fire extinguishers + first aid kit, easily accessible, well-marked.
- **Auto fire suppression:** Combustion-engine buses: engine compartment + external heaters. ECE R 107-6+. All buses from 2021. EV standard pending.
- **Auto dimming** *[OPT]*: Headlights to parking lights when doors open.

### 6 — Seats & comfort

- **Finland min seats:** Class I low-floor by length: 12m→31, 13.5m→37, 15m→47, 18.75m→43.
- **Armrests:** Class B/II/III: foldable on aisle-side, must not obstruct seatbelt.
- **Window visibility:** Good for all passengers including wheelchair.
- **Sun protection:** Shading on all passenger windows. If tinted: 50-70% light transmission, uniform.
- **Seat comfort:** Class A/I: 20 min. Class B/II: 60 min. Class III: several hours.
- **Seat positions:** Low-entry: max 50% on podest >250mm. Others: max 70%. Forward-facing preferred.
- **Seat height:** 450-500mm above floor. Reserved seats always min 450mm.
- **Seat pitch (H):** Class A/B=680mm, I=680mm, II=710mm, III=750mm (at 620mm above floor). 15% may deviate if R107-compliant.
- **Reserved seats:** Class I/II: min 4. Class A/B/III normal-floor: min 2. Low-floor buses: on low area. Articulated: front section.
- **Guide dog seat:** Class I >11m: 2 seats behind driver, window-side foldable if legroom <450mm.
- **Blind area** *[OPT]*: Reserved + marked for blind + guide dogs.
- **High seatbacks:** Class B/II/III: integrated headrest, backrest min 700mm.
- **Adjustable seatbacks** *[OPT]*: Class B/II/III.
- **Child seats** *[OPT]*: Class II/III: min 2 child seats (ECE R44.03+), plus 4 Isofix (ISO 13216), 1 per double seat, front section.
- **Reading lights** *[OPT]*: Class B/II/III: individual per seat on normal-floor section. Must reach wheelchair users.
- **Climate control:** Auto, 18-22C passenger area. Outside >25C: up to 26C allowed. Outside <5C: down to 16C (30 min after start).
- **Air quality:** No drafts. Pollen + particle filters. Anti-condensation. Class III: individual vents per seat.
- **USB charging:** Min 85% of seats + min 1 in wheelchair area. Dual USB-A + USB-C, min 2.1A, surge protection, illuminated.
- **Toilet** *[OPT]*: Class II/III with sink option.

### 7 — Boarding, alighting & interior movement

- **Driver-passenger communication:** Simple communication during boarding (e.g. ticket control). Not for BRT.
- **Door openings:** All buses >9.5m: min 2 doors.
- **Finland doors:** Class I low-floor: >13m→3 doors, <=15m→3 doors.
- **Contrast marking:** Floors, door mechanisms, steps, podests: min 0.4 NCS contrast vs surroundings.
- **Handrails:** R107 minimum. Contrast min 0.4 NCS. Also in wheelchair area.
- **Wheelchair area:** All classes (except Class I only) per ECE R 107 Annex 8. Articulated: min 1 in front section.
- **Flex area:** Left side, for strollers + standing. Min 1300mm each. By class: A=1300mm, I=1800-2500mm, I artic=1800-2500mm+1300mm, II=1300-1800mm (adjustable/removable seats).
- **Stroller restraints:** Min 3 straps.
- **Door lighting:** Per R107 7.6.12.
- **Luggage storage** *[OPT]*: Class II/III normal floor.

### 8 — Information & communication

**External:**
- Programmable line/destination signs, changeable from driver seat.
- Readable: min 0.6 NCS contrast.
- Front + right-side signs on all buses. Class I: line number at right of front door.
- *[OPT]* Additional signs: Class II/III right side, articulated rear, bus rear, left side.
- External speaker prep (downward-facing, front door; articulated also rear door).
- *[OPT]* External speakers installed.

**Onboard:**
- PIS, ticketing, counting systems. Cable conduits for future changes. ITxPT S01 compliance.
- Audiovisual: good for all including wheelchair.
- Internal speakers: handsfree mic, passenger speakers separate from driver speakers.
- Driver speakers auto-mute when mic used. Driver radio auto-mutes when front door opens.
- Stop buttons: red, white braille text, audio + visual signal. Evenly distributed. At reserved seats + wheelchair area: wall-mounted, 700-1000mm height.
- Attention request buttons: blue, accessibility pictograms (wheelchair/stroller/person), audio + visual. Near reserved seats + wheelchair area, 700-1000mm.
- External signal buttons: on bus exterior for wheelchair/stroller users. Visible symbol, LED ring, audio to driver.
- WiFi *[OPT]*: sufficient for mobile data.

### 9 — Exterior

- **Bicycle rack prep:** Class II/III without luggage space: prepped for external rack (2 bikes, 25kg each).
- **Bicycle rack** *[OPT]*: Installed.
- **Flag holder** *[OPT]*: Both front corners, all classes except III and double-deckers.
- **NATO connector:** Class I/II/III.

### 10 — Driver environment

- **Ergonomics:** Per ISO 4040, ISO 16121-1, ISO 16121-3. As large as technically possible. Adjustable seat + steering.
- **Climate:** Own zone, independent of passengers. Winter: min +15C after 30 min (ISO 6549). Summer (>25C): lower by min 3C vs outside. Defroster per ISO 16121-4. Sun shading for front + side windows.
- **Handsfree phone:** If mounted, must be handsfree.
- **Driver seatbelt:** 3-point, all classes. Upper anchor vertically adjustable.
- **Door interlock:** Cannot drive until doors closed; doors cannot open until stopped.
- **Parking brake alarm:** Warns if driver leaves seat with brake disengaged.
- **Security alarm:** Connected to security central. Hidden but driver-accessible. No accidental triggering.
- **Protection wall (NEW v2.0):** Class I/II: screen/wall behind + partially beside driver to prevent assault.
- **Safety screen:** Class I: option to install/remove full partition.
- **Lockable cabinet** *[OPT]*: Storage for driver.
- **Collision safety (NEW v2.0):** Class I/II/III first-registered from Oct 2023: frontal protection per ECE-R 29 section 5, pendulum test per Annex 3 Test A.

## Nordic-specific additions beyond EU/R107

1. Alcolock mandatory (not EU-required)
2. Snow chain accommodation (Nordic climate)
3. Climate control with Nordic temperature ranges (+18-22C, cold-start allowance)
4. USB charging at 85% of seats
5. Driver protection wall (v2.0 addition)
6. Reverse camera + white-noise alarm on all buses
7. External signal buttons for wheelchair/stroller users
8. Contrast marking using NCS (Nordic Color System) — min 0.4 NCS
9. Finland-specific minimum seat/door counts for Class I
10. ITxPT S01 compliance for onboard IT architecture
11. Pollen + particle filters mandatory
12. NATO connector for external power
