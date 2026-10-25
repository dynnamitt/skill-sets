#!/usr/bin/env bash
# Fixture for graph-in-pane: a small pairing script.
. ./lib.sh

scan() {
  bluetoothctl scan on
}

pick() {
  local n
  n=$(echo "$1" | wc -l)
  case $n in
    0) exit 3 ;;
    1) printf '%s\n' "$1" ;;
    *)
      echo "pick one"
      read -r choice
      printf '%s\n' "$choice"
      ;;
  esac
  return 0
}

scan
pick "$(bluetoothctl devices)"
exit 0
