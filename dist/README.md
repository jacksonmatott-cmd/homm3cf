# Heroes III Personal Edition v6 — Crown Authority

**Upload HOMM3-Cloudflare-Upload.zip directly to Cloudflare Pages.** This is the finished website with its compiled backend, engine and Three Realms assets. Create an account on the website and upload your owned game folder there. Other computers only need your login; game files download automatically into the browser.

No local setup scripts, npm, Github, R2 or paid subscription are needed. One **free D1 database binding named DB** is required for accounts, uploaded game files and cloud saves. Bind it in the Pages dashboard and redeploy the same ZIP. Tables initialize automatically. [CLOUDFLARE-UPLOAD.md](CLOUDFLARE-UPLOAD.md) gives the short dashboard steps.

Every future update is a complete directly uploadable site ZIP. Keep the same D1 database when updating to retain accounts, libraries and saves. No patch stacking, personalized ZIP building or repeated original-game upload is required for later updates.

## Accounts and game files

Choose Create an account, enter a username and password, then select your own installed **Heroes III Complete / Shadow of Death** folder on the upload screen. The browser selects supported Data archives, Maps and optional Mp3 music, compresses and encrypts them, and uploads authenticated chunks. The HD Edition is incompatible. Original commercial game content is not included in this ZIP.

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

Libraries are limited to **240 MiB compressed**, 1 GiB raw total and 1000 supported files. At most 20 accounts share a **400 MiB encoded storage reservation budget** for game libraries and save snapshots, leaving headroom under Free D1's per-database limit. The application never activates a paid plan. Try omitting optional music or extra maps if the library does not fit. Replacements need room for both old and new libraries until commit; removing stored game files explicitly does not delete cloud saves.

Snapshots are limited to 32 MiB compressed, split into 128 KiB parts, with five completed snapshots retained. Local portable backups allow 128 MiB raw / 192 MiB serialized / 5000 files. Provider daily quotas apply. The deployment ZIP meets the Pages dashboard limits of 1000 files and 25 MiB per asset.

## Source and validation

The downloadable website includes corresponding source archives and licenses through **Credits & source**. `HOMM3-Cloudflare-Personal.zip` is the separate full developer project; use the **Upload** ZIP for dashboard deployment. Developer commands: `npm ci`, `npm test`, `npm run build`, `npm run verify`, `npm run package`. Node.js 22.13+ / 24 LTS and Python are developer tools only. Older account/setup scripts remain in the source for compatibility tests; the v5 website workflow does not use them.

Automated tests cover registration/login, secure-cookie sessions, account/file/save isolation, upload validation, encrypted compressed file round trips, incomplete transfers, storage reservations, replacement conflicts, browser cache isolation, portable backups, town installation, engine hashes and ZIP structure. Backend tests use real SQLite with a D1-compatible adapter and synthetic original-game fixtures. Live Cloudflare deployment, a real commercial library and full gameplay were not tested here.

The browser runtime is unchanged from [homm3-browser v0.1.0](https://github.com/mihaicristianfarcas/homm3-browser/tree/v0.1.0), using VCMI 1.7.5. Engine and launcher code: GPL-2.0-or-later. Town art/adaptations: CC-BY-SA 4.0 with author credits. @noble/hashes 1.8.0: MIT, license included. Heroes of Might and Magic is a Ubisoft trademark; this project is unaffiliated with Ubisoft.
