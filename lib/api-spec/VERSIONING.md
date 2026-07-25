# API versioning — Sprint 1 review

## Current state

- `openapi.yaml` declares a single server: `/api` (unversioned).
- `artifacts/api-server` mounts all routes under `/api` (see
  `artifacts/api-server/src/routes/index.ts`).
- `artifacts/govcore` (frontend) and the Orval-generated clients
  (`lib/api-client-react`, `lib/api-zod`) both bake in `/api` as the base
  URL (`baseUrl: "/api"` in `lib/api-spec/orval.config.ts`).
- The `govcore` frontend also takes a build-time `BASE_PATH`, separate from
  the API base path (per `replit.md`).

## Recommendation: do not introduce `/api/v1` in this sprint

Reasons:

1. **It's cross-cutting, not additive.** Changing the base path touches the
   OpenAPI `servers` block, every route mount in `api-server`, the Orval
   `baseUrl`, both generated clients, and anywhere the frontend or
   integration scripts hardcode `/api`. That's a coordinated multi-package
   change, not a repository-hygiene change.
2. **No second version exists yet.** Versioning earns its complexity when
   there's a v1 to keep stable while v2 diverges. Today there's one API
   surface; adding `/v1` now is a rename with no immediate payoff, and
   picks a URL scheme (path-based vs. header-based versioning) that's hard
   to walk back once clients depend on it.
3. **Explicitly out of scope.** The Sprint 1 brief is repository hygiene —
   "do not modify existing business logic," "do not redesign the
   architecture." A base-path change is routing/contract surface, which
   every deployed client (frontend, any external integrations) depends on.
4. **Risk is asymmetric.** Skipping this costs nothing today — it can be
   introduced later, additively, by mounting a new `/api/v1` alongside the
   existing `/api` and deprecating the latter on a timeline. Doing it now,
   inside a hygiene sprint, risks a breaking change landing without the
   dedicated review/rollout plan it deserves.

## What to do instead, now

- `lib/api-spec/package.json` gained a `codegen:check` script
  (`pnpm --filter @workspace/api-spec run codegen:check`) that regenerates
  the clients and fails if the checked-in `src/generated/` output doesn't
  match — i.e., it catches "someone edited `openapi.yaml` and forgot to
  regenerate" or "someone hand-edited generated output." This is not yet
  wired into `ci.yml`; see the Sprint 1 summary for why.

## If/when versioning is taken up

- Prefer introducing `/api/v1` additively (new mount point, old one kept
  and marked deprecated) over a hard cutover.
- Update in the same change: `openapi.yaml` `servers`, `api-server` route
  mounting, `orval.config.ts` `baseUrl`, and regenerate both clients.
- Decide up front how the frontend's existing `BASE_PATH` build-time
  variable interacts with an API version segment — they're currently
  orthogonal concerns (deploy path vs. API path) and should stay that way.
