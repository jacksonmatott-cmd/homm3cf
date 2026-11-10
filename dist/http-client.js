// Report the failing operation and bounded provider diagnostics without printing HTML.
// SPDX-License-Identifier: GPL-2.0-or-later
export async function fetchTimed(input,options={},timeout=45000){
 const controller=new AbortController(),external=options.signal;let timedOut=false;
 const abort=()=>controller.abort(external.reason);
 if(external?.aborted)abort();else external?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
 try{return await fetch(input,{...options,signal:controller.signal});}
 catch(error){if(timedOut){const failure=new Error('The connection timed out. Check your connection and retry. Your local files were kept.');failure.retryable=true;throw failure;}throw error;}
 finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
export function retryDelay(response){const value=response.headers?.get('Retry-After');if(!value)return 0;const seconds=Number(value);return Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(value)-Date.now())||0;}
function responseError(response,text,label,kind){
 const status=response.status||502,ray=response.headers?.get('cf-ray'),code=/\bError(?:\s+code)?\b[\s\S]{0,160}?\b(1\d{3})\b/i.exec(text.slice(0,8192))?.[1];
 let reason='The server returned '+(kind==='timeout'?'an incomplete response':kind==='oversize'?'an oversized response':/text\/html/i.test(response.headers?.get('Content-Type')||'')||/^\s*</.test(text)?'HTML instead of upload data':text?'unreadable data':'an empty response');
 if(code==='1102')reason='Cloudflare stopped the request because it exceeded the free Worker processing limit';
 else if(code==='1027')reason='This site reached its free daily request allowance';
 else if(status===413)reason='The server rejected the size of this request';
 else if(status===403)reason='The server denied access to this request';
 else if(status===429)reason='The server is temporarily limiting requests';
 const error=new Error(`${label?label+': ':''}${reason} (HTTP ${status}${code?', Cloudflare '+code:''}${ray?', reference '+ray:''}). Your local files were kept.`);
 error.retryAfterMs=retryDelay(response);if(error.retryAfterMs)error.message+=' Retry after '+Math.ceil(error.retryAfterMs/1000)+' seconds.';error.status=status;error.code=code;error.kind=kind||'invalid_response';error.retryable=error.retryAfterMs<=30000&&![403,413].includes(status)&&code!=='1027'&&(status>=500||status===429||status===408||status===200);return error;
}
export async function responseJSON(response,options=45000){
 const {timeout=45000,label=''}=typeof options==='number'?{timeout:options}:options;
 let timer,reader,text='',kind='invalid_json';
 try{
  const read=async()=>{
   if(!response.body)return response.json();
   reader=response.body.getReader();const decoder=new TextDecoder(),parts=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024){kind='oversize';throw new Error('Oversized response');}parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());text=parts.join('');return JSON.parse(text);}
   finally{reader.releaseLock();}
  };
  const value=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{kind='timeout';reader?.cancel().catch(()=>{});reject(new Error('Incomplete response'));},timeout);})]);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid response');return value;
 }catch{throw responseError(response,text,label,kind);}
 finally{clearTimeout(timer);}
}
