#!/usr/bin/env node
/**
 * secureai-grok-connector
 *
 * Speaks SecureAI semantics toward Core. Prefers SECUREAI_RELAY_URL when set
 * (remote/UAT relay path); otherwise uses the loopback gateway.
 * Never reports Protected without Core-attested verify (or local verify
 * through gateway/relay). Never sets protected:true itself.
 *
 * GROK_GATEWAY_DEPENDENCY: if remote cannot reach LF-HOST loopback gateway
 * and no relay URL is configured, mark Unsupported.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { URL } = require('url');

const PROTOCOL_MAJOR = 1;
const PROTOCOL_MINOR = 1;

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function relayUrl() {
  const raw = env('SECUREAI_RELAY_URL', '');
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error('invalid_relay_url');
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:'))) {
    throw new Error('relay_url_requires_https');
  }
  return parsed.toString().replace(/\/$/, '');
}

function useRelay() {
  return !!relayUrl();
}

function proxyUrl() {
  if (useRelay()) return relayUrl();
  const raw = env('SECUREAI_PROXY_URL', `http://127.0.0.1:${env('SECUREAI_GATEWAY_PORT', '17864')}`);
  // Check raw spelling before URL canonicalization: Node accepts numeric aliases
  // such as 2130706433 and 0177.0.0.1 as loopback addresses.
  if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?\/?$/.test(raw)) {
    throw new Error('gateway_url_requires_loopback');
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error('gateway_url_requires_loopback');
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  if (parsed.protocol !== 'http:' || !loopback || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('gateway_url_requires_loopback');
  }
  return parsed.toString().replace(/\/$/, '');
}

/** Shared SecureAI client: packaged at ../lib, source tree at ../../shared. */
function sharedLib() {
  const path = require('path');
  const fs = require('fs');
  const built = path.join(__dirname, '..', 'lib', 'secureai-core.js');
  return require(fs.existsSync(built) ? built : path.join(__dirname, '..', '..', 'shared', 'secureai-core.js'));
}

/**
 * Auth secret. There is no built-in default: the relay needs an explicit
 * SECUREAI_RELAY_SECRET; the local gateway uses this install's key. An empty
 * value makes the gateway/relay refuse the request (reported as unauthorized).
 */
function authSecret() {
  if (useRelay()) {
    return env('SECUREAI_RELAY_SECRET', '');
  }
  return env('SECUREAI_GATEWAY_SECRET', '') || sharedLib().findSecret() || '';
}

function authHeaderName() {
  return useRelay() ? 'X-SecureAI-Relay-Auth' : 'X-SecureAI-Gateway-Auth';
}

function parseArgs(argv) {
  const out = { mode: 'status', session: null, json: true };
  const rest = argv.slice(2);
  if (rest[0] && !rest[0].startsWith('-')) {
    out.mode = rest.shift();
  }
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--session' && rest[i + 1]) {
      out.session = rest[++i];
    } else if (rest[i] === '--help') {
      out.mode = 'help';
    }
  }
  return out;
}

function isHttpsUrl(urlStr) {
  try {
    return new URL(urlStr).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function httpJson(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const useHttps = u.protocol === 'https:';
    const bodyStr = body || null;
    const hdrs = Object.assign(
      {
        Connection: 'close',
        Accept: 'application/json',
      },
      headers || {}
    );
    if (bodyStr !== null) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const opts = {
      hostname: u.hostname,
      port: u.port || (useHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: hdrs,
      timeout: 3000,
      // Default Node TLS verification — do NOT set rejectUnauthorized:false
    };
    const transport = useHttps ? https : http;
    const req = transport.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data || '{}');
        } catch (_) {
          parsed = { raw: data };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (bodyStr !== null) req.write(bodyStr);
    req.end();
  });
}

