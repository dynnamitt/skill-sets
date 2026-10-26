# dotlive.sh — live, flicker-free progress view of a DOT graph in a kitty-protocol terminal.
# Source it from a bash script. Declare every step up front in one DOT file, then flip
# node states as the script runs; the graph is laid out once, so nothing moves (until the
# window is resized: then it is laid out again for the new shape, once the size settles).
#
#   . path/to/dotlive.sh
#   live_start pipeline.gv                 # alt screen, layout pinned, traps, poller
#   live_set build running; live_draw
#   make build >>"$LIVE_LOG" 2>&1 && live_set build done || live_set build failed
#   live_note "build finished"; live_draw
#   live_stop                              # back to the main screen, final frame inline
#
# States: pending (default) running done failed skipped.
# Node ids must be plain identifiers ([A-Za-z0-9_]): they double as state file names.
# Background jobs may call live_set/live_note (state lives in files). live_draw only draws
# when something changed. In a graphics terminal live_start runs a poller that is the only
# drawer — the parent's live_draw calls are no-ops there — so a resize redraws even while
# the script is blocked in a long step. A "Title (LR)" header sits above the graph.
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
  LIVE_DIR=$(mktemp -d) LIVE_FRAME=0 LIVE_WATCH_PID= LIVE_GFX=0 FIT_DARK=0 FIT_RESIZED=
  LIVE_DIR_ARG=${2:-auto}
  LIVE_LOG=${LIVE_LOG:-$(mktemp -t dotlive.XXXXXX.log)}
  mkdir "$LIVE_DIR/state"; : > "$LIVE_DIR/note"; : > "$LIVE_DIR/drawn"
  cp -- "$1" "$LIVE_DIR/src.gv"
  fit_title "$LIVE_DIR/src.gv" "$1"
  trap live_stop EXIT
  trap 'live_stop; exit 130' INT TERM
  trap 'FIT_RESIZED=1' WINCH
  if fit_gfx; then
    LIVE_GFX=1
    fit_colors
    live__layout
    printf '\e[?1049h\e[?25l\e[H\e[2J'
    live_draw
    live_watch_start
  else
    printf '%s\n' "$FIT_TITLE"
    live_draw
  fi
}

# Measure the window and lay the graph out for it (orientation re-picked). The orientation
# also goes to a file: live_stop runs in the parent, which never sees a poller's relayout.
live__layout() {
  fit_measure "$(( FIT_HEADER_ROWS + LIVE_NOTE_ROWS ))"
  fit_layout "$LIVE_DIR/src.gv" "$LIVE_DIR/raw.gv" "$LIVE_DIR_ARG" || return
  fit_recolor < "$LIVE_DIR/raw.gv" > "$LIVE_DIR/laid.gv" || return
  printf '%s' "$FIT_ORIENT" > "$LIVE_DIR/orient"
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

# "id state" per line for every node that has a state. Skips live__put's temp files
# (id.pid — node ids never contain a dot), which may vanish while being read.
live__states() {
  local f
  for f in "$LIVE_DIR"/state/*; do
    [[ ${f##*/} == *.* ]] && continue
    [ -e "$f" ] && printf '%s %s\n' "${f##*/}" "$(<"$f")"
  done
  return 0
}

# Draw the current state when it differs from what was last drawn (or the window was
# resized). The "drawn" fingerprint is a file, so the parent and the poller agree on it.
# After a resize it first waits for the size to settle (bar on the header row; state
# changes meanwhile are held), then lays out again for the new window.
#   @returns {status} 1 when layout or rendering failed
live_draw() {
  [ -n "${LIVE_DIR:-}" ] || return 0
  [ -n "${LIVE_WATCH_PID:-}" ] && return 0   # a poller is the one drawer (it never sees this set)
  local states note sig resized=
  if [ "$LIVE_GFX" = 1 ] && [ -n "$FIT_RESIZED" ]; then
    fit_settle
    live__layout || return 1
    resized=1
  fi
  states=$(live__states) note=$(<"$LIVE_DIR/note")
  sig="$states|$note"
  [ -z "$resized" ] && [ "$sig" = "$(<"$LIVE_DIR/drawn")" ] && return 0
  if [ "$LIVE_GFX" = 1 ]; then live__frame "$states" "$note" "$resized" || return 1
  else live__line "$states" "$note"; fi
  printf '%s' "$sig" > "$LIVE_DIR/drawn"
}

# Render frame.png from the pinned layout plus per-state overrides, then swap it in: new
# image first, old one deleted after, inside a synchronized update (one paint). After a
# resize ($3 set) the screen is cleared inside that same update.
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
  [ -n "${3:-}" ] && printf '\e[2J'
  printf '\e[1;1H'; fit_header
  fit_show --image-id "$id" --place "${FIT_COLS}x${FIT_ROWS}@0x${FIT_HEADER_ROWS}" < "$LIVE_DIR/frame.png"
  printf '\e_Ga=d,d=I,i=%s,q=2\e\\' "$old"
  printf '\e[%d;1H\e[2K%s' "$(( FIT_HEADER_ROWS + FIT_ROWS + 1 ))" "${2:0:FIT_COLS}"
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

# Redraw from a background poller whenever state changes or the window is resized — also
# while the parent is blocked in a step or in `wait`. live_start calls it in a graphics
# terminal; calling it again is a no-op. It draws once more on its way out. Stopped by
# live_stop.
live_watch_start() {
  [ -n "${LIVE_WATCH_PID:-}" ] && return 0
  ( trap - EXIT INT TERM; trap 'FIT_RESIZED=1' WINCH
    # `|| :` — a failed frame must not end the poller under the caller's set -e
    until [ -e "$LIVE_DIR/stop" ]; do live_draw || :; sleep "$LIVE_POLL_S"; done
    live_draw || :
    : > "$LIVE_DIR/stopped" ) &
  LIVE_WATCH_PID=$!
  disown "$LIVE_WATCH_PID"          # not the caller's job: a bare `wait` would block on it
}

# Stop the poller (it draws the final state on its way out) or draw it here, leave the alt
# screen and reprint the header and last frame inline. Idempotent.
live_stop() {
  [ -n "${LIVE_DIR:-}" ] || return 0
  if [ -n "$LIVE_WATCH_PID" ]; then
    : > "$LIVE_DIR/stop"
    while [ ! -e "$LIVE_DIR/stopped" ] && kill -0 "$LIVE_WATCH_PID" 2>/dev/null; do
      sleep "$LIVE_STOP_POLL_S"
    done
    LIVE_WATCH_PID=
  fi
  [ -e "$LIVE_DIR/stopped" ] || live_draw    # no poller, or it died before its last frame
  if [ "$LIVE_GFX" = 1 ]; then
    printf '\e[?25h\e[?1049l'
    FIT_ORIENT=$(<"$LIVE_DIR/orient"); fit_cols
    fit_header; printf '\n'
    [ -s "$LIVE_DIR/frame.png" ] && fit_show < "$LIVE_DIR/frame.png"
    [ -s "$LIVE_DIR/note" ] && printf '%s\n' "$(<"$LIVE_DIR/note")"
  fi
  echo "log: $LIVE_LOG"
  rm -rf "$LIVE_DIR"; LIVE_DIR=
  trap - EXIT INT TERM WINCH
}
