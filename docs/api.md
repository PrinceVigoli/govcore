# API

GovCore's HTTP API is REST, described API-first with OpenAPI. The spec is the
contract; both the server-side validation and the frontend client are
generated from it.

## Source of truth

- **`lib/api-spec/openapi.yaml`** -- every path, schema, and operation is
  defined here first. Never hand-edit generated output to work around a gap
  in the spec; add it to `openapi.yaml` and regenerate instead.
- Regenerate with:

  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```

  This runs Orval and produces:
  - **`lib/api-zod`** -- generated Zod v3 request/response schemas, imported
    by both the API server routes and the frontend.
  - **`lib/api-client-react`** -- generated TanStack Query hooks used by the
    frontend to call the API.

- After codegen, run `pnpm run typecheck:libs` (or `tsc --build`). Orval's
  `clean` step wipes `lib/api-zod/dist` and `lib/api-client-react/dist`;
  until they're rebuilt, downstream packages report a confusing `TS6305`
  "not built from source file" error that looks like real breakage.

## Adding an endpoint

1. Add the path/operation and any new schemas to `openapi.yaml`, following an
   existing module's section (e.g. `/rules`) for shape and naming.
2. Run codegen (above), then `pnpm run typecheck:libs`.
3. Implement the route in `artifacts/api-server/src/routes/<module>.ts`:
   validate the request with the generated schema, call the engine function,
   serialize the response. Wire the router into
   `artifacts/api-server/src/routes/index.ts`.
4. If the frontend needs it, consume the generated hook from
   `@workspace/api-client-react` in the relevant `pages/` file.

## Naming pitfalls worth knowing before you hit them

- **A schema named `<OperationId>Response`, `<OperationId>Body`, or
  `<OperationId>Params` can collide with Orval's own generated validator
  name** for that operation, failing `tsc --build` on a duplicate export.
  This has happened twice: a `SearchResponse` schema was renamed
  `GlobalSearchResponse`, and a report run-result schema is `ReportRunResult`
  rather than `RunReportResponse`, for exactly this reason.
- **`format: uuid` breaks codegen.** Orval emits `zod.uuid()` (a Zod v4 API),
  but this workspace pins Zod v3 (`z.string().uuid()`). Use a plain
  `type: string` for UUID path/query parameters instead.
- **An operation can't declare both path and query parameters and expect
  distinct generated types** -- Orval names both `<Operation>Params`, so they
  collide at the export level. Every existing endpoint in this spec uses one
  kind of parameter or the other.

## Auth

Requests are authenticated via Clerk (`@clerk/express` on the server). Route
handlers use `requireAuth` and check permissions through
`artifacts/api-server/src/lib/authorization.ts`'s RBAC predicate (superadmin
bypass, `*` module/action wildcards, `manage` implies `read` but not the
reverse, fail-closed on no matching grant).

## Testing the contract

There's no live-request test suite yet; the API surface is exercised through
the database-free engine tests in `tests/engines/` (the decision logic each
route delegates to) plus manual/frontend usage against a real Postgres
instance. See `docs/development.md` for running those.
