---
name: live-updates
description: Redrawing a Graphviz state/progress diagram in a kitty terminal while a script runs, without flicker, jumping layout, or scrolling — pinned layout, image-id swaps, synchronized updates, alt screen, parallel jobs.
---

# Live progress diagrams without glitches

Checked 2026-10 against kitty 0.48.2 and the kitty graphics-protocol spec.
`scripts/dotlive.sh` packages all of this as a bash library; this file explains why each
piece is there, so the same approach can be rebuilt in another language.

## What makes a live view glitch

| Symptom | Cause | Fix |
|---|---|---|
| Nodes jump around between frames | Graph re-laid out with different nodes/labels | Declare every node up front; only change colours; pin the layout |
| Blank frame / flash on each update | `icat --clear` or `\e[2J` before drawing, or re-sending the same image id (the spec deletes the old image *and its placements* before the new data is placed) | Draw the new image under a second id, then delete the old one; wrap in a synchronized update |
| Image scrolls up, half off screen | Something printed to the terminal (step output, the image's trailing newline) | Alt screen, `--place` at a fixed cell, cursor hidden, step output → log file |
| Tearing on large images | Terminal painted mid-transfer | Synchronized update (`\e[?2026h` … `\e[?2026l`) |
| No image at all, but rows are reserved | `icat` got a path and sent only that; the frame was overwritten before kitty read it | PNG on stdin ([terminal-display.md](terminal-display.md)) |
| Wrong size after resizing the pane | Sized once at start | `trap … WINCH`, re-measure, redraw |
| Slow frames on big graphs | Running `dot` layout every frame | Lay out once with `-Tdot`, render frames with `neato -n2` |

## 1. Stable geometry: declare everything, pin the layout

Write the whole flow — every step, every branch, the failure sink — before the first frame.
Nodes that haven't happened yet are styled `pending` (grey), not absent. Then only fill and
pen colours change, and `dot` is deterministic for identical structure.

Go one step further and run the layout once:

```bash
dot -Tdot -Grankdir=LR flow.gv > laid.gv          # adds pos= to every node and edge
frame() { sed '$d' laid.gv; printf '%s\n' "$@" '}'; }   # append overrides before the last "}"
frame 'build [fillcolor="#fff59d"]' 'lint [fillcolor="#c8e6c9"]' |
  neato -n2 -Tpng -Gdpi=110 -Gsize=9.7,5.6 -o frame.png
```

`neato -n2` takes positions *and* edge splines from the input instead of laying out again,
so geometry is identical to the byte and rendering is a few milliseconds. Later
`node [attrs]` statements override earlier ones, which is what the appended lines rely on.

- **Restyling edges** (e.g. highlight the path taken): make the graph `strict digraph`.
  Then a repeated `a -> b [color=red]` merges into the existing edge; in a non-strict graph
  it adds a second edge with no spline.
- **Changing text**: don't put changing text in node labels (width changes break the pinned
  layout). Put it in a status line under the image (terminal text) or in `xlabel`s.
- **Unknown steps** (discovered at run time): pinning can't help; re-layout per frame and
  accept movement, or reserve placeholder nodes.

## 2. Swap images without a blank frame

The graphics protocol keeps image data and placements by id. Re-transmitting an existing id
deletes it and its placements first, so a redraw under the same id can show one empty frame.
Ping-pong two ids instead — place the new frame, *then* delete the old:

```bash
printf '\e[?2026h'                                         # begin synchronized update
kitten icat --transfer-mode=stream --image-id "$new" --place "${cols}x${rows}@0x0" --align left < frame.png
printf '\e_Ga=d,d=I,i=%s,q=2\e\\' "$old"                   # delete old image + its data, quietly
printf '\e[%d;1H\e[2K%s' "$(( rows + 1 ))" "$status"       # status line under the image
printf '\e[?2026l'                                         # end: terminal paints once
```

- `d=I` (capital) frees the image data too; lowercase `d=i` only removes placements and
  leaks memory over a long run. `q=2` suppresses the terminal's reply.
- Mode 2026 (synchronized output) makes the terminal hold painting until the closing
  sequence. Terminals that don't know it ignore it. kitty 0.49.2 fixed an image vanishing
  for one frame the first time it was replaced inside such an update — another reason to
  use two ids rather than replacing one.
- `--place` positions at a fixed cell and does not move the cursor to a new line, so nothing
  scrolls. It scales down to the rectangle but never up — render the PNG at the target
  pixel size ([terminal-display.md](terminal-display.md)).

## 3. Own the screen

```bash
printf '\e[?1049h\e[?25l\e[H\e[2J'      # alt screen, hide cursor, clear once
trap 'printf "\e[?2026l\e[?25h\e[?1049l"' EXIT
trap 'resized=1' WINCH                  # re-measure and redraw on the next frame
```

The alternate screen keeps scrollback clean and gives a fixed canvas. On exit, leave it and
`icat` the final frame inline so the result stays in the scrollback. Everything the steps
print must go to a log (`cmd >>"$LOG" 2>&1`); show its last line in the status row if useful.

## 4. Parallel steps

State in a bash variable dies with the subshell that set it. Keep it in files — one file per
node, written atomically (`printf … > tmp && mv tmp final`) — so background jobs can mark
themselves done. Exactly one process draws:

- parent draws after each `wait`, or
- a poller (`until [ -e stop ]; do draw-if-changed; sleep 0.2; done &`) redraws when the
  state fingerprint differs from the last drawn one. This also rate-limits: bursts of state
  changes cost one frame. `disown` it — a bare `wait` in the script otherwise waits for the
  poller and hangs — and stop it with a flag file it checks between frames, not `kill`: a
  killed drawer can leave its `icat` running and an escape sequence half written.

```bash
. dotlive.sh
live_start build.gv
live_watch_start                                   # background redraws
for t in lint test compile; do
  ( live_set "$t" running; "./$t.sh" >>"$LIVE_LOG" 2>&1 && live_set "$t" done || live_set "$t" failed ) &
done
wait
live_stop
```

## Throttling

`dot -Tdot` layout of a few hundred nodes can take a second; `neato -n2` rendering stays in
milliseconds. If a source emits events faster than ~10/s (log tailing, test runners), don't
draw per event — let the poller sample at a fixed interval.
