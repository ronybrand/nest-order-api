# ADR 0002: In-process event + best-effort publish, not a transactional outbox

## Status
Accepted

## Context
`spring-order-api` (the reference implementation this project ports - see README) uses a
transactional outbox: the status-changed event is written to an `outbox_events` table in the same
database transaction as the order update, and a separate poller publishes it to RabbitMQ,
guaranteeing the event is never lost even if the broker is down at commit time.

This project does not have that guarantee. `OrderService.changeStatus()` emits
`ORDER_STATUS_CHANGED_EVENT` via `@nestjs/event-emitter` (in-process, after the DB transaction
commits); `OrderStatusListener` catches it and calls `RabbitMqPublisher.publish()` inside a
try/catch that only logs on failure (see `order-status.listener.ts`). If RabbitMQ is unreachable
at that moment, the notification is silently dropped - there is no retry-from-database and no
outbox row to reprocess later.

## Decision
Keep the simpler in-process-event-then-publish path rather than porting the outbox pattern.

## Alternatives considered
- **Port the transactional outbox from `spring-order-api`**: would require adding an
  `outbox_events` table + migration, a poller service, and the `SELECT ... FOR UPDATE SKIP LOCKED`
  claiming logic the Java version uses. This is the architecturally more correct choice for a
  production system that cannot tolerate lost notifications, and is deliberately demonstrated once,
  well, in the reference implementation - porting it a second time to this NestJS version
  would repeat the same lesson without adding new signal about NestJS/TypeORM idioms, which is
  the actual point of this port (see `DOMAIN.md`'s framing: "reimplementação em outras stacks").
- **Retry with backoff on the publish call itself** (no outbox, just retry `publish()` a few times
  before giving up): would reduce, but not eliminate, the lost-notification window (a broker outage
  longer than the retry budget still loses the event), for meaningfully more code than the current
  one try/catch. Not implemented; the failure mode is the same class of "eventually consistent,
  best-effort" as today, just with a smaller blast radius - a legitimate future improvement, not
  done here because it doesn't change the fundamental guarantee.

## Consequences
- Positive: no extra table, no poller process, no `SELECT ... FOR UPDATE SKIP LOCKED` claiming
  logic to test and operate - the notification path is a handful of files.
- Negative accepted: a RabbitMQ outage at the exact moment `confirm()`/`cancel()` runs loses that
  customer's status-change email permanently, with only a log line as a trace. Acceptable here
  because this is a portfolio order-management API, not a system with a real SLA on notification
  delivery - the outbox pattern is already demonstrated where it matters (`spring-order-api`,
  ADR 0006 there).
