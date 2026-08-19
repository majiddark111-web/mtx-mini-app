import { createServer } from 'node:http';

export function startFetchServer({ fetchHandler, host, port, label }) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const request = new Request(`http://${incoming.headers.host || `${host}:${port}`}${incoming.url || '/'}`, { method: incoming.method, headers, body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : body, duplex: body ? 'half' : undefined });
      const response = await fetchHandler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      outgoing.end('{"error":"Internal server error"}');
    }
  });
  server.listen(port, host, () => process.stdout.write(`${label} listening on ${host}:${port}\n`));
  return server;
}

export function closeHttpServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
