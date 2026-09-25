#!/usr/bin/env node
'use strict';
/**
 * SecureAI MCP server (stdio, newline-delimited JSON-RPC 2.0).
 *
 * Tools: secureai_status, secureai_protect, secureai_off.
 * Usage: node mcp-server.js --platform cursor|codex|claude|grok
 *
 * Status text comes from Core only. The server never claims protection itself.
 */

const readline = require('readline');
const { withCore, describe, explainError, CUSTOMER_PLATFORMS } = require('./secureai-core.js');

function argPlatform() {
  const i = process.argv.indexOf('--platform');
  const p = i >= 0 ? process.argv[i + 1] : process.env.SECUREAI_PLATFORM;
  return CUSTOMER_PLATFORMS.includes(p) ? p : null;
}

const PLATFORM = argPlatform();
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'secureai_status',
    description: 'Show whether SecureAI is protecting this tool’s connection right now.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'secureai_protect',
    description: 'Turn SecureAI protection on for this tool (the user’s choice is remembered).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'secureai_off',
    description: 'Turn SecureAI protection off for this tool.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function text(t, isError = false) {
  return { content: [{ type: 'text', text: t }], isError };
}

async function statusText() {
  return withCore(PLATFORM, async (c) => {
    const s = await c.status();
    const mine = (s.statuses || []).find((x) => x.platform === PLATFORM);
    return describe(mine);
  });
}

async function callTool(name) {
  if (!PLATFORM) return text('SecureAI adapter is misconfigured (missing --platform).', true);
  try {
    switch (name) {
      case 'secureai_status':
        return text(await statusText());
      case 'secureai_protect': {
        await withCore(PLATFORM, (c) => c.protect(PLATFORM));
        return text(await statusText());
      }
      case 'secureai_off': {
        await withCore(PLATFORM, (c) => c.off(PLATFORM));
        return text('Protection is off for this tool.');
      }
      default:
        return text(`Unknown tool: ${name}`, true);
    }
  } catch (e) {
    return text(explainError(e), true);
  }
}

async function handle(req) {
  const { id, method, params } = req;
  const isNotification = id === undefined || id === null;
  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'secureai', version: '0.1.0' },
        },
      });
      return;
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    case 'tools/call': {
      const result = await callTool(params && params.name);
      send({ jsonrpc: '2.0', id, result });
      return;
    }
    default:
      if (!isNotification) {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
  }
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch (_) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    handle(req).catch(() => {
      if (req && req.id !== undefined) {
        send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'Internal error' } });
      }
    });
  });
}

module.exports = { handle, TOOLS };
