// SPDX-License-Identifier: GPL-2.0-or-later
import {pbkdf2,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
export const ITERATIONS=600000;
export const ACCOUNT_ALGORITHM='pbkdf2-client-600000-v1';
export const SESSION_SECONDS=8*60*60;
export const COOKIE='__Host-h3_session';
export const tokenHash=text=>createHash('sha256').update(text).digest('hex');
export const proofVerifier=proof=>tokenHash('heroes3-login-v1:'+proof);
export const newToken=()=>randomBytes(32).toString('base64url');
// Used by the home setup script. Browsers perform this same step using WebCrypto.
export function derivePassword(password,salt) {
  return new Promise((resolve,reject)=>pbkdf2(password,Buffer.from(salt,'hex'),ITERATIONS,32,'sha256',(error,key)=>error?reject(error):resolve(key.toString('hex'))));
}
export function accountConfig(env) {
  try {
    const value=JSON.parse(env.OWNER_ACCOUNT||'null');
    if(value?.algorithm!==ACCOUNT_ALGORITHM||!/^[a-f0-9]{32}$/.test(value.salt)||!/^[a-f0-9]{64}$/.test(value.hash)||!/^[a-f0-9-]{36}$/.test(value.version)||typeof value.username!=='string')return null;
    return value;
  }catch{return null;}
}
export function verifyLogin(username,proof,account) {
  if(typeof username!=='string'||username.length>80||!/^[a-f0-9]{64}$/.test(proof||''))return false;
  const passwordOK=timingSafeEqual(Buffer.from(proofVerifier(proof),'hex'),Buffer.from(account.hash,'hex'));
  const usernameOK=timingSafeEqual(Buffer.from(tokenHash(username.toLowerCase()),'hex'),Buffer.from(tokenHash(account.username.toLowerCase()),'hex'));
  return passwordOK&&usernameOK;
}
export function cookieToken(request) {
  const value=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(value||'')?value:null;
}
export const sessionCookie=token=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
export const clearCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
