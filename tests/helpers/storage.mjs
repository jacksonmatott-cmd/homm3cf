import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createBackup,parseBackup} from '../../dist/backup-format.js';
import {libraryAAD,base64ToBytes} from '../../dist/library-format.js';
class MemoryFile {
  kind='file'; bytes=new Uint8Array(); open=false;
  constructor(name,state) {this.name=name;this.state=state;}
  async getFile() {return new Blob([this.bytes]);}
  async createSyncAccessHandle() {
    if(this.open)throw new Error('File already open');
    this.open=true;this.state.open++;
    return {
      truncate: size=>{const next=new Uint8Array(size);next.set(this.bytes.subarray(0,size));this.bytes=next;},
      // Deliberately short writes exercise the real partial-write handling.
      write: (bytes,{at})=>{const n=Math.min(3,bytes.length);const next=new Uint8Array(Math.max(this.bytes.length,at+n));next.set(this.bytes);next.set(bytes.subarray(0,n),at);this.bytes=next;this.state.writes++;return n;},
      flush:()=>{},close:()=>{assert.equal(this.open,true);this.open=false;this.state.open--;}
    };
  }
}
class MemoryDirectory {
  kind='directory'; children=new Map();
  constructor(name,state){this.name=name;this.state=state;}
  async getDirectoryHandle(name,{create=false}={}) {
    if(!this.children.has(name)&&create)this.children.set(name,new MemoryDirectory(name,this.state));
    const entry=this.children.get(name);
    if(!entry)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    if(entry.kind!=='directory')throw new Error('Not a directory');
    return entry;
  }
  async getFileHandle(name,{create=false}={}) {
    if(!this.children.has(name)&&create)this.children.set(name,new MemoryFile(name,this.state));
    const entry=this.children.get(name);
    if(!entry)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    if(entry.kind!=='file')throw new Error('Not a file');
    return entry;
  }
  async *entries(){yield* this.children.entries();}
  async removeEntry(name){if(!this.children.delete(name))throw Object.assign(new Error('Not found'),{name:'NotFoundError'});}
}
function memory(){const state={open:0,writes:0};return {state,root:new MemoryDirectory('',state)};}
async function addFile(root,path,bytes) {
  const parts=path.split('/');const name=parts.pop();let dir=root;
  for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});
  const file=await dir.getFileHandle(name,{create:true});file.bytes=bytes;return file;
}
async function runWorker(name,data,root,onSafety,extra={}) {
  const messages=[];
  let script=await readFile(new URL(`../../dist/${name}`,import.meta.url),'utf8');
  script=script.replace(/^import .*;\n/m,'');
  const context=vm.createContext({navigator:{storage:{getDirectory:async()=>root}},createBackup,parseBackup,MAX_FILES:5000,MAX_RAW_BYTES:128*1024*1024,MAX_BACKUP_BYTES:192*1024*1024,Blob,URL,AbortController,ReadableStream,TextEncoder,TextDecoder,atob,btoa,libraryAAD,base64ToBytes,Uint8Array,performance,setTimeout,clearTimeout,postMessage:message=>{
    messages.push(message);
    if(message.type==='safety'){onSafety?.(message);queueMicrotask(()=>context.onmessage({data:{type:'continue'}}));}
  },...extra});
  vm.runInContext(script,context);
  await context.onmessage({data});
  return messages;
}

export {memory,addFile,runWorker};
