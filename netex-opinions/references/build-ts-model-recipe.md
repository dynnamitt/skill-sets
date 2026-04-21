# Recipe: build a TypeScript model for a NeTEx target

End-to-end procedure for turning a user prompt like *"build a ts model for ResourceFrame"* into self-contained TypeScript files using `netex-typescript-model`'s `ts-gen.ts`. Follow the steps in order; interview the user at Step 3 before invoking anything.

## Step 0 — Locate or acquire the checkout

The canonical tool is `ts-gen.ts` inside the `netex-typescript-model` repo. It needs the full repo present (not just the script), because it consumes generated JSON Schema and imports from `html-ts-gen/scripts/lib/`.

Search order:

1. `~/entur/netex-typescript-model/` — the user's conventional location. If present, use it.
2. Any path the user mentions explicitly — prefer it over the default.
3. Otherwise clone fresh:
   ```bash
   git clone https://github.com/entur/netex-typescript-model.git
   cd netex-typescript-model
   ```
   Ask the user first where to clone (home, `/tmp`, somewhere else).

From here on, `$REPO` means the chosen checkout root.

## Step 1 — Ensure the base assembly is built

`ts-gen.ts` loads `$REPO/generated-src/base/base.schema.json` via `loadNetexLibrary()`. If that file is missing, the tool fails. Check first:

```bash
test -f "$REPO/generated-src/base/base.schema.json" && echo PRESENT || echo MISSING
```

If missing, build it. First-time setup needs `cd $REPO/html-ts-gen && npm install` (once), then from the repo root:

```bash
make all
```

This downloads XSDs, runs the GraalJS converter, produces JSON Schema + HTML viewer + monolithic TypeScript + TypeDoc. Expect a few minutes on first run; re-runs are incremental no-ops.

Prerequisites: JDK 21+ (any distribution), Node.js 22+, Maven 3+.

## Step 2 — Validate the target name exists

Entity names are case-sensitive. Unknown targets are skipped by `ts-gen.ts` with only a warning, so catching typos early saves a round-trip:

```bash
jq -r '.definitions | keys[] | select(test("^<Name>$"; "i"))' \
  "$REPO/generated-src/base/base.schema.json"
```

If the user typed `vehicletype`, the canonical form is `VehicleType`; `resourceframe` → `ResourceFrame`; `serviceJourney` → `ServiceJourney`. Correct silently and confirm with the user.

## Step 3 — Interview the user

Ask only what you can't reasonably default. Group related questions and present them together.

**Always ask:**

- **Which target entity or entities?** (You already have this from the prompt, but confirm spelling if there was ambiguity above.)

**Ask when the target is a frame** (`ResourceFrame`, `ServiceFrame`, `TimetableFrame`, `SiteFrame`, `FareFrame`, `GeneralFrame`, `VehicleScheduleFrame`):

- **Container or individual members?** — A frame target emits the whole container plus every frame-member's transitive deps, which is large. If the user only cares about e.g. `VehicleType` and `Organisation`, generating those directly is almost always what they want. Offer the choice.
- If they still want the frame itself, **strongly default** to `--collapse-refs --collapse-collections`. Without collapse, the output is deeply nested and very large.

**Ask when the downstream consumer is known** (e.g., hathor, NeTEx-Deckplan-Editor, a new project):

- **Properties to exclude?** — Downstream consumers usually strip base scaffolding (`brand`, `validityConditions`, etc.) or unused fields. If the user mentions a specific consumer, check `$REPO/gen-samples/` — there may already be a wrapper script (`gen-vehicle.sh`, `gen-vehicletype.sh`, `gen-deckplan.sh`) encoding their exclusion list.
- **Collapse refs?** (`--collapse-refs`) — usually yes for downstream consumers: replaces `VersionOfObjectRefStructure` with `Ref<'Entity'>` / `SimpleRef`. Say no only if the consumer genuinely needs the wrapper structure.
- **Collapse collections?** (`--collapse-collections`) — usually yes: unwraps single-child `_RelStructure` wrappers to the child entity type.

**Default silently unless the user hints otherwise:**

