#!/bin/bash
# ble-pair.sh — pair a BLE gamepad (e.g. Xbox Series X|S controller) from ONE
# bluetoothctl session: agent registered + active LE scan kept running while
# pairing. Works around desktop pairing UIs that stop discovery first and then
# hang in the kernel's passive accept-list scan.
#
# Usage: ble-pair.sh <MAC> [--adapter VID:PID] [--disable VID:PID]...
#   <MAC>              controller address (find it with: bluetoothctl --timeout 20 scan le)
#   --adapter VID:PID  pair through this adapter (by USB id), e.g. a dongle: --adapter 2357:0604.
#                      Strongly recommended with more than one adapter: hciN numbers swap
#                      between boots and bluetoothctl's [default] may be a blocked adapter.
#   --disable VID:PID  soft-block (rfkill) a Bluetooth adapter by USB id first,
#                      e.g. an onboard Intel adapter: --disable 8087:0aaa
#
# WARNING: removes any existing pairing for <MAC> before pairing again.
set -u
MAC=${1:?usage: ble-pair.sh <MAC> [--adapter VID:PID] [--disable VID:PID]...}; shift
DISABLE=(); USE=""
while [ $# -gt 0 ]; do
  case $1 in
    --disable) DISABLE+=("$2"); shift 2 ;;
    --adapter) USE=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

D=$(mktemp -d); L=$D/session.log; F=$D/btctl.fifo
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
has(){ grep -aqE "$1" "$L"; }

# usb_id <hciN sysfs dir> -> "vvvv:pppp"
usb_id(){ local u; u=$(readlink -f "$1/device/.."); echo "$(cat "$u/idVendor" 2>/dev/null):$(cat "$u/idProduct" 2>/dev/null)"; }

# Soft-block every adapter whose USB id is listed in --disable
for id in "${DISABLE[@]}"; do
  for h in /sys/class/bluetooth/hci[0-9]*; do
    case $h in *:*) continue ;; esac          # skip connection entries like hci1:16
    [ "$(usb_id "$h")" = "$id" ] || continue
    ls -d "$h"/rfkill* 2>/dev/null | xargs -r -n1 basename | sed 's/rfkill//' \
      | xargs -r -I{} sh -c 'rfkill block {} && echo "adapter $0 ($1) soft-blocked (rfkill {})"' "$(basename "$h")" "$id"
  done
done

# Resolve --adapter to a controller address via BlueZ's D-Bus API (sysfs has no address)
ADDR=""
if [ -n "$USE" ]; then
  for h in /sys/class/bluetooth/hci[0-9]*; do
    case $h in *:*) continue ;; esac
    [ "$(usb_id "$h")" = "$USE" ] || continue
    ADDR=$(busctl get-property org.bluez "/org/bluez/$(basename "$h")" org.bluez.Adapter1 Address | awk -F'"' '{print $2}')
    break
  done
  [ -n "$ADDR" ] || { echo "adapter $USE not found" >&2; exit 1; }
  echo "pairing through adapter $ADDR ($USE)"
elif [ "$(bluetoothctl list | grep -c '^Controller')" -gt 1 ]; then
  echo "warning: several adapters present and no --adapter given; bluetoothctl's [default] will be used:" >&2
  bluetoothctl list >&2
fi

mkfifo "$F"
bluetoothctl < "$F" 2>&1 | sed -u 's/\x1b\[[0-9;]*m//g' > "$L" &
exec 3> "$F"
send(){ echo "$1" >&3; echo ">>> $1" >> "$L"; }

[ -n "$ADDR" ] && { send "select $ADDR"; sleep 1; send "power on"; sleep 1; }
send "agent NoInputNoOutput"; sleep 1
send "default-agent"; sleep 1
send "remove $MAC"; sleep 1
send "scan le"

say "Put the controller in pairing mode now (Xbox: hold the pair button until the logo flashes fast)."
echo "Listening for up to 3 minutes..."
for _ in $(seq 1 360); do has "(NEW|CHG)\] Device $MAC" && break; sleep 0.5; done

if has "(NEW|CHG)\] Device $MAC"; then
  echo "Controller seen — pairing (scan stays on)..."
  send "pair $MAC"
  for _ in $(seq 1 60); do has 'Pairing successful|Failed to pair' && break; sleep 0.5; done
  send "trust $MAC"; sleep 1
  send "connect $MAC"
  for _ in $(seq 1 40); do has 'Connection successful|Failed to connect' && break; sleep 0.5; done
  sleep 3
  send "scan off"; sleep 1
  send "info $MAC"; sleep 2
else
  echo "RESULT: controller not seen" >> "$L"
  send "scan off"; sleep 1
fi
send "quit"; exec 3>&-; wait

if has 'Paired: yes' && has 'Connected: yes'; then
  say "Paired and connected."
  command -v notify-send >/dev/null && notify-send -i input-gaming "Gamepad" "Paired and connected"
  exit 0
else
  say "Pairing did not complete."
  grep -aE "Failed to pair|Failed to connect|RESULT" "$L"
  echo "Full bluetoothctl log: $L"
  exit 1
fi
