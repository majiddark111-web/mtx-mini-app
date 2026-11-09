import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createLoopbackGate } from './integration/loopbackGate.mjs';

test('loopback gate cuts existing sockets, blocks new ones and restores transport', { timeout: 10000 }, async () => {
  const sockets = new Set();
  const echo = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {}); socket.pipe(socket);
  });
  echo.listen(0, '127.0.0.1'); await once(echo, 'listening');
  let gate, first, blocked, recovered;
  try {
    gate = await createLoopbackGate(echo.address().port);
    const connect = () => {
      const socket = net.connect({ host: '127.0.0.1', port: gate.port });
      socket.on('error', () => {});
      return socket;
    };
    first = connect(); await once(first, 'connect');
    let reply = once(first, 'data'); first.write('before');
    assert.equal((await reply)[0].toString(), 'before');
    const closed = new Promise(resolve => first.once('close', resolve));
    gate.cut(); await closed;
    blocked = connect();
    await new Promise(resolve => blocked.once('close', resolve));
    gate.restore(); recovered = connect(); await once(recovered, 'connect');
    reply = once(recovered, 'data'); recovered.write('after');
    assert.equal((await reply)[0].toString(), 'after');
  } finally {
    for (const socket of [first, blocked, recovered, ...sockets]) socket?.destroy();
    if (gate) await gate.close();
    await new Promise(resolve => echo.close(resolve));
  }
});

test('loopback gate rejects invalid upstream ports', async () => {
  for (const port of [0, -1, 65536, 1.5, '6379']) await assert.rejects(createLoopbackGate(port));
});
