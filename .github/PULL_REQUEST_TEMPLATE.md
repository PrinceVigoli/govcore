## What does this change do?

<!-- One or two sentences. Link the issue if there is one. -->

## Why?

<!-- The context a reviewer needs that isn't obvious from the diff. -->

## Area(s) touched

- [ ] api-server (routes/lib)
- [ ] db (schema/migrations)
- [ ] api-spec / generated clients
- [ ] govcore frontend
- [ ] engines (rules/forms/notifications/documents)
- [ ] CI / tooling / repo standards

## Checklist

- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:check` passes
- [ ] `pnpm run typecheck` passes
- [ ] Relevant `tests/engines/*.test.ts` pass (and were updated if engine
      behavior changed)
- [ ] `pnpm run build` passes
- [ ] If `lib/db/src/schema/` changed: a migration was generated (see
      `lib/db/MIGRATIONS.md`) and committed alongside this PR
- [ ] If `lib/api-spec/openapi.yaml` changed: ran
      `pnpm --filter @workspace/api-spec run codegen` and
      `pnpm run typecheck:libs`, and committed the regenerated output
- [ ] No hand-edits to generated output (`dist/`, `lib/api-zod/src/generated`,
      `lib/api-client-react/src/generated`)

## Risk / rollback

<!-- What's the blast radius if this is wrong? How would you roll it back? -->
