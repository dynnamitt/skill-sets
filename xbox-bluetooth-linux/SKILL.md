---
name: xbox-bluetooth-linux
description: >
  Diagnose and fix Xbox controller Bluetooth problems on Linux (Bazzite,
  SteamOS, Fedora, Arch, Ubuntu…): controller never shows up in scans,
  pairing hangs or fails silently, GNOME/KDE pairing does nothing, random
  disconnects, or "I tried the ERTM fix and it didn't help". Covers the
  BLE-vs-classic distinction (Series X|S and firmware-5.x One controllers are
  Bluetooth LE, so ERTM fixes are irrelevant), btmon-based evidence
  gathering, Intel CNVi combo-card (AC 9462/9560, AX2xx) weak LE reception,
  USB dongle and Xbox Wireless Adapter (xone) alternatives, and a
  single-session bluetoothctl pairing workaround. Use this skill whenever the
  user mentions an Xbox / Xbox Series / Xbox One controller, gamepad, or
  other BLE game controller not pairing, not connecting, or disconnecting on
  Linux — even if they only say "my controller won't connect over bluetooth".
metadata:
  author: kdm
  version: "1.1.0"
  verified: "2026-10 — kernel 7.2.7, BlueZ 5.87, Bazzite 44 (Fedora 44)"
---

# Xbox controller Bluetooth on Linux

Most Xbox-controller-on-Linux advice online is about a different controller
generation than the one the user is holding. The single most useful thing
this skill does is stop that cargo-culting: **identify the protocol first,
then gather evidence, then change one variable at a time.** A machine that
has accumulated three rounds of "fix scripts" is harder to debug than a
clean one.

## Step 1 — Identify what you're actually dealing with

| Controller (model) | USB id (wired) | BT id classic | BT id LE | Protocol over Bluetooth |
|---|---|---|---|---|
| Xbox Series X\|S (1914) | `045e:0b12` | — | `045e:0b13` | **LE only** (HID over GATT) |
| Xbox Elite Series 2 (1797) | `045e:0b00` | `045e:0b05` | `045e:0b22` | LE on firmware 5.x, classic before |
| Xbox One S (1708) | `045e:02ea` | `045e:02fd` | `045e:0b20` | LE on firmware 5.x, classic before |
| Xbox One original (1537/1697) | `045e:02d1` / `02dd` | — | — | No Bluetooth — needs the Xbox Wireless Adapter |

Sources: kernel `drivers/input/joystick/xpad.c` (USB ids) and
`drivers/hid/hid-ids.h` (`USB_DEVICE_ID_MS_XBOX_CONTROLLER_MODEL_*`). The BT id
shows up as the modalias in `bluetoothctl info` and as `0005:045E:xxxx` in
`dmesg` once connected — `0b13`/`0b20`/`0b22` confirm an LE link.

Why it matters: **ERTM** (`bluetooth.disable_ertm=1`, `[L2CAP]` tweaks) is a
classic-Bluetooth L2CAP mode. It only ever helped old One S firmware. On an LE
controller it does nothing — if the user has it applied, it is noise, not a
fix. Check quickly:

```bash
lsusb | grep -i 045e                      # plug in via USB to read the model id
cat /proc/cmdline | tr ' ' '\n' | grep -E 'ertm|quirks'
grep -vE '^\s*(#|$)' /etc/bluetooth/main.conf   # look for leftover [L2CAP] etc.
```

Also identify the **adapter**: `lsusb` (USB BT ids), `lspci -nn | grep -i net`
and `journalctl -k -b | grep -i 'iwlwifi.*Detected'` (exact Intel card name —
the BT USB id `8087:0aaa` is shared by 9460/9560/9461/9462, so don't infer the
model from it).

## Step 2 — Classify the symptom, then gather evidence

The daemon (`bluetoothd`) logs almost nothing on failure, so "look at the
journal" usually yields an empty result. Real evidence comes from scans and
`btmon`.

| Symptom | First check | Likely area |
|---|---|---|
| Controller never appears in GNOME/KDE or `scan on` | `bluetoothctl --timeout 15 scan le` vs `scan on` | Adapter LE reception; interleaved discovery |
| Appears, but pairing hangs / fails with no message | `btmon` during the attempt | Passive accept-list stall, missing agent |
| `Failed to pair: org.bluez.Error.AuthenticationFailed` + journal `No agent available for request type 2` | Is an agent registered in the same session? | Missing pairing agent |
| Pairs, then drops during play | Wi-Fi band, USB autosuspend, distance | Coexistence / power management |
| Logo goes solid in ~1 s but PC shows nothing | Something else grabbed it | Another host (console, phone, TV) |
| Was paired, now won't reconnect; journal loops `HID Information read failed: … unlikely error` | `btmon`: `Encryption Change … PIN or Key Missing (0x06)` | Controller lost its bond (paired elsewhere, or a pairing attempt via the wrong adapter) — re-pair |

