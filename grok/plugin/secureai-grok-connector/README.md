# secureai-grok-connector

Runs locally or in a remote environment and speaks SecureAI gateway/relay semantics.

## Commands

```bash
node connector.js status
node connector.js verify [--session UUID]
node connector.js protect   # still refuses protected=true without Core
```

## Env

| Variable | Role |
| --- | --- |
| `SECUREAI_RELAY_URL` | **Preferred** when set — authenticated relay base URL |
| `SECUREAI_RELAY_SECRET` | Relay control auth (`X-SecureAI-Relay-Auth`) |
| `SECUREAI_PROXY_URL` | Gateway proxy URL when relay URL unset |
| `SECUREAI_GATEWAY_SECRET` / `SECUREAI_SECRET` | Gateway control/proxy auth |
| `SECUREAI_REMOTE=1` / `GROK_REMOTE=1` | Remote mode → `Unsupported` + `GROK_GATEWAY_DEPENDENCY` if gateway unreachable and no relay |

## Truth rules

- **Never** reports `protected: true` from the connector alone.
- When `SECUREAI_RELAY_URL` is set: session create → CONNECT verify → report `verify_ok` / errors.
- Otherwise: egress probe **through** the CONNECT/HTTP gateway proxy requiring a gateway-attested proof.
- If remote cannot reach the LF-HOST loopback gateway and no relay is configured: `Unsupported` / `GROK_GATEWAY_DEPENDENCY`.
- Core remains the authority for session `Protected`.

## Tests

```bash
cargo build -p secureai-relay
node test/connector_relay.test.js
```

## HTTPS relay URL

Set `SECUREAI_RELAY_URL=https://relay.example.invalid:8443` to reach
`secureai-tls` (public TLS → loopback relay).

- Uses Node `https` / `tls` with **default** certificate verification
- **Never** sets `rejectUnauthorized: false` (not a product path)
- Connector always reports `protected: false` — Core attests Protected
