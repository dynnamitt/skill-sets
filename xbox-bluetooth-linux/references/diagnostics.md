---
name: diagnostics
description: Commands and interpretation for diagnosing BLE gamepad problems on Linux — adapter inventory, LE vs interleaved scans, btmon capture and reading, and finding the controller's address.
---

# Diagnostics

Verified on BlueZ 5.87 / kernel 7.2.7 (2026-10). `bluetoothctl` output has ANSI
colour codes; strip with `sed 's/\x1b\[[0-9;]*m//g'` before grepping.

## Inventory (no root needed)

```bash
uname -r; bluetoothctl --version
lsusb | grep -iE 'bluetooth|8087|0bda|2357|0e8d|13d3|045e'   # adapters + wired controller
lspci -nn | grep -iE 'network|wireless'                         # CNVi Wi-Fi half of combo cards
journalctl -k -b | grep -iE 'iwlwifi.*Detected|Bluetooth: hci[0-9]: (Found|Firmware|RTL)'
bluetoothctl list                                               # all adapters, which is [default]
rfkill list bluetooth                                           # soft/hard blocked per hciN
iw phy | grep -i 'Available Antennas'                           # 0x1 = 1x1 card (one antenna shared with BT)
grep -E '^\s*ControllerMode' /etc/bluetooth/main.conf           # must be dual (default) or le — bredr disables LE entirely
grep -E '^\s*UserspaceHID' /etc/bluetooth/input.conf; ls -l /dev/uhid   # BLE HID → uhid; missing uhid = pairs but no input device
```

Map `hciN` to a USB id and address (useful when two adapters are present; numbers
can swap between boots, and sysfs has no address attribute — ask BlueZ over D-Bus):

```bash
for h in /sys/class/bluetooth/hci[0-9]*; do
  case $h in *:*) continue ;; esac   # skip connection entries like hci1:16
  u=$(readlink -f "$h/device/.."); n=$(basename $h)
  echo "$n $(cat $u/idVendor):$(cat $u/idProduct) $(busctl get-property org.bluez /org/bluez/$n org.bluez.Adapter1 Address)"
done
```

## Scans: compare modes

Put the controller in pairing mode first (Xbox: hold the pair button until the
logo flashes fast).

```bash
bluetoothctl --timeout 15 scan on     # interleaved BR/EDR + LE (what GNOME/KDE use)
bluetoothctl --timeout 15 scan le     # LE only
bluetoothctl --timeout 15 scan bredr  # classic only
```

Interpretation:
- `scan le` lists LE devices but `scan on` lists none → interleaved discovery
  is broken on this adapter; desktop UIs will never show LE gamepads.
- `scan le` finds a few devices but never the controller, while a phone/TV
  sees it immediately → weak LE reception on the adapter.
- Only `[NEW]` lines count as new devices; previously seen devices appear as
  `[CHG] … RSSI` and cached ones expire with `[DEL]`. Use
  `bluetoothctl devices` plus `bluetoothctl info <MAC>` for details.

To identify the controller without relying on the name (it is often absent
from the first advertisements), check `bluetoothctl info <MAC>` for:
`ManufacturerData.Key: 0x0006` (Microsoft), `Appearance: 0x03c4`,
`Icon: input-gaming`, `UUID: Human Interface Device (00001812-…)`.

## btmon (needs root)

`bluetoothd` doesn't log why pairing failed. `btmon` shows the HCI traffic.
Have the user run it in a separate terminal and write to a file, then read
the file without root:

```bash
sudo btmon -w ~/btmon.snoop          # user runs this; Ctrl+C when done
btmon -r ~/btmon.snoop | sed 's/\x1b\[[0-9;]*m//g' > /tmp/b.txt
```

Timing matters: start `btmon` **before** the pairing-mode window. Captures
that start after the attempt contain only the startup header (a file of a few
hundred bytes).

Timeline of top-level events (drops the advertising flood):

```bash
grep -aE '^[<>@=] ' /tmp/b.txt \
  | grep -avE 'Advertising Report|LE Meta Event|Device Found|Inquiry Result' \
  | sed -E 's/ +#[0-9]+ / /; s/ +\{0x[0-9a-f]+\}//'
```

Distinct LE advertisers in the capture (a reception-quality metric):

```bash
awk '/Event type:/{et=$3} /^ +Address: /&&et!=""{c[$2" "et]++; et=""} END{for(k in c) print c[k],k}' /tmp/b.txt | sort -rn
```

Note: if the shell aliases `grep` to something else (ugrep, rg), `grep -c` on
btmon text can print nothing — call `/usr/bin/grep -a` explicitly.

### Reading the important lines

| Line | Meaning |
|---|---|
| `LE Set Extended Scan Parameters … Type: Active … Window == Interval` | Discovery scan at 100 % duty — the adapter is listening as hard as it can |
| `Filter policy: Accept all advertisement (0x00)` | Discovery: every advertiser is reported |
| `Filter policy: Ignore not in accept list … (0x03)` + `Type: Passive` | Connection setup / auto-reconnect: only accept-listed devices are reported |
| `Own address type: Random (0x03)` | LL privacy in use (controller-generated RPA) |
| `Event type: 0x0013` / `Props: 0x0013` | Legacy connectable+scannable ADV_IND — what an Xbox controller in pairing mode sends |
| `Event type: 0x0010` or `0x0000` | Non-connectable beacons (phones, trackers) — not a gamepad |
| `MGMT Command: Pair Device` → `LE Add Device To Accept List` → passive scan → **nothing** | The pairing stall: the controller is never reported in accept-list mode, so no `LE Create Connection` is ever sent |
| `MGMT Event: Command Complete … Start Discovery … Status: Not Powered (0x0f)` | Kernel thinks the adapter is off although `bluetoothctl show` says `Powered: yes` (seen after rfkill block/unblock) — fix with `bluetoothctl power off && bluetoothctl power on` |
| `Set Powered … [hci0]` appearing mid-capture | A second adapter was re-enabled (GNOME toggle) |
| `LE Start Encryption` (Random `0x0`, EDIV `0x0` = LE Secure Connections key) → `Encryption Change … Status: PIN or Key Missing (0x06)` → `Disconnect … Authentication Failure`, repeating every ~2 s | The **controller** no longer has a key for this host while the PC still does. bluetoothd shows it as a loop of `HID Information read failed: Request attribute has encountered an unlikely error`. Re-pair. |

## bluetoothd messages worth recognising

| Journal line | Meaning |
|---|---|
| `Unknown group L2CAP in /etc/bluetooth/main.conf` | Leftover `[L2CAP]` section from an old fix script; ignored |
| `setsockopt(L2CAP_OPTIONS): Invalid argument (22)` for OBEX/AVCTP servers | Caused by `bluetooth.disable_ertm=1` on the kernel cmdline (those profiles require ERTM) |
| `No agent available for request type 2` + `device_confirm_passkey: Operation not permitted` | Pairing needed a confirmation and no agent was registered — e.g. non-interactive `bluetoothctl pair` |
| `Error reading PNP_ID value: Request attribute has encountered an unlikely error` | Harmless during GATT discovery before encryption |
