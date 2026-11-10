// Browser-side password stretching keeps server login requests small. GPL-2.0-or-later
export async function loginProof(password,config) {
  if(config?.algorithm!=='pbkdf2-client-600000-v1'||config.iterations!==600000||!/^[a-f0-9]{32}$/.test(config.salt))throw new Error('The account configuration is not supported. Reload the website and try signing in again.');
  const salt=Uint8Array.from(config.salt.match(/../g),byte=>parseInt(byte,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:config.iterations},key,256);
  return Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
}
