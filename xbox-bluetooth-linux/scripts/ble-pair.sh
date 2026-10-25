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
# In kitty (with Graphviz installed) the terminal shows only ble-pair.dot as a live
# flowchart: path so far highlighted, current messages as the caption. Elsewhere,
# or with FLOWCHART=0, it prints the messages as plain text.
#
# WARNING: removes any existing pairing for <MAC>, and forgets cached unpaired
# gamepads, before pairing again.
set -u
MAC=""; ADAPTER=""; DISABLE=()
CONF=${BLE_PAIR_CONF:-${XDG_CONFIG_HOME:-$HOME/.config}/ble-pair.conf}
[ -r "$CONF" ] && . "$CONF"
case ${1:-} in ""|--*) ;; *) MAC=$1; shift ;; esac
while [ $# -gt 0 ]; do
  case $1 in
    --disable) DISABLE+=("$2"); shift 2 ;;
    --adapter) ADAPTER=$2; shift 2 ;;
    *) sed -n 's/^# Usage: /usage: /p' "$0" >&2; exit 2 ;;
  esac
done
MAC=${MAC^^}

D=$(mktemp -d); L=$D/session.log; F=$D/btctl.fifo
notify(){ command -v notify-send >/dev/null && notify-send -i "$1" "Gamepad" "$2"; }
# strip colours, erase-line codes and bluetoothctl's "[prompt]> " prefixes
strip(){ sed -u -E 's/\x1b\[[0-9;]*[mK]//g; s/^(\[[^]]*\]> )+//'; }

# --- Live flowchart (kitty + Graphviz) --------------------------------------
# step <node> [message] and msg <text> only record state (TRAIL of ble-pair.dot
# node ids, CAPTION); flush renders and draws it at the next wait and on exit.
FLOW_DOT=${FLOW_DOT:-$(dirname "$(readlink -f "$0")")/ble-pair.dot}
command -v dot >/dev/null || PATH=$PATH:/home/linuxbrew/.linuxbrew/bin   # Homebrew isn't on the desktop session's PATH
GFX=0
[ "${FLOWCHART:-1}" != 0 ] && [ -t 1 ] && [ -n "${KITTY_WINDOW_ID:-}" ] && [ -r "$FLOW_DOT" ] &&
  command -v kitten >/dev/null && command -v dot >/dev/null && GFX=1
TRAIL=(); CAPTION=""; DIRTY=0; SIZE=""

