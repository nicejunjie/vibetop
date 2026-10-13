'use strict';
const crypto = require('node:crypto');
class Capabilities {
  constructor({secret, uid, profile, epoch, now = () => Date.now()}) {
    if (!secret || !Number.isSafeInteger(uid) || !/^[a-f0-9]{32}$/.test(profile) || !Number.isSafeInteger(epoch)) throw new Error('Invalid authority');
    Object.assign(this, {secret, uid, profile, epoch, now});
  }
  sign(role, seconds) {
    if (!['auth', 'relay'].includes(role) || seconds < 1 || seconds > 86400) throw new Error('Invalid capability');
    const payload = Buffer.from(JSON.stringify({aud:'vibetop-browser-proxy', uid:this.uid,
      profile:this.profile, epoch:this.epoch, role, exp:Math.floor(this.now()/1000)+seconds})).toString('base64url');
    return payload + '.' + crypto.createHmac('sha256',this.secret).update(payload).digest('base64url');
  }
  engineSessionId() {
    // Engine cookie/storage identity is not a bearer capability and must not
    // change when a network capability expires or an authorization epoch bumps.
    return crypto.createHmac('sha256',this.secret).update('engine\0'+this.uid+'\0'+this.profile).digest('base64url');
  }
  verify(token, role) {
    if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
    const [payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256',this.secret).update(payload).digest();
    const received = Buffer.from(signature,'base64url');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received,expected)) return false;
    try {
      const claims = JSON.parse(Buffer.from(payload,'base64url').toString());
      return claims.aud === 'vibetop-browser-proxy' && claims.uid === this.uid && claims.profile === this.profile
        && claims.epoch === this.epoch && claims.role === role && Number.isSafeInteger(claims.exp)
        && claims.exp > this.now()/1000 && claims.exp <= this.now()/1000 + 86400;
    } catch { return false; }
  }
}
module.exports = {Capabilities};
