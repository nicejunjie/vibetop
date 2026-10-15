'use strict';
// With an upstream proxy (Lite's egress), Hammerhead built a new tunnel-agent
// for every HTTPS request, so each request paid a fresh CONNECT, TCP and TLS
// handshake and nothing was reused. claude.ai's ~160 module scripts became
// ~160 simultaneous connections to one host, and Anthropic's asset CDN started
// resetting them ("Can't reach Claude"). Browsers send these over one HTTP/2
// connection, or at most 6 HTTP/1.1 ones. Use one keep-alive agent per proxy
// that opens each connection through a CONNECT tunnel and reuses it, at most 8
// per host.
const fs=require('node:fs');
function createTunnelPool() {
  var http = require('http'), https = require('https'), tls = require('tls'), net = require('net');
  var agents = new Map();
  class TunnelAgent extends https.Agent {
    constructor(proxy) {
      super({keepAlive: true, keepAliveMsecs: 15000, maxSockets: 8, maxFreeSockets: 8, timeout: 30000, scheduling: 'lifo'});
      this.vtProxy = proxy;
    }
    createConnection(options, callback) {
      var proxy = this.vtProxy, host = options.host || options.hostname, target = host + ':' + options.port;
      var headers = {host: target}, settled = false, agent = this, name = options._agentKey;
      if (proxy.authHeader) headers['proxy-authorization'] = proxy.authHeader;
      // Node counts a socket toward maxSockets only once an async
      // createConnection finishes, so a burst would open one tunnel per
      // request. Hold the slot with a placeholder until then; further
      // requests queue and reuse the pooled connections.
      var placeholder = {destroy: function () {}, vtPlaceholder: true};
      (agent.sockets[name] = agent.sockets[name] || []).push(placeholder);
      function finish(error, socket) {
        if (settled) { if (socket) socket.destroy(); return; }
        settled = true;
        var list = agent.sockets[name], at = list ? list.indexOf(placeholder) : -1;
        if (at >= 0) list.splice(at, 1);
        if (list && !list.length) delete agent.sockets[name];
        callback(error, socket);
      }
      var req = http.request({host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: target, headers: headers, agent: false});
      req.once('connect', function (res, socket) {
        if (res.statusCode !== 200) {
          socket.destroy();
          var refused = new Error('Tunnel refused with ' + res.statusCode); refused.code = 'ECONNRESET';
          return finish(refused);
        }
        finish(null, tls.connect({socket: socket, servername: options.servername || (net.isIP(host) ? undefined : host),
          rejectUnauthorized: true, ca: options.ca, session: options.session, ALPNProtocols: ['http/1.1']}));
      });
      req.once('error', function (error) { finish(error); });
      req.setTimeout(20000, function () { req.destroy(new Error('Tunnel timeout')); });
      req.end();
    }
  }
  function idle(agent) {
    return !Object.keys(agent.sockets).length && !Object.keys(agent.freeSockets).length && !Object.keys(agent.requests).length;
  }
  return function agentFor(proxy, destination) {
    var key = proxy.hostname + ':' + proxy.port + ':' + (proxy.authHeader || '') + '|' + destination;
    var agent = agents.get(key);
    if (!agent) {
      if (agents.size >= 256) agents.forEach(function (old, oldKey) { if (idle(old)) { old.destroy(); agents.delete(oldKey); } });
      agent = new TunnelAgent(proxy); agents.set(key, agent);
    }
    return agent;
  };
}
// HTTP/1.1 keep-alive still caps a host at 8 connections, so ChatGPT's ~300
// preloaded chunks queued for 15 s behind them. Browsers send these over one
// HTTP/2 connection. Offer h2 by ALPN inside the same CONNECT tunnel and reuse
// one session per destination; servers that answer http/1.1 keep the pool.
function createHttp2Pool() {
  var http = require('http'), http2 = require('http2'), tls = require('tls'), net = require('net');
  var sessions = new Map(), pending = new Map(), h1Only = new Map();
  var H1_RETRY_MS = 10 * 60 * 1000, CONNECT_MS = 10000, IDLE_MS = 60000, MAX_SESSIONS = 256;
  var STREAM_WINDOW = 4 * 1024 * 1024, SESSION_WINDOW = 32 * 1024 * 1024;
  function open(proxy, host, port, done) {
    var settled = false, timer = setTimeout(function () { finish(null); }, CONNECT_MS);
    function finish(session) { if (settled) return; settled = true; clearTimeout(timer); done(session); }
    var headers = {host: host + ':' + port};
    if (proxy.authHeader) headers['proxy-authorization'] = proxy.authHeader;
    var req = http.request({host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: host + ':' + port, headers: headers, agent: false});
    req.once('error', function () { finish(null); });
    req.once('connect', function (res, socket) {
      if (res.statusCode !== 200) { socket.destroy(); return finish(null); }
      var secure = tls.connect({socket: socket, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, ALPNProtocols: ['h2', 'http/1.1']});
      secure.once('error', function () { secure.destroy(); finish(null); });
      secure.once('secureConnect', function () {
        if (secure.alpnProtocol !== 'h2') { h1Only.set(host + ':' + port, Date.now()); secure.destroy(); return finish(null); }
        // Node's default 64 KB receive window caps the whole shared session at
        // 64 KB per round trip: ChatGPT's 5 MB of chunks took 1.8 s, not 0.3 s.
        var session = http2.connect('https://' + host + ':' + port, {createConnection: function () { return secure; },
          settings: {enablePush: false, initialWindowSize: STREAM_WINDOW}});
        // Never rethrow from a session event: one bad upstream must not end the process.
        session.on('error', function () { session.destroy(); });
        session.once('connect', function () {
          try { session.setLocalWindowSize(SESSION_WINDOW); } catch (e) {}
          finish(session);
        });
        session.once('close', function () { finish(null); });
      });
    });
    req.end();
  }
  return function sessionFor(proxy, host, port) {
    port = Number(port) || 443;
    var destination = host + ':' + port, key = proxy.hostname + ':' + proxy.port + ':' + (proxy.authHeader || '') + '|' + destination;
    var failed = h1Only.get(destination);
    if (failed && Date.now() - failed < H1_RETRY_MS) return Promise.resolve(null);
    var current = sessions.get(key);
    if (current && !current.closed && !current.destroyed) return Promise.resolve(current);
    if (pending.has(key)) return pending.get(key);
    var promise = new Promise(function (resolve) {
      open(proxy, host, port, function (session) {
        pending.delete(key);
        if (!session) return resolve(null);
        if (sessions.size >= MAX_SESSIONS) sessions.forEach(function (old, oldKey) { old.close(); sessions.delete(oldKey); });
        sessions.set(key, session);
        session.setTimeout(IDLE_MS, function () { session.close(); });
        session.once('close', function () { if (sessions.get(key) === session) sessions.delete(key); });
        session.once('goaway', function () { if (sessions.get(key) === session) sessions.delete(key); });
        resolve(session);
      });
    });
    pending.set(key, promise);
    return promise;
  };
}
const SEND_FROM=`        const http2Session = !this.opts.disableHttp2 && this.opts.isHttps && !this.opts.isWebSocket && !this.opts.proxy &&
            await (0, http2_1.getHttp2Session)(this.opts.requestId, this.opts.protocol + '//' + this.opts.host);`;
