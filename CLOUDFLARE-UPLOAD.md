# Upload this ZIP to Cloudflare Pages

`HOMM3-Cloudflare-Upload.zip` is already built. Upload it directly; do not extract a source project, run a script or prepare another ZIP.

1. In Cloudflare **Workers & Pages**, create a **Pages** project using **Direct Upload / drag and drop**. Upload **HOMM3-Cloudflare-Upload.zip** and deploy.
2. In **Storage & databases → D1**, create a free database, or reuse the database from this website's v5 deployment.
3. Open the Pages project → **Settings → Bindings → Add → D1 database**. Use **DB** as the variable name and select that database for production.
4. Redeploy the **same ZIP** to apply the binding. Open its HTTPS address.
5. Click **Create an account** on the website. After registration, select your owned installed **Heroes III Complete / Shadow of Death** folder in the website's upload screen and click **Upload game files**. It should contain Data, Maps and Mp3. The standalone HD Edition is incompatible.
6. Wait for upload and automatic library download to finish. On any other computer, simply open this website and sign in.

The database tables initialize automatically. There is no manual SQL, account-secret configuration, R2, paid plan, Node.js installation or local build step. Use Pages Direct Upload, which supports a ZIP with a compiled `_worker.js`; a static-only upload will not run the accounts backend.

## Updating or replacing the site

Every future update is a full **HOMM3-Cloudflare-Upload.zip**. Upload it as the next production deployment, keeping the **same D1 database binding**. Accounts, uploaded libraries and cloud saves remain in that database, so you do not repeat the game upload. Deleting the site is unnecessary.

If you delete and recreate the Pages project, attach that same D1 database as **DB** to the replacement and redeploy. A new address needs a new login and browser download. Unsynced saves remain on the old browser origin: export or sync them before deleting an old site. Custom domains may need to be attached again.

**Upgrading from v4 or an earlier setup kit:** those versions used a single preconfigured owner account. v5 introduces website-created accounts and does not automatically assign old owner saves to a newly registered user. Export your `.h3backup` from the old site first, then create your v5 account, upload your owned game folder on the website, and restore the backup. Keep the old database until you have verified your exported saves. A fresh free D1 database is simplest for this first v5 deployment. Later v5 updates reuse that database normally.

## Free limits

The application allows at most **400 MiB of compressed game files per library**, 8 GiB raw total, 2 GiB per original file and 10,000 selected supported files (including subfolders). Account libraries and saves together reserve at most **440 MiB of reserved stored data** to leave headroom in the Free D1 database. Up to 20 accounts share that allowance; it is intended for a personal site. New uploads use compact binary storage and per-file metadata; previous libraries remain readable. Select your entire installation folder: supported Data, Maps, Mp3, Sprites, Sounds and config contents are included. Windows programs and cutscene videos are skipped. No paid upgrade is triggered by the application.

Try excluding optional music or extra maps if a library is too large. Replacing an existing library keeps the old copy until the new one is complete, so it temporarily needs room for both. If necessary, explicitly remove your stored game files in **Manage game files**, then upload again; cloud saves remain intact. A failed or interrupted upload does not publish an incomplete library. Interrupted uploads must be restarted and expire after two hours without new uploaded parts.

Uploads use small retryable metadata batches and 64 KiB encrypted parts. The website reports the failed step and HTTP status if a provider request fails. It also reads large game-file lists in pages. Keep the same DB binding when updating; existing libraries remain usable.

Cloud save snapshots are limited to 32 MiB compressed, with up to five retained snapshots per account. Cloudflare's daily request/read/write quotas still apply and can temporarily stop transfers. Keep portable `.h3backup` files for progress you cannot afford to lose.

The site ZIP is checked against the Pages dashboard limits of 1000 files and 25 MiB per file. Engine and town files are static assets; uploaded original game files are private authenticated database downloads.

Official references: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing and free quotas](https://developers.cloudflare.com/d1/platform/pricing/).

## v6 Crown Authority

The full ZIP adds Crown Authority while retaining the v5 account/database format. Upload it over the current deployment and keep the same DB binding. No migration, account reset or new original-game upload is required for an existing v5 library. Start a new in-game match with Crown Authority checked, then visit a town's fort with a hero to issue edicts. See CROWN-AUTHORITY.md.

The GitHub repository builds complete website ZIPs automatically. Pushing source does not itself connect a Pages Direct Upload project to Git deployment; the supplied complete ZIP remains directly uploadable to the existing project.

## GitHub Worker deployment and D1 error 10021

If your build log contains `/workers/scripts/homm3cf/versions`, you are deploying the **Worker**, not using the Pages ZIP uploader. v6.1.0 supports this path directly. Keep the default deploy command `npx wrangler deploy`; the checked-in custom build restores and packages every game asset automatically.

The Worker config declares the **DB** binding without a placeholder ID. Wrangler automatically reuses the existing DB binding on this Worker, or creates `homm3cf-db` on the first deployment. You do not need to paste a database UUID into GitHub. The database tables initialize automatically when the website receives its first API request.

To carry accounts and libraries from a separate Pages project, attach its existing database as **DB** in the Worker's Bindings settings before deployment. Keeping an existing binding preserves its data; creating a first database starts a new account/library store. No database is deleted by this fix.
