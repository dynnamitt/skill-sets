# dotfit.sh — size, orient, lay out, theme and show a Graphviz render in the current
# terminal. Sourced by dotcat and dotlive.sh; not run directly. fit__* names are internal.
# Results land in FIT_* globals (a bash function can't return several values).

FIT_TEXT_EM_PER_CELL=0.8          # graph font em height as a fraction of the cell height
FIT_FONT_PT=${FIT_FONT_PT:-14}    # Graphviz default fontsize; set it if the graph uses another
FIT_PT_PER_IN=72                  # Graphviz points per inch (bb, size)
FIT_DPI_MIN=48 FIT_DPI_MAX=300
FIT_DEFAULT_LINES=24 FIT_DEFAULT_COLS=80   # when the terminal reports no size (or 0x0)
FIT_CELL_W=10 FIT_CELL_H=20       # fallback cell size in pixels
FIT_TIE=0.05                      # orientations whose fit differs by less than this count as equal
FIT_MIN_SCALE=0.5                 # below this the text gets hard to read: warn
FIT_DETECT_TIMEOUT=1              # seconds for icat's graphics-support probe
FIT_QUERY_TIMEOUT=1               # seconds per reply character from the colour query
FIT_DARK_LUMA=128                 # background luma (0-255, Rec. 601) below this counts as dark
FIT_THEME=${FIT_THEME:-auto}      # auto (follow the terminal background) | dark | light
FIT_HEADER_ROWS=1                 # "Title (LR)" row above the image
FIT_RESIZE_SETTLE_S=0.2           # redraw once the window size has held this long
FIT_BAR_COLS=10                   # settle bar on the header row; one cell per tick
FIT_DIR=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
FIT_RESIZED=                      # callers' WINCH trap sets it; fit_settle clears it

# Succeed when stdout is a terminal that shows kitty-protocol images.
#   @returns {status} 0 when images will show
fit_gfx() {
  [ -t 1 ] && command -v kitten >/dev/null &&
    kitten icat --detect-support --detection-timeout "$FIT_DETECT_TIMEOUT" 2>/dev/null
}

# Show a PNG read from stdin. icat reads the bytes itself, so the caller may delete or
# overwrite the file as soon as this returns (passing a path lets icat send only the path,
# which kitty opens later); stream also skips per-call transfer probing and works over
# SSH and tmux.
#   @param {...string} extra kitten icat options (--place, --image-id, …)
#   @returns {status} icat's
fit_show() {
  kitten icat --stdin=yes --transfer-mode=stream --align left "$@"
}

# Measure the window and derive a render size whose text matches the terminal's.
#   @param {int} reserve  rows to keep free under the image (default 1)
#   @returns sets FIT_COLS FIT_ROWS (cells for the image), FIT_DPI, FIT_SIZE ("w,h" inches)
fit_measure() {
  local reserve=${1:-1} lines= cols= pw= ph= ws=
  # `|| :` — with no tty there is no output, and a failing read ends set -e callers
  read -r lines cols < <({ stty size </dev/tty; } 2>/dev/null) || :
  ws=$(kitten icat --print-window-size 2>/dev/null) || :
  [[ $ws =~ ^([0-9]+)x([0-9]+)$ ]] && pw=${BASH_REMATCH[1]} ph=${BASH_REMATCH[2]}
  # cells and pixels are one window size read twice: trust it whole or not at all
  if ! (( ${lines:-0} > 0 && ${cols:-0} > 0 && ${pw:-0} > 0 && ${ph:-0} > 0 )); then
    lines=$FIT_DEFAULT_LINES cols=$FIT_DEFAULT_COLS
    pw=$(( cols * FIT_CELL_W )) ph=$(( lines * FIT_CELL_H ))
  fi
  FIT_COLS=$cols FIT_ROWS=$(( lines > reserve + 1 ? lines - reserve : 1 ))
  read -r FIT_DPI FIT_SIZE < <(awk -v pw="$pw" -v ph="$(( ph * FIT_ROWS / lines ))" \
    -v ch="$(( ph / lines ))" -v em="$FIT_TEXT_EM_PER_CELL" -v pt="$FIT_FONT_PT" \
    -v ppi="$FIT_PT_PER_IN" -v lo="$FIT_DPI_MIN" -v hi="$FIT_DPI_MAX" 'BEGIN {
      dpi = ppi * ch * em / pt; dpi = dpi < lo ? lo : dpi > hi ? hi : dpi
      printf "%d %.2f,%.2f\n", dpi, pw / dpi, ph / dpi }')
}

