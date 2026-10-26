# dotlive.sh — live, flicker-free progress view of a DOT graph in a kitty-protocol terminal.
# Source it from a bash script. Declare every step up front in one DOT file, then flip
# node states as the script runs; the graph is laid out once, so nothing moves.
#
#   . path/to/dotlive.sh
#   live_start pipeline.gv                 # alt screen, layout pinned, traps installed
#   live_set build running; live_draw
#   make build >>"$LIVE_LOG" 2>&1 && live_set build done || live_set build failed
#   live_note "build finished"; live_draw
#   live_stop                              # back to the main screen, final frame inline
#
# States: pending (default) running done failed skipped.
# Node ids must be plain identifiers ([A-Za-z0-9_]): they double as state file names.
# Background jobs may call live_set/live_note (state lives in files). live_draw only draws
# when something changed; while a live_watch_start poller runs it is the only drawer and
# the parent's live_draw calls are no-ops.
# Send step output to "$LIVE_LOG": anything printed to the terminal scrolls the frame.
# live_start sets EXIT/INT/TERM/WINCH traps. Without image support it prints text lines.
# Colours follow FIT_THEME (auto: re-coloured for a dark terminal background).

LIVE_IDS=(424201 424202)          # kitty image ids, alternated so a frame never blanks
LIVE_POLL_S=0.2                   # live_watch_start poll interval
LIVE_STOP_POLL_S=0.05             # live_stop: wait step while the poller finishes its frame
LIVE_NOTE_ROWS=1                  # terminal rows under the graph for the status line
LIVE_NODE_STYLE="rounded,filled"
declare -A LIVE_STYLE=(           # light terminal background
  [pending]='fillcolor="#eeeeee", color="#bdbdbd", fontcolor="#757575"'
  [running]='fillcolor="#fff59d", color="#f9a825", penwidth=2'
  [done]='fillcolor="#c8e6c9", color="#43a047"'
  [failed]='fillcolor="#ffcdd2", color="#e53935", penwidth=2'
  [skipped]='fillcolor="#fafafa", color="#bdbdbd", style="rounded,filled,dashed"'
)
declare -A LIVE_STYLE_DARK=(      # dark background; pending keeps the re-coloured graph's look
  [pending]=''
  [running]='fillcolor="#4a4216", color="#fbc02d", penwidth=2'
  [done]='fillcolor="#1e3a22", color="#4caf50"'
  [failed]='fillcolor="#4a1c1c", color="#ef5350", penwidth=2'
  [skipped]='fillcolor="transparent", color="#5f6b68", fontcolor="#7d8a87", style="rounded,filled,dashed"'
)

here_live=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
# shellcheck source=dotfit.sh
. "$here_live/dotfit.sh"

# Lay the graph out once and take over the screen.
#   @param {string} file  DOT file declaring every step
#   @param {string} dir   auto (default) | TB | LR — see fit_layout
#   @returns sets LIVE_DIR, LIVE_LOG (step output goes here; kept after live_stop)
live_start() {
  LIVE_DIR=$(mktemp -d) LIVE_FRAME=0 LIVE_RESIZED= LIVE_WATCH_PID= LIVE_GFX=0 FIT_DARK=0
  LIVE_LOG=${LIVE_LOG:-$(mktemp -t dotlive.XXXXXX.log)}
  mkdir "$LIVE_DIR/state"; : > "$LIVE_DIR/note"; : > "$LIVE_DIR/drawn"
  trap live_stop EXIT
  trap 'live_stop; exit 130' INT TERM
  trap 'LIVE_RESIZED=1' WINCH
  if fit_gfx; then
    LIVE_GFX=1
    fit_colors
    fit_measure "$LIVE_NOTE_ROWS"
    fit_layout "$1" "$LIVE_DIR/raw.gv" "${2:-auto}"
    fit_recolor < "$LIVE_DIR/raw.gv" > "$LIVE_DIR/laid.gv"
    printf '\e[?1049h\e[?25l\e[H\e[2J'
  fi
  live_draw
}

# Set a node's state; safe from subshells and background jobs.
#   @param {string} node   node id
#   @param {string} state  pending | running | done | failed | skipped
live_set() {
  [[ $1 =~ ^[A-Za-z0-9_]+$ ]] || { echo "dotlive: bad node id '$1'" >&2; return 1; }
  live__put "$LIVE_DIR/state/$1" "$2"
}

# Set the status line under the graph.
#   @param {...string} text
live_note() { live__put "$LIVE_DIR/note" "$*"; }

# Atomic write (temp file + rename), so a reader never sees half a value.
live__put() { printf '%s' "$2" > "$1.$BASHPID" && mv -f "$1.$BASHPID" "$1"; }

