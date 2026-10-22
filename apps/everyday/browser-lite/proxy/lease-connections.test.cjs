const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {LeaseConnections}=require('./lease-connections.cjs');
test('device revoke closes only its streams and rejects delayed authorized ingress',()=>{
 const expired=[],book=new LeaseConnections({expire:id=>expired.push(id),now:()=>1000});
 const first='a'.repeat(32),second='b'.repeat(32),a={destroy(){this.closed=true;}},b={destroy(){this.closed=true;}};
 book.track(first,100,a,new EventEmitter());book.track(second,100,b,new EventEmitter());
 book.revoke(first,100);assert.equal(a.closed,true);assert.equal(b.closed,undefined);assert.deepEqual(expired,[first]);
 assert.throws(()=>book.register(first,100),/revoked/);book.close();
});
test('lease expiry closes active WebSockets and releases finished HTTP responses',()=>{
 const scheduled=[],lease='a'.repeat(32),book=new LeaseConnections({now:()=>1000,schedule:fn=>(scheduled.push(fn),1),cancel:()=>{}});
 const stream={destroy(){this.closed=true;}},finished={destroy(){throw new Error('Finished socket retained');}},response=new EventEmitter();
 book.track(lease,10,stream,new EventEmitter());book.track(lease,10,finished,response);response.emit('finish');
 assert.equal(book.leases.get(lease).connections.size,1);scheduled[0]();assert.equal(stream.closed,true);
});
