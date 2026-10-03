---
name: pairing-workarounds
description: Why desktop pairing UIs can hang with BLE gamepads on Linux and how to pair from a single bluetoothctl session with an agent and an active scan.
---

# Pairing workarounds

Observed 2026-10 with a Realtek RTL8761BU dongle (TP-Link UB500), kernel 7.2.7,
BlueZ 5.87, GNOME. Treat it as a known failure pattern to check for with
`btmon`, not a universal law for every adapter.

## The passive accept-list stall

What a desktop UI (GNOME Settings, KDE) does when you click the controller:

1. `Stop Discovery` — the active, accept-all scan ends.
2. `MGMT Pair Device` → kernel `LE Add Device To Accept List` (public address).
3. Kernel starts a **passive** scan with filter policy
   `Ignore not in accept list (0x03)`, LL privacy on (`Own address type 0x03`).
4. It waits for an advertisement from the accept-listed device, then sends
   `LE Create Connection`.

In the failing case step 4 never happens: zero advertising reports arrive in
accept-list mode even though the controller is in pairing mode and was
reported seconds earlier during discovery. The UI then gives up silently (no
error dialog), and the controller times out to slow flash.

What made it work: if an **active, accept-all discovery scan is still
running** when pairing starts, the kernel picks up the controller's
advertisement from that scan and connects straight away. The very first
attempt in the case study connected instantly because a script's
`scan le` was still running; it only failed because no agent was registered.

Auto-reconnect of an already bonded controller also uses passive accept-list
scanning, but it worked fine afterwards — the stall was specific to first-time
pairing in that setup. Test reconnection (controller off, then press the Xbox
button) before declaring success.

## Missing agent

`bluetoothctl pair <MAC>` run non-interactively (or with `--timeout`) has no
pairing agent unless one is registered **in the same process**. Xbox
controllers use LE Secure Connections "Just Works", which still asks the
agent for confirmation (`request type 2`). Without one:

```
Failed to pair: org.bluez.Error.AuthenticationFailed
bluetoothd: src/device.c:new_auth() No agent available for request type 2
```

GNOME Shell's agent only answers while its Bluetooth settings panel is
driving the pairing.

## The single-session recipe

One `bluetoothctl` process, commands fed through a FIFO so we can wait on its
output:

```text
agent NoInputNoOutput
default-agent
remove <MAC>          # start clean
scan le               # active scan — keep it running
… wait until "[NEW|CHG] Device <MAC>" appears …
pair <MAC>            # while the scan is still on
trust <MAC>
connect <MAC>
scan off
```

Bundled as [../scripts/ble-pair.sh](../scripts/ble-pair.sh):

```bash
scripts/ble-pair.sh <MAC>                                          # single adapter
scripts/ble-pair.sh <MAC> --adapter 2357:0604 --disable 8087:0aaa  # pair via the dongle, block onboard Intel
```

Machine-specific defaults can go in `~/.config/ble-pair.conf` (a bash snippet;
CLI arguments override it). Then the script runs without arguments, can be
symlinked into a personal scripts folder, and the controller's address stays
out of any repo:

```bash
MAC=AA:BB:CC:DD:EE:FF
ADAPTER=2357:0604
DISABLE=(8087:0aaa)
```

The script answers bluetoothctl's own agent prompts (`Request authorization` →
`Accept pairing (yes/no)`) with `yes`. Without that, a controller that requests
pairing itself — e.g. while in a trusted-but-unpaired state — makes the agent
swallow the next queued command as its answer and silently refuse.

Start it **before** the user presses the pair button; it listens for up to
3 minutes. Success looks like `Pairing successful` → `Connection successful`,
then in `dmesg`:

```
hid-generic 0005:045E:0B13…: BLUETOOTH HID v5.24 Gamepad [Xbox Wireless Controller]
microsoft 0005:045E:0B13…: input,hidraw…: BLUETOOTH HID v5.24 Gamepad …
```

and a `js`/`event` node in `/proc/bus/input/devices`. Steam then adds a
virtual "Microsoft X-Box 360 pad" — that is Steam Input taking over, not a
second controller.

With several adapters, always pass `--adapter`: a plain `bluetoothctl` session
acts on `[default]`, which after a reboot may be the (blocked) onboard adapter.
Putting the controller in pairing mode for a pairing that then runs on the wrong
adapter costs the controller its existing bond (seen in the case study).

The script removes any existing bond for that MAC first, so it is for
(re-)pairing only — normal use is just pressing the Xbox button.

## Desktop launcher (optional)

A `.desktop` entry that opens the script in a terminal that stays open:

```ini
[Desktop Entry]
Type=Application
Name=Gamepad Re-pair
Exec=kitty --hold /path/to/ble-pair.sh        # args from ~/.config/ble-pair.conf
Icon=input-gaming
Terminal=false
Categories=Settings;HardwareSettings;
```

Save to `~/.local/share/applications/`, validate with
`desktop-file-validate`, pin via
`gsettings set org.gnome.shell favorite-apps "…, 'name.desktop']"`.
