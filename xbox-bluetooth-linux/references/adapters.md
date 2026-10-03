---
name: adapters
description: Bluetooth adapter choices for BLE gamepads on Linux — Intel CNVi combo-card LE weakness, recommended USB dongles, the Xbox Wireless Adapter with xone, and keeping exactly one adapter active.
---

# Adapters

## Intel CNVi combo cards (Wi-Fi + Bluetooth on one chip)

Common on desktop boards with "/ac" or "Wi-Fi" in the name and on laptops:
Wireless-AC 9461/9462 (1x1), 9560 (2x2), AX200/AX201/AX210/AX211. Bluetooth
shows up as a USB device inside the chipset (`8087:0aaa` for the 9xxx family,
`8087:0029`/`0026`/`0032`/`0033` for AX parts — see `btusb.c`). Identify the exact card with
`journalctl -k | grep 'iwlwifi.*Detected'`.

Characteristics that matter for gamepads:
- **Shared radio and antenna.** 1x1 parts (9461/9462) have a single antenna
  for both Wi-Fi and Bluetooth (`iw phy` → `Available Antennas: TX 0x1 RX 0x1`
  is normal for them, not a fault).
- **Coexistence.** `iwlwifi bt_coex_active=Y` time-shares the radio. 2.4 GHz
  Wi-Fi competes directly with BT; moving Wi-Fi to 5 GHz or Ethernet is the
  standard mitigation for *disconnects*.
- **Weak LE reception (observed).** In the case study, an AC 9462 heard 2–9 LE
  advertisers per scan and caught the Xbox controller only once in many
  minutes, while a USB dongle in the same spot heard 33 devices and the
  controller within seconds. Turning Wi-Fi fully off and `Privacy=off` did not
  improve it. If you see the same pattern, stop tuning and swap adapter.
- `bluetoothctl scan on` (interleaved) returned **no** LE devices on that card;
  `scan le` worked.
- **Dual boot with Windows** (general advice, not verified in the case
  study): Windows Fast Startup can leave Intel combo cards in a bad state for
  Linux. Disable Fast Startup and do a full cold boot (power off at the PSU
  for ~30 s) before concluding the adapter is weak.

## Replacement options

| Option | Pros | Cons |
|---|---|---|
| Realtek **RTL8761B/BU** USB dongle (TP-Link UB500 `2357:0604`, ASUS USB-BT500) | In-kernel `btrtl` driver + `rtl_bt/rtl8761bu_fw.bin` from linux-firmware; replaces BT for every device | Desktop-UI pairing can stall (see pairing-workarounds.md) |
| **Xbox Wireless Adapter** (USB) + `xone` driver | No Bluetooth at all — proprietary 5 GHz link, lower latency, headset audio, up to 8 pads | Only Xbox accessories; needs `xone` (shipped in Bazzite images; DKMS/AUR elsewhere) |

Check whether `xone` is available: `modinfo xone_dongle` (Bazzite ships it
under `/lib/modules/$(uname -r)/extra/xone/`).

Plug the dongle into a port away from other 2.4 GHz receivers (Logitech
Unifying/Bolt dongles, Wi-Fi antennas) when possible — a short USB extension
cable helps.

## Keep exactly one adapter active

With two adapters, `bluetoothctl` and desktop UIs act on the `[default]` one,
discovery and pairing can happen on different chips, and debugging output
gets ambiguous.

Soft-block the onboard one (no root needed in a desktop session):

```bash
rfkill list bluetooth            # find the id of the onboard hciN
rfkill block <id>
```

systemd-rfkill persists the state per device path
(`/var/lib/systemd/rfkill/…:bluetooth`, `1` = blocked). Caveat: **GNOME's
Bluetooth toggle unblocks all adapters.** rfkill ids can also change between
boots.

Permanent and toggle-proof: de-authorize the onboard BT USB device with a
udev rule (root; delete the file to undo):

```bash
echo 'ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="8087", ATTR{idProduct}=="0aaa", ATTR{authorized}="0"' \
  | sudo tee /etc/udev/rules.d/81-disable-onboard-bt.rules
```

Bonds are stored per adapter address under `/var/lib/bluetooth/<adapter>/`,
so a controller paired via the dongle keeps working in any USB port, but must
be re-paired if you switch back to the onboard adapter.

## Resetting a wedged adapter

- `bluetoothctl power off && bluetoothctl power on` — normal reset. It may
  fail with `org.bluez.Error.Failed` while a connection/pairing is pending.
- `rfkill block <id>; rfkill unblock <id>` — harder reset, but afterwards the
  kernel can answer `Start Discovery` with `Not Powered (0x0f)` while
  `bluetoothctl show` still claims `Powered: yes`. Follow it with a
  `power off`/`power on` cycle and confirm a scan returns devices.
