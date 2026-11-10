// SPDX-License-Identifier: GPL-2.0-or-later
export class HTTPError extends Error {constructor(status,message){super(message);this.status=status;}}
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',...headers}});
export async function readJSON(request,max=8192) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HTTPError(415,'Send JSON for this request.');
  const reader=request.body?.getReader();let size=0;const chunks=[];
  if(!reader)throw new HTTPError(400,'Request body is missing.');
  try {for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HTTPError(413,'Request is too large.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  try {const data=JSON.parse(await new Blob(chunks).text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw new HTTPError(400,'Invalid JSON.');}
}
