(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.vibetopRealmHost=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Names a third-party realm host of this document's context locally:
  // hex(HMAC-SHA256(contextKey, origin))[0:32], as RealmRegistry.digest does.
  // URL rewriting is synchronous and WebCrypto is not, hence this small SHA-256.
  const K=new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function sha256(data) {
    const length=data.length,size=((length+9+63)>>6)<<6,block=new Uint8Array(size);
    block.set(data);block[length]=0x80;
    const bits=length*8;
    block[size-4]=bits>>>24;block[size-3]=bits>>>16;block[size-2]=bits>>>8;block[size-1]=bits;
    block[size-5]=Math.floor(length/0x20000000);
    const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w=new Uint32Array(64);
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let offset=0;offset<size;offset+=64) {
      for(let i=0;i<16;i++){const j=offset+i*4;w[i]=(block[j]<<24)|(block[j+1]<<16)|(block[j+2]<<8)|block[j+3];}
      for(let i=16;i<64;i++){
        const a=w[i-15],b=w[i-2];
        w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0;
      }
      let a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],k=h[7];
      for(let i=0;i<64;i++){
        const t1=(k+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
        const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
        k=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=k;
    }
    const out=new Uint8Array(32);
    for(let i=0;i<8;i++){out[i*4]=h[i]>>>24;out[i*4+1]=h[i]>>>16;out[i*4+2]=h[i]>>>8;out[i*4+3]=h[i];}
    return out;
  }
  function utf8(text){
    const bytes=[];
    for(const ch of String(text)){
      let c=ch.codePointAt(0);
      if(c<0x80)bytes.push(c);
      else if(c<0x800)bytes.push(0xc0|c>>6,0x80|c&63);
      else if(c<0x10000)bytes.push(0xe0|c>>12,0x80|c>>6&63,0x80|c&63);
      else bytes.push(0xf0|c>>18,0x80|c>>12&63,0x80|c>>6&63,0x80|c&63);
    }
    return new Uint8Array(bytes);
  }
  function base64url(text){
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',bytes=[];
    let buffer=0,bits=0;
    for(const ch of text){const v=alphabet.indexOf(ch);if(v<0)throw new Error('Invalid key');buffer=(buffer<<6)|v;bits+=6;if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255);}}
    return new Uint8Array(bytes);
  }
  function hmac(key,message) {
    let k=key.length>64?sha256(key):key;
    const inner=new Uint8Array(64+message.length),outer=new Uint8Array(64+32);
    for(let i=0;i<64;i++){const b=k[i]||0;inner[i]=b^0x36;outer[i]=b^0x5c;}
    inner.set(message,64);outer.set(sha256(inner),64);
    return sha256(outer);
  }
  function hex(bytes){let s='';for(let i=0;i<bytes.length;i++)s+=(bytes[i]<16?'0':'')+bytes[i].toString(16);return s;}
  return function realmHost(key,origin,{prefix,suffix}) {
    return prefix+hex(hmac(base64url(key),utf8(origin))).slice(0,32)+suffix;
  };
});
