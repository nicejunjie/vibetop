'use strict';
// Serialized into the worker bootstrap. Keep the native object and native brand
// checks; only its observable URL values change. Engine code keeps saved getters.
function installWorkerLocation(originalUrl,URLConstructor) {
 const location=self.location,prototype=Object.getPrototypeOf(location);
 const url=new URLConstructor(originalUrl);
 for(const name of ['href','origin','protocol','host','hostname','port','pathname','search','hash']) {
  const descriptor=Object.getOwnPropertyDescriptor(prototype,name);
  if(!descriptor?.get || !descriptor.configurable)throw new Error('WorkerLocation descriptor unavailable');
  const get=descriptor.get,value=url[name];
  Object.defineProperty(prototype,name,{...descriptor,get:function(){get.call(this);return value;}});
 }
 const descriptor=Object.getOwnPropertyDescriptor(prototype,'toString'),method=descriptor.value;
 Object.defineProperty(prototype,'toString',{...descriptor,value:function(){method.call(this);return url.href;}});
}
function validatedBlobIdentity(value,physical) {
 if(typeof value!=='string' || value.length>4096)throw new TypeError('Invalid worker Blob identity');
 const url=new URL(value);
 if(url.protocol!=='blob:' || url.origin!==physical || url.search || url.hash
    || !/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url.pathname))throw new TypeError('Invalid worker Blob identity');
 return url.href;
}
module.exports={installWorkerLocation,validatedBlobIdentity};
