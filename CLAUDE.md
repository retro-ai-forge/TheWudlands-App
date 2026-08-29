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

## Known gaps

- **Character has no `items` field yet** — only `resources` and `tools` exist per-character (see `backend/character.py`). When a `Character.items` concept (schema field + check-in/check-out endpoint pair, mirroring `resources`/`tools`) gets built:
  - Wire it into `CharacterPreview.tsx`'s delete-confirmation flow (`checkInAll` calls for `resources` and `tools` before deleting — add `items` there too).
  - Add its section to `InventoryTab.tsx`'s accordion ordering (currently Blueprints Known → Tools → Resources for the character side; Tools → Resources for the party side, per an explicit reorder request — Items was left out only because there was nothing to show).


