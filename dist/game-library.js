// Read large private libraries without one large Worker response.
// SPDX-License-Identifier: GPL-2.0-or-later
import {apiJSON} from './cloud-sync.js';
import {MAX_GAME_FILES} from './library-plan.js';
export async function fetchLibrary(progress=()=>{}){
 const manifest=await apiJSON('/library?paged=1');if(!manifest.paged)return manifest;
 if(!Number.isSafeInteger(manifest.fileCount)||manifest.fileCount<1||manifest.fileCount>MAX_GAME_FILES)throw new Error('Your library file count is invalid. Reload before retrying.');
 const files=[];
 while(files.length<manifest.fileCount){const page=await apiJSON('/library/files?version='+encodeURIComponent(manifest.version)+'&offset='+files.length);if(page.version!==manifest.version||page.offset!==files.length||!Array.isArray(page.files)||!page.files.length||page.files.length>32||files.length+page.files.length>manifest.fileCount)throw new Error('Your library file list is incomplete. Reload and retry; stored files were kept.');files.push(...page.files);progress(files.length,manifest.fileCount);}
 return {...manifest,files};
}
