// Heroes III private account edition. GPL-2.0-or-later
import {api,apiJSON,syncAction,setAPIAccount} from './cloud-sync.js';
import {loginProof} from './login-proof.js';
import {selectGameFiles} from './game-upload.js';
import {cacheAction} from './cache-policy.js';
import {uploadCloud,downloadCloud} from './cloud-transfer.js';
import {browserKeepsKey,isPrintableKey} from './keyboard-policy.js';
import {runWorkerTask} from './worker-task.js';
import {readSetting,missingFeatures} from './browser-support.js';
import {fetchLibrary} from './game-library.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const LINK='h3-cloud-link-v2',ACTIVE='h3-active-account';
let pendingAccount=null,activeUser=null;
const REQUIRED=[['h3bitmap.lod','Shadow of Death graphics'],['h3sprite.lod','Shadow of Death sprites'],['heroes3.snd','Sound effects']];
const recentLog=[];window.vcmiLog=recentLog;
let game=null,running=false,stopped=false,busy=false,ready=false,signedIn=false,featuresReady=false,conflictRevision=0;
function getLink(){try{const data=JSON.parse(localStorage.getItem(LINK));return Number.isSafeInteger(data?.revision)&&data.revision>=0?data:null;}catch{return null;}}
function setLink(value){localStorage.setItem(LINK,JSON.stringify({revision:value.revision,dirty:!!value.dirty}));}
function markDirty(){const link=getLink()||{revision:0};setLink({...link,dirty:true});renderCloudStatus(link.revision,true);}
function clearPassword(){$('password').value='';$('password').type='password';$('show-password').checked=false;}
function showScreen(name){for(const screen of document.querySelectorAll('.screen'))screen.hidden=screen.id!==`screen-${name}`;$('save-tools').hidden=!['launcher','library'].includes(name)||!signedIn||!featuresReady||!!pendingAccount||readSetting(ACTIVE)!==activeUser;$('overlay').hidden=false;}
function notify(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
function setBusy(value){busy=value;for(const id of ['login','logout','sync-cloud','backup','restore','persist','cloud-history','use-cloud','use-device','conflict-export','retry-connection','three-realms','crown-authority','register','open-signup','back-login','game-folder','include-music','upload-library','library-back','remove-library','manage-library','cache-backup','cache-signout'])$(id).disabled=value;$('play').disabled=value||!ready;}
function formatSize(bytes){return bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GiB`:bytes>=1024**2?`${(bytes/1024**2).toFixed(1)} MiB`:`${(bytes/1024).toFixed(0)} KiB`;}
async function withStorageLock(task){if(!navigator.locks)return task();return navigator.locks.request('homm3-game',{ifAvailable:true},lock=>{if(!lock)throw new Error('Close the other Heroes III game tab before syncing or changing files.');return task();});}
function workerTask(script,message,onProgress,onSafety){return runWorkerTask(script,message,{onProgress,onSafety});}
async function directory(path){let dir=await navigator.storage.getDirectory();for(const part of path.split('/').filter(Boolean))dir=await dir.getDirectoryHandle(part);return dir;}
async function listFiles(path,recursive=false){const files=new Map();async function walk(dir,prefix=''){for await(const[name,handle]of dir.entries())if(handle.kind==='file')files.set((prefix+name).toLowerCase(),(await handle.getFile()).size);else if(recursive)await walk(handle,prefix+name+'/');}try{await walk(await directory(path));}catch(error){if(error.name!=='NotFoundError')throw error;}return files;}
async function storageInfo(){try{const estimate=await navigator.storage.estimate?.();$('storage-info').textContent=estimate?`${formatSize(estimate.usage??0)} cached on this computer. Your signed-in account stores the cloud copy.`:'';}catch{}}
function renderCloudStatus(revision,dirty=false){$('cloud-status').textContent=dirty?'Device changes are waiting to upload. Save in game, then return & sync.':revision?`Synced to cloud · revision ${revision}`:'No cloud save yet. Save in game, then return & sync.';$('cloud-status').classList.toggle('pending',dirty);}
async function showLauncher(){try{if(localStorage.getItem('h3-crown-authority')===null){const state=await workerTask('crown-worker.js',{type:'status'});$('crown-authority').checked=state.enabled;}}catch{}try{if(localStorage.getItem('h3-three-realms')===null){const state=await workerTask('town-worker.js',{type:'status'});$('three-realms').checked=state.enabled;}}catch{}const data=await listFiles('h3/Data'),maps=await listFiles('h3/Maps',true),music=await listFiles('h3/Mp3',true);ready=REQUIRED.every(([name])=>(data.get(name)??0)>0);$('data-status').replaceChildren();const add=(ok,text)=>{const li=document.createElement('li');li.className=ok?'ok':'missing';li.textContent=text;$('data-status').append(li);};for(const[name,label]of REQUIRED)add(data.get(name)>0,label);add(true,`${maps.size} map/campaign files · ${music.size} music tracks`);const link=getLink();renderCloudStatus(link?.revision??0,link?.dirty);showScreen('launcher');await storageInfo();$('play').disabled=busy||!ready;}
function downloadBackup(bytes,prefix='heroes3-saves'){const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const link=document.createElement('a');link.href=url;link.download=`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.h3backup`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function exportLocal(){const result=await workerTask('save-worker.js',{type:'export'});return result.bytes;}
async function pushCloud(expected){if(localStorage.getItem(ACTIVE)!==activeUser)throw new Error('Reload to open the signed-in account before syncing.');$('sync-label').textContent='Uploading your saved progress…';const bytes=await exportLocal();const result=await uploadCloud(bytes,expected,message=>{$('sync-label').textContent=message;});setLink({revision:result.revision,dirty:false});return result;}
async function pullCloud(safety=false){if(localStorage.getItem(ACTIVE)!==activeUser)throw new Error('Reload to open the signed-in account before restoring.');$('sync-label').textContent='Restoring your cloud progress…';const result=await downloadCloud(null,message=>{$('sync-label').textContent=message;});await workerTask('save-worker.js',{type:'restore',file:new Blob([result.bytes]),replace:true,skipSafety:!safety},p=>{$('sync-label').textContent=p.message;},bytes=>downloadBackup(bytes,'heroes3-before-cloud-restore'));setLink({revision:result.revision,dirty:false});}
function showConflict(remote){ready=false;conflictRevision=remote.revision;const date=remote.updatedAt?new Date(remote.updatedAt).toLocaleString():'an unknown time';$('conflict-description').textContent=`This computer has local saves, and cloud revision ${remote.revision} was uploaded ${date}. Both copies are kept until you choose which to use.`;showScreen('conflict');$('retry-connection').hidden=true;}
function connectionError(error){ready=false;if(error.status===401){signedIn=false;$('account-strip').hidden=true;showScreen('login');clearPassword();notify(error.message,true);return;}if(error.status===409&&error.save){showConflict(error.save);notify(error.message,true);return;}showScreen('syncing');$('sync-label').textContent='The connection or sync could not finish.';$('save-tools').hidden=!signedIn||!featuresReady||!!pendingAccount||readSetting(ACTIVE)!==activeUser;notify(error.message,true);$('retry-connection').hidden=false;}
function updateUploadSelection(){const all=Array.from($('game-folder').files||[]);if(!all.length){$('upload-selection').textContent='Select your entire installed game folder. Supported files are compressed and encrypted before upload.';return;}try{const files=selectGameFiles(all,$('include-music').checked),size=files.reduce((n,e)=>n+e.file.size,0);$('upload-selection').textContent=`${files.length.toLocaleString()} supported game files · ${formatSize(size)} before compression. ${all.length-files.length} other or excluded files skipped.`;}catch(e){$('upload-selection').textContent=e.message;}}
function showLibrary(hasLibrary=false){$('library-back').hidden=!hasLibrary;$('remove-library').hidden=!hasLibrary;showScreen('library');}
async function ensureLibrary(){const manifest=await fetchLibrary((count,total)=>{$('download-label').textContent=`Reading your file list · ${count}/${total} files…`;});if(!Array.isArray(manifest.files))throw new Error('Your library response is incomplete. Reload and retry; your stored files were kept.');if(!manifest.files.length){ready=false;showLibrary();return false;}showScreen('download');await workerTask('import-worker.js',{type:'download',files:manifest.files,key:manifest.key,version:manifest.version,accountId:activeUser},p=>{$('download-bar').style.width=`${p.total?100*p.copied/p.total:100}%`;$('download-label').textContent=p.file?`${p.file} · ${formatSize(p.copied)} of ${formatSize(p.total)}`:'Checking your cached game files…';});return true;}
async function claimCache(account,count){const action=cacheAction(localStorage.getItem(ACTIVE),account.id,getLink(),count);if(action==='backup'){pendingAccount=account;showScreen('cache');return false;}if(action==='clear'){await workerTask('save-worker.js',{type:'clear-local'});localStorage.removeItem(LINK);}localStorage.setItem(ACTIVE,account.id);pendingAccount=null;return true;}
async function connectAccount(){setBusy(true);ready=false;notify('');$('retry-connection').hidden=true;try{const session=await apiJSON('/session');if(typeof session.user?.id!=='string'||typeof session.user?.username!=='string'||!Number.isSafeInteger(session.save?.revision))throw new Error('Your session response is incomplete. Reload and sign in again.');activeUser=session.user.id;setAPIAccount(activeUser);signedIn=true;$('account-name').textContent=`Signed in as ${session.user.username}`;$('account-strip').hidden=false;const missing=missingFeatures();featuresReady=!missing.length;if(missing.length){$('unsupported-list').replaceChildren();for(const text of missing){const li=document.createElement('li');li.textContent=text;$('unsupported-list').append(li);}showScreen('unsupported');return;}showScreen('syncing');await withStorageLock(async()=>{let {count}=await workerTask('save-worker.js',{type:'inspect'});if(!await claimCache(session.user,count))return;({count}=await workerTask('save-worker.js',{type:'inspect'}));const action=syncAction(getLink(),session.save,count>0);if(action==='conflict'){showConflict(session.save);return;}if(action==='push')await pushCloud(session.save.revision);else if(action==='pull')await pullCloud();else setLink({revision:session.save.revision,dirty:false});if(await ensureLibrary())await showLauncher();});}catch(error){connectionError(error);}finally{setBusy(false);}}
async function bootstrap(){setBusy(true);try{const status=await apiJSON('/status');if(typeof status.configured!=='boolean')throw new Error('The website backend returned an incomplete status. Reload and retry.');if(!status.configured){showScreen('setup');if(status.setupMessage)$('setup-message').textContent=status.setupMessage;return;}const missing=missingFeatures();if(missing.length){featuresReady=false;$('unsupported-list').replaceChildren();for(const text of missing){const li=document.createElement('li');li.textContent=text;$('unsupported-list').append(li);}showScreen('unsupported');return;}try{await apiJSON('/session');await connectAccount();}catch(error){if(error.status===401){signedIn=false;$('account-strip').hidden=true;showScreen('login');}else throw error;}}catch(error){connectionError(error);}finally{setBusy(false);}}
async function login(event){event.preventDefault();if(busy)return;const username=$('username').value.trim(),password=$('password').value;setBusy(true);$('login-error').hidden=true;notify('');try{const config=await apiJSON('/auth-config?username='+encodeURIComponent(username));const proof=await loginProof(password,config);await apiJSON('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,proof})});clearPassword();await connectAccount();}catch(error){clearPassword();$('login-error').textContent=error.message;$('login-error').hidden=false;}finally{setBusy(false);}}
async function register(event){event.preventDefault();if(busy)return;setBusy(true);$('signup-error').hidden=true;try{const username=$('new-username').value.trim(),password=$('new-password').value;if(password.length<14||password.length>256)throw new Error('Use a password of 14–256 characters.');if(password!==$('confirm-password').value)throw new Error('The passwords do not match.');const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),proof=await loginProof(password,{algorithm:'pbkdf2-client-600000-v1',iterations:600000,salt});await apiJSON('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,salt,proof})});$('signup-form').reset();for(const id of ['new-password','confirm-password'])$(id).type='password';await connectAccount();}catch(e){$('signup-error').textContent=e.message;$('signup-error').hidden=false;}finally{setBusy(false);}}
async function uploadGame(){if(busy||!signedIn||running)return;let files;try{files=selectGameFiles(Array.from($('game-folder').files),$('include-music').checked);}catch(e){notify(e.message,true);return;}setBusy(true);notify('');try{await withStorageLock(()=>workerTask('game-upload-worker.js',{files,includeMusic:$('include-music').checked,accountId:activeUser},p=>{$('upload-label').textContent=p.message;$('upload-bar').style.width=`${100*p.fraction}%`;}));$('game-folder').value='';await connectAccount();}catch(e){notify(e.message,true);$('upload-label').textContent='Upload stopped. Select your folder and try again.';}finally{setBusy(false);}}
async function clearForAccount(){if(busy||!pendingAccount)return;setBusy(true);try{await withStorageLock(async()=>{const bytes=await exportLocal();downloadBackup(bytes,'heroes3-previous-account');await workerTask('save-worker.js',{type:'clear-local'});localStorage.removeItem(LINK);localStorage.setItem(ACTIVE,pendingAccount.id);pendingAccount=null;});await connectAccount();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
async function resolveConflict(useCloud){if(busy)return;setBusy(true);notify('');try{showScreen('syncing');await withStorageLock(async()=>{if(useCloud)await pullCloud(true);else await pushCloud(conflictRevision);if(await ensureLibrary())await showLauncher();});}catch(error){connectionError(error);}finally{setBusy(false);}}
async function exportSaves(){if(busy||running||!signedIn)return;setBusy(true);notify('Preparing your save backup…');try{const bytes=await withStorageLock(exportLocal);downloadBackup(bytes);notify('Backup download started. Keep your .h3backup file.');}catch(error){notify(error.message,true);}finally{setBusy(false);}}
async function restoreSaves(file){if(!file||busy||running||!signedIn)return;setBusy(true);notify('Checking your backup…');try{await withStorageLock(async()=>{markDirty();await workerTask('save-worker.js',{type:'restore',file},p=>notify(p.message),bytes=>downloadBackup(bytes,'heroes3-before-restore'));});setBusy(false);await connectAccount();}catch(error){notify(error.message,true);}finally{setBusy(false);}}
async function logout(){if(busy||running||!signedIn)return;if(pendingAccount||localStorage.getItem(ACTIVE)!==activeUser){$('cache-signout').click();return;}setBusy(true);notify('Syncing before sign-out…');try{if(navigator.storage?.getDirectory)await withStorageLock(async()=>{const remote=await apiJSON('/saves/meta'),{count}=await workerTask('save-worker.js',{type:'inspect'});const action=syncAction(getLink(),remote,count>0);if(action==='conflict'){const error=new Error('Choose which saves to keep before signing out.');error.status=409;error.save=remote;throw error;}if(action==='push')await pushCloud(remote.revision);await apiJSON('/logout',{method:'POST'});signedIn=false;if($('shared-device').checked){await workerTask('save-worker.js',{type:'clear-local'});localStorage.removeItem(LINK);localStorage.removeItem(ACTIVE);}});else await apiJSON('/logout',{method:'POST'});signedIn=false;ready=false;$('account-strip').hidden=true;$('history-list').hidden=true;showScreen('login');notify($('shared-device').checked?'Signed out. Local game files and saves were cleared after syncing.':'Signed out. Cached files were kept on this device.');}catch(error){if(!signedIn){$('account-strip').hidden=true;showScreen('login');notify('Signed out, but this browser could not clear every local file. Clear this site’s browser data before leaving a shared computer.',true);}else connectionError(error);}finally{setBusy(false);}}
function log(text, error = false) {
  recentLog.push(String(text)); if (recentLog.length > 200) recentLog.shift();
  (error ? console.warn : console.log)(text);
}
function endGame(title, message, showLog = false) {
  if (stopped) return;
  stopped = true; running = false;
  game?.SDL2?.audioContext?.close().catch(() => {});
  $('ended-title').textContent = title; $('ended-message').textContent = message;
  $('ended-log').textContent = recentLog.slice(-45).join('\n'); $('ended-log').hidden = !showLog;
  $('fullscreen').hidden = true; $('return-to-launcher').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  showScreen('ended');
}
function gameEvent(event, detail) {
  if (event === 'running' && !stopped) { running = true; $('overlay').hidden = true; $('fullscreen').hidden = false; $('return-to-launcher').hidden = false; $('canvas').focus(); }
  else if (event === 'exit') { running=false; location.reload(); }
  else if (event === 'fatal') endGame('The game stopped.', detail || 'Check that your imported files come from a Complete or Shadow of Death installation.', true);
}
function createGameMemory() {
  for (const [initial, maximum] of [[256,2048],[128,1024],[64,768]]) {
    try { return new WebAssembly.Memory({initial: initial * 16, maximum: maximum * 16, shared: true}); }
    catch (error) { log(`Memory allocation: ${error.message}`, true); }
  }
  throw new Error('The browser could not allocate game memory. Close other game tabs and try a new tab.');
}
function acquireGameLock() {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve,reject) => {
    navigator.locks.request('homm3-game', {ifAvailable: true}, lock => {
      resolve(Boolean(lock)); return lock ? new Promise(() => {}) : undefined;
    }).catch(reject);
  });
}
function loadScript(src) {
  return new Promise((resolve,reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = () => reject(new Error(`Could not load ${src}. Upload the complete site package, then try again.`));
    document.head.append(script);
  });
}
async function startGame() {
  if (busy || running || !ready || stopped || !signedIn) return;
  setBusy(true); notify('');
  try {
    const remote=await apiJSON('/saves/meta'); const local=getLink();
    if(!local || local.revision!==remote.revision){setBusy(false);await connectAccount();return;}
    setLink({...local,dirty:true}); renderCloudStatus(local.revision,true);
  }catch(error){setBusy(false);connectionError(error);return;}
  showScreen('loading');
  try {
    if (!(await acquireGameLock())) throw new Error('Heroes III is already open in another tab. Close that tab first.');
    $('loading-label').textContent=$('three-realms').checked?'Preparing Three Realms…':'Preparing game settings…';
    await workerTask('town-worker.js',{type:'prepare',enabled:$('three-realms').checked},p=>{$('loading-label').textContent=p.message;});
    $('loading-label').textContent='Preparing Crown Authority settings…';
    await workerTask('crown-worker.js',{type:'prepare',enabled:$('crown-authority').checked},p=>{$('loading-label').textContent=p.message;});
    const memory = createGameMemory();
    await loadScript('vcmiclient.js');
    game = {
      wasmMemory: memory, vcmiConfig: {logLevel: params.has('debug') ? 'debug' : 'warn'}, canvas: $('canvas'),
      mainScriptUrlOrBlob: new URL('vcmiclient.js', location.href).href,
      print: text => log(text), printErr: text => log(text, true),
      setStatus: text => { if (text) $('loading-label').textContent = text.replace(/\((\d+)\/(\d+)\)/, (_,a,b) => `(${formatSize(+a)} of ${formatSize(+b)})`); },
      onVcmiEvent: gameEvent,
      preRun: [module => { if (!$('sound').checked || params.get('audio') === 'off') module.ENV.SDL_AUDIODRIVER = 'dummy'; }],
      onAbort: reason => endGame('The game could not start.', String(reason || 'Unknown engine error.'), true)
    };
    await window.createVcmiModule(game);
    if (!running && !stopped) $('loading-label').textContent = 'Starting VCMI…';
  } catch (error) { endGame('The game could not start.', error?.message || String(error), true); }
}
function setupInput() {
  const canvas = $('canvas');
  window.addEventListener('keydown', event => {
    const printable = isPrintableKey(event);
    if (running && !browserKeepsKey(event) && !printable) event.preventDefault();
  });
  for (const type of ['keyup','keypress']) window.addEventListener(type, event => { if (running && !browserKeepsKey(event)) event.preventDefault(); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', () => canvas.focus());
  for (const type of ['pointerdown','keydown']) window.addEventListener(type, () => {
    if (game?.SDL2?.audioContext?.state === 'suspended') game.SDL2.audioContext.resume().catch(() => {});
  }, true);
  window.addEventListener('beforeunload', event => { if (running) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', event => { if (!event.persisted) game?.PThread?.terminateAllThreads?.(); });
  $('fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen?.({navigationUI: 'hide'}); }
    catch (error) { log(error.message, true); }
    canvas.focus();
  });
}
function setupUI(){
  $('show-credits').addEventListener('click',()=>$('credits').showModal());$('close-credits').addEventListener('click',()=>$('credits').close());
  $('signup-form').addEventListener('submit',register);$('open-signup').addEventListener('click',()=>{notify('');showScreen('signup');});$('back-login').addEventListener('click',()=>showScreen('login'));
  $('show-new-password').addEventListener('change',()=>{for(const id of ['new-password','confirm-password'])$(id).type=$('show-new-password').checked?'text':'password';});
  $('upload-library').addEventListener('click',uploadGame);$('game-folder').addEventListener('change',updateUploadSelection);$('include-music').addEventListener('change',updateUploadSelection);
  $('manage-library').addEventListener('click',()=>{if(!busy&&signedIn)showLibrary(ready);});$('library-back').addEventListener('click',async()=>{if(busy)return;setBusy(true);notify('');try{await withStorageLock(showLauncher);}catch(error){connectionError(error);}finally{setBusy(false);}});
  $('remove-library').addEventListener('click',async()=>{if(busy||!confirm('Remove this account’s stored game files? Cloud saves stay intact. You will need to upload the game folder again to play.'))return;setBusy(true);try{await withStorageLock(async()=>{await apiJSON('/game-library/current',{method:'DELETE'});await workerTask('import-worker.js',{type:'clear'});});ready=false;showLibrary();notify('Stored game files removed. Your cloud saves are still available.');}catch(e){notify(e.message,true);}finally{setBusy(false);}});
  $('cache-backup').addEventListener('click',clearForAccount);$('cache-signout').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await apiJSON('/logout',{method:'POST'});signedIn=false;pendingAccount=null;$('account-strip').hidden=true;showScreen('login');notify('Sign in to the previous account to sync its local saves.');}catch(e){notify(e.message,true);}finally{setBusy(false);}});
  $('login-form').addEventListener('submit',login);$('logout').addEventListener('click',logout);
  $('show-password').addEventListener('change',()=>{$('password').type=$('show-password').checked?'text':'password';});
  try{$('crown-authority').checked=localStorage.getItem('h3-crown-authority')==='on';}catch{}
  $('crown-authority').addEventListener('change',()=>{try{localStorage.setItem('h3-crown-authority',$('crown-authority').checked?'on':'off');}catch{}});
  try{$('three-realms').checked=localStorage.getItem('h3-three-realms')==='on';}catch{}
  $('three-realms').addEventListener('change',()=>{try{localStorage.setItem('h3-three-realms',$('three-realms').checked?'on':'off');}catch{}});
  $('retry-setup').addEventListener('click',bootstrap);$('retry-connection').addEventListener('click',()=>signedIn?connectAccount():bootstrap());
  $('use-cloud').addEventListener('click',()=>resolveConflict(true));$('use-device').addEventListener('click',()=>resolveConflict(false));$('conflict-export').addEventListener('click',exportSaves);
  $('sync-cloud').addEventListener('click',connectAccount);$('backup').addEventListener('click',exportSaves);$('restore').addEventListener('click',()=>$('restore-input').click());
  $('restore-input').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';restoreSaves(file);});
  $('cloud-history').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{const {backups}=await apiJSON('/saves/history');if(!Array.isArray(backups))throw new Error('The cloud history response is incomplete. Retry to load your backups.');const list=$('history-list');list.replaceChildren();if(!backups.length)list.textContent='No cloud backups yet.';for(const backup of backups){const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=`Revision ${backup.revision} · ${new Date(backup.updatedAt).toLocaleString()} · ${formatSize(backup.size)}`;button.addEventListener('click',async()=>{if(busy)return;setBusy(true);try{const result=await downloadCloud(backup.id,message=>notify(message));downloadBackup(result.bytes,`heroes3-cloud-${backup.revision}`);notify('Earlier cloud backup downloaded.');}catch(error){notify(error.message,true);}finally{setBusy(false);}});list.append(button);}list.hidden=false;}catch(error){notify(error.message,true);}finally{setBusy(false);}});
  $('persist').addEventListener('click',async()=>{try{const granted=await navigator.storage.persist?.();await storageInfo();notify(granted?'The browser will keep cached files where possible. Cloud saves remain available after sign-in.':'The browser may clear its cache. Your uploaded cloud copy remains available.');}catch(error){notify(error.message,true);}});
  try{$('shared-device').checked=localStorage.getItem('h3-cloud-shared')!=='off';}catch{}
  $('shared-device').addEventListener('change',()=>{try{localStorage.setItem('h3-cloud-shared',$('shared-device').checked?'on':'off');}catch{}});
  for(const id of ['sound','sharp']){try{$(id).checked=localStorage.getItem(`h3-personal-${id}`)!=='off';}catch{}$(id).addEventListener('change',()=>{try{localStorage.setItem(`h3-personal-${id}`,$(id).checked?'on':'off');}catch{}applyPixelScaling();});}
  $('play').addEventListener('click',startGame);$('restart').addEventListener('click',()=>location.reload());
  $('return-to-launcher').addEventListener('click',()=>{if(confirm('Save in the game first. Return to the launcher and sync your saved progress now?')){running=false;location.reload();}});
}
function applyPixelScaling(){$('canvas').style.imageRendering=$('sharp').checked?'pixelated':'auto';}
setupUI();setupInput();applyPixelScaling();bootstrap();
