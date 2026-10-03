---
name: obsolete-fixes
description: Commonly copied Xbox-controller Bluetooth "fixes" for Linux that don't apply to BLE controllers or are simply wrong, how to detect them, and how to remove them.
---

# Obsolete and mistaken fixes

Old fix scripts get copied between forums and accumulate. Audit for these
first and remove what doesn't apply, so later tests have fewer variables.

| Fix | Why it doesn't help | Detect | Remove |
|---|---|---|---|
| `bluetooth.disable_ertm=1` kernel arg (or `/sys/module/bluetooth/parameters/disable_ertm`) | ERTM is a classic BR/EDR L2CAP mode. It helped Xbox One S on **pre-5.x firmware**. Series X\|S and updated One S/Elite 2 use LE, where ERTM isn't involved. Side effect: OBEX/AVCTP servers fail with `setsockopt(L2CAP_OPTIONS): Invalid argument` | `cat /proc/cmdline`; `cat /sys/module/bluetooth/parameters/disable_ertm` | `rpm-ostree kargs --delete=bluetooth.disable_ertm=1` (ostree) or edit GRUB cmdline; modprobe.d `options bluetooth disable_ertm=1` |
| `[L2CAP] Mode=ertm MPS=… MTU=…` in `/etc/bluetooth/main.conf` | BlueZ has no `[L2CAP]` group — logs `Unknown group L2CAP` and ignores it | `journalctl -u bluetooth \| grep 'Unknown group'` | Restore distro default (ostree: `/usr/etc/bluetooth/main.conf`) |
| `[LE] ConnectionIntervalMin/Max` | Not BlueZ keys; the real ones are `MinConnectionInterval` / `MaxConnectionInterval` | `check_config()` warnings in the journal | Delete |
| `ControllerMode = bredr` in `[General]` | Some "classic Xbox fix" scripts force BR/EDR-only — that **disables LE completely**, so an LE controller can never be found | `grep ControllerMode /etc/bluetooth/main.conf` | Set `dual` (default) or restore distro default |
| `Class=0x000100` in `[General]` | Changes the PC's advertised device class; irrelevant to pairing an LE gamepad | grep main.conf | Delete |
| `usbcore.quirks=8087:0aaa:i` | Letter `i` is `USB_QUIRK_DEVICE_QUALIFIER`. The intent was probably `k` (NO_LPM) or disabling autosuspend — wrong letter, no effect | `cat /proc/cmdline` | Remove the karg |
| `options btintel disable_secure_send_commands=1` | Not a real module parameter — `btintel` has no parameters at all (kernel 7.2) | `modinfo -p btintel` (prints nothing) | Delete the modprobe.d line |
| `options btusb enable_autosuspend=0 reset=1` | Legitimate, but only relevant to *disconnects*, not to "never seen" or "pairing hangs" | `cat /sys/module/btusb/parameters/enable_autosuspend` | Keep only if disconnects are the symptom |
| Toggling `Privacy=device`/`off` in main.conf | Didn't change LE reception or the pairing stall in testing | — | Leave the distro default unless evidence says otherwise |
| Forcing Wi-Fi to 5 GHz | Helps *coexistence* (disconnects/stutter) on combo cards; didn't help an adapter that couldn't hear the controller at all, even with Wi-Fi off | `iw dev <if> link` | `nmcli con modify <conn> 802-11-wireless.band ""` |
| Re-pairing over and over | Doesn't help if the PC never receives the controller's advertisements | — | Get evidence first (diagnostics.md) |

## Immutable distro notes (Bazzite / Silverblue / SteamOS-like)

- Shipped defaults live in `/usr/etc/…`; compare with `/etc/…` to find local
  edits: `diff /usr/etc/bluetooth/main.conf /etc/bluetooth/main.conf`.
- `rpm-ostree kargs --delete=…` creates a new deployment. That re-resolves
  layered packages and can swap them (seen: layered `nodejs` resolving to an
  older Fedora build); check `rpm-ostree db diff` before rebooting and pin by
  the exact package name (`rpm-ostree uninstall nodejs --install nodejs22`).
- Each new deployment can push the oldest one out of the boot menu, so
  "boot the old image to test for a regression" may no longer be possible
  afterwards — note it before stacking deployments.
