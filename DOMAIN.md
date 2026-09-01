# Domínio: Order Management

Especificação do domínio, independente de linguagem/framework, para servir de base à reimplementação em outras stacks. Extraída da implementação de referência em Java/Spring Boot (`spring-order-api`).

## 1. Visão geral

Domínio simples de gestão de pedidos com dois agregados:

```
Customer (1) ──< Order (1) ──< Item
```

- **Customer**: dados cadastrais do cliente.
- **Order** (aggregate root): um pedido de um cliente, com uma lista de itens e um total calculado.
- **Item**: linha de pedido (descrição livre, sem catálogo de produtos).

Fora de escopo: pagamento, estoque, catálogo de produtos, envio/frete.

## 2. Entidades

### Customer

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | gerado |
| `name` | string | obrigatório |
| `taxId` | string | obrigatório, **único**, 5–20 chars, padrão `^[A-Za-z0-9./-]{5,20}$` |
| `passportNumber` | string | opcional, **único** quando presente, padrão ICAO `^[A-Z0-9]{6,9}$` |
| `email` | string | obrigatório, padrão `^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$` |
| `createdAt`, `updatedAt` | datetime | auditoria |
| `createdBy`, `updatedBy` | string | auditoria (usuário ou "system") |
| `deletedAt`, `deletedBy` | datetime / string | soft-delete (nulo = ativo) |

- Igualdade de identidade por `taxId` (atenção: campo mutável — não confiar nele como chave estável de coleção após updates).
- `taxId` e `passportNumber` são considerados dados sensíveis (PII) — devem ser mascarados em logs/toString.

### Order (aggregate root)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | gerado |
| `customer` | referência a Customer | obrigatório |
| `items` | lista de Item | composição — ciclo de vida atrelado ao Order |
| `total` | decimal | **derivado**, recalculado a cada mutação de itens |
| `status` | enum `OrderStatus` | default `OPEN` |
| `version` | inteiro/long | controle de concorrência otimista |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | — | auditoria |
| `deletedAt`, `deletedBy` | — | soft-delete |

- Igualdade de identidade por `id`.
- **Concorrência otimista**: toda escrita que altera `status` ou `items` deve verificar/incrementar `version`; conflito concorrente deve ser reportado como erro de conflito (HTTP 409 equivalente).

### Item (filho de Order)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | gerado |
| `order` | referência ao Order pai | obrigatório |
| `description` | string | obrigatório, não-branco, máx. 255 chars |
| `unitPrice` | decimal | obrigatório, positivo, máx. 2 casas decimais |
| `quantity` | inteiro | obrigatório, positivo |

- Igualdade de identidade por `id` (não pela descrição — descrições podem se repetir num mesmo pedido).
- Subtotal do item = `unitPrice * quantity` (calculado, não persistido).

## 3. Enum OrderStatus

```
OPEN → CONFIRMED → CANCELED
OPEN → CANCELED
```

- `OPEN`: estado inicial. Itens podem ser adicionados/alterados/removidos. Pode transicionar para `CONFIRMED` ou `CANCELED`.
- `CONFIRMED`: itens congelados (não editáveis). Pode transicionar apenas para `CANCELED`.
- `CANCELED`: estado terminal. Nenhuma transição posterior permitida.

## 4. Regras de negócio / invariantes

1. **Cálculo do total**: `order.total = Σ (item.unitPrice × item.quantity)` sobre todos os itens atuais. Deve ser recalculado após qualquer criação/atualização/remoção de item.
2. **Edição de itens somente com order `OPEN`**: tentar adicionar, alterar quantidade ou remover item em order `CONFIRMED`/`CANCELED` é erro de validação.
3. **Confirmar order** (`OPEN → CONFIRMED`):
   - Falha se status atual não for `OPEN` (transição inválida).
   - Falha se o order não tiver nenhum item (order vazio).
4. **Cancelar order** (`OPEN|CONFIRMED → CANCELED`):
   - Falha se status atual já for `CANCELED`.
5. **Criar order**: exige um `customerId` existente; monta os itens da requisição; calcula o total inicial.
6. **Limite de itens**: máximo de 200 itens por order na criação.
7. **Unicidade de Customer**: `taxId` único; `passportNumber` único quando informado (branco/ausente não conta na checagem).
8. **Exclusão de Customer bloqueada**: não é permitido excluir um customer que possua qualquer order não excluído (soft-deleted não conta).
9. **Delete é sempre soft-delete**: em ambos os agregados — nunca remoção física; registros com `deletedAt` preenchido são excluídos de toda consulta padrão.
10. **Concorrência otimista em Order**: mutações concorrentes conflitantes devem falhar com erro de conflito, não sobrescrever silenciosamente.

## 5. Eventos de domínio

### OrderStatusChangedEvent

Disparado ao final de `confirm()` e `cancel()` (somente se o customer tiver e-mail não-vazio).

