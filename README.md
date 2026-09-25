# SecureAI Adapters (public)

Thin marketplace adapters for SecureAI.

**SecureAI Core is proprietary and is not in this repository.** Adapters discover a locally installed Core, request protection, and display Core-derived status. They never invent `Protected`.

## Packages
- `cursor/` — Partial Protection
- `codex/` — Partial Protection
- `claude/` — Core-backed path
- `grok/` — remote relay semantics; connector never sets `protected=true`

## Install
1. Install SecureAI Core from your LightningFlow account.
2. Sign in to your LightningFlow account in SecureAI Core.
3. For Claude Code, add this repository as a marketplace with `claude plugin marketplace add LightningFlow/secureai-adapters`, then install `secureai@lightningflow`.
4. For Codex, add this repository with `codex plugin marketplace add LightningFlow/secureai-adapters`, then install `secureai@lightningflow` in the Plugins Directory.
5. For Cursor, import this repository in Customize using **From GitHub Repository** and install the `secureai` plugin. Its own AI requests remain outside SecureAI coverage.
6. For Grok Build, add this repository with `grok plugin marketplace add LightningFlow/secureai-adapters`, then install and trust the `secureai` plugin. Remote Grok Bot traffic requires a production relay; this plugin alone does not route it.

The adapters are free; SecureAI Core requires an existing LightningFlow account with a SecureAI entitlement. Cursor and Codex offer Partial Protection; Cursor's own AI requests and Codex cloud tools are not routed through SecureAI.

## License
MIT (adapters only). Core remains proprietary.
