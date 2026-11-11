"""Check the account edition project without a network connection."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = []; self.links = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        for key in ('href', 'src'):
            if key in attrs: self.links.append(attrs[key])

page = Links(); page.feed((DIST/'index.html').read_text())
assert len(set(page.ids)) == len(page.ids), 'Duplicate HTML IDs'
controls = set(re.findall(r"\$\('([^']+)'\)", (DIST/'app.js').read_text()))
assert controls <= set(page.ids), f'Missing controls: {controls - set(page.ids)}'
for link in page.links:
    if link.startswith(('https:', 'http:', '#', 'data:')): continue
    target = link.split('?')[0].split('#')[0]
    assert (DIST/target).exists(), f'Missing local link: {link}'
for p in DIST.rglob('*.json'): json.loads(p.read_text())
json.loads((DIST/'manifest.webmanifest').read_text())
headers = (DIST/'_headers').read_text()
for header in ('Cross-Origin-Opener-Policy: same-origin', 'Cross-Origin-Embedder-Policy: require-corp', 'Content-Type: application/wasm'):
    assert header in headers, f'Missing header: {header}'
files = [p for p in DIST.rglob('*') if p.is_file()]
assert not any(p.name.startswith('.vcmiclient.') for p in files), 'An incomplete runtime copy was included'
assert len(files) <= 1000, 'Too many files for Pages dashboard upload'
assert all(p.stat().st_size <= 25*1024*1024 for p in files), 'An asset exceeds 25 MiB'
assert not any(p.suffix.lower() in ('.lod','.snd','.h3m','.h3c','.mp3') for p in files), 'Unexpected game data in deployment'
for record in json.loads((DIST/'ENGINE.json').read_text())['runtime_files']:
    p = DIST/record['name']
    assert p.stat().st_size == record['size_bytes'], f'Wrong size: {p.name}'
    assert hashlib.sha256(p.read_bytes()).hexdigest() == record['sha256'], f'Wrong runtime hash: {p.name}'
config=json.loads((ROOT/'wrangler.jsonc').read_text())
assert config['main']=='dist/_worker.js'
assert config['assets']['binding']=='ASSETS' and config['assets']['run_worker_first']==['/api/*']
assert any(binding['binding']=='DB' for binding in config['d1_databases'])
for binding in config['d1_databases']:
    if 'database_id' in binding:
        assert re.fullmatch(r'[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}',binding['database_id']), 'D1 database_id must be an actual UUID or omitted for automatic provisioning'
assert 'REPLACE_WITH_' not in json.dumps(config), 'A deployment placeholder remains'
assert config.get('build',{}).get('command')=='npm run build:cloudflare', 'Worker deployments must restore the complete game assets before upload'
assert not config.get('r2_buckets'), 'A storage-bucket binding remains'
assert not config.get('kv_namespaces') and not config.get('durable_objects'), 'Extra storage service configured'
assert '_headers' not in (DIST/'.assetsignore').read_text().splitlines(), 'Static security headers would be ignored'
assert 'webkitdirectory' in (DIST/'index.html').read_text(), 'Missing on-site game folder upload'
assert all(s in (DIST/'app.js').read_text() for s in ['/register','game-upload-worker.js','cacheAction']), 'Missing account/upload isolation flow'
assert (DIST/'_worker.js').is_file() and (DIST/'_routes.json').is_file(), 'Missing compiled Pages backend'
assert 'H3_PRIVATE_CONFIG' not in (DIST/'_worker.js').read_text(), 'Personalized server configuration in the generic upload'
for name in ['server/auth.js','server/worker.js','migrations/0001_accounts.sql','scripts/upload-game.mjs','scripts/set-account.mjs','scripts/encrypt-library.mjs','migrations/0002_free_storage.sql','PREPARE-UPLOAD.bat','server/pages-worker.js','AGENTS.md']:
    assert (ROOT/name).is_file(), f'Missing account setup source: {name}'
assert 'OWNER_ACCOUNT' not in json.dumps(config) and 'CATALOG_KEY' not in json.dumps(config), 'Account secret must not be placed in public configuration'
assert not (ROOT/'.dev.vars').exists(), 'Do not package development credentials'
assert 'env.STORAGE' not in (ROOT/'server/worker.js').read_text(), 'Removed storage backend referenced'
assert 'r2' not in (ROOT/'scripts/setup-cloudflare.mjs').read_text().lower(), 'Removed storage setup remains'
assert 'secret' not in json.loads((ROOT/'server/library-manifest.json').read_text()), 'Private library key in catalog'
towns=json.loads((DIST/'town-pack/manifest.json').read_text())
assert {p.name for p in (DIST/'town-pack').iterdir() if p.is_dir()}=={towns['version']}, 'An obsolete town pack is still included'
for chunk in towns['chunks']:
    assert (DIST/chunk['url']).stat().st_size==chunk['compressedSize'], 'Incomplete town chunk'
print(f'PASS: {len(files)} static files; largest asset {max(p.stat().st_size for p in files)/1024**2:.2f} MiB; links, controls, JSON, engine hashes, Free routing, D1-only storage and account project structure verified.')

crown=json.loads((DIST/'crown-pack/manifest.json').read_text())
assert crown['id']=='crown-authority' and crown['engine']=='1.7.5'
assert len(crown['files'])==10
for f in crown['files']:
    p=DIST/'crown-pack'/f['path']
    assert p.stat().st_size==f['size'] and hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256']
assert 'crown-worker.js' in (DIST/'app.js').read_text() and 'id="crown-authority"' in (DIST/'index.html').read_text()
print('PASS: Crown Authority native mod files, checksums and launcher checkbox verified.')

mod_path=DIST/'crown-pack/Mods/crown-authority'
mod=json.loads((mod_path/'mod.json').read_text())
assert mod['objects']==['config/crown-authority/objects.json'], 'Missing Crown resource map-object registration'
objects=json.loads((mod_path/'Content/config/crown-authority/objects.json').read_text())
authority=objects['core:resource']['types']['authority']
assert authority['resource']=='crown-authority:authority' and authority['amountMultiplier']==1
assert 'index' not in authority and authority['templates']['royalTreasury']['animation']=='AVTgold0.def'
print('PASS: Crown Authority resource pickup registration and original graphic reference verified.')
