# How to apply this bundle

This zip mirrors the exact repo paths. Extract it and copy each file over
the matching path in your local `govcore` clone (overwrite existing files,
create the two new ones).

## 1. Files to copy in (14 modified + 2 new)

Modified (overwrite):
```
.replit
artifacts/api-server/package.json
artifacts/api-server/src/app.ts
artifacts/api-server/src/lib/auth.ts
artifacts/api-server/src/routes/auth.ts
artifacts/govcore/package.json
artifacts/govcore/src/App.tsx
artifacts/govcore/src/components/layout/Navbar.tsx
artifacts/govcore/src/components/layout/Shell.tsx
artifacts/govcore/src/pages/login.tsx
lib/api-client-react/src/custom-fetch.ts
lib/db/src/schema/users.ts
package.json
pnpm-workspace.yaml
```

New (create):
```
artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts
artifacts/govcore/public/logo.svg
```

## 2. File to delete

This one is superseded by Clerk's client SDK and is not in this bundle —
delete it manually from your clone:
```
artifacts/govcore/src/lib/auth.ts
```

## 3. Command-line way (if you'd rather script it)

From your `govcore` repo root, with this bundle extracted next to it as
`changed-files/`:

```bash
rsync -av changed-files/ ./ --exclude README-APPLY.md
rm -f artifacts/govcore/src/lib/auth.ts
pnpm install                # regenerates pnpm-lock.yaml for the new Clerk deps
git checkout -b clerk-auth-migration
git add -A
git commit -m "feat(auth): migrate authentication from local JWT/bcrypt to Clerk"
git push origin clerk-auth-migration
```

## 4. Env vars needed after this

- `CLERK_SECRET_KEY` (server)
- `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` (client)
- `VITE_CLERK_PROXY_URL` (optional, only for the production Clerk proxy path)
