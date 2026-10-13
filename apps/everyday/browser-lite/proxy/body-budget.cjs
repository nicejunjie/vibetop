'use strict';
class BodyBudget {
 constructor({maxBytes=64*1024*1024,maxConcurrent=16}={}) {Object.assign(this,{maxBytes,maxConcurrent});this.bytes=0;this.active=0;}
 async read(stream,limit=this.maxBytes) {
  if(this.active>=this.maxConcurrent)throw new Error('Too many uploads');
  this.active++;let size=0;const chunks=[];
  try {
   for await(const chunk of stream) {
    if(size+chunk.length>limit || this.bytes+chunk.length>this.maxBytes)throw new Error('Upload size limit');
    size+=chunk.length;this.bytes+=chunk.length;chunks.push(chunk);
   }
   return Buffer.concat(chunks);
  } finally {this.bytes-=size;this.active--;}
 }
}
module.exports={BodyBudget};
