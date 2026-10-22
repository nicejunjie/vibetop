'use strict';
// Long streams and WebSockets must end with their originating device lease,
// even when no subsequent HTTP request reaches the root authentication gate.
class LeaseConnections {
 constructor({expire=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout,limit=4096}={}) {
  Object.assign(this,{expire,now,schedule,cancel,limit});this.leases=new Map();
 }
 register(lease,expires) {
  if(!/^[a-f0-9]{32}$/.test(lease||'') || !Number.isSafeInteger(expires) || expires*1000<=this.now() || expires*1000>this.now()+7*86400000)throw new Error('Browser lease expired');
  let item=this.leases.get(lease);
  if(item?.revoked)throw new Error('Browser lease revoked');
  if(item)return item;
  for(const [key,value] of this.leases)if(value.expires*1000<=this.now()){this.revoke(key);this.cancel(value.timer);this.leases.delete(key);}
  if(this.leases.size>=this.limit)throw new Error('Too many browser leases');
  item={expires,connections:new Set(),revoked:false};this.leases.set(lease,item);
  item.timer=this.schedule(()=>this.revoke(lease),expires*1000-this.now());item.timer?.unref?.();return item;
 }
 track(lease,expires,socket,response) {
  const item=this.register(lease,expires);item.connections.add(socket);
  const done=()=>{item.connections.delete(socket);response.removeListener('close',done);response.removeListener('finish',done);};
  response.once('close',done);response.once('finish',done);
 }
 revoke(lease,expires) {
  let item=this.leases.get(lease);
  if(!item && expires*1000>this.now())item=this.register(lease,expires);
  if(!item || item.revoked)return;
  item.revoked=true;for(const socket of item.connections)socket.destroy();item.connections.clear();this.expire(lease);
 }
 close(){for(const [key,item] of this.leases){this.revoke(key);this.cancel(item.timer);}this.leases.clear();}
}
module.exports={LeaseConnections};
