# nest-order-api

[![CI](https://github.com/ronybrand/nest-order-api/actions/workflows/ci.yml/badge.svg)](https://github.com/ronybrand/nest-order-api/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ronybrand/nest-order-api/actions/workflows/codeql.yml/badge.svg)](https://github.com/ronybrand/nest-order-api/actions/workflows/codeql.yml)

Port of the order management domain (`Customer` → `Order` → `Item`) to **NestJS +
TypeORM + PostgreSQL**, based on the Java/Spring Boot reference implementation
(`java-order-api`).

## Domain

Simple order management domain with two aggregates:

```
Customer (1) ──< Order (1) ──< Item
```

- **Customer**: the customer's registration data.
- **Order** (aggregate root): a customer's order, with a list of items and a computed
  total.
- **Item**: an order line (free-text description, no product catalog).

Out of scope: payment, inventory, product catalog, shipping.

### Entities

#### Customer

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | generated |
| `name` | string | required |
| `taxId` | string | required, **unique**, 5–20 chars, pattern `^[A-Za-z0-9./-]{5,20}$` |
| `passportNumber` | string | optional, **unique** when present, ICAO pattern `^[A-Z0-9]{6,9}$` |
| `email` | string | required, pattern `^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$` |
| `createdAt`, `updatedAt` | datetime | audit |
| `createdBy`, `updatedBy` | string | audit (user or "system") |
| `deletedAt`, `deletedBy` | datetime / string | soft-delete (null = active) |

- Identity equality by `taxId` (careful: mutable field — don't rely on it as a stable
  collection key after updates).
- Sensitive fields (e.g. `taxId`, `passportNumber`, `email` — the list grows as the
  domain evolves, not limited to these) never appear in plaintext in logs; see the
  "Sensitive data" section below.

#### Order (aggregate root)

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | generated |
| `customer` | reference to Customer | required |
| `items` | list of Item | composition — lifecycle tied to the Order |
| `total` | decimal | **derived**, recalculated on every item mutation |
| `status` | `OrderStatus` enum | default `OPEN` |
| `version` | int/long | optimistic concurrency control |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | — | audit |
| `deletedAt`, `deletedBy` | — | soft-delete |

- Identity equality by `id`.
- **Optimistic concurrency**: every write that changes `status` or `items` must
  check/increment `version`; a concurrent conflict is reported as a conflict error
  (409).

#### Item (child of Order)

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | generated |
| `order` | reference to the parent Order | required |
| `description` | string | required, non-blank, max. 255 chars |
| `unitPrice` | decimal | required, positive, max. 2 decimal places |
| `quantity` | integer | required, positive |

- Identity equality by `id` (not by description — descriptions can repeat within
  the same order).
- Item subtotal = `unitPrice * quantity` (computed, not persisted).

### OrderStatus enum

```
OPEN → CONFIRMED → CANCELED
OPEN → CANCELED
```

- `OPEN`: initial state. Items can be added/changed/removed. Can transition to
  `CONFIRMED` or `CANCELED`.
- `CONFIRMED`: items frozen (not editable). Can only transition to `CANCELED`.
- `CANCELED`: terminal state. No further transitions allowed.

### Business rules / invariants

1. **Total calculation**: `order.total = Σ (item.unitPrice × item.quantity)` over all
   current items. Recalculated after any item creation/update/removal.
2. **Items editable only while order is `OPEN`**: adding, changing quantity, or
   removing an item on a `CONFIRMED`/`CANCELED` order is a validation error.
3. **Confirm order** (`OPEN → CONFIRMED`): fails if the current status isn't `OPEN`,
   or if the order has no items.
4. **Cancel order** (`OPEN|CONFIRMED → CANCELED`): fails if the current status is
   already `CANCELED`.
5. **Create order**: requires an existing `customerId`; builds the items from the
   request; computes the initial total.
6. **Item limit**: max. 200 items per order on creation.
7. **Customer uniqueness**: `taxId` unique; `passportNumber` unique when provided
   (blank/absent doesn't count toward the check).
8. **Customer deletion blocked**: you can't delete a customer that has any
   non-deleted order (soft-deleted doesn't count).
9. **Delete is always soft-delete**: for both aggregates — never a physical
   removal; records with `deletedAt` set are excluded from every default query.
10. **Optimistic concurrency on Order**: conflicting concurrent mutations fail with
    a conflict error, they don't silently overwrite each other.

### Domain events

#### OrderStatusChangedEvent

Fired at the end of `confirm()` and `cancel()` (only if the customer has a
non-empty email).

| Field | Type |
|---|---|
| `orderId` | UUID |
| `customerEmail` | string |
| `customerName` | string |
| `oldStatus` | OrderStatus |
| `newStatus` | OrderStatus |
| `totalAmount` | decimal |
| `changedAt` | datetime |

`OrderStatusListener` (`EventEmitter2`, in-process) publishes the event to the RabbitMQ
queue `order.status.changed` (`RabbitMqPublisher`); `RabbitMqConsumer` consumes it —
embedded in the same API process, reconnecting with background retry if the broker
goes down, without crashing boot or the e2e tests — and sends the email via
`EmailService` (`nodemailer`/SMTP), rendered with Handlebars from
`src/notification/templates/order-status-changed.hbs`. In dev/local, `SMTP_HOST` points
to Mailpit (`docker compose up mailpit`) — no real email goes out, inspectable at
`http://localhost:8025`. A malformed message or one missing required fields goes
straight to `order.status.changed.dlq` (dead-letter queue); a transient send failure
(e.g. SMTP down) is retried with backoff up to `MAX_RETRIES` attempts before also
landing in the DLQ — no message is ever redelivered in an infinite loop.

### Error catalog

**Validation (400)**
- `VALIDATION_MISSING_FIELD` — required field missing.
- `VALIDATION_INVALID_CUSTOMER_ID` — nonexistent customerId when creating an order.
- `VALIDATION_ORDER_NOT_EDITABLE` — attempt to edit items of a non-`OPEN` order.
- `VALIDATION_ORDER_EMPTY` — attempt to confirm an order with no items.
- `VALIDATION_ORDER_INVALID_STATUS_TRANSITION` — disallowed status transition.
- `VALIDATION_INVALID_FILTER_VALUE` / `VALIDATION_INVALID_SORT_FIELD` — invalid search
  parameters.
- `VALIDATION_CONSTRAINT_VIOLATION` — generic field validation violation.

**Not found (404)**
- `RESOURCE_NOT_FOUND_CUSTOMER`
- `RESOURCE_NOT_FOUND_ORDER`
- `RESOURCE_NOT_FOUND_ITEM`

**Conflict (409)**
- `VALIDATION_CUSTOMER_TAXID_EXISTS` — duplicate taxId.
- `VALIDATION_CUSTOMER_PASSPORT_EXISTS` — duplicate passportNumber.
- `VALIDATION_CUSTOMER_HAS_ORDERS` — deleting a customer with associated orders.
- `CONFLICT_CONCURRENT_MODIFICATION` — optimistic concurrency conflict.
- `CONFLICT_DATA_INTEGRITY_VIOLATION` — storage integrity violation.

**Other**
- `AUTHORIZATION_ACCESS_DENIED` — not authorized for the operation.
- `INTERNAL_ERROR` — unexpected error.

### Sensitive data

Every field classified as PII/secret (not just `taxId`/`passportNumber`/`email` — any
new field that fits this category) is decorated with `@Sensitive()`
(`src/common/security/sensitive.decorator.ts`) and must never be logged in plaintext:
`maskSensitive()` redacts the whole field (`***`) for structured logging of an
entity/DTO, and `maskEmail()` does partial masking (`a***@example.com`) for cases
where the log still needs to be minimally traceable (e.g. `EmailService`, see the
`OrderStatusChangedEvent` event above). HTTP response serialization stays separately
protected by the response DTOs, which only copy the fields meant to actually reach
the client.

## Architecture

Package-by-feature: each domain lives in `src/<domain>/` with its own entity, DTOs,
service, controller and module. Shared infrastructure (generic search/filtering,
exceptions, audit/soft-delete, authentication/roles, sensitive-data masking) lives in
`src/common/`.

Full development conventions (the "how" of each layer) live in the
[`nestjs-feature`](.claude/skills/nestjs-feature/SKILL.md) skill; `AGENTS.md` carries
the summarized checklist to validate before any change. The skill is versioned in a
separate private repository — it isn't included in this public repo.

## Running locally

```bash
cp .env.example .env
docker compose up -d          # starts local PostgreSQL, RabbitMQ and Mailpit
npm install
npm run migration:run         # applies the schema (customers/orders/items)
npm run start:dev
```

- RabbitMQ Management UI (guest/guest): `http://localhost:15672`
- Mailpit Web UI (inspect received emails): `http://localhost:8025`

The API comes up at `http://localhost:3000`. Authentication is via JWT (RS256)
validated against `JWT_PUBLIC_KEY_PATH`/`JWT_AUDIENCE` — point it at your
environment's OIDC provider (e.g. Keycloak) before calling any protected endpoint.

## Tests and quality

```bash
npm run test        # unit tests (*.service.spec.ts) — no Docker
npm run test:e2e     # end-to-end — requires Docker (Testcontainers)
npm run verify       # single local gate: lint (no warnings) → build → coverage → e2e
```

`npm run verify` reproduces `ci.yml` in a single local command. Minimum coverage is
configured in `coverageThreshold` (`package.json`): branches 85% / functions 90% /
lines 90% / statements 90%.

## Endpoints

### `/orders` (requires an authenticated user)

| Method | Path | Description |
|---|---|---|
| POST | `/orders` | Create order |
| GET | `/orders/search` | Search orders (query params) |
| POST | `/orders/search` | Search orders (body) |
| GET | `/orders/{id}` | Get order by id |
| DELETE | `/orders/{id}` | Delete (soft) order |
| POST | `/orders/{id}/items` | Add item |
| PATCH | `/orders/{orderId}/items/{itemId}` | Update item quantity |
| DELETE | `/orders/{orderId}/items/{itemId}` | Remove item |
| POST | `/orders/{id}/confirm` | Confirm order |
| POST | `/orders/{id}/cancel` | Cancel order |

### `/customers` (mutations require `ROLE_ADMIN`; reads require an authenticated user)

| Method | Path | Description |
|---|---|---|
| POST | `/customers` | Create customer (admin) |
| GET | `/customers/search` | Search customers (query params) |
| POST | `/customers/search` | Search customers (body) |
| GET | `/customers/{id}` | Get customer by id |
| PUT | `/customers/{id}` | Update customer (admin) |
| DELETE | `/customers/{id}` | Delete (soft) customer (admin) |
