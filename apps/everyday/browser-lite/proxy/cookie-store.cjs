'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hammerhead}=require('./engine.cjs');
const Cookies=hammerhead('session/cookies');
class CookieStore {
 constructor({file,maxJars=1024,maxCookies=3000}={}) {
  Object.assign(this,{file,maxJars,maxCookies});this.jars=new Map();this.saved=new Map();
  if(file && fs.existsSync(file)) {
   const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   try {
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o077))throw new Error('Cookie profile permissions are unsafe');
    if(stat.size>32*1024*1024)throw new Error('Cookie profile is too large');
    const data=JSON.parse(fs.readFileSync(fd,'utf8'));
    if(data.version!==1||!Array.isArray(data.jars)||data.jars.length>maxJars)throw new Error('Invalid cookie profile');
    if(data.jars.some(entry=>!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[0].length>4096||typeof entry[1]!=='string'))throw new Error('Invalid cookie partitions');
    this.saved=new Map(data.jars);if(this.saved.size!==data.jars.length)throw new Error('Duplicate cookie partitions');
   }finally{fs.closeSync(fd);}
  }
 }
 get(key,existing) {
  if(this.jars.has(key))return this.jars.get(key);
  if(new Set([...this.jars.keys(),...this.saved.keys()]).size>=this.maxJars && !this.saved.has(key))throw new Error('Cookie partition limit');
  const jar=existing||new Cookies();if(this.saved.has(key)){jar.setJar(this.saved.get(key));this.saved.delete(key);}
  const set=jar._set,store=this;
  jar._set=function(...args){const result=set.apply(this,args);if(result.length)store.save();return result;};
  this.jars.set(key,jar);return jar;
 }
 save() {
  // Load saved partitions before enforcing a profile-wide limit, so inactive
  // partitions cannot grow an unbounded on-disk profile across restarts.
  for(const key of [...this.saved.keys()])this.get(key);
  const all=[];
  for(const jar of this.jars.values())for(const cookie of jar._getAllCookiesSync())all.push({jar,cookie});
  all.sort((a,b)=>new Date(a.cookie.lastAccessed||a.cookie.creation)-new Date(b.cookie.lastAccessed||b.cookie.creation));
  for(const {jar,cookie} of all.slice(0,Math.max(0,all.length-this.maxCookies)))jar._removeCookieSync(cookie.domain,cookie.path,cookie.key);
  if(!this.file)return;
  const data=JSON.stringify({version:1,jars:[...this.jars].map(([key,jar])=>[key,jar.serializeJar()])});
  const temporary=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try {
   const fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   try {fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.renameSync(temporary,this.file);
   const directory=fs.openSync(path.dirname(this.file),fs.constants.O_RDONLY);try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
  }finally{try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
 }
}
module.exports={CookieStore};
