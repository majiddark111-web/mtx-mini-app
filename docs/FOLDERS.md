# Folder guide

| Path | Responsibility |
|---|---|
| `src/api` | Axios instance, authentication and request-signing interceptors |
| `src/components` | Reusable visual components; game, navigation, auth and common UI |
| `src/pages` | Route-level screens, loaded lazily |
| `src/hooks` | Client lifecycle and game interaction orchestration |
| `src/services` | Telegram, API, commerce, social, admin, wallet and storage boundaries |
| `src/store` | Zustand store and domain slices |
| `src/types` | Shared frontend TypeScript models |
| `src/constants` | Stable client constants |
| `src/layouts` | Route shells and global lifecycle hooks |
| `src/assets` / `public` | Asset references and static files |
| `src/animations` / `src/styles` | Motion rules and design tokens |
| `src/utils` | Pure formatting helpers |
| `server/src/app.ts` | HTTP routing, middleware and composition-independent API behavior |
| `server/src/gameEngine.ts` | Server-authoritative tap, energy and offline-profit rules |
| `server/src/requestSecurity.ts` | Session key derivation, HMAC verification and replay protection |
| `server/src/productionStorage.ts` | Redis/PostgreSQL game and leaderboard adapters |
| `server/src/socialPersistence.ts` | PostgreSQL social claim persistence |
| `server/src/worker.ts` | Production binding composition and scheduled flush |
| `server/migrations/` | Ordered, checksummed PostgreSQL migrations |
| `server/nodeInfrastructure.mjs` | Pooled PostgreSQL and TLS Redis provider |
| `server/productionServer.mjs` | Persistent Node API entry point |
| `economy` | Versioned, runtime-tunable economy configuration |
| `PHASE-*-REPORT.md` | Verified milestone reports |

Business rules belong in server engines/services, not React pages. Provider-specific SDK code belongs behind the interfaces in `server/src/types.ts`. New UI routes should be lazy imports in `src/router/index.tsx`.
