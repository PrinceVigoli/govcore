# Hotfix: undefined name crash (Clerk users without first/last name)

Two files, both fixing the same latent bug exposed by the Clerk auth migration:
a Clerk user may have no firstName/lastName, so `user.firstName[0]` threw
"Cannot read properties of undefined (reading '0')".

- artifacts/govcore/src/components/layout/Shell.tsx
    - avatar initials now fall back to the email's first letter
    - display name falls back to email when no name is set
- artifacts/govcore/src/pages/users/list.tsx
    - search filter no longer assumes firstName/lastName exist
    - avatar initials guarded the same way

Copy both files over the matching paths in your clone. No install needed
(no dependency changes). Then: pnpm run typecheck  (expect clean).
