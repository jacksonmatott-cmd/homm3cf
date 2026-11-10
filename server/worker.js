// Heroes III Free Edition: static encrypted library + D1. GPL-2.0-or-later
import {accountConfig,verifyLogin,tokenHash,newToken,cookieToken,sessionCookie,clearCookie,SESSION_SECONDS,ITERATIONS,ACCOUNT_ALGORITHM} from './auth.js';
import {json,HTTPError,readJSON} from './http.js';
import {cloudState,saveAPI} from './save-store.js';
import installedLibrary from './library-manifest.json' with {type:'json'};
export {CLOUD_LIMIT,PART_SIZE} from './save-store.js';
const HEADERS={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
function libraryKey(env,library){try{const value=JSON.parse(env.CATALOG_KEY||'null');return value?.version===library.version&&/^[A-Za-z0-9+/]{43}=$/.test(value.key||'')?value.key:null;}catch{return null;}}
async function requireSession(request,env,account){const token=cookieToken(request);if(!token)throw new HTTPError(401,'Sign in to continue.');const session=await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND account_version=? AND expires_at>?').bind(tokenHash(token),account.version,Math.floor(Date.now()/1000)).first();if(!session)throw new HTTPError(401,'Your session ended. Sign in again.');return token;}
async function rateLimit(request,env,account){const now=Math.floor(Date.now()/1000),cutoff=now-900,bucket=tokenHash(`${account.salt}:${request.headers.get('CF-Connecting-IP')||'unknown'}`);const result=await env.DB.prepare(`INSERT INTO login_limits(bucket,window_start,attempts) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END RETURNING attempts`).bind(bucket,now,cutoff,cutoff,now).first();if(result.attempts>10)throw new HTTPError(429,'Too many sign-in attempts. Try again in 15 minutes.');}
export function createWorker(library=installedLibrary){
  async function api(request,env,url){
    const account=accountConfig(env),configured=!!account&&!!env.DB;
    if(url.pathname==='/api/status'&&request.method==='GET')return json({configured,libraryReady:library.files.length>0&&!!libraryKey(env,library),edition:'free'});
    if(!configured)throw new HTTPError(503,'Run the one-time Free Edition setup on your home computer.');
    if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)throw new HTTPError(403,'This request must come from your game website.');
    if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HTTPError(403,'Cross-site requests are not allowed.');
    if(url.pathname==='/api/auth-config'&&request.method==='GET')return json({algorithm:ACCOUNT_ALGORITHM,iterations:ITERATIONS,salt:account.salt});
    if(url.pathname==='/api/login'&&request.method==='POST'){
      await rateLimit(request,env,account);const data=await readJSON(request);
      if(!verifyLogin(data.username,data.proof,account))throw new HTTPError(401,'The username or password is incorrect.');
      const token=newToken();await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<=? OR account_version<>?').bind(Math.floor(Date.now()/1000),account.version),
        env.DB.prepare('DELETE FROM login_limits WHERE window_start<?').bind(Math.floor(Date.now()/1000)-3600),
        env.DB.prepare('INSERT INTO sessions(token_hash,account_version,expires_at) VALUES (?,?,?)').bind(tokenHash(token),account.version,Math.floor(Date.now()/1000)+SESSION_SECONDS)
      ]);
      return json({user:{id:'owner',username:account.username},save:await cloudState(env.DB)},200,{'Set-Cookie':sessionCookie(token)});
    }
    const token=await requireSession(request,env,account);
    if(url.pathname==='/api/logout'&&request.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash(token)).run();return json({ok:true},200,{'Set-Cookie':clearCookie()});}
    if(url.pathname==='/api/session'&&request.method==='GET')return json({user:{id:'owner',username:account.username},save:await cloudState(env.DB),libraryReady:library.files.length>0&&!!libraryKey(env,library)});
    if(url.pathname==='/api/library'&&request.method==='GET'){
      const key=libraryKey(env,library);
      if(!key||!library.files.length)throw new HTTPError(503,'Your encrypted library is not prepared yet. Run npm run upload-game on your home computer.');
      return json({version:library.version,key,files:library.files});
    }
    if(url.pathname.startsWith('/api/saves/'))return saveAPI(request,env.DB,url);
    throw new HTTPError(404,'This endpoint was not found.');
  }
  return {async fetch(request,env){const url=new URL(request.url);let response;try{if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))response=json({error:'Open the HTTPS game website.'},400);else if(url.pathname.startsWith('/api/'))response=await api(request,env,url);else response=await env.ASSETS.fetch(request);}catch(error){response=json({error:error instanceof HTTPError?error.message:'The free service could not complete that request. Retry later; your device copy was kept.'},error instanceof HTTPError?error.status:503);}const headers=new Headers(response.headers);for(const[name,value]of Object.entries(HEADERS))headers.set(name,value);if(url.pathname.endsWith('.wasm'))headers.set('Content-Type','application/wasm');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}};
}
export default createWorker();
