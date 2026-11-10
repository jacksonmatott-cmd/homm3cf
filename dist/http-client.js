// Keep failed network/JSON responses actionable and retryable.
// SPDX-License-Identifier: GPL-2.0-or-later
export async function fetchTimed(input,options={},timeout=45000){
 const controller=new AbortController(),external=options.signal;let timedOut=false;
 const abort=()=>controller.abort(external.reason);
 if(external?.aborted)abort();else external?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
 try{return await fetch(input,{...options,signal:controller.signal});}
 catch(error){if(timedOut)throw new Error('The connection timed out. Check your connection and retry. Your local files were kept.');throw error;}
 finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
export async function responseJSON(response,timeout=45000){
 let timer;
 try{
  const value=await Promise.race([response.json(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Incomplete response')),timeout);})]);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid response');return value;
 }catch{const error=new Error('The website returned an unreadable or incomplete response. Reload and retry. Your local files were kept.');error.status=502;throw error;}
 finally{clearTimeout(timer);}
}
