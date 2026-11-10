// Portable backend for Pages uploads; no Node.js compatibility flag required.
// GPL-2.0-or-later. SHA-256 implementation: @noble/hashes, MIT.
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils';
export const ITERATIONS=600000,ACCOUNT_ALGORITHM='pbkdf2-client-600000-v1',SESSION_SECONDS=8*60*60,COOKIE='__Host-h3_session';
export const tokenHash=value=>bytesToHex(sha256(typeof value==='string'?utf8ToBytes(value):value));
export const proofVerifier=proof=>tokenHash('heroes3-login-v1:'+proof);
export const newToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function accountConfig(env){try{const v=JSON.parse(env.OWNER_ACCOUNT||'null');return v?.algorithm===ACCOUNT_ALGORITHM&&/^[a-f0-9]{32}$/.test(v.salt)&&/^[a-f0-9]{64}$/.test(v.hash)&&/^[a-f0-9-]{36}$/.test(v.version)&&typeof v.username==='string'?v:null;}catch{return null;}}
function equalHex(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export function verifyLogin(username,proof,account){if(typeof username!=='string'||username.length>80||!/^[a-f0-9]{64}$/.test(proof||''))return false;const passwordOK=equalHex(proofVerifier(proof),account.hash),usernameOK=equalHex(tokenHash(username.toLowerCase()),tokenHash(account.username.toLowerCase()));return passwordOK&&usernameOK;}
export function cookieToken(request){const value=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value||'')?value:null;}
export const sessionCookie=token=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
export const clearCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