| Campo | Tipo |
|---|---|
| `orderId` | UUID |
| `customerEmail` | string |
| `customerName` | string |
| `oldStatus` | OrderStatus |
| `newStatus` | OrderStatus |
| `totalAmount` | decimal |
| `changedAt` | datetime |

Fluxo de referência (implementação original): evento publicado após commit da transação → mensageria assíncrona → serviço de e-mail envia notificação ao cliente sobre a mudança de status. Em outra stack, isso pode ser um evento em memória, um outbox, uma fila, ou até uma chamada síncrona simplificada — o importante é preservar o payload e o gatilho (somente em confirm/cancel, somente com e-mail presente).

## 6. Erros de domínio (catálogo de referência)

Categorias e códigos, mapeáveis para exceções/HTTP status em qualquer stack:

**Validação (erro do cliente / 400)**
- `VALIDATION_MISSING_FIELD` — campo obrigatório ausente.
- `VALIDATION_INVALID_CUSTOMER_ID` — customerId inexistente ao criar order.
- `VALIDATION_ORDER_NOT_EDITABLE` — tentativa de editar itens de order não-`OPEN`.
- `VALIDATION_ORDER_EMPTY` — tentativa de confirmar order sem itens.
- `VALIDATION_ORDER_INVALID_STATUS_TRANSITION` — transição de status não permitida.
- `VALIDATION_INVALID_FILTER_VALUE` / `VALIDATION_INVALID_SORT_FIELD` — parâmetros de busca inválidos.
- `VALIDATION_CONSTRAINT_VIOLATION` — violação genérica de validação de campo.

**Não encontrado (404)**
- `RESOURCE_NOT_FOUND_CUSTOMER`
- `RESOURCE_NOT_FOUND_ORDER`
- `RESOURCE_NOT_FOUND_ITEM`

**Conflito (409)**
- `VALIDATION_CUSTOMER_TAXID_EXISTS` — taxId duplicado.
- `VALIDATION_CUSTOMER_PASSPORT_EXISTS` — passportNumber duplicado.
- `VALIDATION_CUSTOMER_HAS_ORDERS` — exclusão de customer com orders associados.
- `CONFLICT_CONCURRENT_MODIFICATION` — conflito de concorrência otimista.
- `CONFLICT_DATA_INTEGRITY_VIOLATION` — violação de integridade no armazenamento.

**Outros**
- `AUTHORIZATION_ACCESS_DENIED` — sem permissão para a operação.
- `INTERNAL_ERROR` — erro inesperado.

## 7. Casos de uso (camada de aplicação)

### Order
- `create(customerId, items[])` → cria order `OPEN` com total calculado.
- `findById(orderId)`
- `delete(orderId)` → soft-delete.
- `addItem(orderId, item)` → requer `OPEN`; recalcula total.
- `updateItemQuantity(orderId, itemId, quantity)` → requer `OPEN`; recalcula total.
- `removeItem(orderId, itemId)` → requer `OPEN`; recalcula total.
- `confirm(orderId)` → `OPEN → CONFIRMED`; requer itens não-vazios; publica `OrderStatusChangedEvent`.
- `cancel(orderId)` → `OPEN|CONFIRMED → CANCELED`; publica `OrderStatusChangedEvent`.
- `search(filtros, ordenação, paginação)`

### Customer
- `create(dados)` → valida unicidade de taxId/passportNumber.
- `update(id, dados)` → valida unicidade excluindo o próprio registro.
- `delete(id)` → bloqueia se houver orders associados; soft-delete.
- `findById(id)`
- `search(filtros, ordenação, paginação)`

## 8. Endpoints de referência (contrato HTTP da implementação original)

Apenas como referência de contrato — não é obrigatório replicar a mesma tecnologia de transporte nas próximas implementações.

### `/orders` (requer usuário autenticado)

| Método | Path | Descrição |
|---|---|---|
| POST | `/orders` | Criar order |
| GET | `/orders/search` | Buscar orders (query params) |
| POST | `/orders/search` | Buscar orders (body) |
| GET | `/orders/{id}` | Obter order por id |
| DELETE | `/orders/{id}` | Excluir (soft) order |
| POST | `/orders/{id}/items` | Adicionar item |
| PATCH | `/orders/{orderId}/items/{itemId}` | Atualizar quantidade do item |
| DELETE | `/orders/{orderId}/items/{itemId}` | Remover item |
| POST | `/orders/{id}/confirm` | Confirmar order |
| POST | `/orders/{id}/cancel` | Cancelar order |

### `/customers` (mutações requerem papel admin; leituras requerem usuário autenticado)

| Método | Path | Descrição |
|---|---|---|
| POST | `/customers` | Criar customer (admin) |
| GET | `/customers/search` | Buscar customers (query params) |
| POST | `/customers/search` | Buscar customers (body) |
| GET | `/customers/{id}` | Obter customer por id |
| PUT | `/customers/{id}` | Atualizar customer (admin) |
| DELETE | `/customers/{id}` | Excluir (soft) customer (admin) |
