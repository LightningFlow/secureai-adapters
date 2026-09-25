# SecureAI for Claude Code

A Claude Code plugin that:

- turns SecureAI protection on when a session starts, **if** you chose automatic
  protection in SecureAI;
- adds `secureai_status`, `secureai_protect` and `secureai_off` tools, so you can ask
  Claude "is SecureAI on?".

Status always comes from SecureAI on this computer; the plugin never decides it.

## Layout (built package)

```
.claude-plugin/plugin.json
hooks/hooks.json              SessionStart → lib/session-hook.js
.mcp.json                     secureai MCP server → lib/mcp-server.js
lib/                          bundled SecureAI client
proxy-env-helper/             per-terminal proxy helper
hooks/settings.fragment.json  manual install (uses $SECUREAI_HOME)
```

The distributed plugin already includes `lib/`.

## Routing Claude Code through SecureAI

Run `secureai setup --platform claude` (or use the tray menu). See
`proxy-env-helper/README.md`. Claude Desktop is not covered.
