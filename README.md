# nest-order-api

Port do domínio de gestão de pedidos (`Customer` → `Order` → `Item`) para **NestJS +
TypeORM + PostgreSQL**, a partir da implementação de referência em Java/Spring Boot
(`java-order-api`).

## Domínio

Domínio simples de gestão de pedidos com dois agregados:

```
Customer (1) ──< Order (1) ──< Item
```

- **Customer**: dados cadastrais do cliente.
- **Order** (aggregate root): um pedido de um cliente, com uma lista de itens e um total
  calculado.
- **Item**: linha de pedido (descrição livre, sem catálogo de produtos).

Fora de escopo: pagamento, estoque, catálogo de produtos, envio/frete.

### Entidades

#### Customer

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

- Igualdade de identidade por `taxId` (atenção: campo mutável — não confiar nele como chave
  estável de coleção após updates).
- Campos sensíveis (ex.: `taxId`, `passportNumber`, `email` — a lista cresce conforme o
  domínio evolui, não se limita a estes) nunca aparecem em texto claro em log; ver seção
  "Dados sensíveis" abaixo.

#### Order (aggregate root)

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
- **Concorrência otimista**: toda escrita que altera `status` ou `items` deve
  verificar/incrementar `version`; conflito concorrente é reportado como erro de conflito
  (409).

#### Item (filho de Order)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | gerado |
| `order` | referência ao Order pai | obrigatório |
| `description` | string | obrigatório, não-branco, máx. 255 chars |
| `unitPrice` | decimal | obrigatório, positivo, máx. 2 casas decimais |
| `quantity` | inteiro | obrigatório, positivo |

- Igualdade de identidade por `id` (não pela descrição — descrições podem se repetir num
  mesmo pedido).
- Subtotal do item = `unitPrice * quantity` (calculado, não persistido).

### Enum OrderStatus

```
OPEN → CONFIRMED → CANCELED
OPEN → CANCELED
```

- `OPEN`: estado inicial. Itens podem ser adicionados/alterados/removidos. Pode
  transicionar para `CONFIRMED` ou `CANCELED`.
- `CONFIRMED`: itens congelados (não editáveis). Pode transicionar apenas para `CANCELED`.
- `CANCELED`: estado terminal. Nenhuma transição posterior permitida.

### Regras de negócio / invariantes

1. **Cálculo do total**: `order.total = Σ (item.unitPrice × item.quantity)` sobre todos os
   itens atuais. Recalculado após qualquer criação/atualização/remoção de item.
2. **Edição de itens somente com order `OPEN`**: adicionar, alterar quantidade ou remover
   item em order `CONFIRMED`/`CANCELED` é erro de validação.
3. **Confirmar order** (`OPEN → CONFIRMED`): falha se status atual não for `OPEN`, ou se o
   order não tiver nenhum item.
4. **Cancelar order** (`OPEN|CONFIRMED → CANCELED`): falha se status atual já for
   `CANCELED`.
5. **Criar order**: exige um `customerId` existente; monta os itens da requisição; calcula
   o total inicial.
6. **Limite de itens**: máximo de 200 itens por order na criação.
7. **Unicidade de Customer**: `taxId` único; `passportNumber` único quando informado
   (branco/ausente não conta na checagem).
8. **Exclusão de Customer bloqueada**: não é permitido excluir um customer que possua
   qualquer order não excluído (soft-deleted não conta).
9. **Delete é sempre soft-delete**: em ambos os agregados — nunca remoção física; registros
   com `deletedAt` preenchido são excluídos de toda consulta padrão.
10. **Concorrência otimista em Order**: mutações concorrentes conflitantes falham com erro
    de conflito, não sobrescrevem silenciosamente.

### Eventos de domínio

#### OrderStatusChangedEvent

Disparado ao final de `confirm()` e `cancel()` (somente se o customer tiver e-mail
não-vazio).

| Campo | Tipo |
|---|---|
| `orderId` | UUID |
| `customerEmail` | string |
| `customerName` | string |
| `oldStatus` | OrderStatus |
| `newStatus` | OrderStatus |
| `totalAmount` | decimal |
| `changedAt` | datetime |

