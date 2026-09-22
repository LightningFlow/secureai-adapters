# SecureAI Adapters (public)

Thin marketplace adapters for [SecureAI](https://lightningflow.ai/secureai/).

**SecureAI Core is proprietary and is not in this repository.** Adapters discover a locally installed Core, request protection, and display Core-derived status. They never invent `Protected`.

## Packages
- `cursor/` — Partial Protection
- `codex/` — Partial Protection
- `claude/` — Core-backed path
- `grok/` — remote relay semantics; connector never sets `protected=true`

## Install
1. Install SecureAI Core from LightningFlow
2. Install the adapter for your tool from this repo / marketplace listing
3. Sign in / entitlement via SecureAI account

## License
MIT (adapters only). Core remains proprietary.