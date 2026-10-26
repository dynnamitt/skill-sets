#!/usr/bin/env bash
# bootstrap.sh — set up a fresh dev box (Bazzite). Run as the desktop user.
set -euo pipefail

echo "[1/8] flatpak apps"
flatpak install -y --noninteractive flathub com.visualstudio.code org.mozilla.firefox

echo "[2/8] homebrew packages"
brew bundle --file="$HOME/dotfiles/Brewfile"

echo "[3/8] distrobox: dev container"
distrobox create -Y -n dev -i registry.fedoraproject.org/fedora-toolbox:41

echo "[4/8] in parallel: rust toolchain, node, dotfiles"
( curl -sSf https://sh.rustup.rs | sh -s -- -y ) &
( brew install fnm && fnm install --lts ) &
( git clone https://github.com/me/dotfiles "$HOME/dotfiles" 2>/dev/null || git -C "$HOME/dotfiles" pull ) &
wait

echo "[5/8] dev container packages"
distrobox enter dev -- sudo dnf install -y gcc make postgresql

echo "[6/8] ssh keys"
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

echo "[7/8] shell config"
ln -sf "$HOME/dotfiles/zshrc" "$HOME/.zshrc"

echo "[8/8] done — log out and back in"
