# Book 10 (Report Engine) + Auth Authorization tests — change bundle

This zip mirrors your `govcore` repo paths. Extract it over the root of your
clone (it only adds/overwrites the files below; it touches nothing else).

## What's in here

**Book 10 — Report Engine** (new module):
- `lib/db/src/schema/report*.ts`, `scheduledReports.ts` — 4 new tables
- `lib/report-engine/` — new `@workspace/report-engine` package (pure compiler,
  csv, cron schedule, service)
- `artifacts/api-server/src/routes/reports.ts` — 13 endpoints
- `artifacts/govcore/src/pages/reports/` — list + builder UI
- `lib/api-spec/openapi.yaml` + regenerated `lib/api-zod` / `lib/api-client-react`
- `tests/engines/reports.test.ts` — 64 tests

**Auth authorization** (from the prior task):
- `artifacts/api-server/src/lib/authorization.ts` — extracted pure RBAC logic
- `artifacts/api-server/src/lib/auth.ts` — now imports it (behavior-preserving)
- `tests/engines/authorization.test.ts` — 51 tests

**Wiring / docs** (modified): workspace `tsconfig.json`, api-server
`package.json` + `tsconfig.json`, `routes/index.ts`, frontend `App.tsx` +
`Shell.tsx`, `lib/db/src/schema/index.ts`, `pnpm-lock.yaml`, `replit.md`,
`tests/engines/README.md`.

## Apply

```bash
cd /path/to/govcore
unzip -o Gov-Core-Suite-book10.zip     # from repo root; paths already match
pnpm install                           # links the new @workspace/report-engine
pnpm run typecheck                     # expect clean
git checkout -b book10-report-engine
git add -A
git commit -m "feat(reports): add Book 10 Report Engine + auth authorization tests"
```

Note: `pnpm-lock.yaml` is included because the new workspace package changes it.
If your local lockfile differs, prefer running `pnpm install` yourself and
committing the lockfile it produces.
