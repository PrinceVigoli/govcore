# Changelog

All notable changes to this project are documented here. Entries are grouped
by the "Book"/sprint they shipped under -- see `docs/architecture.md` for
what each Book owns and `replit.md` for the underlying decisions.

## [Unreleased]

### Added

- `lib/queue-utils` (`@workspace/queue-utils`): shared exponential-backoff
  and stale-processing-reclaim logic, extracted out of the Notification and
  Integration engines so the two queue workers can no longer drift apart
  (Sprint 2A, Task 3 coupling/dedup pass).
- Real content for `docs/architecture.md`, `docs/api.md`, `docs/database.md`,
  `docs/deployment.md`, `docs/development.md`, and `docs/roadmap.md`
  (previously one-line placeholders).

### Fixed

- Undefined-name crash for Clerk users without a `firstName`/`lastName`
  (avatar initials and search now fall back to the user's email). See
  `HOTFIX-NOTES.md`.

### Known gaps (tracked, not yet started)

- No email/SMS/push provider wired into `notificationEngine.ts`'s `deliver()`.
- No running cron for `runDueSchedules()` (Report Engine schedules).
- `authorization`, `search`, `integrations`, and `reports` engine-test suites
  aren't yet listed in `.github/workflows/ci.yml`, though all nine pass
  locally.

## [0.3.0-alpha]

### Added

- **Book 05 -- Workflows.** Versioned state-machine definitions; instances,
  task inbox, approve/reject actions, history.
- **Book 06 -- Rules.** Versioned boolean condition trees with actions,
  priority ordering, and an evaluation sandbox at `/rules/evaluate`.
- **Book 07 -- Forms.** Versioned section/field/validation trees; a dynamic
  renderer covering 17 field types; draft/submitted/synced submissions.
  Submitting a form can start a workflow instance.
- **Book 08 -- Notifications.** Versioned message templates with
  `{{variable}}` placeholders and live preview; recipient resolution by
  user, role, or raw address; per-recipient delivery queue with exponential
  backoff and a dead-letter state; per-user channel preferences.
- **Book 09 -- Documents.** Versioned generation from templates; forward-only
  lifecycle (draft -> generated -> reviewed -> approved -> signed -> archived
  -> retained -> disposed); electronic signatures bound to a version's
  content hash; public QR verification; file attachments shared with Book 07.
- **Book 10 -- Reports.** Reports defined as data over a whitelisted
  data-source catalog; a pure spec compiler producing parameterized,
  unconditionally tenant-scoped SQL; JSON/CSV output; immutable published
  versions; run history; a cron schedule model.
- Authentication migrated from local JWT/bcrypt to Clerk; RBAC authorization
  logic extracted into a pure, independently tested module
  (`authorization.ts`, 51 tests).
- `tests/engines/` grew to 9 database-free suites (rules, forms,
  notifications, documents, auth, authorization, search, integrations,
  reports) covering the decision logic behind every shipped engine.

## [0.2.0-alpha]

### Added

- Engineering Foundation
- Search Engine
- Integration Engine
- CI/CD