/** Absolute-form GET through HTTP proxy to verify host (gateway path). */
function verifyViaGatewayProxy(sessionId) {
  const proxy = new URL(proxyUrl());
  const verifyHost = env('SECUREAI_VERIFY_HOST', 'secureai-verify.local');
  const target = `http://${verifyHost}/v1/prove`;
  const secret = authSecret();
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: proxy.hostname,
      port: proxy.port || 80,
      path: target,
      method: 'GET',
      headers: {
        Host: verifyHost,
        'X-SecureAI-Gateway-Auth': secret,
        'X-SecureAI-Session': sessionId,
        Connection: 'close',
      },
      timeout: 3000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data || '{}');
        } catch (_) {
          parsed = { raw: data };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

/**
 * CONNECT verify through relay with session token + one-time nonce.
 * Returns { status, body, error_class? }.
 */
function verifyViaRelayConnect(sessionId, sessionToken, nonce) {
  const base = new URL(relayUrl());
  const verifyHost = env('SECUREAI_VERIFY_HOST', 'secureai-verify.local');
  const useTls = base.protocol === 'https:';
  const port = Number(base.port || (useTls ? 443 : 80));
  const host = base.hostname;

  return new Promise((resolve, reject) => {
    function onConnected(socket) {
      const connectReq =
        `CONNECT ${verifyHost}:80 HTTP/1.1\r\n` +
        `Host: ${verifyHost}:80\r\n` +
        `X-SecureAI-Session: ${sessionId}\r\n` +
        `X-SecureAI-Session-Token: ${sessionToken}\r\n` +
        `X-SecureAI-Relay-Nonce: ${nonce}\r\n` +
        `\r\n`;
      socket.write(connectReq);
    }

    // HTTPS relay URL → TLS to secureai-tls (public), then HTTP CONNECT passthrough.
    // rejectUnauthorized defaults to true — never set false as product path.
    const socket = useTls
      ? tls.connect({ host, port, servername: host }, () => onConnected(socket))
      : net.connect({ host, port }, () => onConnected(socket));
    socket.setTimeout(3000);

    let buf = Buffer.alloc(0);
    let connectDone = false;

    function fail(errClass, msg) {
      try {
        socket.destroy();
      } catch (_) {}
      resolve({ status: 0, body: null, error_class: errClass, message: msg });
    }

    socket.on('timeout', () => fail('timeout', 'timeout'));
    socket.on('error', (e) => fail('verify_transport_error', String(e.message || e)));

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!connectDone) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const hdr = buf.slice(0, idx).toString('utf8');
        const rest = buf.slice(idx + 4);
        const statusLine = hdr.split('\r\n')[0] || '';
        const code = Number((statusLine.split(' ')[1] || '0'));
        if (code !== 200) {
          const bodyStr = rest.toString('utf8');
          let errClass = 'connect_rejected';
          if (code === 407) errClass = 'unauthorized';
          else if (bodyStr.includes('replay') || hdr.includes('replay')) errClass = 'replay';
          else if (bodyStr.includes('expired') || hdr.includes('expired')) errClass = 'expired';
          socket.destroy();
          resolve({ status: code, body: null, error_class: errClass, raw: bodyStr });
          return;
        }
        connectDone = true;
        buf = rest;
        const get =
          `GET /v1/prove HTTP/1.1\r\n` +
          `Host: ${verifyHost}\r\n` +
          `X-SecureAI-Session: ${sessionId}\r\n` +
          `Connection: close\r\n` +
          `\r\n`;
        socket.write(get);
      }

      if (connectDone) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const hdr = buf.slice(0, idx).toString('utf8');
        const bodyStr = buf.slice(idx + 4).toString('utf8');
        // Wait for Content-Length if present
        let contentLen = null;
        for (const line of hdr.split('\r\n').slice(1)) {
          const m = line.match(/^content-length:\s*(\d+)/i);
          if (m) contentLen = Number(m[1]);
        }
        if (contentLen !== null && Buffer.byteLength(bodyStr) < contentLen) return;
        const statusLine = hdr.split('\r\n')[0] || '';
        const code = Number((statusLine.split(' ')[1] || '0'));
        let parsed = null;
        try {
          parsed = JSON.parse(bodyStr || '{}');
        } catch (_) {
          parsed = { raw: bodyStr };
        }
        socket.end();
        resolve({ status: code, body: parsed });
      }
    });
  });
}

async function gatewayReachable() {
  const base = proxyUrl().replace(/\/$/, '');
  try {
    if (useRelay()) {
      const r = await httpJson('GET', `${base}/health`, {});
      return r.status === 200 && r.body && r.body.ok === true;
    }
    const r = await httpJson('GET', `${base}/control/status`, {
      'X-SecureAI-Gateway-Auth': authSecret(),
    });
    return r.status === 200 && r.body && r.body.ok === true && r.body.listening === true;
  } catch (_) {
    return false;
  }
}

