// SPDX-License-Identifier: GPL-2.0-or-later
import {fetchTimed,responseJSON} from './http-client.js';
export function syncAction(local,remote,hasLocal) {
  const revision=remote?.revision??0;
  if(!hasLocal)return revision>0?'pull':'none';
  if(!local)return revision>0?'conflict':'push';
  if(local.dirty)return local.revision===revision?'push':'conflict';
  if(local.revision===revision)return 'none';
  return revision>local.revision?'pull':'conflict';
}
let expectedAccount=null;
export function setAPIAccount(id){expectedAccount=id;}
export async function api(path,options={}) {
  const headers=new Headers(options.headers);if(expectedAccount&&/^\/(library|saves\/|game-library\/)/.test(path))headers.set('X-H3-Account',expectedAccount);
  const response=await fetchTimed('/api'+path,{...options,headers,credentials:'same-origin',cache:'no-store'});
  if(!response.ok){let data;try{data=await responseJSON(response);}catch{}const error=new Error(data?.error||`The server answered ${response.status}.`);error.status=response.status;error.save=data?.save;throw error;}
  return response;
}
export const apiJSON=async(path,options={})=>responseJSON(await api(path,options),{label:'Loading '+path.split('?')[0]});
