# Three Realms 1.0 — Heroes III browser town pack

## Complete replacement uploads

Three Realms is included in every complete package. Extract the package into a new folder and run **PREPARE-UPLOAD.bat**. For a later update, supply your previous prepared **UPLOAD-TO-CLOUDFLARE.zip** when prompted; the new package reuses its private account and encrypted game library. Upload the newly generated complete ZIP to Cloudflare Pages. See **CLOUDFLARE-UPLOAD.md** for the required free D1 binding.

Every update is a complete version. No previous patch ZIPs need to be stacked. On the website, sign in and check **Three Realms** before pressing **Enter the realm**.

## One checkbox

The checkbox controls three real VCMI town mods together. It downloads and checks the pack only when enabled and you start the engine. Downloads are resumable at completed chunk boundaries. First use adds about **80 MiB of downloads / 173 MiB of browser storage**. The original game library is separate.

Unchecking it disables these three town mods before engine startup. It does not remove their cached files or change original town definitions. Keep it enabled to load saves made with Three Realms. The engine can reject a save when its required mods are missing; unchecking the box cannot convert that save to the base game. Mod resources are stored alongside the cached game; only settings and saved progress enter cloud backups. Shared-device sign-out clears the cached town resources together with the original game cache.

The selection is remembered on the device. On a new device with no saved checkbox preference, the launcher also reads the mod configuration restored with your cloud saves.

## Town identities and balance

These are adapted editions of existing community towns, with their actual animated creatures, portraits, town screens, battle sounds, map castles, siege graphics, hero classes, spells and building artwork. They are not three new original art sets. New building effects reuse the corresponding town's existing building graphics. The balance is a first playable configuration; competitive balance has not been established by playtesting.

| Town | Intended role | Changes in this edition |
| --- | --- | --- |
| Grove | Small maps; low-resource starts | Lower building costs; tiers 1–4 have no rare-resource cost, cheaper recruits, and increased growth. Top-tier units have reduced health and higher gold costs, so the town's main advantage is early momentum. |
| Pavilion | Medium to large maps | Cheaper tier 3–5 dwellings, extra mid-tier growth and health, a 750-gold/day Caravan Exchange, and a Sunward Academy granting 2000 experience once per hero per town. |
| Cathedral | Large maps and long campaigns | More expensive recruitment buildings and elites. Tier 6–7 troops gain health, attack, defense and damage. A costly Crusader Endowment improves long-term income; the Vigil Chapel strengthens siege morale. |

Custom buildings include **Muster Oak**, **Wardens' Watch**, **Foragers' Lodge**, **Caravan Exchange**, **Sunward Academy**, **Tithe Hall**, **Crusader Endowment**, and **Vigil Chapel**. Building effects, costs and prerequisites are in the actual faction JSON loaded by VCMI.

The pack has **43 recruitable creature forms across seven tiers per faction**, counting upgrades, and **60 heroes**. Nine named heroes were added for this edition: Rowan Vale, Mira Thorn, Edrin Moss; Samira Dawn, Tarek of the Dunes, Neset Sunward; Severin Ash, Helia Voss, Brother Ordan. Their portraits, hero classes, working specialties and starting armies derive from heroes in their respective source towns; biographies are new. The other 51 heroes come from the community towns.

## Maps and campaigns

Enable the pack before starting a new game, then select Grove, Pavilion or Cathedral in faction selection where the map allows it. Random maps can use the added factions. Existing fixed maps and original campaigns keep their authored faction restrictions and town placements. This update does not rewrite every campaign or add a new campaign storyline. Cathedral is designed for the economy of long games, including campaigns authored to use these factions.

## Credits, license and source

Adapted mod content, artwork and the resized preview screenshots are distributed under **Creative Commons Attribution-ShareAlike 4.0**, as identified by the VCMI mod repository: <https://creativecommons.org/licenses/by-sa/4.0/>. Attribution is required when redistributing; adapted content retains that license. The launcher code and build tools use GPL-2.0-or-later, consistent with the existing project. Ubisoft's original commercial game archives are not included.

| Source | Authors | Pinned revision |
| --- | --- | --- |
| [Grove](https://github.com/vcmi-mods/grove) | New Grove Team & Trith; Kuririn & Pointer; avatar; Alyx182008 and contributors | `abd472fbc949c2592ea0e42aa067dc970a6d0a83` |
| [Pavilion](https://github.com/vcmi-mods/new-pavilion) | Bastion New Town Group; edeksumo; New Pawulon Team; Acid Cave and VCMI communities | `ac2ca887db4446796a6a0e251bf3d0de2148ee76` |
| [Cathedral](https://github.com/vcmi-mods/cathedral-town) | Ben Yan and VCMI contributors | `0c298006c7b43bb3fef3407290934b5419d145d0` |

Changes made for Three Realms: town economies, creature costs/growth/stats/AI values, special-building effects and names, nine derived heroes, metadata, and the browser installer/checkbox. Upstream art is preserved; previews are resized source screenshots. Source versions support VCMI 1.7; this package targets the bundled **VCMI 1.7.5** runtime without rebuilding it.

`mods/towns.lock.json` pins sources and credits. `scripts/build-town-pack.mjs` applies all adaptations and produces the compressed, checksummed asset pack. To rebuild, install project dependencies and clone the three pinned source revisions into a sibling `town-work` folder named `grove`, `pavilion`, and `cathedral`; then run `node scripts/build-town-pack.mjs ../town-work`. The generated `mods/content-report.json` lists the final heroes and creature statistics. Pack files contain the full adapted mod files; `scripts/unpack-town-pack.mjs OUTPUT_FOLDER` extracts them for inspection or desktop VCMI use.

## Verification limits

Automated checks exercise mod settings, preserved unrelated presets, installation, file/checksum validation, interrupted downloads and retries, activation/deactivation, and preservation of saves. The asset pack is decompressed and its checksums are verified during packaging. The existing account/save tests are also retained. This environment has no owned original game installation or live Cloudflare account: full engine gameplay, sieges, campaigns, and balance have **not** been playtested here.
