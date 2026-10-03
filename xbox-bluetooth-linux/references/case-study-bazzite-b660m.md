---
name: case-study-bazzite-b660m
description: Anonymised end-to-end debugging session — Xbox Series X|S controller on Bazzite 44, ASRock B660M-ITX/ac with Intel AC 9462, solved with a TP-Link UB500 dongle and single-session bluetoothctl pairing.
---

# Case study: Bazzite 44, ASRock B660M-ITX/ac, Intel AC 9462 (2026-10)

## Setup

| | |
|---|---|
| Distro | Bazzite 44 (Fedora 44, rpm-ostree), GNOME, deck-nvidia image |
| Kernel / BlueZ | 7.2.7 (Bazzite/OGC build), BlueZ 5.87 |
| Board | ASRock B660M-ITX/ac |
| Onboard Wi-Fi/BT | Intel Wireless-AC 9462 — CNVi, 1x1, PCI `8086:7af0`, BT `8087:0aaa`, BT fw `ibt-1040-1020` build 151 |
| Controller | Xbox Series X\|S (1914), USB `045e:0b12`, BLE `045e:0b13`, BT HID v5.24 |
| Final adapter | TP-Link UB500, RTL8761BU, `2357:0604` |
| Nearby | Logitech Unifying receiver on the same board; a smart TV that also pairs gamepads |

User report: "known distro/kernel/mobo Bluetooth issue; earlier remedy scripts
didn't fix my Xbox connection." Older kernels had paired the controller fine.

## Timeline

1. **Audit.** Found `bluetooth.disable_ertm=1`, `usbcore.quirks=8087:0aaa:i`
   (wrong letter) and an `[L2CAP] Mode=ertm` block — all from an old script
   aimed at classic-BT One S controllers. The controller is LE, so none of it
   applied. Removed the kargs (`rpm-ostree kargs --delete`); noticed the new
   deployment would swap a layered package and pinned it by name.
2. **Clarified the symptom.** The user's problem was not disconnects: the
   controller **never paired**. Assuming "disconnects" (from the old notes)
   cost time — ask early.
3. **Hypothesis: 2.4 GHz coexistence.** Moved Wi-Fi to 5 GHz → no change.
4. **Scan comparison.** `scan on` (interleaved): zero LE devices. `scan le`:
   a handful of devices; the controller appeared once with no name. An OUI
   lookup showed the address belonged to Microsoft — the controller.
5. **btmon.** Active 100 %-duty LE scan, filter accept-all — and only 3
   advertisers in 70 s, none from the controller.
6. **Hypothesis: something else grabs it.** The logo went solid fast once. The
   TV's own Bluetooth search found the controller *instantly* (and wasn't
   paired to it) → the controller was fine; the PC was the problem.
7. **Hypothesis: Wi-Fi coexistence, strongly.** Script turned Wi-Fi off for
   75 s (and back on automatically) while scanning → still not seen.
8. **Hypothesis: LL privacy.** `Privacy=off` → still not seen.
9. **Antenna check.** `Available Antennas 0x1` — normal for a 1x1 9462, not a
   fault. Four hypotheses had failed → stopped tuning and proposed hardware.
10. **USB dongle.** TP-Link UB500 heard the controller within 13 s, with its
    name, and 33 devices total. The first scripted `pair` connected instantly
    but failed with `AuthenticationFailed` / `No agent available for request
    type 2`.
11. **GNOME pairing hung silently.** btmon: `Pair Device` →
    accept-list passive scan → no reports at all. GNOME had also re-enabled
    the onboard adapter via its Bluetooth toggle.
12. **Fix.** Single `bluetoothctl` session: `agent NoInputNoOutput`,
    `default-agent`, `scan le` left running, then `pair` / `trust` /
    `connect` → paired, bonded, `hid-microsoft` bound, Steam Input picked it
    up. Auto-reconnect (off → Xbox button) worked.
13. **After reboot: no reconnect.** `hciN` numbers had swapped, GNOME had
    re-enabled the Intel adapter and it was `[default]`. A re-pair attempt ran
    against it; the controller dropped its bond with the dongle. btmon then
    showed `Encryption Change: PIN or Key Missing` on every reconnect while the
    PC still held a valid LE SC key. Fix: udev rule removing the onboard BT
    adapter for good, script selects the dongle by USB id, re-pair.

## Lessons

- Identify controller generation and protocol before touching config.
- Ask what exactly fails (never seen / pairing hangs / disconnects) before
  picking a direction.
- Comparative evidence (TV vs PC, dongle vs onboard, `scan le` vs `scan on`)
  resolved what log reading couldn't.
- After three failed hypotheses, change approach (hardware) instead of trying a
  fourth setting.
- Start captures before the pairing window; the window is short.
- With two adapters, never rely on `[default]` — select the adapter explicitly
  or remove the extra one entirely.
- rfkill block/unblock can leave the adapter "Not Powered" at the kernel level;
  power-cycle it via bluetoothctl afterwards.
