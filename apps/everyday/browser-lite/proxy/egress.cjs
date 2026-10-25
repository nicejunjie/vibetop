'use strict';
// All upstream HTTP(S)/WebSocket connections go through this authenticated,
// loopback-only forward proxy. DNS is checked once and the selected IP is pinned
// to the actual socket; redirects create new checked connections.
const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns/promises');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const ipaddr = require('ipaddr.js');

function publicAddress(value) {
  try {
    let ip = ipaddr.parse(value);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    // ipaddr distinguishes private, loopback, multicast, link-local, CGNAT,
    // reserved and IPv6 transition mechanisms from ordinary global unicast.
    if (ip.range() !== 'unicast') return false;
    if (ip.kind() === 'ipv6') {
      if (!ip.match(ipaddr.parseCIDR('2000::/3'))) return false;
      for (const cidr of ['64:ff9b::/96', '64:ff9b:1::/48', '2001::/32', '2002::/16']) {
        if (ip.match(ipaddr.parseCIDR(cidr))) return false;
      }
    }
    return true;
  } catch { return false; }
}

// A refusal by policy (not a network failure) names its kind in X-VT-Blocked,
// so the tab can say why instead of "the site could not be reached".
function blocked(kind) { return Object.assign(new Error('Destination not allowed'), {blocked: kind}); }
function blockedHeader(error) { return ['local', 'port'].includes(error?.blocked) ? error.blocked : ''; }
class EgressProxy {
  constructor({resolve = dns.lookup, connect = net.createConnection,
               maxConnections = 384, slotWait = 15000, deniedAddresses = [], deniedCIDRs = [], deniedDomains = [],
               interfaces = os.networkInterfaces, secret} = {}) {
    this.resolve = resolve;
    this.connect = connect;
    this.maxConnections = maxConnections;
    this.slotWait = slotWait;
    this.waiters = [];
    this.denied = new Set(deniedAddresses);
    this.deniedDomains = deniedDomains.map(value=>value.toLowerCase().replace(/\.+$/, '')); 
    this.deniedCIDRs = deniedCIDRs.map(value=>ipaddr.parseCIDR(value));
    this.interfaces = interfaces;
    this.secret = secret || crypto.randomBytes(32).toString('hex');
    this.pending = 0;
    this.authorization = 'Basic ' + Buffer.from('browser:' + this.secret).toString('base64');
    this.sockets = new Set();
    this.server = http.createServer((req, res) => this.request(req, res));
    this.server.on('connect', (req, client, head) => this.tunnel(req, client, head));
    this.server.on('upgrade', (req, client, head) => this.upgrade(req, client, head));
    this.server.on('clientError', (_err, socket) => socket.destroy());
    this.server.requestTimeout = 60000;
    this.server.headersTimeout = 15000;
  }
  async listen(socketPath) {
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      if (socketPath) this.server.listen(socketPath, resolve);
      else this.server.listen(0, '127.0.0.1', resolve);
    });
    if (typeof socketPath==='string') { fs.chmodSync(socketPath, 0o600); return socketPath; }
    if (socketPath) return socketPath;
    return `http://browser:${this.secret}@127.0.0.1:${this.server.address().port}`;
  }
  authorized(req) {
    const got = Buffer.from(req.headers['proxy-authorization'] || '');
    const want = Buffer.from(this.authorization);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  async destination(hostname, port) {
    if (![80, 443].includes(Number(port))) throw blocked('port');
    hostname = hostname.replace(/^\[|\]$/g, '');
    if (!hostname || hostname.includes('%')) throw new Error('Invalid destination');
    const canonical = hostname.toLowerCase().replace(/\.+$/, '');
    if (this.deniedDomains.some(domain=>canonical===domain || canonical.endsWith('.'+domain))) throw blocked('local');
    const answers = net.isIP(hostname)
      ? [{address: hostname, family: net.isIP(hostname)}]
      : await Promise.race([this.resolve(hostname, {all: true, verbatim: true}),
          new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('DNS timeout')), 10000); t.unref(); })]);
    const local = Object.values(this.interfaces()).flat().filter(Boolean);
    const networks = [...this.deniedCIDRs,...local.filter(x=>x.cidr).map(x=>ipaddr.parseCIDR(x.cidr))];
    const isLocal = address => {
      const ip=ipaddr.parse(address);
      return local.some(x=>x.address===address) || networks.some(([network,bits])=>network.kind()===ip.kind() && ip.match(network,bits));
    };
    if (!answers.length || answers.some(x => !publicAddress(x.address) || this.denied.has(x.address) || isLocal(x.address))) {
      throw blocked('local');
    }
    // Prefer IPv4 where both exist; IPv6-only destinations remain supported.
    return answers.find(x => x.family === 4) || answers[0];
  }
  track(socket) {
    this.sockets.add(socket);
    socket.once('close', () => { this.sockets.delete(socket); this.waiters.shift()?.(); });
    socket.setTimeout(120000, () => socket.destroy());
    return socket;
  }
  // A modern app page opens well over a hundred requests at once (claude.ai:
  // ~160 module scripts), each on its own tunnel. Wait briefly for a slot
  // instead of failing the excess: a refusal surfaces as a CORS-less 500.
  async slot() {
    const deadline = Date.now() + this.slotWait;
    while (this.sockets.size + this.pending >= this.maxConnections) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('Connection limit');
      await new Promise(resolve => {
        const timer = setTimeout(() => { const i = this.waiters.indexOf(wake); if (i >= 0) this.waiters.splice(i, 1); resolve(); }, left);
        const wake = () => { clearTimeout(timer); resolve(); };
        this.waiters.push(wake);
      });
    }
  }
  async open(hostname, port) {
    await this.slot();
    this.pending++;
    try {
      const destination = await this.destination(hostname, Number(port));
      return await new Promise((resolve, reject) => {
      const socket = this.track(this.connect({host: destination.address, port: Number(port), family: destination.family}));
      const timer = setTimeout(() => socket.destroy(new Error('Connect timeout')), 15000);
      timer.unref();
      socket.once('close', () => clearTimeout(timer));
      socket.once('error', reject);
      socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
      });
    } finally { this.pending--; }
  }
  headers(req, target, upgrade = false) {
    const result = {...req.headers, host: target.host};
    for (const name of String(result.connection || '').split(',')) delete result[name.trim().toLowerCase()];
    for (const name of ['connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade']) delete result[name];
    delete result['proxy-authorization'];
    delete result['proxy-connection'];
    if (upgrade) { result.connection = 'Upgrade'; result.upgrade = 'websocket'; }
    result.host = target.host;
    return result;
  }
  async request(req, res) {
    if (!this.authorized(req)) { res.writeHead(407); res.end(); return; }
    let socket;
    try {
      const url = new URL(req.url);
      if (url.protocol !== 'http:' || url.username || url.password) throw new Error('Invalid HTTP target');
      socket = await this.open(url.hostname, url.port || 80);
      const agent = new http.Agent({keepAlive: false});
      agent.createConnection = () => socket;
      const upstream = http.request({method: req.method, path: url.pathname + url.search,
        headers: this.headers(req, url), agent}, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
        response.on('error', () => res.destroy());
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch (error) {
      socket?.destroy();
      const kind = blockedHeader(error);
      if (!res.headersSent) res.writeHead(403, kind ? {'X-VT-Blocked': kind} : {});
      res.end('Destination unavailable');
    }
  }
  async tunnel(req, client, head) {
    if (!this.authorized(req)) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    let remote;
    try {
      const target = new URL('https://' + req.url);
      if (target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('Invalid CONNECT target');
      remote = await this.open(target.hostname, target.port || 443);
      if (client.destroyed) { remote.destroy(); return; }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      client.pipe(remote).pipe(client);
      client.on('error', () => remote.destroy());
      remote.on('error', () => client.destroy());
      client.on('close', () => remote.destroy());
      remote.on('close', () => client.destroy());
    } catch (error) {
      if(process.env.VT_BROWSER_DIAGNOSTICS==='1')console.error('CONNECT failed',error.code||error.message);
      remote?.destroy();
      const kind = blockedHeader(error);
      client.end('HTTP/1.1 403 Forbidden\r\n' + (kind ? 'X-VT-Blocked: ' + kind + '\r\n' : '') + '\r\n');
    }
  }
  async upgrade(req, client, head) {
    if (!this.authorized(req)) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    let remote;
    try {
      const target = new URL(req.url);
      if (!['http:', 'ws:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid WS target');
      remote = await this.open(target.hostname, target.port || 80);
      if (req.headers.upgrade?.toLowerCase() !== 'websocket') throw new Error('Unsupported upgrade');
      const headers = this.headers(req, target, true);
      remote.write(`${req.method} ${target.pathname + target.search} HTTP/1.1\r\n` +
        Object.entries(headers).map(([k,v]) => `${k}: ${v}\r\n`).join('') + '\r\n');
      if (head.length) remote.write(head);
      client.pipe(remote).pipe(client);
      client.on('error', () => remote.destroy());
      remote.on('error', () => client.destroy());
      client.on('close', () => remote.destroy());
      remote.on('close', () => client.destroy());
    } catch { remote?.destroy(); client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  }
  async close() {
    for (const socket of this.sockets) socket.destroy();
    this.server.closeAllConnections();
    await new Promise(resolve => this.server.close(resolve));
  }
}
module.exports = {EgressProxy, publicAddress};
if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!config.socket || !/^[a-f0-9]{64}$/.test(config.secret)) throw new Error('Invalid egress configuration');
  const proxy = new EgressProxy({secret: config.secret, deniedAddresses: config.deniedAddresses || [],deniedCIDRs:config.deniedCIDRs || [],deniedDomains:config.deniedDomains || []});
  const inherited=process.env.LISTEN_FDS==='1'&&Number(process.env.LISTEN_PID)===process.pid;
  if(config.inheritedSocket&&!inherited)throw new Error('Root-owned egress socket is required');
  proxy.listen(config.inheritedSocket?{fd:3}:config.socket).catch(error => { console.error(error.message); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => proxy.close().then(() => process.exit()));
}
