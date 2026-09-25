# SecureAI for Grok

- `local/status.js` — prints SecureAI's status for Grok on this computer.
- `secureai-grok-connector/` — verifies the gateway (local) or relay (remote) path.
  It never reports `protected: true` on its own; SecureAI Core decides.
- `lib/` — bundled SecureAI client.
- `.mcp.json` — local SecureAI status, protect, and off tools for Grok Build.

The connector reads the SecureAI key from the install (never a built-in default).
It sends that key only to a configured literal loopback HTTP endpoint. An optional
`SECUREAI_PROXY_URL` must also be literal loopback HTTP; remote gateway overrides
are rejected before the key is read or transmitted. A custom loopback port is
trusted configuration: the connector cannot establish that a listener there is
Core before sending the key. The plugin has no telemetry.
Remote/relay use needs `SECUREAI_RELAY_URL` and `SECUREAI_RELAY_SECRET`.
The relay secret is sent only to the explicitly configured relay URL. Remote
relay URLs must use HTTPS; plaintext HTTP is accepted only for loopback tests.
The Grok Build plugin requires an installed SecureAI Core; installing the plugin
alone does not route remote Grok Bot traffic or establish Protected status.

See `secureai-grok-connector/README.md` for connector setup and verification.