- `--dest-dir` → `/tmp` (offer `./out` if the user wants files in the repo tree)
- `--suffix` → none (offer when the user says things like "tag it with the consumer name")
- `--overwrite` → false (flip to true only if the user confirms)

## Step 4 — Pick the invocation

Check `$REPO/gen-samples/` first — if a wrapper matches the target+consumer, use it verbatim:

```bash
cd "$REPO/gen-samples"
./gen-vehicle.sh --dest-dir ./out            # Vehicle, collapse both on
./gen-vehicletype.sh --dest-dir ./out        # VehicleType with hathor excludes
./gen-deckplan.sh --dest-dir ./out           # DeckPlan with NeTEx-Deckplan-Editor excludes
```

Otherwise invoke `ts-gen.ts` directly from `html-ts-gen/`:

```bash
cd "$REPO/html-ts-gen"
npx tsx scripts/ts-gen.ts \
  --dest-dir /tmp \
  --collapse-refs --collapse-collections \
  --exclude prop1,prop2 \
  --suffix -v1 \
  --overwrite \
  TargetName [AnotherTarget ...]
```

Multiple targets in one invocation is the norm — each produces its own `<Name>.ts` + `<Name>-mapping.ts` pair.

## Step 5 — Verify

`ts-gen.ts` automatically runs `tsc --noEmit --strict --skipLibCheck` on every generated file and prints `PASS <path>` or `FAIL <path>` per target. Exit code is 0 iff every target passed.

**If FAIL:** read the `tsc` diagnostics printed above. Common causes:

- A property type resolves to something `tsc --strict` rejects (e.g. a reference into a type the converter couldn't classify). Collapse flags often resolve this by sidestepping the problematic wrapper — try adding `--collapse-refs` or `--collapse-collections` if not already on.
- An `--exclude` list is too aggressive and stripped a required property. Remove entries one at a time.
- Genuine upstream bug: the converter mis-stamped something. Report against the project's `TODO.md` issue list; do not paper over with `@ts-ignore`.

**If PASS:** confirm the output files landed where expected:

```bash
ls -la <dest-dir>/<Name>*.ts
```

## Step 6 — Report

Tell the user:

1. Which files were produced and where (absolute paths)
2. Which collapse flags / excludes were applied
3. Any targets that were skipped with "not found in schema" warnings (should be zero if Step 2 was done properly)
4. How to consume the files: the `.ts` file is the interface graph; the `-mapping.ts` file contains the XML serialization helpers. Both are self-contained — no imports from the generator repo are needed at runtime.

Do not run `make clean` or touch the checkout state at the end. The user may want to iterate.

## Common patterns, cheat sheet

| User prompt | Likely invocation |
|---|---|
| "ts model for VehicleType for hathor" | `gen-samples/gen-vehicletype.sh` |
| "ts model for Vehicle" | `gen-samples/gen-vehicle.sh` |
| "ts model for DeckPlan for deckplan editor" | `gen-samples/gen-deckplan.sh` |
| "ts model for ResourceFrame" | Offer individual-members alternative first; if they insist on frame: `ts-gen.ts --collapse-refs --collapse-collections ResourceFrame` |
| "ts model for ServiceJourney + DatedServiceJourney" | `ts-gen.ts --collapse-refs --collapse-collections ServiceJourney DatedServiceJourney` |
| "just the interface, no XML mapping" | Both files are emitted together by `ts-gen.ts` — tell the user they can ignore `-mapping.ts` rather than suppress it |

## What the recipe deliberately does not cover

- Modifying the converter itself (`xsd-to-jsonschema.js`) or the `lib/` codegen modules — if a generated output is wrong in a non-user-fixable way, file it against the upstream project rather than hand-patching.
- Building a different assembly than `base` (e.g., `network+timetable`) — only required if the target lives in an optional part. Most user-facing entities (VehicleType, Organisation, Vehicle, DeckPlan) live in the framework and are already in `base`. If a target isn't in `base`, re-run `make all ASSEMBLY=<name>` before Step 4.
- Vendoring the output into a consumer project — out of scope; that's the consumer's concern.
