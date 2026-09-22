#!/usr/bin/env bash
# SecureAI Claude proxy-env helper (local sessions).
# Sets HTTP_PROXY/HTTPS_PROXY/NO_PROXY from Core/CLI proxy URL.
# Does NOT claim Protected — Core remains the authority.
# Desktop-managed Claude sessions may ignore these env vars (see V1_LIMITATIONS).

set -euo pipefail

resolve_url() {
  if [[ -n "${SECUREAI_PROXY_URL:-}" ]]; then
    printf '%s' "$SECUREAI_PROXY_URL"
    return
  fi
  if command -v secureai >/dev/null 2>&1; then
    # Prefer CLI when on PATH (prints export lines; extract URL)
    local line
    line="$(secureai proxy-env 2>/dev/null | grep '^export SECUREAI_PROXY_URL=' | head -1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s' "${line#export SECUREAI_PROXY_URL=}"
      return
    fi
  fi
  local port="${SECUREAI_GATEWAY_PORT:-17864}"
  printf 'http://127.0.0.1:%s' "$port"
}

URL="$(resolve_url)"
export HTTP_PROXY="$URL"
export HTTPS_PROXY="$URL"
export NO_PROXY="localhost,127.0.0.1,::1"
export SECUREAI_PROXY_URL="$URL"

echo "secureai: Claude local proxy env set (HTTP_PROXY/HTTPS_PROXY → $URL)" >&2
echo "secureai: Core remains Protected authority; Desktop-managed sessions may ignore proxy" >&2

# If sourced, exports stick; if executed, print exports for eval
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  printf 'export HTTP_PROXY=%q\n' "$URL"
  printf 'export HTTPS_PROXY=%q\n' "$URL"
  printf 'export NO_PROXY=%q\n' "localhost,127.0.0.1,::1"
  printf 'export SECUREAI_PROXY_URL=%q\n' "$URL"
fi
