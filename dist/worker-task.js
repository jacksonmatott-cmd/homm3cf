// Bound worker lifetimes and contain asynchronous UI/worker errors.
// SPDX-License-Identifier: GPL-2.0-or-later
export function runWorkerTask(script,message,{onProgress,onSafety,idleTimeout=180000,WorkerClass=globalThis.Worker}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}error?reject(error instanceof Error?error:new Error(String(error))):resolve(result);};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new Error('The file operation stopped responding. Retry; your cloud saves were kept.')),idleTimeout);};
  try{
   worker=new WorkerClass(script,{type:'module'});
   worker.onmessage=async event=>{
    if(settled)return;
    try{
     const data=event?.data;if(!data||typeof data!=='object'||typeof data.type!=='string')throw new Error('The file worker returned an invalid response. Reload the website and retry.');
     arm();
     if(data.type==='progress'){await onProgress?.(data);return;}
     if(data.type==='safety'){
      if(!onSafety)throw new Error('A safety backup must be exported before restoring these saves.');
      clearTimeout(timer);await onSafety(data.bytes);if(!settled){arm();worker.postMessage({type:'continue'});}return;
     }
     if(data.type==='done'){finish(null,data);return;}
     if(data.type==='error')throw new Error(data.message||'The file operation failed.');
     throw new Error('The file worker returned an unknown response. Reload the website and retry.');
    }catch(error){finish(error);}
   };
   worker.onerror=event=>{event.preventDefault?.();finish(new Error(event.message||'The file worker could not start. Reload the website and retry.'));};
   worker.onmessageerror=()=>finish(new Error('The browser could not read a file worker response. Reload the website and retry.'));
   arm();worker.postMessage(message);
  }catch(error){finish(error);}
 });
}
