# Crown Authority — Royal Council v1.0

Enable **Crown Authority** on the launcher before starting a **new game**. It is an original politics mod inspired by empire-management games, with twelve edicts and decrees. It uses the existing Heroes III town/fort/capitol/treasury graphical pieces through your uploaded compatible game library. It contains no Roblox code or copied Roblox assets.

## Income and capitals

At the start of each new day, each owned town produces **3 Crown Authority**. A town with the existing **Capitol** building produces **8 total**: 3 for the town and 5 extra for the capital. Building a Capitol activates that extra income from the next daily income payment; the +5 is recurring income, not a one-time award. Normal map income handicaps still apply.

For example, three towns, including one with a Capitol, produce **14 Authority per day**. Losing a town transfers its future production to its new owner. Upgrading Village Hall → Town Hall → City Hall does not multiply the base +3; only the highest built hall tier pays. Existing faction-specific gold income is preserved. The standard one-Capitol-per-player rule remains.

Authority belongs to the in-game kingdom/player color, not the website account across all matches. Each new game starts its own economy. Its balance, council visits and remaining effect durations are held in the normal VCMI save, so the existing cloud-save/backup flow carries them between computers after you save and sync.

Right-click the resource bar for balances and daily income, or open Kingdom Overview. Authority reuses the original treasury icons and is named **Crown Authority** in tooltips. VCMI 1.7.5 treats custom resources as tradable: normal marketplaces can buy/sell Authority at a base valuation of 250 gold. It is not restricted to daily town income only.

## Convene the council

1. Bring a hero into a town as the **visiting** hero. A garrison-only hero cannot activate the council.
2. Open the town and click its **Fort, Citadel or Castle** graphical structure. The fort's new manual council interaction takes precedence over its usual click action; its defensive walls/towers remain intact.
3. Choose an affordable edict. Hover the choice for the cost and full effect, or cancel without spending anything. Unaffordable options are unavailable.
4. A successful choice spends Authority immediately. That town's council reconvenes at the **start of the next game week**. Other towns have their own council sessions. A captured town keeps its already-used session until that weekly reset.

This uses the engine's native rewardable-building and bonus systems. The website is not asking you to manually enter town counts or to award yourself points.

## Actions

| Action | Authority | Effect |
| --- | ---: | --- |
| Royal Levy | 12 | Receive 2500 gold immediately. |
| Supply Writ | 12 | Receive 8 wood and 8 ore immediately. |
| Royal Roads Edict | 18 | All your heroes gain +300 land movement at each new day for 7 days. |
| Banner of Unity | 15 | Your kingdom gains +1 morale for 7 days. |
| Festival Decree | 15 | Your kingdom gains +1 luck for 7 days. |
| Writ of Steel | 20 | Your kingdom gains +1 Attack and +1 Defense for 7 days. |
| Arcane Council | 20 | Your kingdom gains +1 Spell Power and +1 Knowledge for 7 days. |
| Royal Relief | 8 | Restore up to 30 spell points to the visiting hero, capped at their normal maximum. |
| Dread Proclamation | 20 | Enemies fighting the issuing hero suffer −1 morale for 7 days. |
| War of Whispers | 20 | Enemies fighting the issuing hero suffer −1 luck for 7 days. |
| Weapons Embargo | 24 | Enemy troops fighting the issuing hero suffer −2 Attack for 7 days. |
| Shatter Shields Sanction | 24 | Enemy troops fighting the issuing hero suffer −2 Defense for 7 days. |

Identical timed bonuses use shared stacking groups: buying the same effect from multiple towns does not multiply its strength. Different effects can coexist. Morale immunity, luck rules, creature/hero limits, and ordinary combat rules still apply. Hostile decrees apply to the issuing hero's battles, not every enemy on the adventure map. Losing that hero loses their hostile decree effects. AI factions receive native income; this version adds no AI strategy for issuing council decrees.

## Compatibility and graphics

The mod covers Castle, Rampart, Tower, Inferno, Necropolis, Dungeon, Stronghold, Fortress and Conflux. Optional compatibility submods also cover Grove, Pavilion and Cathedral when **Three Realms** is enabled. All animations, selection areas and town structure placements remain those of the original towns. The Crown pack adds JSON rules, not replacement commercial artwork.

Keep Crown Authority enabled when loading a game created with it. Enabling it only after a match has already begun does not retroactively initialize the custom resource and councils; use a new game. The mod does not rewrite fixed campaigns, lift Capitol build restrictions, or patch an installed Windows Heroes3.exe. It is for this bundled VCMI 1.7.5 browser version.

Your local Windows folder is not reachable from the website or from this development workspace just because its path is typed in chat. On the website, use **Manage game files → choose folder** to select the installed GOG game folder. If that library is already uploaded, keep using it; this update needs no new original-data upload.

## Source and validation

Mod rules: `mods/crown-authority-rules.json`; builder: `scripts/build-crown-mod.mjs`; browser installer: `dist/crown-worker.js`. The complete website includes the generated `crown-pack`, all Three Realms assets, the engine, accounts and uploads. Source and licenses remain accessible through Credits & source. Original mod code/data is GPL-2.0-or-later; existing Three Realms community content retains its documented CC-BY-SA license.

Validation covers native VCMI 1.7.5 mod/resource/building/reward schemas, scoped compatibility patches, exact income definitions, Authority costs, effect duration/stacking, enemy-side limiters, file checksums, preset preservation, and save-safe installation. Tests use synthetic files; full gameplay with a commercial game library has not been verified here.
