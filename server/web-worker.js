// Account creation and website file uploads. GPL-2.0-or-later
import {proofVerifier,verifyLogin,tokenHash,newToken,cookieToken,sessionCookie,clearCookie,SESSION_SECONDS,ITERATIONS,ACCOUNT_ALGORITHM} from './auth.js';
import {HTTPError,json,readJSON} from './http.js';
import {createSaveStore} from './save-store.js';
import {STORAGE_LIMIT} from './storage-quota.js';
import {libraryAPI,libraryManifest,libraryState} from './web-library.js';
const HEADERS={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
const usernameKey=value=>typeof value==='string'?value.trim().toLowerCase():'';
async function limit(db,request,scope,max,seconds){const now=Math.floor(Date.now()/1000),cutoff=now-seconds,bucket=tokenHash(scope+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));const row=await db.prepare(`INSERT INTO web_rate_limits(bucket,window_start,attempts) VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END RETURNING attempts`).bind(bucket,now,cutoff,cutoff,now).first();if(row.attempts>max)throw new HTTPError(429,'Too many attempts. Please try again later.');}
async function newSession(db,account){const token=newToken(),now=Math.floor(Date.now()/1000);await db.batch([
 db.prepare('DELETE FROM web_sessions WHERE expires_at<=?').bind(now),
 db.prepare('DELETE FROM web_rate_limits WHERE window_start<?').bind(now-86400),
 db.prepare('INSERT INTO web_sessions(token_hash,account_id,account_version,expires_at) VALUES (?,?,?,?)').bind(tokenHash(token),account.id,account.version,now+SESSION_SECONDS)
]);return token;}
async function signedAccount(request,db){const token=cookieToken(request);if(!token)throw new HTTPError(401,'Sign in to continue.');const row=await db.prepare('SELECT a.* FROM web_accounts a JOIN web_sessions s ON a.id=s.account_id AND a.version=s.account_version WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash(token),Math.floor(Date.now()/1000)).first();if(!row)throw new HTTPError(401,'Your session ended. Sign in again.');return row;}
export function createWebWorker(schema,schemaVersion){
 const ready=new WeakMap();
 async function initialize(db){if(!ready.has(db)){const promise=(async()=>{try{const row=await db.prepare('SELECT version FROM h3_pages_schema WHERE id=1').first();if(row?.version===schemaVersion)return;}catch{}await db.batch(schema.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));})();ready.set(db,promise);promise.catch(()=>ready.delete(db));}return ready.get(db);}
 async function api(request,env,url){
  if(!env.DB){if(url.pathname==='/api/status')return json({configured:false,setupMessage:'Connect a free D1 database binding named DB in your Cloudflare project settings and redeploy. GitHub Worker deployments can create the binding automatically.'});throw new HTTPError(503,'Add the free D1 binding named DB and redeploy.');}
  await initialize(env.DB);const db=env.DB,route=url.pathname;
  if(route==='/api/status'&&request.method==='GET')return json({configured:true,registrationEnabled:true,edition:'free-web-upload'});
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)throw new HTTPError(403,'This request must come from your game website.');
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HTTPError(403,'Cross-site requests are not allowed.');
  if(route==='/api/auth-config'&&request.method==='GET'){const key=usernameKey(url.searchParams.get('username'));if(key.length>40)throw new HTTPError(400,'Invalid username.');const account=await db.prepare('SELECT salt FROM web_accounts WHERE username_key=?').bind(key).first();return json({algorithm:ACCOUNT_ALGORITHM,iterations:ITERATIONS,salt:account?.salt||tokenHash('unregistered:'+key).slice(0,32)});}
  if(route==='/api/register'&&request.method==='POST'){
   await limit(db,request,'register',5,3600);const data=await readJSON(request),key=usernameKey(data.username);
   if(!/^[a-z0-9_-]{3,40}$/.test(key)||!/^[a-f0-9]{32}$/.test(data.salt||'')||!/^[a-f0-9]{64}$/.test(data.proof||''))throw new HTTPError(400,'Use a username of 3–40 letters, numbers, underscores or hyphens, and a valid password.');
   const account={id:crypto.randomUUID(),username:data.username.trim(),version:crypto.randomUUID()},results=await db.batch([
    db.prepare('INSERT OR IGNORE INTO web_accounts(id,username,username_key,salt,verifier,version,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM web_accounts)<20').bind(account.id,account.username,key,data.salt,proofVerifier(data.proof),account.version,Date.now()),
    db.prepare('INSERT INTO free_current(account_id,revision) SELECT id,0 FROM web_accounts WHERE id=?').bind(account.id),
    db.prepare('INSERT INTO game_current(account_id,revision) SELECT id,0 FROM web_accounts WHERE id=?').bind(account.id)
   ]);
   if(results[0].meta.changes!==1)throw new HTTPError(409,'That username is taken or this personal site has reached its 20-account limit.');
   const token=await newSession(db,account);return json({user:{id:account.id,username:account.username}},201,{'Set-Cookie':sessionCookie(token)});
  }
  if(route==='/api/login'&&request.method==='POST'){
   await limit(db,request,'login',10,900);const data=await readJSON(request),key=usernameKey(data.username),row=await db.prepare('SELECT * FROM web_accounts WHERE username_key=?').bind(key.slice(0,40)).first();
   if(!row||!verifyLogin(data.username?.trim(),data.proof,{username:row.username,hash:row.verifier}))throw new HTTPError(401,'The username or password is incorrect.');
   const token=await newSession(db,row);return json({user:{id:row.id,username:row.username}},200,{'Set-Cookie':sessionCookie(token)});
  }
  const account=await signedAccount(request,db),store=createSaveStore(account.id,{globalLimit:STORAGE_LIMIT});
  if(request.headers.get('X-H3-Account')&&request.headers.get('X-H3-Account')!==account.id)throw new HTTPError(401,'The signed-in account changed in another tab. Reload before continuing.');
  if(route==='/api/logout'&&request.method==='POST'){await db.prepare('DELETE FROM web_sessions WHERE token_hash=?').bind(tokenHash(cookieToken(request))).run();return json({ok:true},200,{'Set-Cookie':clearCookie()});}
  if(route==='/api/session'&&request.method==='GET')return json({user:{id:account.id,username:account.username},save:await store.cloudState(db),libraryReady:!!(await libraryState(db,account.id)).version});
  if(route==='/api/library'&&request.method==='GET')return json(await libraryManifest(db,account.id));
  if(route.startsWith('/api/game-library/'))return libraryAPI(request,db,url,account.id);
  if(route.startsWith('/api/saves/'))return store.saveAPI(request,db,url);
  throw new HTTPError(404,'Endpoint not found.');
 }
 return {async fetch(request,env){const url=new URL(request.url);let response;try{
  if(/^\/_worker\.js(?:[/.]|$)/.test(url.pathname))response=new Response('Not found',{status:404});
  else if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))response=json({error:'Open the HTTPS game website.'},400);
  else response=url.pathname.startsWith('/api/')?await api(request,env,url):await env.ASSETS.fetch(request);
 }catch(e){response=json({error:e instanceof HTTPError?e.message:'The free service could not complete that request. Retry later; your local files were kept.'},e instanceof HTTPError?e.status:503);}
 const headers=new Headers(response.headers);for(const[k,v]of Object.entries(HEADERS))headers.set(k,v);return new Response(response.body,{status:response.status,headers});}};
}
