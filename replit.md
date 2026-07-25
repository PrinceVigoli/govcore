# Gov-Core Suite

A multi-tenant government administration platform: LGU staff configure forms, approval workflows, and business rules as data, then citizens and staff file and process records against them — without shipping code for each new form or policy.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `npx tsx tests/engines/<name>.test.ts` — run an engine's logic tests (no database needed; see `tests/engines/README.md`)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- The `govcore` frontend also requires `PORT` and `BASE_PATH` at build time, or `vite build` fails while loading its config.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, wouter routing, TanStack Query, shadcn/ui + Tailwind

## Where things live

- **DB schema (source of truth):** `lib/db/src/schema/` — one file per table, re-exported from `index.ts`
- **API contract (source of truth):** `lib/api-spec/openapi.yaml` — everything in `lib/api-zod` and `lib/api-client-react` is generated from it; never hand-edit `src/generated/`
- **API server:** `artifacts/api-server/src/` — `routes/` for endpoints, `lib/` for engines
- **Engine tests:** `tests/engines/` — database-free tests for rules, forms, notifications, documents, auth, search, and integrations
- **Frontend:** `artifacts/govcore/src/` — `pages/` by feature, `components/ui/` for shadcn primitives

Modules are organized as "Books": Book 05 workflows, Book 06 rules, Book 07 forms, Book 08 notifications, Book 09 documents. Sprint 2A added two cross-cutting platform engines that aren't Books: the Search Engine (`lib/search`, package `@workspace/search`) and the Integration Engine (`lib/integration-engine`, package `@workspace/integration-engine`). Schema and engine files carry `Book NN §X` or `Sprint 2A` comments pointing at the spec section they implement.

## Architecture decisions

- **Definition vs. version split.** Forms, workflows, and rules each have a definition table plus a versioned tree. Published versions are immutable; edits always create a new version, so historical records stay bound to the exact layout/logic in force when they were filed.
- **One active version per definition.** Publishing demotes the previously active version to `deprecated` inside the same transaction.
- **Client-supplied temporary keys.** Version-creation endpoints accept a tree where children reference parents by a request-scoped `key` (not a DB id), resolved server-side inside the transaction. Same pattern in forms and rules.
- **JSON-in-text columns.** `rule_conditions.value`, `form_fields.options/defaultValue`, and `submission_values.value` are JSON-encoded text, so one column holds any answer type. Decode defensively at every read.
- **Rules are the shared policy engine.** Forms don't reimplement conditional logic — field visibility, calculated values, and `custom_rule` validations all delegate to `evaluateRules()` keyed by rule `code`.
- **Notifications are event-driven and asynchronous.** Modules never call a channel directly (ADR-0016); they create a notification, which fans out to one `notification_queue` row per recipient. `POST /notifications/send` drains due rows, so request latency never depends on a mail server (ADR-0018).
- **Documents are addressed by UUID, not path** (ADR-0019). Storage keys derive from the UUID, so content can move between inline, local disk, NAS, and S3 without invalidating a single stored reference or QR code.
- **Attachments back the forms file fields.** Book 07's `file_upload`/`image`/`signature` fields store an attachment UUID resolving to a real `attachments` row (size, MIME type, uploader, hash) instead of the unbacked storage string they held before Book 09 existed.
- **Signatures bind to a version, not a document.** A signature records the version's content hash, so regenerating a document correctly leaves the new version unsigned rather than silently inheriting an approval.
- **Rule isolation.** One rule's evaluation error is logged as `failed` and skipped rather than aborting the batch, so a malformed rule can't take down every other policy check.

## Product

- **Identity:** tenants, departments, users, roles, permissions, audit logs
- **Workflows (Book 05):** versioned state machines; instances, task inbox, approve/reject, history
- **Rules (Book 06):** versioned boolean condition trees with actions; priority ordering; evaluation sandbox at `/rules/evaluate`; audit trail
- **Search (Sprint 2A):** global and entity-scoped search over a denormalized `search_index` table; plain-text ILIKE-style ranking (title > subtitle > content, all-tokens bonus); pull-based reindexing per entity type; permission-filtered results that fail closed
- **Integrations (Sprint 2A):** an integration registry (endpoint definitions, no credentials stored), a webhook framework with HMAC-SHA256-signed delivery, an append-only event log, and a retry queue with exponential backoff and a dead-letter state — shaped like the notification queue so both behave identically to an operator
- **Reports (Book 10):** reports defined as data over a *whitelisted* data-source catalog (never raw tables/columns); a pure spec compiler that produces parameterized, unconditionally tenant-scoped SQL; JSON/CSV output; immutable published versions; run history; and a cron schedule model. `@workspace/report-engine`, package at `lib/report-engine/`
- **Documents (Book 09):** versioned generation from `{{variable}}` templates; immutable version history; forward-only lifecycle (draft → generated → reviewed → approved → signed → archived → retained → disposed); electronic signatures bound to a version's hash; public QR verification at `/verify/:uuid`; append-only access and download trail; file attachments shared with Book 07 forms
- **Notifications (Book 08):** versioned message templates with `{{variable}}` placeholders and live preview; recipient resolution by user, role, or raw address; per-recipient queue with exponential backoff and a dead-letter state; append-only delivery audit trail; per-user channel preferences
- **Forms (Book 07):** versioned section/field/validation trees; dynamic renderer covering 17 field types; draft/submitted/synced submissions; submitting a form can start a workflow instance

