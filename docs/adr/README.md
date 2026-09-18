# Architecture Decision Records

Log of the non-obvious technical decisions made in this project — context, what was decided,
alternatives discarded, and consequences (including the ones left deliberately unmitigated).

- [0001 — Binary RBAC (ADMIN/USER), not per-resource permissions](0001-binary-rbac-admin-user.md)
- [0002 — In-process event + best-effort publish, not a transactional outbox](0002-no-transactional-outbox.md)
- [0003 — Validate JWTs against a local RSA public key file, not OIDC discovery against Keycloak](0003-local-jwt-rs256-key-file.md)
