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

- **`characters` collection**: one doc per character, keyed by `(address, id)`. Each doc holds gear, stats, profession, crafting, availability, etc. No `players` collection — `_build_player` assembles a Player from `characters` + related tables.
- **`active_players` collection**: TTL 8h, tracks who is online (address, last_active_at). Separate from character data.
- **`player_vaults` collection**: `{ address, items: [...], itemBalances: {id: qty} }` — **per-player** (keyed by address only). Shared vault across all characters. `itemBalances` is the unified pool for all stackable items (raw materials, processed, crafting tools, food, potions, etc.). `items` holds instance-tracked items. Injected into every `character.vault` by `_build_player` at read time.
- **`character_blueprints` collection**: `{ address, characterId, blueprints: [id, …] }` — soulbound blueprints per character.
- **`character_camps` collection**: `{ address, characterId, itemBalances: {id: qty} }` — camp-held stackable items per character. Injected into `gear.itemBalances.camp` by `_build_player` at read time.
- **`Character.gear.itemBalances`** covers `backpack`, `saddlepack`, `cart` on the persistent doc, with `camp` injected at read time from `character_camps`.
- **Character deletion** dumps all gear (body, backpack, saddlepack, cart, camp, companions, mounts) into the shared vault, deletes blueprints and camp doc, then deletes the character doc. The vault persists.


