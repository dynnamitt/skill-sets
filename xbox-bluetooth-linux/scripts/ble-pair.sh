#!/bin/bash
# ble-pair.sh — pair a BLE gamepad (e.g. Xbox Series X|S controller) from ONE
# bluetoothctl session: agent registered + active LE scan kept running while
# pairing. Works around desktop pairing UIs that stop discovery first and then
# hang in the kernel's passive accept-list scan.
#
# Usage: ble-pair.sh [<MAC>] [--adapter VID:PID] [--disable VID:PID]...
#   <MAC>              controller address (find it with: bluetoothctl --timeout 20 scan le)
#   --adapter VID:PID  pair through this adapter (by USB id), e.g. a dongle: --adapter 2357:0604.
#                      Strongly recommended with more than one adapter: hciN numbers swap
#                      between boots and bluetoothctl's [default] may be a blocked adapter.
#   --disable VID:PID  soft-block (rfkill) a Bluetooth adapter by USB id first,
#                      e.g. an onboard Intel adapter: --disable 8087:0aaa
#
# Defaults can live in ${XDG_CONFIG_HOME:-~/.config}/ble-pair.conf (or $BLE_PAIR_CONF),
# a bash snippet; command-line arguments override it. That keeps machine-specific
# values (and the controller's address) out of the script, so the script itself
# can be symlinked or launched without arguments:
#   MAC=AA:BB:CC:DD:EE:FF
#   ADAPTER=2357:0604        # optional, as --adapter
#   DISABLE=(8087:0aaa)      # optional, as --disable
#
# WARNING: removes any existing pairing for <MAC> before pairing again.
set -u
MAC=""; ADAPTER=""; DISABLE=()
CONF=${BLE_PAIR_CONF:-${XDG_CONFIG_HOME:-$HOME/.config}/ble-pair.conf}
[ -r "$CONF" ] && . "$CONF"
USE=$ADAPTER
case ${1:-} in ""|--*) ;; *) MAC=$1; shift ;; esac
while [ $# -gt 0 ]; do
  case $1 in
    --disable) DISABLE+=("$2"); shift 2 ;;
    --adapter) USE=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MAC" ] || { echo "usage: ble-pair.sh [<MAC>] [--adapter VID:PID] [--disable VID:PID]... (or set MAC in $CONF)" >&2; exit 2; }

D=$(mktemp -d); L=$D/session.log; F=$D/btctl.fifo
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
notify(){ command -v notify-send >/dev/null && notify-send -i "$1" "Gamepad" "$2"; }

# hci_by_usb VID:PID -> adapter names (hciN) whose USB id matches
hci_by_usb(){
  local h u
  for h in /sys/class/bluetooth/hci[0-9]*; do
    case $h in *:*) continue ;; esac            # skip connection entries like hci1:16
    u=$(readlink -f "$h/device/..")
    [ "$(cat "$u/idVendor" 2>/dev/null):$(cat "$u/idProduct" 2>/dev/null)" = "$1" ] && echo "${h##*/}"
  done
}

# Soft-block every adapter listed in --disable
for id in "${DISABLE[@]}"; do hci_by_usb "$id"; done |
  while read -r h; do
    for r in /sys/class/bluetooth/"$h"/rfkill*; do
      [ -e "$r" ] && rfkill block "${r##*rfkill}" && echo "adapter $h soft-blocked (rfkill ${r##*rfkill})"
    done
  done

# Resolve --adapter to a controller address (sysfs has no address; ask BlueZ over D-Bus)
ADDR=""
if [ -n "$USE" ]; then
  HCI=$(hci_by_usb "$USE" | head -1)
  [ -n "$HCI" ] && ADDR=$(busctl get-property org.bluez "/org/bluez/$HCI" org.bluez.Adapter1 Address | awk -F'"' '{print $2}')
  [ -n "$ADDR" ] || { echo "adapter $USE not found" >&2; exit 1; }
  echo "pairing through adapter $ADDR ($USE)"
else
  CTRLS=$(bluetoothctl list)
  if [ "$(grep -c '^Controller' <<<"$CTRLS")" -gt 1 ]; then
    echo "warning: several adapters present and no --adapter given; bluetoothctl's [default] will be used:" >&2
    echo "$CTRLS" >&2
  fi
