# Security Policy

GovCore handles data for Philippine local government units, including
citizen records, identity data, and audit trails. Treat security reports as
high priority.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately to the maintainers listed in `CODEOWNERS`.

> TODO(maintainers): replace this with a dedicated security contact —
> ideally a `security@<org-domain>` mailbox or GitHub's private vulnerability
> reporting feature (Settings → Security → "Report a vulnerability") — before
> this repo has external contributors.

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is very helpful)
- Affected package(s)/route(s) (e.g. `artifacts/api-server/src/routes/...`,
  `lib/db/src/schema/...`)
- Any relevant logs or stack traces (redact tenant/citizen data)

We aim to acknowledge reports within 3 business days.

## Scope

In scope:

- `artifacts/api-server` — the Express API (auth, tenants, identity,
  workflows, rules, forms, notifications, documents)
- `lib/db` — schema and query layer
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — API contract and
  generated clients
- `artifacts/govcore` — the citizen/staff-facing frontend

Out of scope:

- `artifacts/mockup-sandbox` — design/prototyping sandbox, not deployed with
  production data
- Denial-of-service via brute-force volume alone (report logic flaws, not
  raw traffic)

## Areas of particular sensitivity

- **Authentication & authorization** (`routes/auth.ts`, roles/permissions
  tables) — privilege escalation, tenant-isolation bypass.
- **Audit logs** (`auditLogs` schema, `documentAccessLogs`) — must remain
  append-only and tamper-evident.
- **Document signatures** — a signature binds to a specific version's content
  hash by design (see `replit.md` architecture decisions); any path that lets
  a regenerated document inherit an old signature is a security bug, not
  just a logic bug.
- **Multi-tenancy** — every query that touches tenant-scoped data should be
  scoped by tenant. A missing tenant filter is a cross-tenant data leak.

## Supply chain

`pnpm-workspace.yaml` enforces a minimum npm package release age
(`minimumReleaseAge`) as a defense against supply-chain attacks. Don't
disable this setting or add packages to `minimumReleaseAgeExclude` without
sign-off from a `CODEOWNERS` reviewer — see the comment block at the top of
`pnpm-workspace.yaml` for the rationale.

## Disclosure

We'll credit reporters (unless anonymity is requested) once a fix ships and
coordinate on public disclosure timing.