O `OrderStatusListener` (`EventEmitter2`, in-process) publica o evento na fila RabbitMQ
`order.status.changed` (`RabbitMqPublisher`); o `RabbitMqConsumer` a consome — embutido no
mesmo processo da API, reconectando com retry em background se o broker cair, sem derrubar
o boot nem os testes e2e — e dispara o e-mail via `EmailService` (`nodemailer`/SMTP),
renderizado com Handlebars a partir de
`src/notification/templates/order-status-changed.hbs`. Em dev/local, `SMTP_HOST` aponta
para o Mailpit (`docker compose up mailpit`) — nenhum e-mail real sai, inspecionável em
`http://localhost:8025`.

### Catálogo de erros

**Validação (400)**
- `VALIDATION_MISSING_FIELD` — campo obrigatório ausente.
- `VALIDATION_INVALID_CUSTOMER_ID` — customerId inexistente ao criar order.
- `VALIDATION_ORDER_NOT_EDITABLE` — tentativa de editar itens de order não-`OPEN`.
- `VALIDATION_ORDER_EMPTY` — tentativa de confirmar order sem itens.
- `VALIDATION_ORDER_INVALID_STATUS_TRANSITION` — transição de status não permitida.
- `VALIDATION_INVALID_FILTER_VALUE` / `VALIDATION_INVALID_SORT_FIELD` — parâmetros de busca
  inválidos.
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

### Dados sensíveis

Todo campo classificado como PII/segredo (não só `taxId`/`passportNumber`/`email` — qualquer
campo novo que se enquadre nessa categoria) é decorado com `@Sensitive()`
(`src/common/security/sensitive.decorator.ts`) e nunca deve ser logado em texto claro:
`maskSensitive()` redige o campo inteiro (`***`) para log estruturado de uma entidade/DTO, e
`maskEmail()` faz um mascaramento parcial (`a***@example.com`) para casos em que o log
precisa continuar minimamente rastreável (ex.: `EmailService`, ver evento
`OrderStatusChangedEvent` abaixo). Serialização de resposta HTTP continua protegida à parte
pelos DTOs de resposta, que só copiam os campos que devem mesmo ir ao cliente.

## Arquitetura

Package-by-feature: cada domínio vive em `src/<dominio>/` com entidade, DTOs, service,
controller e module próprios. Infraestrutura compartilhada (busca/filtro genérico,
exceções, auditoria/soft-delete, autenticação/papéis, mascaramento de dado sensível) vive em
`src/common/`.

Convenções completas de desenvolvimento (o "como" de cada camada) estão na skill
[`nestjs-feature`](.claude/skills/nestjs-feature/SKILL.md); `AGENTS.md` traz o checklist
resumido a validar antes de qualquer alteração. A skill fica versionada num repositório
privado à parte — não está incluída neste repositório público.

## Executando localmente

```bash
cp .env.example .env
docker compose up -d          # sobe PostgreSQL, RabbitMQ e Mailpit locais
npm install
npm run migration:run         # aplica o schema (customers/orders/items)
npm run start:dev
```

- RabbitMQ Management UI (guest/guest): `http://localhost:15672`
- Mailpit Web UI (inspecionar e-mails recebidos): `http://localhost:8025`

A API sobe em `http://localhost:3000`. Autenticação é via JWT (RS256) validado contra
`JWT_PUBLIC_KEY_PATH`/`JWT_AUDIENCE` — aponte para o provedor OIDC do seu ambiente (ex.
Keycloak) antes de chamar qualquer endpoint protegido.

## Testes e qualidade

```bash
npm run test        # unitários (*.service.spec.ts) — sem Docker
npm run test:e2e     # ponta a ponta — requer Docker (Testcontainers)
npm run verify       # gate local único: lint (sem warning) → build → cobertura → e2e
```

`npm run verify` reproduz o `ci.yml` num único comando local. Cobertura mínima configurada
em `coverageThreshold` (`package.json`): branches 85% / functions 90% / lines 90% /
statements 90%.

## Endpoints

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

### `/customers` (mutações requerem `ROLE_ADMIN`; leituras requerem usuário autenticado)

| Método | Path | Descrição |
|---|---|---|
| POST | `/customers` | Criar customer (admin) |
| GET | `/customers/search` | Buscar customers (query params) |
| POST | `/customers/search` | Buscar customers (body) |
| GET | `/customers/{id}` | Obter customer por id |
| PUT | `/customers/{id}` | Atualizar customer (admin) |
| DELETE | `/customers/{id}` | Excluir (soft) customer (admin) |