## Gotchas

- **Always run `pnpm run typecheck:libs` (or `tsc --build`) after codegen.** Orval's `clean` wipes `lib/api-zod/dist` and `lib/api-client-react/dist`; until they're rebuilt, the API server and frontend report confusing `TS6305` "not built from source file" errors that look like real breakage.
- **Codegen is two-way coupled.** Adding endpoints to `openapi.yaml` without rerunning codegen leaves the frontend with no hooks — the forms module shipped a complete backend but an unusable client for exactly this reason.
- **Route order matters in wouter `<Switch>`.** First match wins, so `/forms/:id/fill` must precede `/forms/:id`, and `/rules/evaluate` must precede `/rules/:id`.
- **`isEmpty(false)` is `false`.** The server's `required` check treats a boolean `false` as an answer. Never pre-seed a required checkbox/switch with `false` — it would let an unticked consent box pass validation. See `buildInitialValues`.
- **The rules engine compares strictly.** `"5"` never equals `5`; a `greater_than` against a string operand is always false. Coerce numeric input before storing a condition value.
- **Express matches routes in declaration order.** `/notifications/history` and `/notifications/send` must be declared before `/notifications/:id`, or `:id` swallows them and they 400 on a non-numeric param.
- **Only `in_app`/`announcement` actually deliver.** `deliver()` in `notificationEngine.ts` has no email/SMS/push provider wired; those channels fail with "no provider configured" and route through the normal retry path rather than silently reporting success. Wiring a real provider means implementing that one function.
- **SMS recipients must be passed as explicit addresses.** The `users` table has no phone column (Book 04), so resolving a user for SMS yields nothing and they land in `unroutableUserIds`.
- **`format: uuid` in the OpenAPI spec breaks codegen.** Orval emits `zod.uuid()`, a Zod v4 API, but this workspace pins Zod v3 (`z.string().uuid()`). Use a plain `type: string` for UUID params.
- **An operation can't have both path and query parameters.** Orval names both `<Operation>Params`, so they collide at the export level and `tsc --build` fails on a duplicate member. Every existing endpoint in this spec uses one or the other.
- **`/documents/verify/:uuid` must be declared before `/documents/:id`** in Express, and the frontend `/verify/:uuid` route lives outside `AuthenticatedRoutes` — a citizen scanning a QR code must not hit the login redirect.
- **Generated document content is stored inline** in `document_versions.content`, and attachment bytes in `attachments.content` as base64. `storeContent()` in `documentEngine.ts` is the single function to change when wiring S3 or NAS. Uploads are capped at 5 MB client-side because of this.
- **Nav highlighting uses exact/sub-path matching**, not `startsWith` — otherwise `/forms` lights up while on `/form-submissions`.
- **A schema `component` name can collide with orval's generated response validators.** A schema named `SearchResponse` collided with the auto-generated `SearchResponse` validator for the `search` operation, failing `tsc --build` on a duplicate export. Named it `GlobalSearchResponse` instead. When adding a schema, avoid `<OperationId>Response`/`<OperationId>Body`/`<OperationId>Params` shapes.
- **`lib/integrations/*` is a reserved workspace glob** for future per-external-API adapter packages (one government API each). The reusable engine lives at `lib/integration-engine/`, deliberately outside that namespace — don't move it in. Add adapters as `lib/integrations/<name>/` alongside it.
- **Report data sources are a whitelist, not the schema.** A report can only reference a source in `lib/report-engine/src/sources.ts` and the columns that source declares. Adding a source is a security-sensitive change: it MUST declare a `tenantColumn` (the module self-checks this at load and throws otherwise), because the compiler relies on it to scope every query. Never let a report reference a raw table or column.
- **The report scheduler is a model, not a running cron.** `runDueSchedules()` is the entry point a worker/cron calls; this deployment ships no timer — the same honest boundary as the notification/webhook workers. `nextRunAt` is precomputed so "what's due" is an indexed comparison.
- **A schema `component` named `<OperationId>Response` collides with orval's generated response validator.** The run-result schema is `ReportRunResult`, not `RunReportResponse`, for this reason — same class of collision as the earlier `SearchResponse` → `GlobalSearchResponse` rename.
- **Two queue workers share one backoff formula.** `retryPolicy.backoffMs` (integrations) and `notificationEngine.backoffMs` are intentionally identical. Change both together or they'll drift.
