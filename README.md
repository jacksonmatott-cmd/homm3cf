# Heroes III Personal Edition v6.2.1 — Crown resource pickup fix

**Upload HOMM3-Cloudflare-Upload.zip directly to Cloudflare Pages.** This is the finished website with its compiled backend, engine and Three Realms assets. Create an account on the website and upload your owned game folder there. Other computers only need your login; game files download automatically into the browser.

No local setup scripts, npm, Github, R2 or paid subscription are needed. One **free D1 database binding named DB** is required for accounts, uploaded game files and cloud saves. Bind it in the Pages dashboard and redeploy the same ZIP. Tables initialize automatically. [CLOUDFLARE-UPLOAD.md](CLOUDFLARE-UPLOAD.md) gives the short dashboard steps.

Every future update is a complete directly uploadable site ZIP. Keep the same D1 database when updating to retain accounts, libraries and saves. No patch stacking, personalized ZIP building or repeated original-game upload is required for later updates.

## GitHub → Cloudflare Workers deployment

The repository also supports the **Worker** named `homm3cf`. Cloudflare's default `npx wrangler deploy` command now runs the complete game build automatically, including pinned engine/town downloads, compiled backend, source archives and Crown Authority. No separate local build command is required.

The `DB` D1 binding intentionally has **no hardcoded database ID or database name**. Wrangler 4.158.0 reuses an existing D1 binding named DB on this same Worker; for a first deployment, it can automatically create `homm3cf-db`. This fixes Cloudflare error **10021** caused by the old placeholder ID. Future deployments keep using that binding. No paid-plan or storage-product changes are made.

If moving an existing **Pages** site to this Worker, connect that Pages site's existing D1 database as **DB** on the Worker before deploying to preserve those accounts and uploads. Separate Cloudflare projects do not automatically share a database. The directly uploadable Pages ZIP remains supported with its normal dashboard binding.

The build pipeline checks a real `wrangler deploy --dry-run`, and packaging rejects placeholder or malformed explicit D1 IDs. This validates the Worker upload without accessing a production database.

## Accounts and game files

Choose Create an account, enter a username and password, then select your own installed **Heroes III Complete / Shadow of Death** folder on the upload screen. Select the entire installation folder. The browser keeps supported files and subfolders in Data, Maps, Mp3, Sprites, Sounds and config, compresses and encrypts them, and uploads authenticated binary chunks. Maps, campaigns, loose sprites/images, fonts, sound effects and optional music are supported. Windows executables, installers, third-party Windows mod runtimes and cutscene videos are skipped. Nested backup installations are ignored; select one installation if several are found side by side. The HD Edition is incompatible. Original commercial game content is not included in this ZIP.

Each account has its own private library, secure session and save history. Password fields have Show password controls. There is no email recovery: retain your password. The database operator can access stored account libraries; this is private authenticated storage, not end-to-end encryption against the site owner.

On another computer, open the same HTTPS site and sign in. The browser downloads game files into its private cache; no desktop program is installed. A current desktop browser must support WebAssembly threads/SIMD, OffscreenCanvas, WebCrypto, compression streams and private browser storage. Managed devices can restrict these features or block the site.

Save in game, then quit or choose **Return & sync**. Keep the tab open until **Synced to cloud** appears. Conflicts keep both copies until you choose. Earlier completed snapshots remain in the last five cloud backups. Portable export/restore is available. When changing accounts on the same computer, clean caches are cleared; unsynced or unassigned saves must first be exported instead of being attached to a different account.

**Shared computer** cleanup is enabled by default. Sign out when finished: it syncs, revokes the session and clears cached game files and local saves. Closing the tab is not sign-out.

## Crown Authority

A second launcher checkbox enables the new **Crown Authority** native mod. Start a new game with it enabled. Each owned town produces **+3 Authority per day**, and a built Capitol adds **+5**, for **8 in that capital town**. With a visiting hero, click a town's Fort/Citadel/Castle to choose one of twelve paid edicts or decrees. Each town reconvenes once per week. Kingdom buffs last seven days; hostile decrees weaken enemies in the issuing hero's battles. Income and effects are saved inside the normal game save and carried by cloud sync.

The mod reuses your uploaded original HOMM3 graphics and works with all nine original towns plus the three optional Three Realms towns. See [CROWN-AUTHORITY.md](CROWN-AUTHORITY.md) for all costs, controls, stacking rules, marketplace trading and limitations. Keep the checkbox enabled for Crown saves.

## GitHub and full builds

