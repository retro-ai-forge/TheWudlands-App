# Dev Readiness Notes

Findings from a project review on 2026-07-10, covering what would help future
contributors ramp up faster and catch regressions earlier. Ordered roughly by
priority.

## High priority

### 1. No automated tests
Neither the frontend (`app/`) nor the backend (`backend/`) has any test
infrastructure — no test runner is installed, no `*.test.*`/`*.spec.*` files
exist. This is the biggest gap: a duplicate React `key` bug in
`STORY_STATS` (`app/create/page.tsx`) shipped to prod and only surfaced as a
browser console error, something a basic render test would have caught
before merge.

### 2. No CI
There is no `.github/workflows` directory. Nothing runs `npm run type-check`,
`npm run lint`, or `npm run build` automatically on a PR. Several bugs fixed
this session (a dead/broken `useEffect`, an unused-expression lint warning)
would have been flagged by CI without needing a manual review pass.

### 3. `.env-example` is incomplete
`.env-example` only documents the SMTP feedback-email variables
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
`SMTP_SECURE`). It does not mention `REDIS_HOST` / `REDIS_PORT`, which
`backend/auth.py` requires for auth to work at all. A new developer setting
up the project from `.env-example` alone would hit a confusing runtime
failure with no indication Redis is even a dependency.

## Lower priority / nice-to-have

### 5. No pre-commit hooks
No husky (or equivalent) setup. A pre-commit hook running `type-check` +
`lint` would catch issues before they even reach a PR, complementing (not
replacing) CI.

### 6. No custom error/not-found pages
The Next.js app has no custom `error.tsx` or `not-found.tsx` in `app/` —
currently relying on framework defaults.

## Observation (not necessarily a problem)

The repo root has several folders alongside the actual app that look like
scratch/tooling rather than shipped code: `add-ons/`, `contracts/`,
`chatgpt_role/`, `pdf-convert/`. Worth grouping under something like
`tools/` or `scripts/` if they're meant to stay long-term, just so a new
contributor can tell at a glance what's live application code versus
side material.

## Already fixed this session (for context, not action items)

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
