# GroundOpApps — iOS + Android Mobile

React Native (Expo) monorepo for the GroundOps mobile apps.

- **`mobile/`** — the Expo project (one codebase, compiles to both iOS and Android)
- **`scripts/`** — `pull-vercel-env.sh`, `sync-from-web.js`
- **`.github/workflows/`** — auto-build on web change
- **`MOBILE_APP_BUILD_PROMPT.md`** — the authoritative 1000+ line spec

## Start here
```bash
cd mobile
npm install --legacy-peer-deps
../scripts/pull-vercel-env.sh   # (after vercel + eas login)
npx expo start
```

Read `mobile/README.md` for full details.

## Shared backend
Web, iOS, and Android all use the **same** Firebase project (`groundopss`), same Firestore,
same Auth, same Storage, same Cloudinary, same Stripe, same Mailgun, same SendBlue, same
Supabase backup, and the same `CRON_SECRET` (server-only — mobile never sees it).
