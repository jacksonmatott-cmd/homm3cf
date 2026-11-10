// Complete dashboard upload backend. GPL-2.0-or-later
import {createWorker} from './worker.js';
import {json} from './http.js';
export function createPagesWorker(config,schema,schemaVersion){
  const worker=createWorker(config.library),ready=new WeakMap();
  async function ensureDatabase(db){
    if(!ready.has(db)){const initialization=(async()=>{
      try{const row=await db.prepare('SELECT version FROM h3_pages_schema WHERE id=1').first();if(row?.version===schemaVersion)return;}catch{}
      const statements=schema.split(';').map(s=>s.trim()).filter(Boolean);
      await db.batch(statements.map(s=>db.prepare(s)));
    })();ready.set(db,initialization);initialization.catch(()=>ready.delete(db));}return ready.get(db);
  }
  return {async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(/^\/_worker\.js(?:[/.]|$)/.test(url.pathname))return new Response('Not found',{status:404});
    if(!url.pathname.startsWith('/api/'))return worker.fetch(request,env,ctx);
    if(!config.account||!config.secret||!config.library.files?.length){if(url.pathname==='/api/status')return json({configured:false,setupMessage:'On your home computer, run PREPARE-UPLOAD.bat from the complete package. Upload its generated UPLOAD-TO-CLOUDFLARE.zip to Cloudflare Pages.'});return json({error:'Prepare your personal upload ZIP on your home computer first.'},503);}
    if(!env.DB){if(url.pathname==='/api/status')return json({configured:false,setupMessage:'In Cloudflare Pages, add a free D1 database binding named DB under Settings → Bindings, then redeploy this same upload ZIP.'});return json({error:'Add the free D1 binding named DB, then redeploy.'},503);}
    try{await ensureDatabase(env.DB);}catch{return json({error:'The free D1 database could not initialize. Check the DB binding and retry.'},503);}
    return worker.fetch(request,{...env,OWNER_ACCOUNT:JSON.stringify(config.account),CATALOG_KEY:JSON.stringify(config.secret)},ctx);
  }};
}
