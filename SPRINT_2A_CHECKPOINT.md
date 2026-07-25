# Sprint 2A — Checkpoint (Platform Infrastructure)

> **STATUS: COMPLETE.** The "Explicitly not started" items below were all
> finished in a later pass (OpenAPI paths + real `orval codegen`, inline zod
> replaced with generated `@workspace/api-zod` schemas, both test suites,
> frontend UI, and docs). This file is kept as a record of how the sprint was
> built; the "What's done" sections remain accurate. See the "Completion pass"
> note immediately below for what changed. Task 3 (coupling/dedup) was left
> deliberately, per step 5 of the original next-steps list.

## Completion pass

Everything under "Explicitly not started" is now done:

- **OpenAPI + codegen.** Added 11 paths and 20 schemas to `openapi.yaml` for
  both engines, ran a real `orval codegen`, and regenerated
  `@workspace/api-zod` and `@workspace/api-client-react`. One collision fixed:
  a schema named `SearchResponse` clashed with orval's auto-generated response
  validator for the `search` operation and was renamed `GlobalSearchResponse`.
- **Inline zod removed.** `routes/search.ts` and `routes/integrations.ts` now
  import generated schemas (`SearchQueryParams`, `CreateIntegrationEndpointBody`,
  etc.) instead of the hand-written `z.object({...})` stand-ins. One real type
  gap surfaced in the swap: `PublishEventInput.payload` is optional on the wire
  but required by `publish()`, so the handler defaults it to `null`.
- **Tests.** `tests/engines/search.test.ts` (23) and
  `tests/engines/integrations.test.ts` (26), with `.core.ts` copies of the
  pure logic, following the existing harness. Both pass.
- **Frontend.** `pages/search.tsx` (global search with entity-type filters and
  reindex) and `pages/integrations.tsx` (endpoints / webhooks / events / retry
  queue tabs), routed in `App.tsx` and added to the nav in `Shell.tsx`.
- **Docs.** `replit.md` and `tests/engines/README.md` updated.

Verified: full `pnpm run typecheck`, API server typecheck, Vite build, and all
seven engine test suites pass (151 tests total).

---


This is a **mid-sprint checkpoint**, not a finished deliverable. Read this
before continuing the work or handing it to Sprint 2B.

## Update — second pass

