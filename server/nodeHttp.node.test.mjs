import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { setInterval, clearInterval } from 'node:timers';
import { startFetchServer, closeHttpServer, MAX_REQUEST_BODY_BYTES } from './nodeHttp.mjs';

async function fixture(t, options = {}) {
  const calls = [];
  const server = startFetchServer({ host: '127.0.0.1', port: 0, label: 'Isolated HTTP test', ...options,
    fetchHandler: async (req) => {
      const body = await req.arrayBuffer();
      calls.push({ method: req.method, bytes: body.byteLength });
      return Response.json({ bytes: body.byteLength });
    },
  });
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await closeHttpServer(server); });
  const send = (headers = {}, write = req => req.end(), method = 'POST') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: '/', method, headers, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    write(req);
  });
  const healthy = async () => assert.equal((await send({}, req => req.end(), 'GET')).status, 200);
  return { server, calls, send, healthy };
}

test('accepts an empty GET and a normal JSON POST', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  await app.healthy();
  const body = JSON.stringify({ taps: 1, batchId: 'example-batch-id-1' });
  const result = await app.send({ 'content-type': 'application/json' }, req => req.end(body));
  assert.equal(result.status, 200);
  assert.equal(result.body.bytes, Buffer.byteLength(body));
});

test('accepts exactly the 64 KiB boundary', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const body = Buffer.alloc(MAX_REQUEST_BODY_BYTES, 97);
  const result = await app.send({ 'content-length': body.length }, req => req.end(body));
  assert.equal(result.status, 200);
  assert.equal(result.body.bytes, MAX_REQUEST_BODY_BYTES);
});

test('rejects oversized declared length before receiving its body', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const result = await app.send({ 'content-length': MAX_REQUEST_BODY_BYTES + 1 }, req => req.flushHeaders());
  assert.equal(result.status, 413);
  assert.equal(result.headers.connection, 'close');
  assert.deepEqual(result.body, { error: 'Request body too large' });
  assert.equal(app.calls.length, 0);
  await app.healthy();
});

test('rejects chunked bytes above limit without Content-Length', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const result = await app.send({ 'transfer-encoding': 'chunked' }, req => {
    req.write(Buffer.alloc(MAX_REQUEST_BODY_BYTES));
    req.end(Buffer.from('x'));
  });
  assert.equal(result.status, 413);
  assert.equal(app.calls.length, 0);
  await app.healthy();
});

test('counts UTF-8 bytes, not characters', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const body = 'م'.repeat(MAX_REQUEST_BODY_BYTES / 2 + 1);
  assert.ok(body.length < MAX_REQUEST_BODY_BYTES);
  const result = await app.send({ 'transfer-encoding': 'chunked' }, req => req.end(body));
  assert.equal(result.status, 413);
  assert.equal(app.calls.length, 0);
});

test('rejects oversized Expect requests without issuing 100 Continue', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  let continued = false;
  const result = await app.send({ expect: '100-continue', 'content-length': MAX_REQUEST_BODY_BYTES + 1 }, req => {
    req.on('continue', () => { continued = true; });
    req.flushHeaders();
  });
  assert.equal(result.status, 413);
  assert.equal(continued, false);
  assert.equal(app.calls.length, 0);
});

test('allows bounded Expect requests', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const result = await app.send({ expect: '100-continue', 'content-length': 2 }, req => {
    req.on('continue', () => req.end('{}'));
    req.flushHeaders();
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.bytes, 2);
});

test('times out incomplete uploads before invoking handler', { timeout: 5000 }, async t => {
  const app = await fixture(t, { bodyTimeoutMs: 100 });
  const result = await app.send({ 'content-length': 10 }, req => req.write('x'));
  assert.equal(result.status, 408);
  assert.equal(result.headers.connection, 'close');
  assert.equal(app.calls.length, 0);
  await app.healthy();
});

test('client abort does not reach handler or break following requests', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const req = request({ host: '127.0.0.1', port: app.server.address().port, method: 'POST', headers: { 'content-length': 100 }, agent: false });
  req.on('error', () => {});
  const closed = new Promise(resolve => req.once('close', resolve));
  req.write('incomplete');
  await delay(30);
  req.destroy();
  await closed;
  assert.equal(app.calls.length, 0);
  await app.healthy();
});

test('trickling bytes does not reset the absolute upload deadline', { timeout: 5000 }, async t => {
  const app = await fixture(t, { bodyTimeoutMs: 100 });
  let timer;
  let writes = 0;
  try {
    const result = await app.send({ 'transfer-encoding': 'chunked' }, req => {
      req.write('x');
      timer = setInterval(() => { writes++; req.write('x'); }, 15);
      req.once('close', () => clearInterval(timer));
    });
    assert.equal(result.status, 408);
    assert.ok(writes > 0);
    assert.equal(app.calls.length, 0);
  } finally { clearInterval(timer); }
  await app.healthy();
});

test('accepts chunked uploads exactly at the byte boundary', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const result = await app.send({ 'transfer-encoding': 'chunked' }, req => {
    req.write(Buffer.alloc(MAX_REQUEST_BODY_BYTES / 2));
    req.end(Buffer.alloc(MAX_REQUEST_BODY_BYTES / 2));
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.bytes, MAX_REQUEST_BODY_BYTES);
});

test('applies the body cap to GET requests too', { timeout: 5000 }, async t => {
  const app = await fixture(t);
  const result = await app.send({ 'content-length': MAX_REQUEST_BODY_BYTES + 1 }, req => req.flushHeaders(), 'GET');
  assert.equal(result.status, 413);
  assert.equal(app.calls.length, 0);
});
