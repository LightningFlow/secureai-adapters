# SecureAI Adapters (public)

Thin marketplace adapters for [SecureAI](https://lightningflow.ai/secureai/).

**SecureAI Core is proprietary and is not in this repository.** Adapters discover a locally installed Core, request protection, and display Core-derived status. They never invent `Protected`.

## Packages
- `cursor/` — Partial Protection
- `codex/` — Partial Protection
- `claude/` — Core-backed path
- `grok/` — remote relay semantics; connector never sets `protected=true`

## Install
1. Install SecureAI Core from [LightningFlow](https://lightningflow.ai/secureai/).
2. Sign in to your LightningFlow account in SecureAI Core.
3. For Claude Code, add this repository as a marketplace with `claude plugin marketplace add LightningFlow/secureai-adapters`, then install `secureai@lightningflow`.
4. For Codex, add this repository with `codex plugin marketplace add LightningFlow/secureai-adapters`, then install `secureai@lightningflow` in the Plugins Directory.

The Cursor and Grok adapters remain available in their directories while their public listings are prepared. Cursor and Codex offer Partial Protection; Cursor's own AI requests and Codex cloud tools are not routed through SecureAI.

## License
MIT (adapters only). Core remains proprietary.
