# ADR 0001: Binary RBAC (ADMIN/USER), not per-resource permissions

## Status
Accepted

## Context
`CustomerController`/`OrderController` need to tell apart who can read data from who can mutate
it. The domain (`DOMAIN.md`) has no concept of ownership, tenancy, or a customer acting on their
own record - it's an internal order-management API, not a customer-facing self-service one.

## Decision
Two roles only, read from the JWT's `realm_access.roles` claim (same claim shape
`spring-order-api`'s Keycloak integration produces, even though this app validates the token
locally against a static RSA public key rather than doing OIDC discovery against a real Keycloak -
see ADR 0003): `USER` can call every `GET` endpoint, `ADMIN` is additionally required for every
mutation (`POST`/`PUT`/`DELETE`). Enforced via `@UseGuards(JwtAuthGuard, RolesGuard)` at the
controller level (default `@Roles(Role.USER, Role.ADMIN)`) with a per-method `@Roles(Role.ADMIN)`
override on each mutating handler - see `customer.controller.ts`/`order.controller.ts`.

## Alternatives considered
- **Per-resource/ownership-based authorization** (a `USER` can only mutate their own orders):
  doesn't map to the actual domain - there's no notion of a customer being the same principal as
  an API caller. Adding it would be modeling a use case this API doesn't have.
- **A single role (any authenticated caller can do anything)**: simpler, but throws away the
  ability to demonstrate/exercise `RolesGuard` and a read-vs-write authorization boundary, which is
  exactly the kind of access-control granularity a backend-focused portfolio piece should show.
- **Fine-grained permissions (e.g. `orders:write`, `customers:delete`)**: proportional to a
  multi-team/multi-client API where different callers need different slices of the same resource.
  This API has exactly two kinds of caller in practice (an operator UI and a read-only reporting
  consumer, conceptually) - two roles already capture that distinction without inventing a
  permission model nothing in the domain asks for.

## Consequences
- Positive: authorization logic stays in one guard + one decorator, easy to audit by reading the
  two controllers top to bottom.
- Negative accepted: adding a third kind of caller (e.g. a read-only auditor role) later means
  touching every controller method's `@Roles(...)` list one by one - there's no role hierarchy or
  inheritance. Acceptable given the API's actual number of distinct callers today is two.
