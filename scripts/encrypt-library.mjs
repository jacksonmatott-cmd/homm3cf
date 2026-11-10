// Local-only encryption; only ciphertext is deployed as static assets. GPL-2.0-or-later
import {open,mkdir,writeFile,rm} from 'node:fs/promises';
import {randomBytes,randomUUID,createCipheriv,createHash} from 'node:crypto';
import path from 'node:path';
import {prepareLibrary} from './library-files.mjs';
import {libraryAAD} from '../dist/library-format.js';
export async function encryptLibrary(folder,output,{chunkSize=8*1024*1024}={}) {
  const prepared=await prepareLibrary(folder),version=randomUUID(),key=randomBytes(32);
  const directory=path.join(output,version);await mkdir(directory,{recursive:true});
  const files=[];
  for(const file of prepared.files) {
    const handle=await open(file.localPath,'r'),chunks=[],digest=createHash('sha256');let offset=0,index=0;
    try {
      while(offset<file.size) {
        const wanted=Math.min(chunkSize,file.size-offset),buffer=Buffer.alloc(wanted);let read=0;
        while(read<wanted){const result=await handle.read(buffer,read,wanted-read,offset+read);if(!result.bytesRead)throw new Error('A source game file changed while being prepared. Retry preparation.');read+=result.bytesRead;}
        digest.update(buffer);
        const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
        cipher.setAAD(libraryAAD(version,file.path,index,read));
        const encrypted=Buffer.concat([cipher.update(buffer),cipher.final(),cipher.getAuthTag()]);
        const name=randomBytes(16).toString('hex')+'.bin';await writeFile(path.join(directory,name),encrypted);
        chunks.push({url:`/game-data/${version}/${name}`,iv:iv.toString('base64'),size:read,cipherSize:encrypted.length});
        offset+=read;index++;
      }
    }finally{await handle.close();}
    if(digest.digest('hex')!==file.sha256)throw new Error('A source game file changed during encryption. Retry preparation.');
    files.push({path:file.path,size:file.size,sha256:file.sha256,chunks});
  }
  return {manifest:{version,files},secret:{version,key:key.toString('base64')}};
}
