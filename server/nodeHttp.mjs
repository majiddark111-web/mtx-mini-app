import { createServer } from 'node:http';
import { setTimeout, clearTimeout } from 'node:timers';

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const REQUEST_BODY_TIMEOUT_MS = 10_000;

class BodyReadError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function declaredBodyTooLarge(incoming) {
  const length = incoming.headers['content-length'];
  return length !== undefined && Number(length) > MAX_REQUEST_BODY_BYTES;
}

function readBody(incoming, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const cleanup = () => {
      clearTimeout(timer);
      incoming.off('data', onData);
      incoming.off('end', onEnd);
      incoming.off('error', onError);
      incoming.off('aborted', onAbort);
    };
    const fail = (error) => {
      cleanup();
      chunks.length = 0;
      incoming.pause();
      reject(error);
    };
    const onData = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BODY_BYTES) return fail(new BodyReadError(413, 'Request body too large'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(bytes ? Buffer.concat(chunks, bytes) : undefined);
    };
    const onError = () => fail(new BodyReadError(400, 'Incomplete request body'));
    const onAbort = onError;
    // Absolute deadline: trickling a byte must not extend the upload lifetime.
    const timer = setTimeout(() => fail(new BodyReadError(408, 'Request body timeout')), timeoutMs);
    timer.unref();
    incoming.on('data', onData);
    incoming.once('end', onEnd);
    incoming.once('error', onError);
    incoming.once('aborted', onAbort);
  });
}

function rejectRequest(incoming, outgoing, status, message) {
  incoming.pause();
  if (outgoing.destroyed || incoming.socket.destroyed) return;
  // Do not drain an unbounded upload or reuse a connection with unread bytes.
  outgoing.shouldKeepAlive = false;
  const timer = setTimeout(() => incoming.destroy(), 1000);
  timer.unref();
  incoming.socket.once('close', () => clearTimeout(timer));
  // Let HTTP flush the error and close gracefully; immediate destroy can reset
  // an active upload before the client receives the response. The timer bounds
  // any remaining socket lifetime and no body chunks are retained here.
  outgoing.writeHead(status, { 'content-type': 'application/json; charset=utf-8', connection: 'close' });
  outgoing.end(JSON.stringify({ error: message }));
}

export function startFetchServer({ fetchHandler, host, port, label, bodyTimeoutMs = REQUEST_BODY_TIMEOUT_MS }) {
  if (!Number.isSafeInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || bodyTimeoutMs > REQUEST_BODY_TIMEOUT_MS) throw new Error('Invalid body timeout');
  const handleIncoming = async (incoming, outgoing) => {
    // An abort can emit an error after the body reader has already settled.
    incoming.on('error', () => {});
    try {
      if (declaredBodyTooLarge(incoming)) return rejectRequest(incoming, outgoing, 413, 'Request body too large');
      const body = await readBody(incoming, bodyTimeoutMs);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const request = new Request(`http://${incoming.headers.host || `${host}:${port}`}${incoming.url || '/'}`, { method: incoming.method, headers, body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : body, duplex: body ? 'half' : undefined });
      const response = await fetchHandler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (error instanceof BodyReadError) return rejectRequest(incoming, outgoing, error.status, error.message);
      if (outgoing.destroyed || incoming.socket.destroyed) return;
      if (outgoing.headersSent) { outgoing.destroy(); return; }
      outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      outgoing.end('{"error":"Internal server error"}');
    }
  };
  const server = createServer({ headersTimeout: 10_000, requestTimeout: 15_000 }, handleIncoming);
  server.on('checkContinue', (incoming, outgoing) => {
    incoming.on('error', () => {});
    if (declaredBodyTooLarge(incoming)) return rejectRequest(incoming, outgoing, 413, 'Request body too large');
    outgoing.writeContinue();
    void handleIncoming(incoming, outgoing);
  });
  server.listen(port, host, () => process.stdout.write(`${label} listening on ${host}:${port}\n`));
  return server;
}

export function closeHttpServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
