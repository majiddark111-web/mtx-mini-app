import { createServer } from 'node:http';
import { handleRequest } from './src/app.ts';

const port = Number(process.env.PORT || '3000');
const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:5173',
  AUTH_MAX_AGE_SECONDS: process.env.AUTH_MAX_AGE_SECONDS || '300',
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
};

createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers(); for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    const request = new Request(`http://${incoming.headers.host || `localhost:${port}`}${incoming.url || '/'}`, { method: incoming.method, headers, body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : body, duplex: body ? 'half' : undefined });
    const response = await handleRequest(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500, { 'content-type': 'application/json' }); outgoing.end('{"error":"Local server error"}'); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`MTX API listening on http://127.0.0.1:${port}\n`));
