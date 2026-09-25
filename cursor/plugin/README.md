# SecureAI for Cursor

- `mcp.json` — the `secureai` MCP server (`secureai_status`, `secureai_protect`,
  `secureai_off`), backed by SecureAI on this computer.
- `hooks/hooks.json` — at session start, turns protection on if you chose automatic
  protection. Cursor runs `sessionStart` as fire-and-forget, so this is a convenience
  action rather than a blocking protection gate.

The hook and MCP server use Cursor's `CURSOR_PLUGIN_ROOT` variable and the bundled
`lib/`, so both resolve inside the installed plugin.

**Partial Protection:** Cursor sends its own AI requests to Cursor's servers directly;
SecureAI can't route or see those. SecureAI covers tools and terminals you start
with SecureAI's proxy.