async function runVerifyRelay() {
  const base = relayUrl();
  const reachable = await gatewayReachable();
  if (!reachable) {
    return {
      component: 'secureai-grok-connector',
      protocol_major: PROTOCOL_MAJOR,
      protocol_minor: PROTOCOL_MINOR,
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'relay_unreachable' },
      note: 'Relay not reachable; refusing Protected',
    };
  }

  const authHdr = {};
  authHdr[authHeaderName()] = authSecret();
  let issued;
  try {
    issued = await httpJson('POST', `${base}/v1/session`, authHdr, '{}');
  } catch (e) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'session_issue_transport_error' },
      message: String(e.message || e),
    };
  }
  if (issued.status === 401) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'unauthorized' },
      note: 'Invalid relay auth; refusing Protected',
    };
  }
  if (issued.status !== 200 || !issued.body || !issued.body.session_token) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'session_issue_failed' },
    };
  }

  const sid = issued.body.session_id;
  const token = issued.body.session_token;
  const nonce = crypto.randomUUID();
  let proof;
  try {
    proof = await verifyViaRelayConnect(sid, token, nonce);
  } catch (e) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'verify_transport_error' },
      message: String(e.message || e),
    };
  }

  // Cleanup session (best-effort)
  try {
    await httpJson('DELETE', `${base}/v1/session/${sid}`, authHdr);
  } catch (_) {}

  if (proof.error_class === 'replay') {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      session_id: sid,
      verify: { egress_ok: false, error_class: 'replay' },
      note: 'Replay rejected; refusing Protected',
    };
  }

  const ok =
    proof.status === 200 && proof.body && proof.body.ok === true && !!proof.body.proof;
  if (!ok) {
    return {
      component: 'secureai-grok-connector',
      protocol_major: PROTOCOL_MAJOR,
      state: 'Failed',
      protected: false,
      verify_ok: false,
      session_id: sid,
      verify: {
        egress_ok: false,
        error_class: proof.error_class || 'egress_verify_failed',
      },
      note: 'Refusing Protected without relay-attested proof',
    };
  }

  return {
    component: 'secureai-grok-connector',
    protocol_major: PROTOCOL_MAJOR,
    protocol_minor: PROTOCOL_MINOR,
    state: 'VerifiedLocal',
    protected: false,
    verify_ok: true,
    core_attested_protected: false,
    session_id: sid,
    verify: {
      egress_ok: true,
      proof_via: (proof.body && proof.body.via) || 'relay_connect',
      error_class: null,
    },
    note:
      'Relay-attested egress proof received; report to Core for Protected — connector never self-declares Protected',
  };
}

async function runVerifyGateway(sessionId) {
  const reachable = await gatewayReachable();
  if (!reachable) {
    const remote = env('SECUREAI_REMOTE', '0') === '1' || env('GROK_REMOTE', '0') === '1';
    return {
      component: 'secureai-grok-connector',
      protocol_major: PROTOCOL_MAJOR,
      protocol_minor: PROTOCOL_MINOR,
      state: remote ? 'Unsupported' : 'Failed',
      protected: false,
      verify_ok: false,
      verify: {
        egress_ok: false,
        error_class: remote ? 'GROK_GATEWAY_DEPENDENCY' : 'gateway_unreachable',
      },
      note: remote
        ? 'Remote cannot reach LF-HOST loopback gateway without public exposure — set SECUREAI_RELAY_URL or mark GROK_GATEWAY_DEPENDENCY'
        : 'Gateway not reachable; refusing Protected',
    };
  }

  const base = proxyUrl().replace(/\/$/, '');
  const sid = sessionId || crypto.randomUUID();
  const reg = await httpJson(
    'POST',
    `${base}/control/session/register`,
    { 'X-SecureAI-Gateway-Auth': authSecret() },
    JSON.stringify({ session_id: sid })
  );
  if (reg.status !== 200) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'register_failed' },
    };
  }

  let proof;
  try {
    proof = await verifyViaGatewayProxy(sid);
  } catch (e) {
    return {
      component: 'secureai-grok-connector',
      state: 'Failed',
      protected: false,
      verify_ok: false,
      verify: { egress_ok: false, error_class: 'verify_transport_error' },
      message: String(e.message || e),
    };
  }

  try {
    await httpJson(
      'POST',
      `${base}/control/session/unregister`,
      { 'X-SecureAI-Gateway-Auth': authSecret() },
      JSON.stringify({ session_id: sid })
    );
  } catch (_) {}

  const ok = proof.status === 200 && proof.body && proof.body.ok === true && !!proof.body.proof;
  if (!ok) {
    return {
      component: 'secureai-grok-connector',
      protocol_major: PROTOCOL_MAJOR,
      state: 'Failed',
      protected: false,
      verify_ok: false,
      session_id: sid,
      verify: { egress_ok: false, error_class: 'egress_verify_failed' },
      note: 'Refusing Protected without gateway-attested proof',
    };
  }

  return {
    component: 'secureai-grok-connector',
    protocol_major: PROTOCOL_MAJOR,
    protocol_minor: PROTOCOL_MINOR,
    state: 'VerifiedLocal',
    protected: false,
    verify_ok: true,
    core_attested_protected: false,
    session_id: sid,
    verify: {
      egress_ok: true,
      proof_via: proof.body.via || 'http_proxy',
      error_class: null,
    },
    note:
      'Gateway-attested egress proof received; report to Core for Protected — connector never self-declares Protected',
  };
}

