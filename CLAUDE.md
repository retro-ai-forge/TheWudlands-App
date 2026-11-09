# TheWudlands — Agent Context

## Tech Stack

### Frontend
- **Next.js** — App framework (React-based, SSR/SSG)
- **React** — UI component library
- **TypeScript** — Typed JavaScript throughout
- **CSS Modules** — Styling (pixel-art / ASCII-friendly game UI)
- **Polkadot wallet connection** — Browser-side wallet integration layer

## Development

### Backend (FastAPI) — terminal 1
```bash
source .venv/bin/activate
uvicorn backend.main:app --reload   # http://localhost:8000
```

### Frontend (Next.js) — terminal 2
```bash
npm install   # first time only
npm run dev   # http://localhost:3000
```

### Other useful commands
```bash
npm run build       # production build
npm run start       # serve the production build
npm run lint        # ESLint
npm run type-check  # TypeScript check without emitting
```

## Conventions
- ESLint's `react/no-unescaped-entities` rule is enabled — escape raw apostrophes/quotes in JSX text (e.g. `'` → `&apos;`, `"` → `&quot;`).

## Schema layout (post-unification)

- **`player_characters` collection**: `{ address, characters: [{ characterId, name, status: [...], tags: [...], timers: {}, slotNumber, availability: {...}, portraitUrl, activeCraft, ... }] }` — **per-player** (keyed by address). Lightweight summary of all characters: `status` (e.g. `["free"]`, `["adventuring"]`, `["free", "crafting"]`), `tags` (e.g. `["alive"]`, `["dead"]`), `timers` (e.g. `craftingReadyAt`). Profession levels are not mirrored here — read them from the character doc (`profession.lvl1`–`lvl3`). Updated alongside the character doc; injected as `pcStatus`/`pcTags`/`pcTimers` on each character by `_build_player`.
- **`characters` collection**: one doc per character, keyed by `(address, id)`. Each doc holds gear, stats, profession, crafting, availability, etc. `_build_player` assembles a Player from `characters` + related tables.
- **`active_players` collection**: TTL 8h, tracks who is online (address, last_active_at). Separate from character data.
- **`player_vaults` collection**: `{ address, items: [...], itemBalances: {id: qty} }` — **per-player** (keyed by address only). Shared vault across all characters. `itemBalances` is the unified pool for all stackable items (raw materials, processed, crafting tools, food, potions, etc.). `items` holds instance-tracked items. Injected into every `character.vault` by `_build_player` at read time.
- **`character_blueprints` collection**: `{ address, characterId, blueprints: [id, …] }` — soulbound blueprints per character.
- **`character_homes` collection**: `{ address, characterId, items: [...], itemBalances: {id: qty}, homeType: str }` — home storage for out-of-adventure characters. `items` holds instance-tracked gear; `itemBalances` holds stackable counts; `homeType` is a visual hint for the UI background (e.g. `"cave"`, `"forest"`, `"prairie"`, `"ruin"`). Both injected into the character by `_build_player` at read time (`items` → `gear.items`, `itemBalances` → `gear.itemBalances.home`). Only loaded when `inAdventure` is false.
- **`character_resting` collection**: `{ address, characterId, items: [...], itemBalances: {id: qty}, homeType: str }` — rest-stop storage for in-adventure characters at `rest_allowed` story locations. Same schema as `character_homes`. Loaded by `_build_player` only when `inAdventure` is true and `restAllowed` is true. No vault transfers allowed (rest↔vault is always blocked).
- **Unified storage helpers**: Home and rest share generic functions parameterised by `storage_type` (`"home"` or `"rest"`), mapping to their respective collections via `STORAGE_COLLECTIONS`. Generic move functions (`move_storage_item_to_container`, `move_container_item_to_storage`, `load_balance_from_storage`, `unload_balance_to_storage`, `move_container_balance`, `move_container_item`, `bulk_move_storage`, `destroy_all_storage`) enforce transfer rules via `_TRANSFER_RULES` + `_check_transfer`.
- **Transfer rules**: All storage↔container and container↔container transfers are symmetric except vault→body (allowed when `!inAdventure`) vs body→vault (never). Home↔anything requires `!inAdventure`; rest↔anything requires `inAdventure && restAllowed`. Vault↔container (backpack/saddlepack/cart) is never.
- **`Character.gear.items`** on the persistent doc holds only items the character takes on adventure (body, backpack, saddlepack, cart, mount, companion, crafting locations). Home instances live in `character_homes.items`; rest instances live in `character_resting.items`.
- **`Character.gear.itemBalances`** covers `backpack`, `saddlepack`, `cart` on the persistent doc, with `home` injected at read time from `character_homes` and `rest` from `character_resting` (depending on adventure state).
- **`adventure_sessions` collection**: one doc per **running** adventure (`backend/adventures.py`): `{ _id: sessionId, address, storyAuthor, storyId, storyVersion, title, members: [{address, characterId, lead}], status, seq, passage, prevPassage, trail, vars (JSON text), serverVars: {char, lead} }`. Status `starting → active → ending → done`, then the doc is deleted — finished runs never stay here. Every step is a conditional update on `seq`; no multi-doc transactions. `recover_adventures(address)` finishes/undoes anything a crashed request left half done (called on list/start).
- **Character ↔ adventure link**: each member carries `availability.adventure = {sessionId, storyId, title}` on both its `characters` doc and its `player_characters` entry (mirrored by `_sync_pc`), so the soul preview can group characters by `sessionId` without loading sessions. Null when free. The dev in-adventure toggle and character deletion refuse characters in a running session.
- **`adventure_log` collection**: write-once record of each finished adventure (`_id` = sessionId): members, `outcome` (`finished` / `run_away` / `aborted`), `endingPassage`, `trail`, timestamps. Finishing also bumps `stats.adventureFinished`/`adventureRunAway` and adds to `characters.completedStories`; camp storage is discarded.
- **`story_snapshots` collection**: immutable copy of a played story version (`_id` = `author:storyId:hash`), with passages and the step graph (`backend/twine_graph.py`). Sessions pin one, so resubmitting a story never breaks a running adventure. Steps only follow literal `[[links]]`/image-links, plus `Retreat` (if `$meta_allowRunAway`) and `LastResort` from anywhere.
- **`story_plays` collection**: runs left per player per story (`backend/adventures.py`): `{ address, storyAuthor, storyId, remaining, open: [sessionId] }`, unique on (address, storyAuthor, storyId). The story's `$meta_access` (required at submit) decides the start: `free` = no counter, `trial` = 1, `paid` = 0; a purchase adds 3 (`grant_runs`). Starting takes a run (refused at 0, HTTP 402); a `finished`/`run_away` ending keeps it spent; `LastResort` (`aborted`) or a failed start gives it back. Take/return are conditional writes keyed on the session id in `open`, so retries never double-charge or double-refund.
- **Foraging** (`backend/foraging.py`, rules in `data/foraging-rules.json`, names in `data/foraging-missions.json`): each soul slot gets one pool ever, at `soul_slots.forage_pools.<slot> = {professionCount, total, families: {familyId: {initial, remaining, count}}}`. It's created at character creation, or lazily for older slots. It survives character deletion, and the next character in the slot uses only the families its professions cover. A trip lives on `characters.foraging.activeForage` (pc status `foraging`, timer `foragingReadyAt`). Finds use `floor(base * 0.5 ** (count / halfLife) * gearMultiplier)` per family (gathering weapon/items from `data/gathering-bonuses-raw-material.json`, bonus by tier, worn on use, destroyed at quality 0; at most one light — lantern+oil, else torch, else candle — counts on ore/crystal/clockwork, only with a tinderbox, at its tier (a lantern at the lower of lantern and oil tier), burning one oil/torch/candle per trip: `lightSources`/`lightRequires`/`lightFuel` in `foraging-rules.json`), are rolled (with ammo use and gear wear) when the trip starts, kept hidden in `activeForage.result`, and on collect go to the character's home storage (`character_homes.itemBalances`); the result is kept as `foraging.lastResult` with a return sentence from `data/foraging-messages.json` (`rich` / `thin` when more than half is gone / `depleted` on the last trip). Each trip also rolls extras outside the pool (no wear): surprise raws (`surprises`: 5% for 1–3 of any T1–T3 raw, 1% for 1 of any T4–T6) and lost equipment (`oldGear`: 15% for one damaged T1 quality-tracked piece of that material's gathering gear, at most 10% quality, pushed to `character_homes.items`). A site whose next trip would find nothing is no longer listed. Foraging, crafting and adventures exclude each other.
- **Temporary attribute loss** (`backend/condition.py`): `characters.attr` is the maximum; damage is stored as `attrLost: {attr: n}` (current = max − lost, never below 0) plus `healFrom` (ISO, healing clock). One point heals per 20h of *uninterrupted* free time (`HEALING_INTERVAL_MINUTES` overrides it for local testing), weighted by points lost; the clock restarts after each loss and each return, and is stopped (`healFrom: null`) while foraging/crafting/adventuring (`pause_healing` / `resume_healing`, wired into foraging, `start_craft`/`finish_craft`, adventure claim/release and the dev toggle). Heals are seeded by the clock time, so reads compute the current state (`condition.annotate` → `attrNow`, `attrLost`, `nextHealAt`) without writing. A point aimed at an attribute at 0 goes to another in its group, then to the other group; Body all 0 → `vitalStatus: "dead"`, Soul all 0 → `"soulless"` (also the pc tag), and a drained group never heals. A foraging trip's night (`foraging-rules.json` "nights", sentences in `foraging-messages.json` "nights") is rolled at start: weather from `nights.weather` (`{weight, severity: none|mild|severe, families?}` - weathers with `families` only happen when foraging those materials, e.g. sandstorm on sand, flood on fish/reed/clay, blizzard/rockslide on ore/stone/crystal; loss by shelter count and severity in `pointsLost`; a severe night has a 3% chance (`tentDestroyedChance`) to destroy the carried tent - the best one is removed at trip start and listed as broken; sentences in `byWeather.<weather>`); tent + bedroll carried = no loss, one of them = at most 1 point, neither = up to 1 Body + 1 Soul; applied on collect.
- **Character deletion** dumps all gear (body, backpack, saddlepack, cart, home, companions, mounts) into the shared vault, deletes blueprints and home doc, discards the rest doc without salvage (temporary adventure loot), then deletes the character doc. The vault persists.



## Submodule: twinejs-integrated

- The integrated Twine story editor lives in the `twinejs-integrated` git submodule (`retro-ai-forge/twinejs-integrated`). Its working branch is **`develop`** — commit and push changes there, not `main`/`master`.
- After committing inside the submodule, record the new commit in the parent repo (`git add twinejs-integrated && git commit`) so the pointer is bumped. A detached-HEAD checkout means the parent is pinning an older commit; `git -C twinejs-integrated checkout develop` to get back on the branch.
- It is served under `/twine/` in the Wudlands app (dev: Next proxies to the vite dev server; prod: built to `public/twine/`). `npm run dev` starts both; `npm run build` builds and copies the editor.
