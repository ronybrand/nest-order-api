# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/). Este projeto não versiona releases
(`main` é deployado continuamente); as entradas abaixo agrupam o histórico por tema, não por tag.

## [Unreleased]

### Security

- `JWT_ISSUER` passa a ser obrigatório (a API não sobe sem ele): antes o emissor só era conferido se a variável existisse.
- `taxId` é validado, gravado e comparado na forma canônica (maiúsculas, sem `.`/`-`/`/`), com no mínimo 5 letras ou dígitos;
  `"123.456-78"` e `"12345678"` deixam de ser dois cadastros do mesmo documento. Linhas já gravadas com pontuação ou minúsculas
  precisam de um `UPDATE` de normalização antes do deploy.
- Teste e2e da corrida entre excluir cliente e criar pedido.
- Busca: valores de filtro convertidos ao tipo da coluna (uuid, inteiro, decimal, boolean, data ISO 8601, enum) em vez de
  irem crus ao Postgres (500 em valor inválido); `gt`/`lt`/`between` rejeitados em enum e boolean; `lk` só em texto e com
  `%`/`_` literais; limites de campos, condições, itens de `in`, tamanho de valor e offset.
- JWT: `sub` e `exp` obrigatórios, `realm_access.roles` só como lista de strings, `JWT_ISSUER` opcional; o 401 passa a ter
  código próprio (`AUTHORIZATION_UNAUTHENTICATED`) em vez de `INTERNAL_ERROR`, sem vazar o motivo da falha.
- Excluir cliente (`FOR UPDATE`) e criar pedido (`FOR SHARE`) serializam na linha do cliente; `Customer` ganhou `@VersionColumn`
  (migration `AddCustomerVersion`). Ver ADR 0004.
- Rate limit por usuário (token verificado) e por IP só para anônimos; escritas de pedido com limite próprio (30/min);
  `GET /health` público e fora do limite; `X-Request-Id` só é propagado se for UUID canônico.
- Mensageria: `RABBITMQ_URL` obrigatória e `amqps://` fora de development/test (sem fallback `guest:guest`), STARTTLS
  obrigatório no SMTP e credencial nunca sem TLS; `messageId` com deduplicação no consumidor; destinatário recusado vai
  direto para a DLQ.
- Imagem Docker e compose com bases fixadas por digest, `HEALTHCHECK` em `/health`, portas do compose em `127.0.0.1` e
  `permissions: contents: read` nos workflows.
