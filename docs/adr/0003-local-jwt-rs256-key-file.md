# ADR 0003: Validate JWTs against a local RSA public key file, not OIDC discovery against Keycloak

## Status
Accepted

## Context
`spring-order-api` runs a real Keycloak (`docker-compose.yml` there provisions a realm via
`keycloak/realm-export.json`) and its `SecurityConfig` does OIDC discovery against it
(`JwtDecoders.fromIssuerLocation(issuerUri)`). This project's `JwtStrategy`
(`src/common/auth/jwt.strategy.ts`) does neither: it reads an RSA public key from
`JWT_PUBLIC_KEY_PATH` synchronously at construction and validates tokens against it directly with
`passport-jwt`, with no issuer/JWKS-endpoint discovery call at all. Tests
(`test/order-flow.e2e-spec.ts`, `test/hardening.e2e-spec.ts`) generate their own throwaway RSA key
pair and sign tokens locally - no Keycloak container is ever started for this project's test suite.

## Decision
Keep local-key validation. Nothing in this repository issues tokens (there's no `/auth/login`
endpoint) - whatever issues tokens in a real deployment is expected to sign with the private half
of the key `JWT_PUBLIC_KEY_PATH` points at, out of band.

## Alternatives considered
- **Run Keycloak here too, mirroring `spring-order-api`**: `spring-order-api` already demonstrates
  wiring a real identity provider with OIDC discovery once - repeating that setup (a
  `docker-compose` service, a realm export, `JwksClient`/discovery config) in this port would add
  the same operational weight (a JVM-based Keycloak container is not light) without demonstrating
  anything new about NestJS specifically; `passport-jwt` + a static key is the more idiomatic
  minimal choice for a NestJS resource server that doesn't also need to run an IdP.
- **Symmetric secret (HS256) instead of RSA (RS256)**: would remove the "public key file" plumbing
  entirely, but throws away the one property RS256 actually demonstrates here - that the API only
  needs the *public* half of the signing key, matching how a real deployment would consume tokens
  issued by a separate identity provider it doesn't share a secret with.

## Consequences
- Positive: the whole test suite boots the app with zero external identity dependency (just the
  Postgres Testcontainer) - faster and simpler than standing up Keycloak per test run.
- Negative accepted: there is no live demonstration of OIDC discovery, JWKS rotation, or
  Keycloak-specific realm/role provisioning in this project - that's intentionally left to
  `spring-order-api`, the one implementation in this portfolio where it's shown end to end.
