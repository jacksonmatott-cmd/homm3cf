import {uploadLibrary} from './game-upload.js';
onmessage=async({data})=>{try{await uploadLibrary(data.files,data.includeMusic,p=>postMessage({type:'progress',...p}),data.accountId);postMessage({type:'done'});}catch(e){postMessage({type:'error',message:e.message||String(e)});}};
