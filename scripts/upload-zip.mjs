// Streaming, classic ZIP writer and bounded ZIP reader. GPL-2.0-or-later
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat} from 'node:fs/promises';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';
import {inflateRawSync} from 'node:zlib';
const TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crcStep(crc,bytes){for(const b of bytes)crc=TABLE[(crc^b)&255]^(crc>>>8);return crc;}
const crc32=bytes=>(crcStep(0xffffffff,bytes)^0xffffffff)>>>0;
function nameOK(name){return typeof name==='string'&&!name.startsWith('/')&&!name.includes('\\')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..')&&!/[\x00-\x1f]/.test(name);}
export async function writeUploadZip(output,entries){
  const stream=createWriteStream(output,{mode:0o600});const complete=finished(stream);complete.catch(()=>{});let position=0;const directory=[],seen=new Set();
  async function write(bytes){if(position+bytes.length>0xffffffff)throw new Error('The upload exceeds the 4 GiB ZIP limit.');position+=bytes.length;if(!stream.write(bytes))await once(stream,'drain');}
  try{for(const entry of entries){if(!nameOK(entry.name)||seen.has(entry.name))throw new Error('Invalid or duplicate ZIP filename.');seen.add(entry.name);const name=Buffer.from(entry.name),offset=position,header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x808,6);header.writeUInt16LE(0,8);header.writeUInt16LE(33,12);header.writeUInt16LE(name.length,26);await write(header);await write(name);let size=0,crc=0xffffffff;
    const parts=entry.path?createReadStream(entry.path):[entry.bytes];for await(const part of parts){const bytes=Buffer.from(part);size+=bytes.length;if(size>25*1024*1024)throw new Error('A file exceeds Cloudflare’s 25 MiB asset limit: '+entry.name);crc=crcStep(crc,bytes);await write(bytes);}crc=(crc^0xffffffff)>>>0;
    const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(size,8);descriptor.writeUInt32LE(size,12);await write(descriptor);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x808,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(size,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);directory.push(central,name);
  }
  const start=position;for(const bytes of directory)await write(bytes);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(position-start,12);end.writeUInt32LE(start,16);await write(end);stream.end();await complete;
  }catch(error){stream.destroy(error);await complete.catch(()=>{});throw error;}
}
export async function openUploadZip(filename){
  const handle=await open(filename,'r');try{const size=(await handle.stat()).size,tail=Buffer.alloc(Math.min(size,65557));await handle.read(tail,0,tail.length,size-tail.length);let end=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
    if(end<0)throw new Error('The previous upload ZIP is incomplete.');const count=tail.readUInt16LE(end+10),bytes=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);if(count===65535||offset+bytes>size||bytes>8*1024*1024)throw new Error('Unsupported ZIP directory.');const central=Buffer.alloc(bytes);await handle.read(central,0,bytes,offset);const entries=new Map();let p=0;
    for(let i=0;i<count;i++){if(p+46>bytes||central.readUInt32LE(p)!==0x02014b50)throw new Error('Invalid ZIP directory.');const nameLength=central.readUInt16LE(p+28),extra=central.readUInt16LE(p+30),comment=central.readUInt16LE(p+32),name=central.subarray(p+46,p+46+nameLength).toString('utf8');const value={flags:central.readUInt16LE(p+8),method:central.readUInt16LE(p+10),crc:central.readUInt32LE(p+16),compressed:central.readUInt32LE(p+20),size:central.readUInt32LE(p+24),offset:central.readUInt32LE(p+42)};if(!nameOK(name)||entries.has(name)||value.flags&1||![0,8].includes(value.method)||value.size>25*1024*1024||value.compressed>26*1024*1024)throw new Error('Unsupported or unsafe ZIP entry.');entries.set(name,value);p+=46+nameLength+extra+comment;}
    return {entries,close:()=>handle.close(),async read(name){const e=entries.get(name);if(!e)throw new Error('The previous ZIP is missing '+name);const local=Buffer.alloc(30);await handle.read(local,0,30,e.offset);if(local.readUInt32LE(0)!==0x04034b50)throw new Error('Invalid ZIP entry header.');const begin=e.offset+30+local.readUInt16LE(26)+local.readUInt16LE(28);if(begin+e.compressed>offset)throw new Error('Invalid ZIP entry size.');const raw=Buffer.alloc(e.compressed);await handle.read(raw,0,raw.length,begin);const result=e.method===0?raw:inflateRawSync(raw,{maxOutputLength:e.size});if(result.length!==e.size||crc32(result)!==e.crc)throw new Error('The previous ZIP has a corrupt file: '+name);return result;}};
  }catch(error){await handle.close();throw error;}
}