fi

# One bluetoothctl session fed through a FIFO. Its output is appended (>>) to the
# log; send() appends a ">>> cmd" marker BEFORE each command, so wait_for only
# looks at replies to that command (earlier reconnect attempts print stale
# "[CHG] Device <MAC>" lines that must not count).
mkfifo "$F"
bluetoothctl --agent NoInputNoOutput < "$F" 2>&1 | sed -u 's/\x1b\[[0-9;]*m//g' >> "$L" &
exec 3> "$F"
# bluetoothctl's agent asks "Accept pairing (yes/no)" / "Confirm passkey … (yes/no)"
# when the controller requests pairing itself; whatever we send next is taken as the
# answer (a queued "remove …" silently refused the pairing). Answer every pending
# request with "yes" before sending a command and while waiting. Counted by the
# "Request …" line printed once per request — the (yes/no) prompt is re-printed on
# every output line. Note: accepts any pairing request during this short session.
ANSWERED=0
answer_prompts(){
  local n; n=$(grep -aoE 'Request (authorization|confirmation)|Authorize service' "$L" | wc -l)
  while (( ANSWERED < n )); do
    echo ">>> yes (agent prompt)" >> "$L"; echo "yes" >&3; ANSWERED=$((ANSWERED + 1))
  done
}
send(){ answer_prompts; echo ">>> $1" >> "$L"; echo "$1" >&3; }

# seen <command> <regex>: has <regex> appeared after <command>'s marker?
# (marker/regex passed via ENVIRON: awk -v would eat backslashes, turning "\[NEW\]" into "[NEW]")
seen(){ M=">>> $1" RE="$2" awk 'index($0,ENVIRON["M"])==1{on=1} on && $0~ENVIRON["RE"]{f=1; exit} END{exit !f}' "$L"; }
# wait_for <command> <regex> <seconds>: poll seen() every 0.5 s
wait_for(){ local n=$(( $3 * 2 )); while (( n-- > 0 )); do answer_prompts; seen "$1" "$2" && return 0; sleep 0.5; done; return 1; }

if [ -n "$ADDR" ]; then
  send "select $ADDR"
  send "power on";      wait_for "power on" 'power on succeeded' 5
fi
send "default-agent";   wait_for "default-agent" 'Default agent request successful' 5
send "remove $MAC";     wait_for "remove $MAC" 'has been removed|not available' 5
send "scan le"

SCAN_SECS=${SCAN_SECS:-180}   # override for testing
say "Put the controller in pairing mode now (Xbox: hold the pair button until the logo flashes fast)."
echo "Listening for up to $((SCAN_SECS / 60)) minutes..."

REASON=""
if ! wait_for "scan le" "\[NEW\] Device $MAC" "$SCAN_SECS"; then
  REASON="controller not seen"
else
  echo "Controller seen — pairing (scan stays on)..."
  send "pair $MAC"
  wait_for "pair $MAC" 'Pairing successful|Failed to pair|not available' 30
  if ! seen "pair $MAC" 'Pairing successful'; then
    REASON="pairing failed"
  else
    send "trust $MAC";   wait_for "trust $MAC" 'trust succeeded' 5
    send "connect $MAC"; wait_for "connect $MAC" 'Connection successful|Failed to connect' 20
    wait_for "connect $MAC" 'ServicesResolved: yes' 10   # let HID setup finish before scan off
  fi
fi
send "scan off";        wait_for "scan off" 'Discovery stopped' 5
send "info $MAC";       wait_for "info $MAC" 'Connected: (yes|no)|not available' 5
send "quit"; exec 3>&-; wait

if seen "info $MAC" 'Paired: yes' && seen "info $MAC" 'Connected: yes'; then
  say "Paired and connected."
  notify input-gaming "Paired and connected"
  exit 0
else
  say "Pairing did not complete${REASON:+: $REASON}."
  grep -aE "Failed to pair|Failed to connect|not available" "$L"
  echo "Full bluetoothctl log: $L"
  notify dialog-error "Pairing failed — see the terminal"
  exit 1
fi
