# Claude proxy-env helper

Sets `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` for **local** Claude Code sessions so traffic can use the SecureAI loopback CONNECT gateway.

## Usage

```bash
# print exports (eval into current shell)
eval "$(./set-proxy.sh)"

# or source
source ./set-proxy.sh
```

Windows (PowerShell):

```powershell
. .\set-proxy.ps1
```

Proxy URL resolution order:

1. `SECUREAI_PROXY_URL`
2. `secureai proxy-env` (CLI) when on `PATH`
3. `http://127.0.0.1:${SECUREAI_GATEWAY_PORT:-17864}`

## Scope (truthful)

- **Does not claim Protected.** Core remains the single authority; Protected requires gateway-attested egress verify.
- Desktop-managed provider connections may **ignore** repo/shell proxy settings — see `docs/V1_LIMITATIONS.md` and `docs/INSTALL_CLAUDE.md`.
- `NO_PROXY` always includes `localhost`, `127.0.0.1`, `::1`.

## Remote / relay note

Local Claude keeps the **gateway** / `proxy-env` path above.

For remote Claude (future), operators may point HTTP(S)_PROXY at a TLS-terminated
front of `secureai-relay` (`SECUREAI_RELAY_URL`). That does **not** claim Protected;
Core remains the authority. See `docs/REMOTE_RELAY.md` (MVP implemented).
