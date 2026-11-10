// Stores only a salted password hash as a Cloudflare secret. GPL-2.0-or-later
import {createInterface} from 'node:readline/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {derivePassword,proofVerifier,ACCOUNT_ALGORITHM} from '../server/auth.js';
import {getWranglerPath,runWrangler} from './wrangler-run.mjs';
async function readCredentials() {
  const rl=createInterface({input:process.stdin,output:process.stdout,terminal:!!(process.stdin.isTTY&&process.stdout.isTTY)});
  const lines=rl[Symbol.asyncIterator]();
  const question=async prompt=>{rl.setPrompt(prompt);rl.prompt();const reply=await lines.next();if(reply.done)throw new Error('Account input closed before setup finished. Open FIX-ACCOUNT.bat in a normal terminal window and enter each answer there.');return reply.value;};
  try {
    let username;
    while(true){username=(await question('Choose your private account username (3–40 letters, numbers, . _ -): ')).trim();if(/^[a-zA-Z0-9_.-]{3,40}$/.test(username))break;console.error('Use 3–40 letters, numbers, periods, underscores or hyphens. Please try again.');}
    while(true){
      const password=await question('Choose a password (14–256 characters; visible as you type): ');
      if(password.length<14||password.length>256){console.error('The password must contain 14–256 characters. Please try again.');continue;}
      const confirmation=await question('Repeat password (visible as you type): ');
      if(password!==confirmation){console.error('The passwords did not match. Enter the password and confirmation again.');continue;}
      return {username,password};
    }
  } finally {rl.close();}
}
try {
  getWranglerPath();
  const {username,password}=await readCredentials();
  const salt=randomBytes(16).toString('hex');
  const account={algorithm:ACCOUNT_ALGORITHM,username,salt,hash:proofVerifier(await derivePassword(password,salt)),version:randomUUID()};
  console.log('Saving your private account to the configured Cloudflare Worker…');
  const result=await runWrangler(['secret','put','OWNER_ACCOUNT'],{input:JSON.stringify(account)+'\n',capture:true});
  if(result.output.trim())console.log(result.output.trim());
  console.log('Your private account is configured. Sign in with the username and password you chose. Existing sessions are invalidated; cloud saves are retained.');
}catch(error){console.error('\nAccount setup failed: '+error.message);console.error('Retry only this step with FIX-ACCOUNT.bat or npm run set-account. If Cloudflare asks you to authenticate, run npx wrangler login first.');process.exitCode=1;}
