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

- **`player_characters` collection**: `{ address, characters: [{ characterId, name, status: [...], tags: [...], timers: {}, craftingTiers: {} }] }` — **per-player** (keyed by address). Lightweight summary of all characters: `status` (e.g. `["free"]`, `["adventuring"]`, `["free", "crafting"]`), `tags` (e.g. `["alive"]`, `["dead"]`), `timers` (e.g. `craftingReadyAt`), `craftingTiers` (profession level per slot). Updated alongside the character doc; injected as `pcStatus`/`pcTags`/`pcTimers`/`pcCraftingTiers` on each character by `_build_player`.
- **`characters` collection**: one doc per character, keyed by `(address, id)`. Each doc holds gear, stats, profession, crafting, availability, etc. `_build_player` assembles a Player from `characters` + related tables.
- **`active_players` collection**: TTL 8h, tracks who is online (address, last_active_at). Separate from character data.
- **`player_vaults` collection**: `{ address, items: [...], itemBalances: {id: qty} }` — **per-player** (keyed by address only). Shared vault across all characters. `itemBalances` is the unified pool for all stackable items (raw materials, processed, crafting tools, food, potions, etc.). `items` holds instance-tracked items. Injected into every `character.vault` by `_build_player` at read time.
- **`character_blueprints` collection**: `{ address, characterId, blueprints: [id, …] }` — soulbound blueprints per character.
- **`character_camps` collection**: `{ address, characterId, items: [...], itemBalances: {id: qty}, campType: str }` — camp storage for out-of-adventure characters. `items` holds instance-tracked gear; `itemBalances` holds stackable counts; `campType` is a visual hint for the UI background (e.g. `"cave"`, `"forest"`, `"prairie"`, `"ruin"`). Both injected into the character by `_build_player` at read time (`items` → `gear.items`, `itemBalances` → `gear.itemBalances.camp`). Only loaded when `inAdventure` is false.
- **`character_resting` collection**: `{ address, characterId, items: [...], itemBalances: {id: qty}, campType: str }` — rest-stop storage for in-adventure characters at `rest_allowed` story locations. Same schema as `character_camps`. Loaded by `_build_player` only when `inAdventure` is true and `restAllowed` is true. No vault transfers allowed (rest↔vault is always blocked).
- **Unified storage helpers**: Camp and rest share generic functions parameterised by `storage_type` (`"camp"` or `"rest"`), mapping to their respective collections via `STORAGE_COLLECTIONS`. Generic move functions (`move_storage_item_to_container`, `move_container_item_to_storage`, `load_balance_from_storage`, `unload_balance_to_storage`, `move_container_balance`, `move_container_item`, `bulk_move_storage`, `destroy_all_storage`) enforce transfer rules via `_TRANSFER_RULES` + `_check_transfer`.
- **Transfer rules**: All storage↔container and container↔container transfers are symmetric except vault→body (allowed when `!inAdventure`) vs body→vault (never). Camp↔anything requires `!inAdventure`; rest↔anything requires `inAdventure && restAllowed`. Vault↔container (backpack/saddlepack/cart) is never.
- **`Character.gear.items`** on the persistent doc holds only items the character takes on adventure (body, backpack, saddlepack, cart, mount, companion, crafting locations). Camp instances live in `character_camps.items`; rest instances live in `character_resting.items`.
- **`Character.gear.itemBalances`** covers `backpack`, `saddlepack`, `cart` on the persistent doc, with `camp` injected at read time from `character_camps` and `rest` from `character_resting` (depending on adventure state).
- **Character deletion** dumps all gear (body, backpack, saddlepack, cart, camp, companions, mounts) into the shared vault, deletes blueprints and camp doc, discards the rest doc without salvage (temporary adventure loot), then deletes the character doc. The vault persists.


