# packaging/cursor

**Classification: PACKAGED** (thin adapter; Partial Protection)

Bundles `adapters/cursor` for offline install against a running SecureAI Core.

## Contents
- `.cursor-plugin/plugin.json`
- `hooks/`, `scripts/`, `mcp.json`

## Install (dev/UAT)
1. Install SecureAI Core (Windows package) and start daemon.
2. Copy or symlink plugin into a Cursor-compatible plugin path.
3. Core remains Protected authority — adapter only requests status/protect/off.

## Non-claims
- Does not intercept `api.cursor.sh` TLS.
- No MITM, no custom CA, no DLL injection.