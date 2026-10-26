---
name: install
description: Installing Graphviz (dot, neato, tred, …) on Arch/Manjaro, Debian/Ubuntu, Fedora, openSUSE, Alpine, NixOS, macOS, and on Bazzite / Fedora Atomic without layering.
---

# Installing Graphviz

Checked 2026-10. Graphviz upstream is at 16.x; Debian 12/13 and Ubuntu 24.04 still ship
2.42.x (2019-era). Everything in this skill works on 2.42 — the CLI, attributes and
`neato -n2` have been stable for a decade — so the distro package is fine.

Check first: `dot -V` (prints to stderr). One package gives every tool: `dot`, `neato`,
`fdp`, `sfdp`, `circo`, `twopi`, `tred`, `unflatten`, `ccomps`, `sccmap`, `gvpr`, `gvpack`.

| Distro | Command |
|---|---|
| Arch / Manjaro / EndeavourOS | `sudo pacman -S graphviz` |
| Debian / Ubuntu / Mint / Pop!_OS | `sudo apt install graphviz` |
| Fedora (Workstation, Server) | `sudo dnf install graphviz` |
| openSUSE Tumbleweed / Leap | `sudo zypper install graphviz graphviz-gd` |
| Alpine | `apk add graphviz font-dejavu` |
| NixOS / nix | `nix profile install nixpkgs#graphviz` (or `environment.systemPackages`) |
| Void | `sudo xbps-install graphviz` |
| macOS | `brew install graphviz` |
| Windows | `winget install Graphviz.Graphviz` |

## Bazzite (and other Fedora Atomic: Silverblue, Kinoite, Aurora, Bluefin)

The root filesystem is an immutable image, so `dnf install` is not available on the host.
Prefer, in order:

1. **Homebrew** — preinstalled on Bazzite / Universal Blue images:
   ```bash
   brew install graphviz
   ```
   Binaries land in `/home/linuxbrew/.linuxbrew/bin`. Interactive shells have it on `PATH`;
   scripts started from the desktop (a `.desktop` launcher, a systemd user unit, a kitty
   startup session) often don't. Scripts should fall back explicitly:
   ```bash
   command -v dot >/dev/null || PATH=$PATH:/home/linuxbrew/.linuxbrew/bin
   ```
2. **Distrobox** — when the rest of the toolchain already lives in a box:
   ```bash
   distrobox create -n dev -i registry.fedoraproject.org/fedora-toolbox:latest
   distrobox enter dev -- sudo dnf install -y graphviz
   distrobox enter dev -- distrobox-export --bin /usr/bin/dot   # optional: host shim in ~/.local/bin
   ```
   Export each tool you call from the host (`neato`, `tred`, …) the same way.
3. **Layering** — `rpm-ostree install graphviz` then reboot. Works, but Bazzite discourages
   layering (slower updates, rebase conflicts); use it only when 1 and 2 don't fit.

## Troubleshooting

- `Format: "png" not recognized` — the renderer plugin is missing or unregistered. Install
  the plugin package (openSUSE: `graphviz-gd`; a `-gd`/`-cairo` split elsewhere), or, after a
  source/manual install, run `sudo dot -c` to rebuild the plugin config. `dot -Tpng:`
  (trailing colon) lists the png renderers that are present.
- **Empty boxes or tofu in labels** — no fonts in a minimal container. Install a font package
  (`font-dejavu`, `fonts-dejavu-core`, `dejavu-sans-fonts`) and name a generic family:
  `fontname="Sans"` or `"Monospace"`; fontconfig resolves it.
- **Ugly serif text** — the default font is Times-Roman. Set
  `graph [fontname="Sans"]; node [fontname="Sans"]; edge [fontname="Sans"]` once at the top.
