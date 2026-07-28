#!/usr/bin/env bash
# baresip container entrypoint.
#
# When BARESIP_DISABLE_ALERT_TONES=true, start from a runtime config directory
# that silences menu alert tones. That prevents the default audio_alert device
# (alsa,default) from being opened on incoming calls on headless hosts without
# a sound card. The shared /config bind mount is left unchanged so ALSA-based
# deployments keep the default ringtone behavior.
set -euo pipefail

RUNTIME_CONFIG_DIR="${BARESIP_RUNTIME_CONFIG_DIR:-/var/run/baresip-config}"
DISABLE_TONES_SCRIPT="${BARESIP_DISABLE_ALERT_TONES_SCRIPT:-/usr/local/lib/baresipui/disable-alert-tones.sh}"

prepare_silent_alert_config() {
  local src="${1:-/config}"
  local dst="$RUNTIME_CONFIG_DIR"
  local path base

  if [ ! -f "$src/config" ]; then
    echo "baresip-entrypoint: missing config file at $src/config" >&2
    exit 1
  fi
  if [ ! -x "$DISABLE_TONES_SCRIPT" ] && [ ! -f "$DISABLE_TONES_SCRIPT" ]; then
    echo "baresip-entrypoint: missing $DISABLE_TONES_SCRIPT" >&2
    exit 1
  fi

  rm -rf "$dst"
  mkdir -p "$dst"

  # Keep accounts/contacts/uuid on the bind mount via symlinks so the app and
  # baresip share the same writable files. Only `config` is copied+patched.
  shopt -s nullglob dotglob
  for path in "$src"/*; do
    base=$(basename "$path")
    if [ "$base" = "config" ]; then
      continue
    fi
    ln -s "$path" "$dst/$base"
  done
  shopt -u nullglob dotglob

  cp "$src/config" "$dst/config"
  bash "$DISABLE_TONES_SCRIPT" "$dst/config"
  echo "baresip-entrypoint: alert tones disabled via runtime config at $dst" >&2
  printf '%s\n' "$dst"
}

if [ "${1:-}" = "baresip" ]; then
  args=("$@")
  if [ "${BARESIP_DISABLE_ALERT_TONES:-false}" = "true" ]; then
    config_dir="/config"
    i=0
    while [ "$i" -lt "${#args[@]}" ]; do
      if [ "${args[$i]}" = "-f" ] && [ $((i + 1)) -lt "${#args[@]}" ]; then
        config_dir="${args[$((i + 1))]}"
        break
      fi
      i=$((i + 1))
    done
    runtime_dir="$(prepare_silent_alert_config "$config_dir")"
    new_args=()
    skip_next=0
    found_f=0
    for arg in "${args[@]}"; do
      if [ "$skip_next" -eq 1 ]; then
        new_args+=("$runtime_dir")
        skip_next=0
        continue
      fi
      if [ "$arg" = "-f" ]; then
        new_args+=("$arg")
        skip_next=1
        found_f=1
        continue
      fi
      new_args+=("$arg")
    done
    if [ "$found_f" -eq 0 ]; then
      new_args+=(-f "$runtime_dir")
    fi
    args=("${new_args[@]}")
  fi
  exec /usr/bin/baresip -a "Baresip AWAH" -s -v "${args[@]}"
fi

exec "$@"
