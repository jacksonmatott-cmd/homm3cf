// SPDX-License-Identifier: GPL-2.0-or-later
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function getWranglerPath() {
  const cli=path.join(ROOT,'node_modules/wrangler/bin/wrangler.js');
  if(!existsSync(cli))throw new Error('Wrangler is not installed in this project folder. Run npm install here, then retry the command.');
  return cli;
}
export async function runWrangler(args,{input,capture=false,allowFailure=false}={}) {
  const cli=getWranglerPath();
  const child=spawn(process.execPath,[cli,...args],{cwd:ROOT,stdio:[input===undefined?'inherit':'pipe',capture?'pipe':'inherit',capture?'pipe':'inherit'],env:{...process.env,WRANGLER_SEND_METRICS:'false',...(capture?{CI:'true'}:{})}});
  let output='';if(capture){child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});}
  let inputError;
  if(input!==undefined){child.stdin.on('error',error=>{inputError=error;});child.stdin.end(input);}
  const {code,signal}=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  if(code!==0&&!allowFailure)throw new Error(`${capture&&output.trim()?output.trim()+'\n':''}Cloudflare command failed (${signal||`exit ${code}`}): ${args.slice(0,3).join(' ')}. Review the error above and retry.`);
  if(code===0&&inputError)throw new Error('The Cloudflare command closed its input before the secret could be sent. The account update was not confirmed. Retry the account step.');
  return {code,output};
}
export async function runNode(script,args=[]) {
  const child=spawn(process.execPath,[path.join(ROOT,'scripts',script),...args],{cwd:ROOT,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error(script==='set-account.mjs'?`The account step failed (exit ${code}). The website/game upload does not need to be repeated. Run FIX-ACCOUNT.bat in this folder to retry only account setup. The specific error is printed above.`:`${script} did not finish (exit ${code}). Fix the message above, then run that step again.`);
}