# Lay a graph out once, choosing rankdir for this window, and keep the positioned DOT —
# render it with `neato -n2`, no second layout. Call fit_measure first (uses FIT_SIZE).
#   @param {string} in      DOT file
#   @param {string} out     laid-out DOT to write
#   @param {string} dir     auto (default) | TB | LR | BT | RL. auto keeps a rankdir the file
#                           sets; otherwise lays out TB and LR in parallel and keeps the one
#                           that shrinks least (tie: wide pane → LR, tall pane → TB)
#   @param {string} engine  layout engine (default dot); rankdir applies to dot only
#   @returns {status} the engine's; sets FIT_ORIENT (TB | LR | BT | RL, or the engine name)
fit_layout() {
  local in=$1 out=$2 dir=${3:-auto} engine=${4:-dot} tb lr st=0
  if [ "$engine" != dot ]; then FIT_ORIENT=$engine; "$engine" -Tdot "$in" > "$out"; return; fi
  if [ "$dir" = auto ] && grep -q rankdir "$in"; then
    dot -Tdot "$in" > "$out" || return
    FIT_ORIENT=$(awk 'match($0, /rankdir="?[A-Za-z]+/) {
      s = substr($0, RSTART + 8, RLENGTH - 8); gsub(/"/, "", s); print toupper(s); exit }' "$out")
    FIT_ORIENT=${FIT_ORIENT:-TB}
    return
  fi
  if [ "$dir" != auto ]; then FIT_ORIENT=$dir; dot -Tdot -Grankdir="$dir" "$in" > "$out"; return; fi
  dot -Tdot -Grankdir=TB "$in" > "$out.TB" & tb=$!
  dot -Tdot -Grankdir=LR "$in" > "$out.LR" & lr=$!
  wait "$tb" || st=$?
  wait "$lr" || st=$?
  (( st == 0 )) || return "$st"
  dir=$(fit__pick "$out.TB" "$out.LR")
  FIT_ORIENT=$dir
  mv -f "$out.$dir" "$out"
  rm -f "$out.TB" "$out.LR"
}

# Pick the header title: the root graph's label, else the file's basename, else the graph
# id, else "stdin". HTML labels and anonymous graphs (gvpr names them %1) are skipped.
#   @param {string} file  DOT file to read
#   @param {string} name  what the user passed ("-" or empty for stdin)
#   @returns sets FIT_TITLE
fit_title() {
  local id label
  { IFS= read -r id; label=$(cat); } < <(gvpr 'BEG_G {
      printf("%s\n%s\n", $G.name, hasAttr($G, "label") ? aget($G, "label") : ""); }' "$1" 2>/dev/null)
  label=${label//\\[nlr]/ } label=${label//$'\n'/ }
  [[ $label == '<'* ]] && label=
  [[ $id == %* ]] && id=
  FIT_TITLE=$label
  [ -n "$FIT_TITLE" ] || { [ -n "${2:-}" ] && [ "$2" != - ] && FIT_TITLE=${2##*/}; }
  FIT_TITLE=${FIT_TITLE:-${id:-stdin}}
}

# Header line, no newline and no positioning: bold title, dim (orientation), then an
# optional bar. The title is cut first so orientation and bar always fit in FIT_COLS.
#   @param {string} bar  text after the orientation (default none)
fit_header() {
  local tail=" (${FIT_ORIENT:-?})${1:+  $1}" cols=${FIT_COLS:-$FIT_DEFAULT_COLS} room
  room=$(( cols - ${#tail} ))
  (( room > 0 )) || room=0 tail=${tail:0:cols}
  printf '\e[2K\e[1m%s\e[22m\e[2m%s\e[22m' "${FIT_TITLE:0:room}" "$tail"
}

# Wait until the window size has held for FIT_RESIZE_SETTLE_S, drawing an ASCII bar on the
# header row (row 1) that fills over that time; each new WINCH (FIT_RESIZED) restarts it.
# The old frame stays on screen meanwhile. Call fit_measure afterwards.
fit_settle() {
  local steps=$FIT_BAR_COLS i=0 tick
  tick=$(awk -v s="$FIT_RESIZE_SETTLE_S" -v n="$steps" 'BEGIN { printf "%.3f", s / n }')
  while :; do
    if [ -n "$FIT_RESIZED" ]; then FIT_RESIZED= i=0; fi
    fit_cols
    printf '\e[1;1H'; fit_header "$(fit__bar "$i" "$steps")"
    (( i >= steps )) && [ -z "$FIT_RESIZED" ] && return 0
    sleep "$tick"
    (( i < steps )) && i=$(( i + 1 ))
  done
}

# Refresh FIT_COLS from the terminal (unchanged when there is no tty).
fit_cols() {
  local lines= cols=
  read -r lines cols < <({ stty size </dev/tty; } 2>/dev/null) || :
  (( ${cols:-0} > 0 )) && FIT_COLS=$cols
  return 0
}

# "[####------]": $1 of $2 steps done, FIT_BAR_COLS wide.
fit__bar() {
  local n=$(( $1 * FIT_BAR_COLS / $2 )) done todo
  printf -v done '%*s' "$n" ''; printf -v todo '%*s' "$(( FIT_BAR_COLS - n ))" ''
  printf '[%s%s]' "${done// /#}" "${todo// /-}"
}

# Width and height in points of a laid-out graph (its first bb is the root's).
fit__bb() {
  awk 'match($0, /bb="[^"]*"/) {
    split(substr($0, RSTART + 4, RLENGTH - 5), b, ","); print b[3] - b[1], b[4] - b[2]; exit }' "$1"
}

# TB or LR: whichever laid-out file ($1 TB, $2 LR) needs less shrinking into FIT_SIZE.
fit__pick() {
  awk -v tb="$(fit__bb "$1")" -v lr="$(fit__bb "$2")" -v size="$FIT_SIZE" -v ppi="$FIT_PT_PER_IN" \
    -v tie="$FIT_TIE" -v min="$FIT_MIN_SCALE" 'BEGIN {
    split(size, s, ","); w = s[1] * ppi; h = s[2] * ppi
    split(tb, a, " "); split(lr, b, " ")
    ft = fit(a[1], a[2]); fl = fit(b[1], b[2])
    dir = ft - fl > tie ? "TB" : fl - ft > tie ? "LR" : (w >= h ? "LR" : "TB")
    best = ft > fl ? ft : fl
    if (best < min)
      printf "dotfit: graph shrinks to %d%% to fit; split it or view the file at full size\n", best * 100 > "/dev/stderr"
    print dir }
    function fit(gw, gh) { return gw > 0 && gh > 0 ? min1(w / gw, h / gh) : 0 }
    function min1(x, y) { m = x < y ? x : y; return m > 1 ? 1 : m }'
}

# Ask the terminal for its colours and decide whether to re-colour for a dark background.
# One round trip: OSC 11 (background) and OSC 10 (foreground), then DA1, which every
# terminal answers — so a terminal that ignores OSC costs no timeout.
#   @returns sets FIT_DARK (1|0) and FIT_BG/FIT_FG (#rrggbb, empty when not reported).
#            FIT_THEME: auto → dark when FIT_BG is darker than FIT_DARK_LUMA; dark; light.
fit_colors() {
  local reply= ch c da=$'\e''\[\?[0-9;]*c$'
  FIT_DARK=0 FIT_BG= FIT_FG=
  [ "$FIT_THEME" = light ] && return 0
  if [ -t 1 ] && { : </dev/tty; } 2>/dev/null; then
    printf '\e]11;?\e\\\e]10;?\e\\\e[c' >/dev/tty
    while IFS= read -rs -n1 -t "$FIT_QUERY_TIMEOUT" ch </dev/tty; do
      reply+=$ch
      [[ $reply =~ $da ]] && break
    done
  fi
  FIT_BG=$(fit__rgb 11 "$reply") FIT_FG=$(fit__rgb 10 "$reply")
  if [ "$FIT_THEME" = dark ]; then FIT_DARK=1; return 0; fi
  [ -n "$FIT_BG" ] || return 0      # auto, no answer: leave the graph's own colours
  c=${FIT_BG#\#}
  (( (299 * 16#${c:0:2} + 587 * 16#${c:2:2} + 114 * 16#${c:4:2}) / 1000 < FIT_DARK_LUMA )) && FIT_DARK=1
  return 0
}

# OSC colour $1 (10 | 11) from a terminal reply, as #rrggbb.
fit__rgb() {
  [[ $2 =~ \]$1\;rgb:([0-9a-fA-F]{2})[0-9a-fA-F]*/([0-9a-fA-F]{2})[0-9a-fA-F]*/([0-9a-fA-F]{2}) ]] &&
    printf '#%s%s%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
  return 0
}

# Filter DOT on stdin: re-coloured for a dark terminal (dark.gvpr) when FIT_DARK=1,
# unchanged otherwise. Unreported colours fall back to dark.gvpr's defaults.
#   @returns {status} gvpr's
fit_recolor() {
  if [ "${FIT_DARK:-0}" != 1 ]; then cat; return; fi
  gvpr -c ${FIT_BG:+-a "$FIT_BG $FIT_FG"} -f "$FIT_DIR/dark.gvpr"
}