async function runVerify(sessionId) {
  if (useRelay()) return runVerifyRelay();
  return runVerifyGateway(sessionId);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === 'help') {
    console.log(`usage: connector.js [status|verify|protect] [--session UUID]
env: SECUREAI_RELAY_URL (HTTPS required except loopback tests), SECUREAI_RELAY_SECRET,
     SECUREAI_PROXY_URL, SECUREAI_GATEWAY_SECRET, SECUREAI_REMOTE=1
note: https uses Node default TLS verify (never rejectUnauthorized:false)`);
    process.exit(0);
  }

  if (args.mode === 'status') {
    const reachable = await gatewayReachable();
    const remote = env('SECUREAI_REMOTE', '0') === '1' || env('GROK_REMOTE', '0') === '1';
    const via = useRelay() ? 'relay' : 'gateway';
    const out = {
      component: 'secureai-grok-connector',
      mode: 'status',
      protocol_major: PROTOCOL_MAJOR,
      protocol_minor: PROTOCOL_MINOR,
      transport: via,
      gateway_reachable: reachable,
      relay_url_set: useRelay(),
      protected: false,
      verify_ok: false,
      state: reachable ? 'Ready' : remote && !useRelay() ? 'Unsupported' : 'Offline',
      dependency:
        reachable || useRelay()
          ? null
          : remote
            ? 'GROK_GATEWAY_DEPENDENCY'
            : via === 'relay'
              ? 'relay_unreachable'
              : 'gateway_unreachable',
      note: 'Never reports Protected without Core-attested verify; prefer SECUREAI_RELAY_URL when set',
    };
    console.log(JSON.stringify(out));
    return;
  }

  if (args.mode === 'verify' || args.mode === 'protect') {
    const out = await runVerify(args.session);
    if (args.mode === 'protect') {
      out.note =
        (out.note || '') +
        ' | protect requested: connector will not set protected=true without Core';
      out.protected = false;
    }
    // Hard rule: never invent Protected
    out.protected = false;
    console.log(JSON.stringify(out));
    process.exit(out.verify && out.verify.egress_ok ? 0 : 2);
    return;
  }

  console.log(
    JSON.stringify({
      component: 'secureai-grok-connector',
      error: 'unknown_mode',
      mode: args.mode,
      protected: false,
      verify_ok: false,
    })
  );
  process.exit(1);
}

// Exported for tests
module.exports = {
  useRelay,
  relayUrl,
  proxyUrl,
  authSecret,
  authHeaderName,
  isHttpsUrl,
  runVerify,
  verifyViaRelayConnect,
  gatewayReachable,
};

if (require.main === module) {
  main().catch((e) => {
    console.log(
      JSON.stringify({
        component: 'secureai-grok-connector',
        state: 'Failed',
        protected: false,
        verify_ok: false,
        error: String(e.message || e),
      })
    );
    process.exit(1);
  });
}
