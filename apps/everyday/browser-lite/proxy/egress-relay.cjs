'use strict';
// Run inside the rewriter's PrivateNetwork namespace. The only path out is a
// filesystem socket owned by this user, served by the independently guarded unit.
const net = require('node:net');
// The cap counts connections (each is two sockets) and sits above the egress
// limit, so a burst waits for an egress slot instead of being reset here.
async function createEgressRelay(socketPath, secret, {maxConnections = 512} = {}) {
  const sockets = new Set();
  const server = net.createServer(client => {
    if (sockets.size / 2 >= maxConnections) { client.destroy(); return; }
    const guard = net.createConnection({path: socketPath});
    for (const socket of [client, guard]) {
      sockets.add(socket);
      socket.setTimeout(120000, () => socket.destroy());
      socket.on('error', () => { client.destroy(); guard.destroy(); });
      socket.on('close', () => { sockets.delete(socket); client.destroy(); guard.destroy(); });
    }
    client.pipe(guard).pipe(client);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://browser:${secret}@127.0.0.1:${server.address().port}`,
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(r => server.close(r)); }
  };
}
module.exports = {createEgressRelay};
