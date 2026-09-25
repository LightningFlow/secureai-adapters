# SecureAI for Codex

- `.mcp.json` — registers the bundled `secureai` MCP server and its status,
  protect, and off tools when the plugin is installed.
- `mcp-bridge.toml.example` — manual fallback for older Codex installations.
- `hooks/hooks.json` — at session start, turns protection on if you chose automatic
  protection. The hook never approves, denies or changes tool permissions. Codex
  asks you to review and trust an installed plugin hook before it can run.

The hook uses Codex's `PLUGIN_ROOT` variable, so it runs from the installed plugin
copy instead of depending on the machine-wide SecureAI install path.

To route the Codex CLI's own requests through SecureAI in a terminal:

```powershell
secureai proxy-env --platform codex | Invoke-Expression
```

**Partial Protection:** Codex cloud/hosted tools run on OpenAI's side and are not
routed through SecureAI. The local Codex CLI can use SecureAI only when launched
with the proxy environment above.
