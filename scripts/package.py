"""Package the Cloudflare Worker project and corresponding application source."""
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'
subprocess.run(['node',str(ROOT/'scripts/build-web.mjs')],check=True,cwd=ROOT)
for name in ['README.md','START-HERE.txt','THREE-REALMS.md','CLOUDFLARE-UPLOAD.md','CROWN-AUTHORITY.md']:
    shutil.copy2(ROOT/name,DIST/name)
root_files=[ROOT/name for name in ['README.md','START-HERE.txt','THREE-REALMS.md','CLOUDFLARE-UPLOAD.md','CROWN-AUTHORITY.md','AGENTS.md','PREPARE-UPLOAD.bat','package.json','package-lock.json','wrangler.jsonc','.gitignore']]
code_files=[]
for directory in ['server','migrations','scripts','tests','mods','.github']:
    code_files.extend(p for p in sorted((ROOT/directory).rglob('*')) if p.is_file() and '__pycache__' not in p.parts)
application_files=root_files+code_files+[p for p in sorted(DIST.rglob('*')) if p.is_file() and not any(part in p.relative_to(DIST).parts for part in ['source','game-data','town-pack']) and p.name not in ['vcmiclient.js','vcmiclient.wasm','vcmiclient.data']]
with zipfile.ZipFile(DIST/'source/personal-launcher-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in application_files:
        archive.write(p,'personal-launcher/'+str(p.relative_to(ROOT)))
subprocess.run([sys.executable,str(ROOT/'scripts/verify-package.py')],check=True)
output=ROOT.parent/'HOMM3-Cloudflare-Personal.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in root_files+code_files+[p for p in sorted(DIST.rglob('*')) if p.is_file() and '__pycache__' not in p.parts]:
        archive.write(p,str(p.relative_to(ROOT)))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(name in archive.namelist() for name in ['dist/index.html','server/pages-worker.js','PREPARE-UPLOAD.bat','START-HERE.txt','AGENTS.md'])
print(f'Created {output} ({output.stat().st_size/1024**2:.1f} MiB).')
upload=ROOT.parent/'HOMM3-Cloudflare-Upload.zip'
with zipfile.ZipFile(upload,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for p in sorted(DIST.rglob('*')):
        if p.is_file() and p.name!='.assetsignore': archive.write(p,str(p.relative_to(DIST)))
with zipfile.ZipFile(upload) as archive:
    names=archive.namelist()
    assert archive.testzip() is None
    assert {'index.html','_worker.js','_routes.json','_headers','game-upload-worker.js'} <= set(names)
    assert len(names)<=1000 and all(n not in names for n in ['package.json','PREPARE-UPLOAD.bat','wrangler.jsonc'])
    assert all(i.file_size<=25*1024**2 for i in archive.infolist())
print(f'Created directly uploadable {upload} ({upload.stat().st_size/1024**2:.1f} MiB; {len(names)} files at website root).')