This pass finished the rest of Task 2's engine code and both HTTP route
layers (recommended next steps 1–2 below), scoped deliberately to *code
only* — no OpenAPI/zod codegen and no test suites yet (see "Still not
started"). Everything below "What's done" is unchanged from the first
checkpoint and still accurate; this note just says what moved.

Done in this pass:
- `lib/integration-engine/src/{webhookFramework,eventBus,retryQueue,registry}.ts`
  — all four, plus the barrel `index.ts` export update.
- `routes/search.ts` and `routes/integrations.ts`, wired into
  `artifacts/api-server/src/routes/index.ts`.
- `artifacts/api-server/tsconfig.json` — added references to
  `../../lib/search` and `../../lib/integration-engine`.
- `artifacts/api-server/package.json` — added `@workspace/search`,
  `@workspace/integration-engine`, and `zod` (direct dependency; previously
  only reached transitively through `@workspace/api-zod`).

**Naming/validation note:** the new routes validate with hand-written
`zod/v4` schemas defined inline in each route file, *not* the generated
`@workspace/api-zod` schemas every other route uses — `orval codegen` still
can't run in this sandbox (no network). This is a deliberate stand-in, not a
convention change: once codegen can run, the real generated schemas should
replace these inline ones (their shapes were written to match what the
generated ones would look like), and the inline `z.object({...})` blocks in
`search.ts`/`integrations.ts` should be deleted in favor of imports from
`@workspace/api-zod`.

Nothing in this pass has been compiled, typechecked, or run either — same
environment constraint as before. Still needs the same verification pass
described below before it's trustworthy enough to merge.

## Environment constraint (important)

This sandbox has **no network access and no installed `node_modules`**.
Nothing below has been compiled, typechecked, or run. Everything was
hand-written by close pattern-matching against the existing codebase's
conventions, but needs a real pass of:

```bash
pnpm install
pnpm run typecheck:libs
pnpm run build
npx tsx tests/engines/search.test.ts        # once written, see below
npx tsx tests/engines/integrations.test.ts  # once written, see below
```

before this is trustworthy enough to merge.

## What's done

### Task 1 — Search Engine (`lib/search/`, package `@workspace/search`)
Complete:
- `ranking.ts` — pure tokenize/score/rank logic (no DB import), title >
  subtitle > content weighting, all-tokens-matched bonus.
- `permissions.ts` — Search Permissions. Reuses the *existing* `permissions`
  / `role_permissions` / `user_roles` tables rather than inventing a new
  permission model. Fails closed: a user with no matching role/permission
  rows sees zero search results.
- `indexer.ts` — Search Indexing. Pull-based reindex functions per entity
  type (rule, form, workflow_definition, document_template,
  notification_template, department, user) plus `reindexAll(tenantId)`.
  Deliberately pull-based rather than hooking every other engine's
  write path, per Task 3's "reduce coupling" instruction.
- `searchService.ts` — the Global Search Service / Entity Search entrypoint.
  Tenant scoping is applied first and is never optional; permissions narrow
  entity types next; `entityTypes` param can only narrow further.
- DB schema: `search_index` table (`lib/db/src/schema/searchIndex.ts`),
  wired into `lib/db/src/schema/index.ts`.
- `package.json` / `tsconfig.json` (composite project reference, matching
  `lib/db`'s pattern), and now referenced from the root `tsconfig.json`.

Also now complete (second pass): the HTTP layer (**Search API** —
`routes/search.ts`: `GET /search`, `GET /search/entity-types`, `POST
/search/reindex`), wired into the router.

Still missing: the **Unit Tests** task (`tests/engines/search.core.ts` copy
+ `tests/engines/search.test.ts`).

### Task 2 — Integration Engine (`lib/integration-engine/`, package `@workspace/integration-engine`)
Complete:
- `retryPolicy.ts` — pure backoff calculation (identical formula to
  `notificationEngine.ts`'s `backoffMs`, intentionally, so the two queues
  behave the same to an operator) plus HMAC-SHA256 webhook signing and a
  constant-time `verifySignature`.
- `apiClient.ts` — **API Client abstraction**: a fetch-based client with
  pluggable auth (none/bearer/api_key/basic), timeout, and bounded retry on
  network error / 5xx. No external government API is called anywhere —
  this is scaffolding only, as instructed.
- `package.json` / `tsconfig.json`, referenced from root `tsconfig.json`.
- DB schema for the rest of the engine (tables exist, code doesn't yet):
  `integration_endpoints` (Integration Registry), `webhook_subscriptions`
  (Webhook framework), `integration_events` (Event Publisher's append-only
  log), `integration_retry_queue` (Retry Queue, shaped like
  `notification_queue` for a consistent worker pattern —
  `SELECT ... FOR UPDATE SKIP LOCKED` claiming, `dead_letter` terminal
  state).

**Important naming note:** `pnpm-workspace.yaml` already declares
`lib/integrations/*` as a workspace glob. That's reserved for *future,
per-external-API adapter packages* (Sprint 2B+, one government API each) —
not the reusable engine itself. That's why the engine lives at
`lib/integration-engine/`, not `lib/integrations/`. Don't rename this into
`lib/integrations/` directly; add adapters as `lib/integrations/<name>/`
alongside it instead.

Also now complete (second pass):
- `webhookFramework.ts` — register/list/pause a `webhook_subscriptions` row,
  and `buildDeliveryPayload()` to turn an event into a signed envelope.
  Secret is only ever returned once, on creation (see `routes/integrations.ts`).
- `eventBus.ts` — `publish(eventType, payload)` persists to
  `integration_events` and enqueues an `integration_retry_queue` row per
  matching active webhook subscription (wildcarded `"*"` subscriptions
  match everything); in-process `subscribe()` for same-process listeners,
  isolated with try/catch so one bad listener can't break `publish()`.
- `retryQueue.ts` — `processQueue()`, a DB-backed worker mirroring
  `notificationEngine.ts`'s claim pattern almost line-for-line: `SELECT
  ... FOR UPDATE SKIP LOCKED` inside a transaction, stale-`processing`
  reclaim after 5 minutes, reuses `retryPolicy.decideRetry` for the
  retry/dead-letter decision. Delivery is injectable (`opts.deliver`) so
  it never needs a real network call in tests.
- `registry.ts` — Integration Registry CRUD over `integration_endpoints`.
- `index.ts` barrel now exports all six modules.

### Task 3 — Package organization / coupling
Only the naming decision above (keeping the engine out of the
`lib/integrations/*` reserved namespace) has been made. No broader
refactor of existing packages has been attempted yet — deliberately, since
Task 3 says "if necessary" and touching working code without finishing
Tasks 1–2 first risked leaving things in a worse state.

## Explicitly not started

- `openapi.yaml` additions for both engines, and the corresponding
  hand-authored `@workspace/api-zod` generated-style schemas (the real
  `orval codegen` script can't run in this sandbox — no network). The new
  routes validate with inline `zod/v4` schemas as a stand-in in the
  meantime — see the "Update — second pass" note above.
- `tests/engines/search.test.ts` + `.core.ts`,
  `tests/engines/integrations.test.ts` + `.core.ts`
- `replit.md` and `tests/engines/README.md` updates
- Root `package.json` — nothing needed there; both new packages pick up
  `pnpm-workspace.yaml`'s `lib/*` glob automatically
- Any Task 3 coupling/dedup pass

## Recommended next steps for whoever picks this up

1. ~~Finish `lib/integration-engine/src/{webhookFramework,eventBus,retryQueue,registry}.ts`.~~ Done.
2. ~~Write both route files and wire them in.~~ Done — `routes/search.ts`
   and `routes/integrations.ts`, following `routes/rules.ts`'s shape
   (`requireAuth`, `logAudit` on writes), using inline zod instead of
   `@workspace/api-zod` for now.
3. Add the OpenAPI paths/schemas by hand, matching the existing `/rules`
   section's structure, then get a real `orval codegen` run once
   dependencies are installable, diff against the hand-authored `api-zod`
   stand-in to catch drift, and delete the inline zod schemas in
   `search.ts`/`integrations.ts` in favor of the generated ones.
4. Write the two test files following `tests/engines/rules.test.ts`'s
   custom `check()`/`throws()` harness — no test framework dependency.
   `retryPolicy.ts`, `ranking.ts`, and `permissions.ts` are already
   dependency-free and copy-pasteable into the `.core.ts` files the same
   way `rules.core.ts` copies from `rulesEngine.ts`.
5. Only then attempt any Task 3 coupling/dedup pass, so it's evaluated
   against the finished surface area rather than a half-built one.
6. Whichever of these runs first, run the verification commands at the top
   of this file (`pnpm install`, `typecheck:libs`, `build`) before trusting
   any of this — none of it has been compiled or run yet.
