#!/usr/bin/env node
/**
 * Grok connector relay tests: invalid auth, replay, unavailable relay,
 * refuses Protected without verify.
 *
 * Spawns `secureai-relay` from cargo target if available; otherwise skips
 * relay-live cases after checking unavailable-relay behavior.
 */
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const net = require('net');

const ROOT = path.resolve(__dirname, '../../../../');
const CONNECTOR = path.join(__dirname, '../connector.js');

function runConnector(args, env) {
  const r = spawnSync(process.execPath, [CONNECTOR, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 8000,
  });
  let json = null;
  try {
    json = JSON.parse((r.stdout || '').trim().split('\n').pop());
  } catch (_) {}
  return { code: r.status, json, stderr: r.stderr, stdout: r.stdout };
}

function findRelayBin() {
  const target = process.env.CARGO_TARGET_DIR || path.join(ROOT, 'target');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    path.join(target, 'debug', `secureai-relay${exe}`),
    path.join(target, 'release', `secureai-relay${exe}`),
  ];
  for (const c of candidates) {
    try {
      require('fs').accessSync(c);
      return c;
    } catch (_) {}
  }
  return null;
}

function waitPort(port, ms = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect({ host: '127.0.0.1', port }, () => {
        s.end();
        resolve();
      });
      s.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('timeout waiting for relay'));
        else setTimeout(tryOnce, 50);
      });
    };
    tryOnce();
  });
}

async function withRelay(secret, fn) {
  const bin = findRelayBin();
  if (!bin) {
    console.log('SKIP live relay tests (build secureai-relay first)');
    return null;
  }
  // ephemeral: bind 127.0.0.1:0 is not CLI-supported easily; pick free port
  const probe = net.createServer();
  await new Promise((res) => probe.listen(0, '127.0.0.1', res));
  const port = probe.address().port;
  await new Promise((res) => probe.close(res));

  const child = spawn(
    bin,
    ['--bind', `127.0.0.1:${port}`, '--secret', secret],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let err = '';
  child.stderr.on('data', (d) => (err += d.toString()));
  try {
    await waitPort(port);
    return await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    child.kill('SIGTERM');
  }
}

function httpJson(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const bodyStr = body || null;
    const hdrs = Object.assign({ Connection: 'close', Accept: 'application/json' }, headers || {});
    if (bodyStr !== null) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method,
        headers: hdrs,
        timeout: 3000,
      },
      (res) => {
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
      }
    );
    req.on('error', reject);
    if (bodyStr !== null) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  let failed = 0;

  // Remote relay credentials must never be sent to plaintext HTTP endpoints.
  {
    const { relayUrl } = require('../connector.js');
    const prior = process.env.SECUREAI_RELAY_URL;
    try {
      for (const url of ['http://relay.example.invalid:8443', 'http://127.0.0.1.evil.example:8443']) {
        process.env.SECUREAI_RELAY_URL = url;
        assert.throws(() => relayUrl(), /relay_url_requires_https/);
      }
      process.env.SECUREAI_RELAY_URL = 'http://127.0.0.1:8443';
      assert.strictEqual(relayUrl(), 'http://127.0.0.1:8443');
      process.env.SECUREAI_RELAY_URL = 'https://relay.example.invalid:8443';
      assert.strictEqual(relayUrl(), 'https://relay.example.invalid:8443');
    } finally {
      if (prior === undefined) delete process.env.SECUREAI_RELAY_URL;
      else process.env.SECUREAI_RELAY_URL = prior;
    }
    console.log('ok remote_relay_requires_https');
  }

  // 1) unavailable relay
  {
    const r = runConnector(['verify'], {
      SECUREAI_RELAY_URL: 'http://127.0.0.1:1',
      SECUREAI_RELAY_SECRET: 'x',
    });
    assert.strictEqual(r.json.protected, false);
    assert.ok(r.json.verify_ok === false || (r.json.verify && r.json.verify.egress_ok === false));
    assert.ok(
      r.json.verify &&
        (r.json.verify.error_class === 'relay_unreachable' ||
          r.json.verify.error_class === 'session_issue_transport_error' ||
          r.json.verify.error_class === 'verify_transport_error')
    );
    console.log('ok unavailable_relay');
  }

  // 2) protect never sets protected:true without verify (unavailable)
  {
    const r = runConnector(['protect'], {
      SECUREAI_RELAY_URL: 'http://127.0.0.1:1',
      SECUREAI_RELAY_SECRET: 'x',
    });
    assert.strictEqual(r.json.protected, false);
    console.log('ok refuses_protected_without_verify');
  }

  const live = await withRelay('relay-connector-secret', async (base) => {
    // 3) invalid auth
    {
      const r = runConnector(['verify'], {
        SECUREAI_RELAY_URL: base,
        SECUREAI_RELAY_SECRET: 'wrong-secret',
      });
      assert.strictEqual(r.json.protected, false);
      assert.ok(r.json.verify && r.json.verify.error_class === 'unauthorized');
      console.log('ok invalid_auth');
    }

    // 4) happy path verify_ok, still protected:false
    {
      const r = runConnector(['verify'], {
        SECUREAI_RELAY_URL: base,
        SECUREAI_RELAY_SECRET: 'relay-connector-secret',
      });
      assert.strictEqual(r.json.protected, false);
      assert.ok(r.json.verify && r.json.verify.egress_ok === true);
      assert.ok(r.json.verify_ok === true);
      assert.ok(r.code === 0);
      console.log('ok relay_verify_ok_no_self_protected');
    }

    // 5) replay rejected at relay API (connector surface)
    {
      process.env.SECUREAI_RELAY_URL = base;
      process.env.SECUREAI_RELAY_SECRET = 'relay-connector-secret';
      // Re-require after env so relayUrl() sees it (module caches env at call time — ok)
      delete require.cache[require.resolve('../connector.js')];
      const { verifyViaRelayConnect } = require('../connector.js');
      const issued = await httpJson(
        'POST',
        `${base}/v1/session`,
        { 'X-SecureAI-Relay-Auth': 'relay-connector-secret' },
        '{}'
      );
      assert.strictEqual(issued.status, 200);
      const sid = issued.body.session_id;
      const token = issued.body.session_token;
      const nonce = crypto.randomUUID();
      const first = await verifyViaRelayConnect(sid, token, nonce);
      assert.ok(first.status === 200 && first.body && first.body.ok);
      const second = await verifyViaRelayConnect(sid, token, nonce);
      assert.ok(second.error_class === 'replay' || second.status === 403);
      console.log('ok replay_rejected');
    }

    return true;
  });

  if (live === null) {
    console.log('note: live relay cases skipped');
  }

  console.log(failed === 0 ? 'ALL CONNECTOR RELAY TESTS PASSED' : `FAILED ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
