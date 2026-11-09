import net from 'node:net';
import { once } from 'node:events';

// Test-only TCP fault injection. Neither listener nor upstream can leave loopback.
export async function createLoopbackGate(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_LOOPBACK_PORT');
  const sockets = new Set();
  let blocked = false;
  const track = socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    return socket;
  };
  const server = net.createServer(downstream => {
    if (blocked) { downstream.destroy(); return; }
    track(downstream);
    const upstream = track(net.connect({ host: '127.0.0.1', port }));
    const destroy = () => { downstream.destroy(); upstream.destroy(); };
    downstream.on('error', destroy); upstream.on('error', destroy);
    downstream.on('close', () => upstream.destroy());
    upstream.on('close', () => downstream.destroy());
    downstream.pipe(upstream).pipe(downstream);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    cut() { blocked = true; for (const socket of sockets) socket.destroy(); },
    restore() { blocked = false; },
    async close() {
      blocked = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
