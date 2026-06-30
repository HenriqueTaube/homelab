#!/bin/sh

set -eu

WG_CONFIG="${WG_CONFIG:-/etc/wireguard/wg0.conf}"
WG_INTERFACE="${WG_INTERFACE:-wg0}"

cleanup() {
  if ip link show "$WG_INTERFACE" >/dev/null 2>&1; then
    wg-quick down "$WG_CONFIG" || true
  fi
}

if [ ! -f "$WG_CONFIG" ]; then
  echo "missing WireGuard config: $WG_CONFIG" >&2
  exit 1
fi

trap cleanup INT TERM EXIT

wg-quick up "$WG_CONFIG"

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec tail -f /dev/null