const SEND_TO=`        const http2Session = this.opts.proxy && this.opts.isHttps && !this.opts.isWebSocket && !this.vtHttp1
            ? await requestAgent.vtHttp2SessionFor(this.opts.proxy, this.opts.hostname, this.opts.port)
            : !this.opts.disableHttp2 && this.opts.isHttps && !this.opts.isWebSocket && !this.opts.proxy &&
            await (0, http2_1.getHttp2Session)(this.opts.requestId, this.opts.protocol + '//' + this.opts.host);`;
// A stream refused before any response (GOAWAY, REFUSED_STREAM, a session
// that just closed) was never processed upstream: resend it over HTTP/1.1.
const RETRY_FROM=`            if (DestinationRequest._isHttp2ProtocolError(err)) {
                session.destroy();
                this._sendReal();
            }`;
const RETRY_TO=`            if (DestinationRequest._isHttp2ProtocolError(err) || (!this.vtHttp2Responded && /REFUSED_STREAM|GOAWAY|ERR_HTTP2_INVALID_SESSION|ERR_HTTP2_STREAM_CANCEL|ERR_HTTP2_SESSION_ERROR/.test(String(err.code) + ' ' + err.message))) {
                if (DestinationRequest._isHttp2ProtocolError(err)) session.destroy();
                this.vtHttp1 = true;
                this._sendReal();
            }`;
const RESPONSE_FROM=`        stream.on('response', headers => {
            const http2res`;
const RESPONSE_TO=`        stream.on('response', headers => {
            this.vtHttp2Responded = true;
            const http2res`;
const FROM=`        reqOpts.agent = tunnel_agent_1.default.httpsOverHttp({
            proxy,
            rejectUnauthorized: true,
        });
        return;`;
function patchTunnelPool(engineRequire) {
  const file=engineRequire.resolve('testcafe-hammerhead/lib/request-pipeline/destination-request/agent.js');
  let code=fs.readFileSync(file,'utf8');
  if(!code.includes('/* vt-tunnel-pool */')) {
    if(code.split(FROM).length!==2)throw new Error('Tunnel pool patch anchor changed: '+file);
    code=code.replace(FROM,()=>"        reqOpts.agent = vtTunnelAgentFor(proxy, reqOpts.hostname + ':' + (reqOpts.port || 443));\n        return;");
    code+='\n/* vt-tunnel-pool */ var vtTunnelAgentFor = ('+createTunnelPool.toString()+')();\nexports.vtTunnelAgentFor = vtTunnelAgentFor;\n';
  }
  if(!code.includes('/* vt-http2-pool-v2 */')) {
    // A reused engine tree may carry an earlier pool version: replace it.
    const prior=code.indexOf('/* vt-http2-pool');
    if(prior>=0)code=code.slice(0,prior);
    code+='/* vt-http2-pool-v2 */ var vtHttp2SessionFor = ('+createHttp2Pool.toString()+')();\nexports.vtHttp2SessionFor = vtHttp2SessionFor;\n';
  }
  fs.writeFileSync(file,code);
  const sender=engineRequire.resolve('testcafe-hammerhead/lib/request-pipeline/destination-request/index.js');
  let send=fs.readFileSync(sender,'utf8');
  if(send.includes('vtHttp2SessionFor'))return;
  for(const [from,to] of [[SEND_FROM,SEND_TO],[RETRY_FROM,RETRY_TO],[RESPONSE_FROM,RESPONSE_TO]]) {
    if(send.split(from).length!==2)throw new Error('HTTP/2 tunnel patch anchor changed: '+from.slice(0,60));
    send=send.replace(from,()=>to);
  }
  fs.writeFileSync(sender,send);
}
module.exports={patchTunnelPool,createTunnelPool,createHttp2Pool};
