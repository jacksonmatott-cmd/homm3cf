# Delivery requirements for this game

- Always deliver a complete `HOMM3-Cloudflare-Upload.zip` that can be uploaded directly to Cloudflare Pages from the dashboard. Its root must contain index.html, compiled _worker.js, _routes.json, _headers, the engine and every current asset. Never deliver only a patch or a local setup kit.
- Users create accounts and upload their owned game folder ON THE WEBSITE. Do not require PREPARE-UPLOAD.bat, npm, local scripts, Github, or baking personal data into the deployment archive.
- Keep accounts, private game libraries and saves separate in free D1. Never attach another account's cached saves to a new account. Other computers need only the website login and an automatic browser download.
- Future updates replace the entire website ZIP while retaining the same D1 database. No repeated game-folder upload is needed if that database is retained.
- Include all existing features and Three Realms. Preserve engine hashes, credits, source availability and licenses. Keep a full developer source archive updated separately; deliver the directly uploadable ZIP as the main user artifact.
- No R2 or paid subscription. Clearly explain the one required free D1 binding named DB, finite storage and free service quotas. ZIP upload alone cannot create that Cloudflare resource.
- Do not include commercial game files or personal credentials in public static assets or source.
- Verify account/file/save isolation, upload integrity, free storage limits and the complete replacement ZIP. Report gameplay and deployment verification limits honestly.

- Source is now in GitHub: jacksonmatott-cmd/homm3cf. Push authorized updates there and retain the reproducible full-asset build/workflow. Do not commit commercial originals, cloud libraries, save databases or secrets.
- Preserve Crown Authority, its native income/council rules and optional Three Realms compatibility. Use the existing pinned VCMI engine; unsupported Lua scripts are not an implementation of this mod.
