# nest-order-api

Port do domínio de gestão de pedidos (`Customer` → `Order` → `Item`) para **NestJS +
TypeORM + PostgreSQL**, a partir da especificação agnóstica de framework em
[`DOMAIN.md`](../java-order-api/DOMAIN.md) (extraída do projeto de referência
`java-order-api`, Spring Boot).

## Domínio

- **Customer**: cadastro de cliente (`taxId`/`passportNumber` únicos, `email`).
- **Order** (aggregate root): pedido de um cliente, com `items[]` e `total` derivado.
  Estado `OrderStatus`: `OPEN → CONFIRMED → CANCELED` (ou `OPEN → CANCELED`).
- **Item**: linha de pedido (`description`, `unitPrice`, `quantity`).

Regras de negócio, catálogo de erros e contrato de endpoints estão detalhados no
`DOMAIN.md` — este README cobre apenas a implementação NestJS.

## Arquitetura

Package-by-feature: cada domínio vive em `src/<dominio>/` com entidade, DTOs, service,
controller e module próprios. Infraestrutura compartilhada (busca/filtro genérico,
exceções, auditoria/soft-delete, autenticação/papéis, mascaramento de dado sensível) vive em
`src/common/`.

Convenções completas de desenvolvimento (o "como" de cada camada) estão na skill
[`nest-feature`](.claude/skills/nest-feature/SKILL.md); `AGENTS.md` traz o checklist
resumido a validar antes de qualquer alteração.

## Executando localmente

```bash
cp .env.example .env
docker compose up -d          # sobe PostgreSQL local
npm install
npm run migration:run         # aplica o schema (customers/orders/items)
npm run start:dev
```

A API sobe em `http://localhost:3000`. Autenticação é via JWT (RS256) validado contra
`JWT_PUBLIC_KEY_PATH`/`JWT_AUDIENCE` — aponte para o provedor OIDC do seu ambiente (ex.
Keycloak) antes de chamar qualquer endpoint protegido.

## Testes

```bash
npm run test        # unitários (*.service.spec.ts) — sem Docker
npm run test:e2e     # ponta a ponta — requer Docker (Testcontainers)
```

## Endpoints principais

| Recurso | Rotas |
|---|---|
| `/customers` | `POST`, `GET/POST /search`, `GET /:id`, `PUT /:id`, `DELETE /:id` (mutação exige `ROLE_ADMIN`) |
| `/orders` | `POST`, `GET/POST /search`, `GET /:id`, `DELETE /:id`, `POST /:id/items`, `PATCH /:orderId/items/:itemId`, `DELETE /:orderId/items/:itemId`, `POST /:id/confirm`, `POST /:id/cancel` |

Contrato completo (payloads, códigos de erro) em `DOMAIN.md`.
