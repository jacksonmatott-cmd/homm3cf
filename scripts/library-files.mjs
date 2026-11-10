// SPDX-License-Identifier: GPL-2.0-or-later
import {readdir,stat,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const RULES={data:{name:'Data',accept:/\.(lod|snd|pac)$/i},maps:{name:'Maps',accept:/\.(h3m|h3c|tut)$/i},mp3:{name:'Mp3',accept:/\.mp3$/i}};
export async function prepareLibrary(root) {
  const files=[];
  for(const directory of await readdir(root,{withFileTypes:true})) {
    const rule=RULES[directory.name.toLowerCase()];
    if(!directory.isDirectory()||!rule)continue;
    for(const entry of await readdir(path.join(root,directory.name),{withFileTypes:true})) {
      if(!entry.isFile()||!rule.accept.test(entry.name))continue;
      if(/[\\/:\x00-\x1f]/.test(entry.name))throw new Error('Invalid filename in the game directory.');
      const localPath=path.join(root,directory.name,entry.name),info=await stat(localPath);
      if(info.size===0)throw new Error(`The game file ${entry.name} is empty.`);
      if(info.size>300*1024*1024)throw new Error(`${entry.name} exceeds the 300 MiB uploader limit. Use an original, unmodified Complete/Shadow of Death installation.`);
      if(/\.lod$/i.test(entry.name)) {
        const handle=await open(localPath,'r');const magic=Buffer.alloc(4);
        try {await handle.read(magic,0,4,0);}finally{await handle.close();}
        if(!magic.equals(Buffer.from([76,79,68,0])))throw new Error(`${entry.name} is not a valid Heroes III LOD archive.`);
      }
      const hash=createHash('sha256');for await(const chunk of createReadStream(localPath))hash.update(chunk);
      files.push({path:`${rule.name}/${entry.name}`,size:info.size,sha256:hash.digest('hex'),localPath});
    }
  }
  for(const required of ['data/h3bitmap.lod','data/h3sprite.lod','data/heroes3.snd'])if(!files.some(file=>file.path.toLowerCase()===required))throw new Error(`Missing ${required}. Select your own Complete or Shadow of Death installation folder.`);
  const seen=new Set();for(const file of files){if(seen.has(file.path.toLowerCase()))throw new Error('Duplicate game filenames.');seen.add(file.path.toLowerCase());}
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const manifestFiles=files.map(({path,size,sha256})=>({path,size,sha256}));
  const version=createHash('sha256').update(JSON.stringify(manifestFiles)).digest('hex');
  return {files,manifest:{version,files:manifestFiles}};
}
