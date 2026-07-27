# Deployment

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. Enable corepack, set up Node 24, install with `pnpm install --frozen-lockfile`.
2. `pnpm run lint`
3. `pnpm run typecheck` (full workspace: `tsc --build` across `lib/*`, then
   `typecheck` in each `artifacts/*` and `scripts` package)
4. Database-free engine tests, run individually via `tsx`
5. `pnpm run build`, with `PORT`/`BASE_PATH` placeholders set so the
   frontend's Vite build succeeds without a real deployment environment (see
   the `development.md` gotcha on this)

> The CI engine-test step currently lists `rules`, `forms`, `notifications`,
> `documents`, and `auth` explicitly. `authorization`, `search`,
> `integrations`, and `reports` exist under `tests/engines/` and pass
> locally, but aren't yet wired into `ci.yml` -- worth adding as a follow-up
> so CI covers the same 9 suites `tests/engines/README.md` documents.

## Building the API server

```bash
pnpm --filter @workspace/api-server run build
```

This runs `artifacts/api-server/build.mjs`, which bundles `src/index.ts` with
esbuild into a single ESM file at `dist/index.mjs` (format: `esm`,
`outExtension: { ".js": ".mjs" }`). Packages that can't be safely bundled
(native modules, packages that use path traversal to load sibling files at
runtime) are externalized rather than inlined -- see the `external` list in
`build.mjs`.

Run the built server with:

```bash
pnpm --filter @workspace/api-server run start          # node dist/index.mjs
pnpm --filter @workspace/api-server run start:local     # same, loading .env via dotenv-cli
```

## Building the frontend

```bash
pnpm --filter @workspace/govcore run build
```

The Vite config reads `PORT` and `BASE_PATH` **at build time**; both must be
set in the environment or `vite build` fails before it gets to bundling
anything. This is why CI exports placeholder values for the build step even
though nothing is actually served in CI.

## Required environment variables

| Variable       | Used by                      | Notes                                      |
| -------------- | ---------------------------- | ------------------------------------------ |
| `DATABASE_URL` | API server, `lib/db` scripts | Postgres connection string                 |
| `PORT`         | `artifacts/govcore` build    | Read at Vite build time, not just runtime  |
| `BASE_PATH`    | `artifacts/govcore` build    | Same -- required even for a CI/no-op build |

## Full local pipeline

```bash
pnpm install
pnpm run lint
pnpm run typecheck
npx tsx tests/engines/<suite>.test.ts   # any/all of the 9 suites, no DB needed
pnpm run build
```

There is no infra-as-code or container manifest in this repo yet (no
Dockerfile, no Kubernetes/Helm chart) -- deployment today is "build the two
artifacts and run/serve them," with the environment variables above supplied
by whatever platform hosts them.
