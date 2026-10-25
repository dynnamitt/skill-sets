#!/bin/bash
# ble-pair.sh — pair a BLE gamepad (e.g. Xbox Series X|S controller) from ONE
# bluetoothctl session: agent registered + active LE scan kept running while
# pairing. Works around desktop pairing UIs that stop discovery first and then
# hang in the kernel's passive accept-list scan.
#
# Usage: ble-pair.sh [<MAC>] [--adapter VID:PID] [--disable VID:PID]...
#   <MAC>              preferred controller address. Optional: without it (or when that
#                      controller doesn't show up) the gamepad found in pairing mode is used,
#                      as long as there is exactly one.
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
# WARNING: removes any existing pairing for <MAC>, and forgets cached unpaired
# gamepads, before pairing again.
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
    *) echo "usage: ble-pair.sh [<MAC>] [--adapter VID:PID] [--disable VID:PID]..." >&2; exit 2 ;;
  esac
done
MAC=${MAC^^}

D=$(mktemp -d); L=$D/session.log; F=$D/btctl.fifo
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
notify(){ command -v notify-send >/dev/null && notify-send -i "$1" "Gamepad" "$2"; }
strip(){ sed -u 's/\x1b\[[0-9;]*[mK]//g'; }   # colours and erase-line codes

systemctl is-active -q bluetooth || { echo "bluetooth service is not running (sudo systemctl start bluetooth)" >&2; exit 1; }

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

# Known devices, before the session. Paired gamepads other than <MAC> are left alone
# (and never picked); cached *unpaired* gamepads are forgotten so that, back in pairing
# mode, they reappear as [NEW] with their full advertisement (name, HID UUID, vendor).
macs(){ bluetoothctl devices "$@" | strip | awk '$1=="Device"{print $2}' | sort -u; }
PAIRED=$(macs Paired | grep -vxF "${MAC:-none}")
STALE=$(comm -23 <(macs) <(macs Paired) |
  while read -r m; do bluetoothctl info "$m" | grep -qE 'Icon: input-gaming|Appearance: 0x03c4' && echo "$m"; done)

# One bluetoothctl session fed through a FIFO. Its output is appended (>>) to the
# log; send() appends a ">>> cmd" marker BEFORE each command, so wait_for only
# looks at replies to that command (earlier reconnect attempts print stale
# "[CHG] Device <MAC>" lines that must not count).
mkfifo "$F"
bluetoothctl --agent NoInputNoOutput < "$F" 2>&1 | strip >> "$L" &
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

# gamepads: unpaired gamepad-like advertisers since "scan le", in order of first sight.
# Gamepad-like = gamepad appearance/icon, a controller-ish name, or HID service (0x1812)
# plus Microsoft manufacturer data (0x0006) — the name is often missing at first.
gamepads(){
  awk 'index($0,">>> scan le")==1{on=1; next}
    on && match($0, /Device ([0-9A-F][0-9A-F]:){5}[0-9A-F][0-9A-F]/){
      m=substr($0, RSTART+7, 17); if(!(m in seen)){seen[m]=1; order[++n]=m}
      if($0 ~ /\[NEW\] Device/ && tolower($0) ~ /xbox|controller|gamepad/) pad[m]=1
      if($0 ~ /Appearance: 0x03c4|Icon: input-gaming/) pad[m]=1
      if($0 ~ /UUIDs: 00001812-/) hid[m]=1
      if($0 ~ /ManufacturerData\.Key: 0x0006 /) ms[m]=1
    }
    END{for(i=1;i<=n;i++){m=order[i]; if(pad[m] || (hid[m] && ms[m])) print m}}' "$L" |
    grep -vxF -f <(echo "$PAIRED")
}

if [ -n "$ADDR" ]; then send "select $ADDR"; fi
send "power on";        wait_for "power on" 'power on succeeded' 5
send "default-agent";   wait_for "default-agent" 'Default agent request successful' 5
for m in $MAC $STALE; do
  send "remove $m";     wait_for "remove $m" 'has been removed|not available' 5
