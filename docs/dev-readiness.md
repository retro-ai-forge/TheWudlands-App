# Dev Readiness Notes

Findings from a project review on 2026-07-10, covering what would help future
contributors ramp up faster and catch regressions earlier. Ordered roughly by
priority. Status last checked on 2026-11-21.

## High priority

### 1. Automated tests - partly done
The backend has a pytest suite in `tests/`. It runs against the database that
`MONGODB_URI` in `.env` points to and writes test records there, so point it at
a database you don't mind tests writing to. The editor submodule
(`twinejs-integrated`) has Twine's own Jest suite; 28 of its tests already fail.
Still open: the Next.js app (`app/`) has no tests and no test runner.

### 2. No CI - open
The main repo has no `.github/workflows`. Nothing runs `npm run type-check`,
`npm run lint`, `npm run build` or the backend tests on a push or PR. Both
`type-check` and `lint` pass today (lint with warnings only), so a first job
for them would start green. The backend tests need a database of their own in
CI. The editor submodule still carries Twine's original workflows; its Jest
workflow runs on every push to `develop` and fails on the tests above.

### 3. `.env-example` - done
Redis is no longer used: login sessions and sign-in nonces live in Firestore
with TTL indexes. `.env-example` documents Firestore, the image bucket, Subscan
and SMTP, and marks `FORAGING_DURATION_MINUTES` as dev-only (it shortens every
player's foraging trips). Optional variables it doesn't list, all with
defaults: `ASSETHUB_RPC`, `HYDRATION_RPC`, `IPFS_GATEWAY`, and the dev-only
`HEALING_INTERVAL_MINUTES`.

## Lower priority / nice-to-have

### 5. No pre-commit hooks - open
No husky (or equivalent) setup. A pre-commit hook running `type-check` +
`lint` would catch issues before they reach a PR. It only complements CI: it
runs on one machine, `git commit --no-verify` skips it, and the backend tests
don't belong in it (they write to the database). Set up CI first.

### 6. Custom error/not-found pages - done (2026-11-21)
`app/not-found.tsx` (unknown addresses, status 404), `app/error.tsx` (a page
that throws; shows only the error's reference code) and `app/global-error.tsx`
(the root layout itself fails), sharing `app/styles/statusPage.module.css`.

## Observation - done (2026-11-21)

The scratch folders at the repo root were removed: `add-ons/` and
`contracts/` (empty placeholders; stories live in Firestore, there are no smart
contracts), `chatgpt_role/` (an early prompt describing a different game
design) and `pdf-convert/` (an outdated PDF export script, with its
`puppeteer` dev dependency). `docker-compose.yml` lost the `add-ons` mount and
the unused `NEXT_PUBLIC_API_URL`.

## Fixed in the 2026-07-10 session (for context, not action items)

- `lib/wallet.ts` was never tracked by git — a stray `lib/`/`lib64/` rule in
  `.gitignore` (leftover from the Python project template) was silently
  excluding it. Fixed, and the file was moved to `app/lib/wallet.ts` to make
  its frontend-only scope explicit and avoid a repeat collision.
- ~70 unused CSS classes, 3 dead components, dead React state/props, a dead
  wrapper function, a duplicate-key rendering bug, an unreachable code
  branch, and a handful of unused imports/exports were identified and
  removed across the frontend.
- `Dockerfile` had a stale `COPY lib ./lib` line left over from the
  `lib/wallet.ts` move above — removed (redundant anyway, since `COPY app
  ./app` already includes `app/lib/`).

## Checked and NOT an issue (corrected from an earlier pass)

`backend/main.py`'s CORS middleware hardcodes
`allow_origins=["http://localhost:3000", "http://localhost:3001"]`. This
looks alarming out of context, but it's a non-issue for the current
deployment: `next.config.ts` rewrites all `/api/:path*` requests to
`http://localhost:8000/api/:path*` server-side, and the `Dockerfile` bundles
both Next.js (port 3000) and FastAPI (port 8000) in one container, with
Cloud Run only exposing port 3000 externally (`gcp_deploy --port=3000`). The
browser only ever talks to one origin (the Cloud Run URL); it never makes a
cross-origin request to FastAPI directly, so `allow_origins` is never
actually consulted. This would only become real if the frontend and backend
are ever split into separate deployed services, or something starts calling
the FastAPI URL directly from the browser instead of through the rewrite.