# render: the DOT plus the trail (visited nodes and their edges green, the current
# node coloured by outcome) and the caption, at the window's pixel size if known
render(){
  local cur=${TRAIL[*]: -1} fill line chain cap opts=(-Gdpi=150)
  case $cur in
    ok) fill="#66bb6a" line="#1b5e20" ;;  noinput) fill="#ffcc80" line="#e65100" ;;
    fail) fill="#ef9a9a" line="#b71c1c" ;; *) fill="#ffe082" line="#ff6f00" ;;
  esac
  printf -v chain '%s -> ' "${TRAIL[@]}"
  cap=$(fold -s -w 60 <<<"$CAPTION")   # a wide caption would shrink the chart
  cap=${cap//\\/\\\\}; cap=${cap//\"/\\\"}; cap=${cap//$'\n'/\\n}
  [ -n "$SIZE" ] && opts=(-Gdpi=96 -Gsize="$SIZE")
  { sed '/^}/,$d' "$FLOW_DOT"
    printf '  %s [fillcolor="#c8e6c9" color="#66bb6a"]\n' "${TRAIL[@]}"
    (( ${#TRAIL[@]} > 1 )) && printf '  %s [color="#2e7d32" penwidth=2]\n' "${chain% -> }"
    printf '  %s [fillcolor="%s" color="%s" penwidth=3]\n  label="%s"\n}\n' "$cur" "$fill" "$line" "$cap"
  } | dot -Tpng "${opts[@]}" -o "$D/flow.png" 2>/dev/null
}
# winsize: Graphviz size in inches at 96 dpi, filling the window minus its last row
winsize(){
  local ws; ws=$(kitten icat --print-window-size 2>/dev/null)
  [[ $ws =~ ^([0-9]+)x([0-9]+)$ ]] &&
    SIZE=$(awk -v w="${BASH_REMATCH[1]}" -v h="${BASH_REMATCH[2]}" -v r="$(tput lines)" \
      'BEGIN{printf "%.2f,%.2f!", w/96, h*(r-1)/r/96}')
}
draw(){
  kitten icat --clear --stdin=no 2>/dev/null; printf '\e[H\e[2J'
  kitten icat --stdin=no --scale-up --place "$(tput cols)x$(( $(tput lines) - 1 ))@0x0" "$D/flow.png" 2>/dev/null
}
flush(){ (( GFX && DIRTY )) || return 0; DIRTY=0; render && draw || { GFX=0; echo "$CAPTION"; }; }
msg(){ CAPTION=${CAPTION:+$CAPTION$'\n'}$*; DIRTY=1; (( GFX )) || echo "$*"; }
step(){
  [ "$1" = "${TRAIL[*]: -1}" ] || { TRAIL+=("$1"); DIRTY=1; }
  [ -z "${2:-}" ] || { CAPTION=""; msg "$2"; }
}
if (( GFX )); then
  winsize; printf '\e[?25l'
  trap 'flush; printf "\e[?25h\e[%d;1H" "$(tput lines)"' EXIT
  trap 'winsize; DIRTY=1; flush' WINCH
fi
# -----------------------------------------------------------------------------

step prep
systemctl is-active -q bluetooth || { step fail "bluetooth service is not running (sudo systemctl start bluetooth)"; exit 1; }

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
while read -r h; do
  for r in /sys/class/bluetooth/"$h"/rfkill*; do
    [ -e "$r" ] && rfkill block "${r##*rfkill}" && msg "adapter $h soft-blocked (rfkill ${r##*rfkill})"
  done
done < <(for id in "${DISABLE[@]}"; do hci_by_usb "$id"; done)

# Resolve --adapter to a controller address (sysfs has no address; ask BlueZ over D-Bus)
ADDR=""
if [ -n "$ADAPTER" ]; then
  HCI=$(hci_by_usb "$ADAPTER" | head -1)
  [ -n "$HCI" ] && ADDR=$(busctl get-property org.bluez "/org/bluez/$HCI" org.bluez.Adapter1 Address | awk -F'"' '{print $2}')
  [ -n "$ADDR" ] || { step fail "adapter $ADAPTER not found"; exit 1; }
  msg "pairing through adapter $ADDR ($ADAPTER)"
else
  CTRLS=$(bluetoothctl list)
  [ "$(grep -c '^Controller' <<<"$CTRLS")" -gt 1 ] &&
    msg "warning: several adapters and no --adapter; bluetoothctl's [default] will be used:"$'\n'"$CTRLS"
fi

# Known devices, before the session. Paired gamepads other than <MAC> are left alone
# (and never picked); cached *unpaired* gamepads are forgotten so that, back in pairing
# mode, they reappear as [NEW] with their full advertisement (name, HID UUID, vendor).
PAD_RE='Appearance: 0x03c4|Icon: input-gaming'
macs(){ bluetoothctl devices "$@" | strip | awk '$1=="Device"{print $2}' | sort -u; }
ALLPAIRED=$(macs Paired)
PAIRED=$(grep -vxF "${MAC:-none}" <<<"$ALLPAIRED")
STALE=$(comm -23 <(macs) <(echo "$ALLPAIRED") |
  while read -r m; do bluetoothctl info "$m" | grep -qE "$PAD_RE" && echo "$m"; done)

# One bluetoothctl session fed through a FIFO. Its output is appended (>>) to the
# log; send() appends a ">>> cmd" marker BEFORE each command, so replies are only
# looked for after their command (earlier reconnect attempts print stale
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
  local n; n=$(grep -acE 'Request (authorization|confirmation)|Authorize service' "$L")
  while (( ANSWERED < n )); do
    echo ">>> yes (agent prompt)" >> "$L"; echo "yes" >&3; ANSWERED=$((ANSWERED + 1))
  done
}
send(){ answer_prompts; echo ">>> $1" >> "$L"; echo "$1" >&3; }
# since <command>: log lines from <command>'s marker on
since(){ M=">>> $1" awk 'index($0,ENVIRON["M"])==1{on=1} on' "$L"; }
seen(){ since "$1" | grep -qaE "$2"; }
# poll <seconds> <command...>: retry every 0.5 s until it succeeds, answering agent
# prompts and drawing the flowchart meanwhile
poll(){ local n=$(( $1 * 2 )); shift; while (( n-- > 0 )); do answer_prompts; flush; "$@" && return 0; sleep 0.5; done; return 1; }
wait_for(){ poll "$3" seen "$1" "$2"; }
run(){ send "$1"; wait_for "$1" "$2" "${3:-5}"; }

# gamepads: unpaired gamepad-like advertisers since "scan le", in order of first sight.
# Gamepad-like = gamepad appearance/icon, a controller-ish name, or HID service (0x1812)
# plus Microsoft manufacturer data (0x0006) — the name is often missing at first.
gamepads(){
  since "scan le" | RE=$PAD_RE awk 'match($0, /Device ([0-9A-F][0-9A-F]:){5}[0-9A-F][0-9A-F]/){
      m=substr($0, RSTART+7, 17); if(!(m in seen)){seen[m]=1; order[++n]=m}
      if($0 ~ /\[NEW\] Device/ && tolower($0) ~ /xbox|controller|gamepad/) pad[m]=1
      if($0 ~ ENVIRON["RE"]) pad[m]=1
      if($0 ~ /UUIDs: 00001812-/) hid[m]=1
      if($0 ~ /ManufacturerData\.Key: 0x0006 /) ms[m]=1
    }
    END{for(i=1;i<=n;i++){m=order[i]; if(pad[m] || (hid[m] && ms[m])) print m}}' |
    grep -vxF -f <(echo "$PAIRED")
}

[ -n "$ADDR" ] && send "select $ADDR"
run "power on" 'power on succeeded'
run "default-agent" 'Default agent request successful'
for m in $MAC $STALE; do run "remove $m" 'has been removed|not available'; done
send "scan le"

SCAN_SECS=${SCAN_SECS:-180}   # override for testing
GRACE=${GRACE:-5}             # after another gamepad shows up, wait this long for <MAC>
step scan "Pairing mode now: hold the pair button until the logo flashes fast."
msg "Listening up to $((SCAN_SECS / 60)) min${MAC:+, preferring $MAC}"

# pick: <MAC> as soon as it shows up; otherwise the only gamepad seen for GRACE
# seconds. Several at once is ambiguous — name one on the command line.
PICK=""; REASON=""; FIRST=""
pick(){
  [ -n "$MAC" ] && seen "scan le" "\[NEW\] Device $MAC" && { PICK=$MAC; return 0; }
  mapfile -t PADS < <(gamepads)
  (( ${#PADS[@]} )) || return 1
  [ -n "$FIRST" ] || { FIRST=$SECONDS; msg "gamepad seen: ${PADS[*]} — waiting ${GRACE} s for the preferred one"; }
  (( SECONDS - FIRST >= GRACE )) || return 1
  if (( ${#PADS[@]} == 1 )); then PICK=${PADS[0]}
  else REASON="several gamepads in pairing mode: ${PADS[*]} — run again with the one to pair"; fi
}
poll "$SCAN_SECS" pick || REASON="no controller seen${MAC:+ ($MAC)}"

if [ -n "$PICK" ]; then
  step pair "Pairing $PICK (scan stays on)"
  run "pair $PICK" 'Pairing successful|Failed to pair|not available' 30
  if seen "pair $PICK" 'Pairing successful'; then
    run "trust $PICK" 'trust succeeded'
    run "connect $PICK" 'Connection successful|Failed to connect' 20
    wait_for "connect $PICK" 'ServicesResolved: yes' 10   # let HID setup finish before scan off
  else
    REASON="pairing failed"
  fi
fi
run "scan off" 'Discovery stopped'
[ -n "$PICK" ] && run "info $PICK" 'Connected: (yes|no)|not available'
send "quit"; exec 3>&-; wait

# Success = an input device exists for the controller (BlueZ sets its uniq to the
# device address). Paired+connected without one is the HID-over-GATT setup failing
# before encryption ("Report Map read failed"), which bluetoothd won't retry.
INPUT_DEVICES=${INPUT_DEVICES:-/proc/bus/input/devices}   # override for testing
if [ -n "$PICK" ] && seen "info $PICK" 'Paired: yes' && seen "info $PICK" 'Connected: yes'; then
  step input
  HINT=""
  [ -n "$MAC" ] && [ "$PICK" != "$MAC" ] && HINT="Note: paired $PICK, not $MAC — set MAC=$PICK in ${CONF/#$HOME/\~} to prefer it"
  [ -z "$MAC" ] && HINT="Tip: set MAC=$PICK in ${CONF/#$HOME/\~} to prefer this controller"
  if poll 10 grep -qix "U: Uniq=$PICK" "$INPUT_DEVICES"; then
    step ok "Paired and connected ($PICK)."
    [ -n "$HINT" ] && msg "$HINT"
    notify input-gaming "Paired and connected"
    exit 0
  fi
  step noinput "Paired and connected, but no input device was created."
  msg "Fix: sudo systemctl restart bluetooth, then press the Xbox button (or reboot)."
  msg "Full bluetoothctl log: $L"
  notify dialog-warning "Paired, but no gamepad device — restart bluetooth"
  exit 3
fi
step fail "Pairing did not complete${REASON:+: $REASON}."
# errors from the scan on (the startup "remove" replies "not available" are expected)
ERRS=$(since "scan le" | grep -aE "Failed to pair|Failed to connect|not available")
[ -n "$ERRS" ] && msg "$ERRS"
msg "Full bluetoothctl log: $L"
notify dialog-error "Pairing failed — see the terminal"
exit 1