done
send "scan le"

SCAN_SECS=${SCAN_SECS:-180}   # override for testing
GRACE=${GRACE:-5}             # after another gamepad shows up, wait this long for <MAC>
say "Put the controller in pairing mode now (Xbox: hold the pair button until the logo flashes fast)."
echo "Listening for up to $((SCAN_SECS / 60)) minutes${MAC:+ (preferring $MAC)}..."

# Pick the controller: <MAC> as soon as it shows up; otherwise the only gamepad seen
# for GRACE seconds. Several at once is ambiguous — name one on the command line.
PICK=""; REASON=""; FIRST=""; T=0
while (( T < SCAN_SECS * 2 )); do
  answer_prompts
  if [ -n "$MAC" ] && seen "scan le" "\[NEW\] Device $MAC"; then PICK=$MAC; break; fi
  PADS=$(gamepads)
  if [ -n "$PADS" ]; then
    FIRST=${FIRST:-$T}
    if (( T - FIRST >= GRACE * 2 )); then
      if [ "$(wc -l <<<"$PADS")" -eq 1 ]; then PICK=$PADS
      else REASON="several gamepads in pairing mode: ${PADS//$'\n'/ } — run again with the one to pair"; fi
      break
    fi
  fi
  sleep 0.5; T=$((T + 1))
done
[ -n "$PICK$REASON" ] || REASON="no controller seen${MAC:+ ($MAC)}"

if [ -n "$PICK" ]; then
  echo "Controller $PICK seen — pairing (scan stays on)..."
  send "pair $PICK"
  wait_for "pair $PICK" 'Pairing successful|Failed to pair|not available' 30
  if ! seen "pair $PICK" 'Pairing successful'; then
    REASON="pairing failed"
  else
    send "trust $PICK";   wait_for "trust $PICK" 'trust succeeded' 5
    send "connect $PICK"; wait_for "connect $PICK" 'Connection successful|Failed to connect' 20
    wait_for "connect $PICK" 'ServicesResolved: yes' 10   # let HID setup finish before scan off
  fi
fi
send "scan off";        wait_for "scan off" 'Discovery stopped' 5
[ -n "$PICK" ] && { send "info $PICK"; wait_for "info $PICK" 'Connected: (yes|no)|not available' 5; }
send "quit"; exec 3>&-; wait

# Success = an input device exists for the controller (BlueZ sets its uniq to the
# device address). Paired+connected without one is the HID-over-GATT setup failing
# before encryption ("Report Map read failed"), which bluetoothd won't retry.
INPUT_DEVICES=${INPUT_DEVICES:-/proc/bus/input/devices}   # override for testing
has_input(){ local n=$(( $2 * 2 )); while (( n-- > 0 )); do grep -qix "U: Uniq=$1" "$INPUT_DEVICES" && return 0; sleep 0.5; done; return 1; }

if [ -n "$PICK" ] && seen "info $PICK" 'Paired: yes' && seen "info $PICK" 'Connected: yes'; then
  [ -n "$MAC" ] && [ "$PICK" != "$MAC" ] && echo "Note: paired $PICK, not $MAC. To make it the default, set MAC=$PICK in $CONF"
  [ -z "$MAC" ] && echo "Tip: set MAC=$PICK in $CONF to prefer this controller next time"
  if has_input "$PICK" 10; then
    say "Paired and connected ($PICK)."
    notify input-gaming "Paired and connected"
    exit 0
  fi
  say "Paired and connected, but no input device was created."
  echo "Fix: sudo systemctl restart bluetooth, then press the Xbox button (or reboot)."
  echo "Full bluetoothctl log: $L"
  notify dialog-warning "Paired, but no gamepad device — restart bluetooth"
  exit 3
fi
say "Pairing did not complete${REASON:+: $REASON}."
grep -aE "Failed to pair|Failed to connect|not available" "$L"
echo "Full bluetoothctl log: $L"
notify dialog-error "Pairing failed — see the terminal"
exit 1
