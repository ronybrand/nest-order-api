# ADR 0004: Lock the customer row between "delete customer" and "create order"

## Status
Accepted

## Context
`CustomerService.delete` refuses to delete a customer that still has active orders, and `OrderService.create` refuses
an order for a customer that does not exist. Both are soft-delete aware, but they were two separate steps with nothing
between them: a delete and an order creation for the same customer could interleave (check "no orders", create the
order, soft-delete the customer) and leave an active order under a deleted customer. A soft delete is only an
`UPDATE`, so it does not conflict with the foreign key check on the order insert either.

## Decision
Serialize the two operations on the customer row. `delete` runs in one transaction that takes `FOR UPDATE`
(`pessimistic_write`) on the customer before looking at its orders; `OrderService.create` takes `FOR SHARE`
(`pessimistic_read`) on the same row in the same transaction that saves the order. `FOR SHARE` is compatible with other
`FOR SHARE`, so many orders can be created for one customer concurrently; only a delete excludes them (and the reverse).
`Customer` also gets a `@VersionColumn`, so two concurrent `PUT`s no longer overwrite each other (the second gets 409).

## Alternatives considered
- **Optimistic version only:** the soft delete does not write the version of a row the order insert only reads, so it
  would not detect this race.
- **A trigger or a deferred constraint over `deleted_at`:** moves a business rule into the database, away from the rest
  of the soft-delete logic, for a case a row lock already covers.

## Consequences
- Positive: no active order under a deleted customer; same approach as `spring-order-api` (ADR 0001 there).
- Negative: order creation now holds a short row lock on the customer, and the order service depends on a customer
  service method that takes a transaction manager.
