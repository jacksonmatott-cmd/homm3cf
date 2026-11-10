import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const password='  visible café pass42  ';
async function fixture(t,{missing=false}={}) {
  const root=await mkdtemp(path.join(tmpdir(),'h3-account-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const name of ['scripts/set-account.mjs','scripts/wrangler-run.mjs','server/auth.js','package.json']){
    await mkdir(path.dirname(path.join(root,name)),{recursive:true});
    await copyFile(new URL('../'+name,import.meta.url),path.join(root,name));
  }
  if(!missing){
    await mkdir(path.join(root,'node_modules/wrangler/bin'),{recursive:true});
    await writeFile(path.join(root,'node_modules/wrangler/package.json'),'{"type":"module"}');
    await writeFile(path.join(root,'node_modules/wrangler/bin/wrangler.js'),`
import assert from 'node:assert/strict';
import {derivePassword,proofVerifier,ACCOUNT_ALGORITHM} from '../../../server/auth.js';
assert.deepEqual(process.argv.slice(2),['secret','put','OWNER_ACCOUNT']);
if(process.env.H3_SETUP_TEST_MODE==='fail'){console.error('TEST PROVIDER: authentication expired');process.exit(42);}
if(process.env.H3_SETUP_TEST_MODE==='closed-input'){process.stdin.destroy();console.error('TEST PROVIDER: refused the command');process.exit(43);}
let input='';for await(const chunk of process.stdin)input+=chunk;
const account=JSON.parse(input);
assert.equal(account.algorithm,ACCOUNT_ALGORITHM);assert.equal(account.username,'TestOwner');
assert.equal(account.hash,proofVerifier(await derivePassword(${JSON.stringify(password)},account.salt)));
assert(!input.includes(${JSON.stringify(password)}));
console.log('TEST PROVIDER: verifier received; no network used.');
`);
  }
  return root;
}
async function execute(root,input,{mode='',args=['scripts/set-account.mjs']}={}) {
  const child=spawn(process.execPath,args,{cwd:root,stdio:['pipe','pipe','pipe'],env:{...process.env,H3_SETUP_TEST_MODE:mode}});
  let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.stdin.on('error',()=>{});child.stdin.end(input);
  const timer=setTimeout(()=>child.kill(),8000);
  try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});return{code,stdout,stderr};}finally{clearTimeout(timer);}
}

test('account setup accepts redirected input and sends the matching verifier without a terminal-only failure',async t=>{
  const root=await fixture(t),result=await execute(root,`TestOwner\n${password}\n${password}\n`);
  assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/verifier received/);assert.match(result.stdout,/private account is configured/);
  assert.ok(!result.stdout.includes(password));assert.ok(!result.stderr.includes(password));
});
test('invalid username, password length and confirmation can be corrected in the same account run',async t=>{
  const root=await fixture(t),input=['bad name','TestOwner','short','x'.repeat(257),password,'different password',password,password].join('\n')+'\n';
  const result=await execute(root,input);assert.equal(result.code,0,result.stderr);
  assert.match(result.stderr,/Use 3–40/);assert.equal(result.stderr.match(/password must contain/g)?.length,2);assert.match(result.stderr,/passwords did not match/);assert.match(result.stdout,/verifier received/);
});
test('closed account input produces an actionable failure and never claims success',async t=>{
  const root=await fixture(t),result=await execute(root,'TestOwner\n');
  assert.equal(result.code,1);assert.match(result.stderr,/input closed/);assert.match(result.stderr,/FIX-ACCOUNT\.bat/);assert.doesNotMatch(result.stdout,/Saving your private account|account is configured/);
});
test('missing dependencies are detected before asking for a password',async t=>{
  const root=await fixture(t,{missing:true}),result=await execute(root,'');
  assert.equal(result.code,1);assert.match(result.stderr,/npm install/);assert.doesNotMatch(result.stdout,/Choose/);
});
test('account upload preserves the provider error and exit code',async t=>{
  const root=await fixture(t),result=await execute(root,`TestOwner\n${password}\n${password}\n`,{mode:'fail'});
  assert.equal(result.code,1);assert.match(result.stderr,/TEST PROVIDER: authentication expired/);assert.match(result.stderr,/exit 42/);assert.match(result.stderr,/npx wrangler login/);assert.doesNotMatch(result.stdout,/account is configured/);
});
test('full setup points to account-only recovery after an account child failure',async t=>{
  const root=await fixture(t),result=await execute(root,`TestOwner\n${password}\n${password}\n`,{mode:'fail',args:['--input-type=module','-e',"import {runNode} from './scripts/wrangler-run.mjs';try{await runNode('set-account.mjs')}catch(error){console.error(error.message);process.exitCode=1}"]});
  assert.equal(result.code,1);assert.match(result.stderr,/TEST PROVIDER: authentication expired/);assert.match(result.stderr,/website\/game upload does not need to be repeated/);assert.match(result.stderr,/FIX-ACCOUNT\.bat/);
});
test('a provider that exits before reading a secret reports its error instead of an uncaught pipe failure',async t=>{
  const root=await fixture(t),result=await execute(root,'',{mode:'closed-input',args:['--input-type=module','-e',"import {runWrangler} from './scripts/wrangler-run.mjs';try{await runWrangler(['secret','put','OWNER_ACCOUNT'],{input:'test-data'.repeat(262144),capture:true})}catch(error){console.error(error.message);process.exitCode=1}"]});
  assert.equal(result.code,1);assert.match(result.stderr,/TEST PROVIDER: refused the command/);assert.match(result.stderr,/exit 43/);assert.doesNotMatch(result.stderr,/Unhandled 'error'|write EPIPE|test-data/);
});
