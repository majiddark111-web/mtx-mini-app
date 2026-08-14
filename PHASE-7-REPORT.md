# MTX Phase 7 — Admin Panel

## Delivered

- Separate admin credential + OTP verifier; Telegram player authentication is not reused
- Separate admin JWT secret, 15-minute token, `role=admin`, and `scope=mtx:admin`
- Server-side RBAC on every `/api/admin/*` endpoint
- Dashboard statistics and audit-log summary
- Users list and ban/unban controls with player-request enforcement
- Payment, catalog item, notification, event, and log APIs
- Notification creation and event/promotion creation
- Dedicated `/admin/login` and protected `/admin` dashboard
- PostgreSQL schemas for bans, audit logs, notifications, and events

## Verification

- Frontend/backend TypeScript: passed
- ESLint: passed
- Tests: 35 passed
- Player JWT against admin dashboard: rejected with 403
- Separate verified admin login: accepted
- Banned player session request: rejected with 403

## Production requirements

- Bind `ADMIN_AUTH` to an identity provider that verifies password and TOTP/WebAuthn; never put operator credentials in environment variables or frontend code.
- Set an independent random `ADMIN_JWT_SECRET` of at least 32 characters and rotate it separately from player JWTs.
- The supplied admin runtime store is in-memory for local operation. Wire it to the supplied PostgreSQL tables before multi-instance deployment.
- Add CSRF/origin policy review, alerting, audit-log retention, and step-up authentication for destructive or high-value operations.

Phase 7 authorization DoD is met: a non-admin JWT cannot access any admin endpoint. Operational durability requires the production database binding.