# "id state" per line for every node that has a state.
live__states() {
  local f
  for f in "$LIVE_DIR"/state/*; do [ -e "$f" ] && printf '%s %s\n' "${f##*/}" "$(<"$f")"; done
  return 0
}

# Draw the current state when it differs from what was last drawn (or the window was
# resized). The "drawn" fingerprint is a file, so the parent and the poller agree on it.
#   @returns {status} 1 when rendering failed
live_draw() {
  [ -n "${LIVE_DIR:-}" ] || return 0
  [ -n "${LIVE_WATCH_PID:-}" ] && return 0   # a poller is the one drawer (it never sees this set)
  local states note sig
  states=$(live__states) note=$(<"$LIVE_DIR/note")
  sig="$states|$note"
  if [ "$LIVE_GFX" = 1 ] && [ -n "$LIVE_RESIZED" ]; then
    LIVE_RESIZED=
    fit_measure "$LIVE_NOTE_ROWS"
    printf '\e[2J'
  elif [ "$sig" = "$(<"$LIVE_DIR/drawn")" ]; then
    return 0
  fi
  if [ "$LIVE_GFX" = 1 ]; then live__frame "$states" "$note" || return 1
  else live__line "$states" "$note"; fi
  printf '%s' "$sig" > "$LIVE_DIR/drawn"
}

# Render frame.png from the pinned layout plus per-state overrides, then swap it in: new
# image first, old one deleted after, inside a synchronized update (one paint).
live__frame() {
  local id=${LIVE_IDS[LIVE_FRAME % 2]} old=${LIVE_IDS[(LIVE_FRAME + 1) % 2]} n st style
  LIVE_FRAME=$(( LIVE_FRAME + 1 ))
  {
    sed '$d' "$LIVE_DIR/laid.gv"
    while read -r n st; do
      [ -n "$n" ] || continue
      if [ "$FIT_DARK" = 1 ]; then style=${LIVE_STYLE_DARK[$st]:-}; else style=${LIVE_STYLE[$st]:-}; fi
      printf '%s [style="%s", %s]\n' "$n" "$LIVE_NODE_STYLE" "$style"
    done <<< "$1"
    echo '}'
  } | neato -n2 -Tpng -Gdpi="$FIT_DPI" -Gsize="$FIT_SIZE" -o "$LIVE_DIR/frame.png" || return 1
  printf '\e[?2026h'
  fit_show --image-id "$id" --place "${FIT_COLS}x${FIT_ROWS}@0x0" < "$LIVE_DIR/frame.png"
  printf '\e_Ga=d,d=I,i=%s,q=2\e\\' "$old"
  printf '\e[%d;1H\e[2K%s' "$(( FIT_ROWS + 1 ))" "${2:0:FIT_COLS}"
  printf '\e[?2026l'
}

# Text fallback: "[state] node …" for every node with a state, then the note.
live__line() {
  local n st line=
  while read -r n st; do [ -n "$n" ] && line+="[$st] $n  "; done <<< "$1"
  line+=$2
  [ -n "$line" ] && printf '%s\n' "$line"
  return 0
}

# Redraw from a background poller whenever state changes — for parallel jobs while the
# parent is blocked in `wait`. Stopped by live_stop.
live_watch_start() {
  ( trap - EXIT INT TERM; trap 'LIVE_RESIZED=1' WINCH
    until [ -e "$LIVE_DIR/stop" ]; do live_draw; sleep "$LIVE_POLL_S"; done
    : > "$LIVE_DIR/stopped" ) &
  LIVE_WATCH_PID=$!
  disown "$LIVE_WATCH_PID"          # not the caller's job: a bare `wait` would block on it
}

# Stop the poller (it finishes its frame), draw the final state, leave the alt screen and
# reprint the last frame inline. Idempotent.
live_stop() {
  [ -n "${LIVE_DIR:-}" ] || return 0
  if [ -n "$LIVE_WATCH_PID" ]; then
    : > "$LIVE_DIR/stop"
    while [ ! -e "$LIVE_DIR/stopped" ] && kill -0 "$LIVE_WATCH_PID" 2>/dev/null; do
      sleep "$LIVE_STOP_POLL_S"
    done
    LIVE_WATCH_PID=
  fi
  live_draw
  if [ "$LIVE_GFX" = 1 ]; then
    printf '\e[?25h\e[?1049l'
    [ -s "$LIVE_DIR/frame.png" ] && fit_show < "$LIVE_DIR/frame.png"
    [ -s "$LIVE_DIR/note" ] && printf '%s\n' "$(<"$LIVE_DIR/note")"
  fi
  echo "log: $LIVE_LOG"
  rm -rf "$LIVE_DIR"; LIVE_DIR=
  trap - EXIT INT TERM WINCH
}
