#!/usr/bin/env bash
# Patch a baresip config file so menu alert tones never open audio_alert.
# Used by docker-entrypoint.sh for headless / mediasoup-only hosts.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <baresip-config-file>" >&2
  exit 2
fi

file="$1"
if [ ! -f "$file" ]; then
  echo "disable-alert-tones: missing file: $file" >&2
  exit 1
fi

set_config_value() {
  local key="$1"
  local value="$2"
  if grep -qE "^[[:space:]]*#?[[:space:]]*${key}([[:space:]]|$)" "$file"; then
    sed -i -E "s|^[[:space:]]*#?[[:space:]]*${key}([[:space:]].*)?$|${key}            ${value}|" "$file"
  else
    printf '%s\n' "${key}            ${value}" >>"$file"
  fi
}

for key in \
  ring_aufile \
  ringback_aufile \
  callwaiting_aufile \
  sip_autoanswer_aufile \
  hangup_aufile \
  notfound_aufile \
  busy_aufile \
  error_aufile
do
  set_config_value "$key" "none"
done
set_config_value "menu_message_tone" "no"
