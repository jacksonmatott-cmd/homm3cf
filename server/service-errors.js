// Return useful storage/quota categories without exposing SQL or private values.
// SPDX-License-Identifier: GPL-2.0-or-later
export function serviceError(error){
 const text=String(error?.message||'');
 if(/(?:D1|database).*(?:daily|quota)|(?:daily|quota).*(?:D1|rows (?:read|written))/i.test(text))return {status:429,error:'This site reached a free database daily allowance. Try again after the allowance resets; your stored library and saves were kept.',code:'D1_DAILY_LIMIT',retryable:false};
 if(/SQLITE_FULL|database or disk is full|database.*(?:storage limit|is full|size limit)/i.test(text))return {status:507,error:'Free database storage is full. Your current library and saves were kept.',code:'D1_STORAGE_FULL',retryable:false};
 return {status:503,error:'The free service could not complete that request. Retry later; your local files were kept.',code:'BACKEND_UNAVAILABLE',retryable:true};
}
