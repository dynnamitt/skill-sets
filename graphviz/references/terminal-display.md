---
name: terminal-display
description: Showing Graphviz output inside a bitmap-capable terminal (kitty first; Ghostty, WezTerm, sixel, tmux, SSH) — measuring the window, choosing dpi and size so text stays crisp, placing the image, and re-colouring for dark terminals.
---

# Graphviz in the terminal

Checked 2026-10 against kitty 0.48/0.49 and Graphviz 16.0. `scripts/dotcat` implements
everything below; read on when tuning it or doing it by hand.

## The sizing problem

Two knobs decide how a graph looks in a terminal pane:

- **`dpi`** — pixels per inch of the PNG. With Graphviz's default `fontsize=14` (points),
  text height in pixels is `14 × dpi / 72`. Pick the dpi that makes that close to the
  terminal's own text, and the graph reads like part of the console.
- **`size="w,h"`** (inches) — an upper bound. Graphviz scales the drawing **down** to fit;
  with a trailing `!` (`size="w,h!"`) it also scales **up**. Without `!` small graphs keep
  their natural (text-sized) scale, which is usually what you want.

Render at the final pixel size and let the terminal show it 1:1. Letting `icat` resample a
wrong-sized PNG blurs text (upscaling) or makes it unreadably thin (downscaling).

## Measuring a kitty window

```bash
kitten icat --print-window-size        # "1600x900" — pixels of this window (not the OS window)
stty size </dev/tty                    # "45 160"  — rows cols
```

From those: `cell_h = px_h / rows`. Choose `dpi = 72 × cell_h × 0.8 / fontsize` (graph em ≈ 80%
of a cell, like terminal glyphs) and `size = px_w/dpi , px_h×(rows−reserve)/rows/dpi`, where
`reserve` keeps the prompt row(s) free so the image doesn't scroll away. `fit_measure` in
`scripts/dotfit.sh` is the implementation (dpi clamp, 0×0 fallback); render with
`-Gdpi=… -Gsize=…` and show with `kitten icat --transfer-mode=stream --align left < g.png`.

HiDPI is handled for free: kitty reports physical pixels, so `cell_h` (and therefore dpi)
doubles on a 2× display and text stays the same visual size.

## `kitten icat` options that matter

| Option | Use |
|---|---|
| `--align left` | Default is centred; left aligns with the prompt and other output. |
| `--place WxH@LxT` | Put the image in a cell rectangle (origin 0,0 top-left). Scales **down** to fit; cursor ends at the image's top-left. Used for fixed-position live views. |
| `--scale-up` | With `--place`/`--fit`, also enlarge small images. Prefer rendering at size instead. |
| `--fit width\|height\|both\|none` | Without `--place`: how to fit the screen. Default `width`. |
| `--image-id N` | Fixed graphics-protocol id — the basis of flicker-free updates ([live-updates.md](live-updates.md)). |
| `--background '#1e1e2e'` | Composite a transparent PNG onto a colour. |
| `< file.png` (stdin) | **Pass the PNG on stdin in scripts.** Given a *path*, `detect` may pick `file` mode, which sends only the path (`t=f`): kitty opens it later, so a script that deletes or overwrites the PNG right after `icat` returns (temp dir trap, live frames) shows nothing — no error, the space still reserved. On stdin `icat` reads the bytes itself. |
| `--transfer-mode stream` | Bytes inline in the escape codes: no per-call transfer probe, works over SSH and tmux. |
| `--detect-support` | Exit 0 when the terminal speaks the protocol — use it to choose a fallback. |
| `--clear` | Removes **all** images on screen. Fine once; in a redraw loop it causes a blank frame. |

`icat` reads PNG, JPEG, GIF, WebP and more, but not SVG: render `-Tpng`.

## Graphviz's own terminal outputs

Recent Graphviz (16.x here; not the 2.42 in Debian/Ubuntu) adds:

- `dot -Tkitty g.gv` / `-Tkittyz` (zlib) — writes the kitty graphics escape directly to stdout,
  no `kitten` needed; streams the pixels, so it also works over SSH. No id, no placement, no
  fitting — set `-Gdpi`/`-Gsize` yourself. Good for one-offs.
- `dot -Tvt-24bit g.gv` (also `vt`, `vt-4up`, `vt-6up`, `vt-8up`) — Unicode block art for
  terminals **without** bitmap support. Each cell holds 1×2 pixels (more with the `-Nup`
  variants), so use a low dpi (`-Gdpi=30`) and expect shapes, not readable labels.

## Dark terminals

A white PNG in a dark theme is glaring. Don't bake a dark palette into each `.dot` — re-colour
at render time instead, so the source stays neutral and tool-generated DOT gets the same
treatment. `scripts/dark.gvpr` does that for any graph:

```bash
gvpr -c -a '#18201e #8ea4a0' -f scripts/dark.gvpr g.gv | dot -Tpng -o g.png   # terminal bg, fg
```

- The graph background becomes the terminal background, so the image blends into the pane.
- Greys/black/white are rebuilt from the terminal's bg/fg hues (light fills → dark surfaces,
  black ink → light ink); coloured fills keep their hue as dark tints, coloured lines and
  text keep their hue and get brighter — green still means done, red still means failed.
- Untouched: colour lists (`"red:blue"`), `transparent`, colours inside HTML-like labels.

`dotcat --theme auto` (default) and `dotlive.sh` (`FIT_THEME=auto`) ask the terminal for its
colours — `printf '\e]11;?\e\\'` (background) and `\e]10;?` (foreground); kitty replies
`\e]11;rgb:1818/2020/1e1e\e\\` — and apply `dark.gvpr` when the background is dark. Force with
`--theme dark|light` / `FIT_THEME`. No reply (some multiplexers) leaves the colours alone.

Hand-picking instead (a one-off image, or a graph whose colours must stay exact):

```dot
graph [bgcolor="transparent", fontcolor="#cdd6f4"]
node  [color="#7f849c", fontcolor="#cdd6f4", fillcolor="#313244", style="rounded,filled"]
edge  [color="#7f849c", fontcolor="#a6adc8"]
```

## Other terminals

| Terminal | Bitmap route |
|---|---|
| **kitty** | kitty graphics protocol — `kitten icat`, `dot -Tkitty` |
| **Ghostty** | kitty graphics protocol — `kitten icat` works (install kitty's `kitten` binary) |
| **WezTerm** | kitty protocol after `enable_kitty_graphics = true` (partial); `wezterm imgcat g.png` (iTerm2 protocol) always works |
| **Konsole** | kitty protocol (most of it) and sixel |
| **foot, xterm (`-ti vt340`), Windows Terminal ≥ 1.22** | sixel — `img2sixel g.png` or `chafa -f sixels g.png` |
| **iTerm2** | `imgcat g.png` |
| anything else | `dot -Tvt-24bit`, or `chafa g.png` (symbols) |

## tmux and SSH

- **tmux** swallows graphics unless allowed: `set -g allow-passthrough on` in `tmux.conf`.
  `icat` then detects tmux, wraps the escapes, and switches to Unicode placeholders. `--clear`
  cannot work there (only tmux knows the screen); `--place` rectangles are pane-relative.
- **SSH** — `kitten icat` detects remote sessions and streams; force with
  `--transfer-mode stream` if detection is slow. `kitten ssh` also forwards it cleanly.
