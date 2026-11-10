// Shared browser/setup encryption format. GPL-2.0-or-later
export function libraryAAD(version,path,index,size) {
  return new TextEncoder().encode(JSON.stringify({version,path,index,size}));
}
export function base64ToBytes(text) {
  const binary=atob(text);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
export function bytesToBase64(bytes) {
  const chunks=[];
  for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return btoa(chunks.join(''));
}