Comparative signals beat absolute ones. Useful comparisons:
- **Another device** (phone, TV) sees the controller instantly but the PC
  doesn't → the controller is fine; the PC adapter is the problem.
- **`scan le` finds devices but `scan on` finds no LE devices** → the
  adapter's interleaved BR/EDR+LE discovery is broken; desktop UIs use the
  interleaved mode.
- **Count of distinct LE advertisers** in a 60 s `btmon` capture: a handful in
  a residential area, while a second adapter in the same spot sees 30+, means
  weak reception.

Commands and how to read `btmon` output: [references/diagnostics.md](references/diagnostics.md).

The controller's address isn't printed on it. Find it from a scan while it's
in pairing mode: it advertises Microsoft manufacturer data (company id
`0x0006`), appearance `0x03c4` (gamepad) and the HID UUID `0x1812`. The name
may be missing from early advertisements, so match on those fields, not on
"Xbox" in the name. Microsoft OUIs include `A8:8C:3E`, `98:7A:14`, `44:16:22`,
`C8:3F:26` — confirm via `https://api.macvendors.com/<prefix>`.

## Step 3 — Fixes, in order of evidence

1. **Remove cargo-cult leftovers** that don't apply (ERTM karg, `[L2CAP]`
   section — BlueZ logs `Unknown group L2CAP` and ignores it, mistyped
   `usbcore.quirks` letters, invented module params). Reason: every stale
   setting is a variable that muddies later tests. See
   [references/obsolete-fixes.md](references/obsolete-fixes.md).
2. **If the adapter can't hear LE reliably**, settings won't fix it — swap
   hardware: a Realtek RTL8761B(U) USB dongle (e.g. TP-Link UB500), or the
   Xbox Wireless Adapter with the `xone` driver (no Bluetooth at all, lowest
   latency). Then soft-block the onboard adapter so only one is active. See
   [references/adapters.md](references/adapters.md).
3. **If pairing hangs from the desktop UI**, pair from a single
   `bluetoothctl` session with an agent registered and an active LE scan
   still running — bundled as [scripts/ble-pair.sh](scripts/ble-pair.sh). See
   [references/pairing-workarounds.md](references/pairing-workarounds.md) for
   why this works.
   Success looks like `hid-generic`/`microsoft 0005:045E:0B13 … BLUETOOTH HID … Gamepad`
   in `dmesg` — the in-kernel `hid-microsoft` driver is enough. `xpadneo` is
   optional (better rumble/battery) and not present in every image; check
   with `modinfo hid_xpadneo` before claiming the distro ships it.
4. **Disconnects during play** (after pairing works): move Wi-Fi to 5 GHz or
   Ethernet on combo cards, disable USB autosuspend for the adapter, update
   controller firmware (Xbox Accessories app on Windows/Xbox).

## Working principles

- **One variable per test.** Pair each change with a repeatable test (scan
  for N seconds with the controller in pairing mode; count devices; did it
  pair). Revert changes that didn't help — don't stack them.
- **Watch the pairing-mode window.** The logo flashes fast for a limited time,
  then drops to slow flash (unpaired idle). Start captures and scans *before*
  the user presses the pair button, and tell them exactly when to press it.
  "Solid" means connected — to *something*.
- **Separate hosts.** A controller remembers one Bluetooth host. Pairing it to
  a TV/phone replaces the PC pairing; the PC must re-pair afterwards.
- **Name the adapter explicitly.** With two adapters, `hciN` numbers can swap
  between boots and `bluetoothctl`'s `[default]` can be a blocked adapter.
  Pairing through the wrong one wipes the controller's existing bond without
  creating a new one. Use `select <adapter-address>` / `--adapter VID:PID`, or
  remove the second adapter for good (udev `authorized=0`).
- **Watch for adapters coming back.** GNOME's Bluetooth toggle unblocks every
  rfkill-blocked adapter. If a second adapter reappears mid-debugging, results
  get confusing — re-check `rfkill list` before each test.
- **Immutable distros** (Bazzite, SteamOS, Silverblue): kernel args via
  `rpm-ostree kargs`; every new deployment re-resolves layered packages, so
  review `rpm-ostree db diff` before rebooting.

## Worked example

A full anonymised session — Bazzite 44 on an ASRock B660M-ITX/ac with an
Intel AC 9462, Series X|S controller, where four plausible fixes failed and a
USB dongle plus the single-session pairing workaround succeeded:
[references/case-study-bazzite-b660m.md](references/case-study-bazzite-b660m.md).
