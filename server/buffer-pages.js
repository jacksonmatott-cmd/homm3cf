// Only the strict base64 decoding operation used by save-store is needed on Pages.
export const Buffer={from(value,encoding){if(typeof value!=='string'||encoding!=='base64')throw new Error('Unsupported binary encoding.');const data=atob(value);return Uint8Array.from(data,c=>c.charCodeAt(0));}};