Source repository: [jacksonmatott-cmd/homm3cf](https://github.com/jacksonmatott-cmd/homm3cf). Each push to main runs the complete website build and uploads **HOMM3-Cloudflare-Upload.zip** as a workflow artifact. It restores the pinned open-source engine and community towns, checks their hashes, runs tests, and packages every deployment asset. No commercial game files, user libraries, credentials or cloud-save data are committed. Large unchanged engine/town assets are fetched by the reproducible build rather than duplicated in git.

The website ZIP can still be uploaded directly to your existing Cloudflare Pages project. Keep its **DB** binding and database to preserve accounts and libraries. A GitHub push alone does not reconfigure or redeploy an existing Pages Direct Upload project. Users still create accounts and upload their game folder on the website.

Developer full build: `npm ci`, `npm run hydrate`, `npm run build`, `npm test`, `npm run package`. The GitHub workflow runs these automatically. Generated ZIPs are written to the parent of the repository folder. The full user deployment remains self-contained; it never fetches engine/town assets from GitHub at play time.

## Three Realms

One launcher checkbox enables **Grove**, **Pavilion** and **Cathedral**, with community graphics, animated creatures, sounds, heroes and town buildings. The adapted pack has 43 recruitable creature forms and 60 heroes, including nine added for this edition. Grove emphasizes inexpensive early expansion; Pavilion suits the midgame; Cathedral rewards long-term investment. See [THREE-REALMS.md](THREE-REALMS.md) for mechanics, author credits, source revisions and limitations.

Keep the checkbox enabled for saves made with the pack. Original fixed campaigns keep their authored factions; the mod does not rewrite them. The first browser town installation downloads about 80 MiB. Full gameplay and balance have not been verified here.

## Free storage

Libraries accept up to **10,000 supported files**, **400 MiB compressed**, **8 GiB raw total** and **2 GiB per file**. Compression, hashing and encryption stream through bounded buffers; temporary encrypted upload data is stored on the device and removed after the upload. New libraries use binary BLOB storage instead of base64, avoiding its roughly one-third size overhead. Metadata is split by file to stay within D1 row limits. Existing base64 libraries still download normally. At most 20 accounts share a **440 MiB storage reservation budget** for libraries, metadata and save snapshots, leaving headroom under Free D1's per-database limit. The application never activates a paid plan. Try omitting optional music or extra maps if the library does not fit. Replacements need room for both old and new libraries until commit; removing stored game files explicitly does not delete cloud saves.

Snapshots are limited to 32 MiB compressed, split into 128 KiB parts, with five completed snapshots retained. Local portable backups allow 128 MiB raw / 192 MiB serialized / 5000 files. Provider daily quotas apply. The deployment ZIP meets the Pages dashboard limits of 1000 files and 25 MiB per asset.

## Source and validation

The downloadable website includes corresponding source archives and licenses through **Credits & source**. `HOMM3-Cloudflare-Personal.zip` is the separate full developer project; use the **Upload** ZIP for dashboard deployment. Developer commands: `npm ci`, `npm test`, `npm run build`, `npm run verify`, `npm run package`. Node.js 22.13+ / 24 LTS and Python are developer tools only. Older account/setup scripts remain in the source for compatibility tests; the v5 website workflow does not use them.

Automated tests cover registration/login, secure-cookie sessions, account/file/save isolation, upload validation, encrypted compressed file round trips, incomplete transfers, storage reservations, replacement conflicts, browser cache isolation, portable backups, town installation, engine hashes and ZIP structure. Backend tests use real SQLite with a D1-compatible adapter and synthetic original-game fixtures. The deployment pipeline is checked separately on GitHub and Cloudflare. A real commercial library and full gameplay were not tested here; the supplied Windows game folder is not accessible from this workspace.

The browser runtime is unchanged from [homm3-browser v0.1.0](https://github.com/mihaicristianfarcas/homm3-browser/tree/v0.1.0), using VCMI 1.7.5. Engine and launcher code: GPL-2.0-or-later. Town art/adaptations: CC-BY-SA 4.0 with author credits. @noble/hashes 1.8.0: MIT, license included. Heroes of Might and Magic is a Ubisoft trademark; this project is unaffiliated with Ubisoft.

## Launcher reliability checks

Keyboard routing accepts events with missing keys, legacy key codes and IME input while preserving browser shortcuts. Worker tasks contain message/callback failures and time out when idle; HTTP and JSON failures show retry controls. Required storage, compression, encryption and worker capabilities are checked before sign-in operations. Library deletion and conflict downloads respect the game-tab lock.

The GitHub build also runs `npm run test:browser` in Chromium: website signup/login, nested game-folder upload, real OPFS and D1 transfers, Crown installation, launch/input handling, cloud sync between separate browser contexts, backup export, account switching, storage locks, worker failure and blocked/missing browser capabilities. It uses synthetic original-game fixtures and a simulated engine entry point; this checks the launcher and does not replace gameplay testing with a real owned installation. Developer browser checks need Chromium (or H3_CHROMIUM) and OpenSSL.

## v6.2 upload recovery

The browser now reserves storage with a small summary, registers file metadata in bounded batches, then sends 64 KiB encrypted parts. Metadata is inserted with two bulk JSON queries instead of a separate statement for every file and part. Native Web Crypto verifies checksums on the server. Lost start, metadata, part and finish replies can be retried without double reservations or partial publication. File-list downloads are paged as well. Existing base64 and binary libraries stay readable; keep the same DB binding.

Upload errors identify the operation, HTTP status and a Cloudflare error/reference when available, rather than replacing every failure with an unreadable-response message. Daily database limits and full storage are reported separately; no paid services are enabled. The synthetic regression suite includes 10,000 file records and a 300 MiB compressed archive plan, incomplete uploads, duplicate paths, quota reservations, lost replies and authenticated paged downloads. These are metadata/fixture tests, not a claim that your original commercial installation has been playtested here.

## v6.2.1 Crown resource registration

Crown Authority v1.0.1 registers the missing resource-pickup subtype that caused `Failed to find object of type 79::7` when a random resource resolved to Authority. It reuses the original gold-pile animation and preserves the original seven resource types, Authority income/councils, existing IDs, saves and uploaded libraries. The browser installer upgrades the small mod pack automatically on the next launch with Crown Authority enabled. Tests check every selectable resource against the exact bundled VCMI 1.7.5 object table and random-resource selection source; this is a data-contract regression, not a full gameplay test with commercial data.
