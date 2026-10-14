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
const FROM=`        reqOpts.agent = tunnel_agent_1.default.httpsOverHttp({
            proxy,
            rejectUnauthorized: true,
        });
        return;`;
function patchTunnelPool(engineRequire) {
  const file=engineRequire.resolve('testcafe-hammerhead/lib/request-pipeline/destination-request/agent.js');
  let code=fs.readFileSync(file,'utf8');
  if(code.includes('/* vt-tunnel-pool */'))return;
  if(code.split(FROM).length!==2)throw new Error('Tunnel pool patch anchor changed: '+file);
  code=code.replace(FROM,()=>"        reqOpts.agent = vtTunnelAgentFor(proxy, reqOpts.hostname + ':' + (reqOpts.port || 443));\n        return;");
  code+='\n/* vt-tunnel-pool */ var vtTunnelAgentFor = ('+createTunnelPool.toString()+')();\nexports.vtTunnelAgentFor = vtTunnelAgentFor;\n';
  fs.writeFileSync(file,code);
}
module.exports={patchTunnelPool,createTunnelPool};
