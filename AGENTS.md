# Instruções para agentes de código neste repositório

Antes de editar qualquer arquivo em `src/`, invoque a skill `nest-feature`
(`.claude/skills/nest-feature/SKILL.md`), que contém as convenções completas de
desenvolvimento deste projeto.

A skill é a fonte de referência para arquitetura, implementação, testes, segurança e
persistência. Este arquivo contém apenas o checklist resumido dos pontos que devem ser
validados antes de uma alteração.

A instrução vale tanto para novas features quanto para correções, refatorações e auditorias
de código existente.

## Checklist antes de escrever código

- [ ] Li o domínio de referência mais parecido neste projeto (`customer/` para domínio simples, `order/` para domínio com relacionamento e efeitos colaterais) e vou espelhar sua estrutura e convenções, evitando criar um padrão novo sem necessidade justificada.
- [ ] Classifiquei **cada campo novo** (entidade + `RequestDto`) contra: PII, categoria especial/LGPD, PCI, dado financeiro, credenciais/segredos. Se o campo for sensível, utilize a infraestrutura existente (`@Sensitive()`, `maskSensitive()`), nunca uma solução manual ad hoc. Nenhum campo sensível "para o caso de precisar depois" sem necessidade real da feature.
- [ ] Apliquei DRY, eliminando duplicações tanto em produção quanto nos testes (reaproveitando helpers de mock de repository e fixtures compartilhadas entre `*.service.spec.ts`).
- [ ] Avaliei se algum efeito colateral novo (e-mail, notificação, relatório) se beneficia de processamento assíncrono (evento de domínio via `EventEmitter2`, opcionalmente encaminhado a uma fila real) versus uma chamada síncrona mais simples — decisão documentada, não por hábito.

## TDD (red → green → refactor, não retroativo)

- [ ] Teste escrito e executado **falhando antes** do código de produção correspondente.
- [ ] `*.service.spec.ts` cobre todos os branches relevantes: caminho feliz, recurso inexistente, conflito de unicidade, regra de negócio violada, limites exatos de validação (`N` e `N+1`) e, quando aplicável, concorrência otimista (`@VersionColumn`).
- [ ] Todo domínio exposto via HTTP possui teste e2e (`test/<domain>.e2e-spec.ts`), incluindo pelo menos um cenário de autorização negada (403) para cada endpoint protegido.
- [ ] Rate limiting, CORS ou qualquer outro guard de produção não foram alterados para facilitar testes; diferenças de configuração pertencem exclusivamente ao ambiente de teste (`.env.test`).

## Entidade / persistência

- [ ] `id` gerado via `@PrimaryGeneratedColumn('uuid')` (ou geração explícita em memória quando justificado — ver skill).
- [ ] Soft delete (`deletedAt`/`deletedBy`, `AuditableBaseEntity`) como padrão; serviços de produção nunca executam hard delete nem operações de exclusão em massa.
- [ ] `@VersionColumn()` (via `VersionedAuditableBaseEntity`) em entidades sujeitas a concorrência real; não é obrigatório em entidades de referência sem atualizações concorrentes relevantes.
- [ ] Toda validação de unicidade feita no service possui índice `UNIQUE` equivalente na migration.
- [ ] Query nativa (`repository.manager.query`) usa parâmetros posicionais (`$1`), nunca concatenação de string; aplica manualmente `AND deleted_at IS NULL` quando relevante.
- [ ] Listagens/paginação envolvendo relações usam `eager`/`relations` explícito para evitar N+1.
- [ ] Nenhum log/`toString` implícito serializa campo `@Sensitive` sem passar por `maskSensitive()`.

## Service / controller / autorização

- [ ] Todo endpoint de controller possui `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` explícito; não existe acesso protegido implícito nesta aplicação.
- [ ] Recursos pertencentes a um usuário específico validam ownership na camada de serviço após o carregamento da entidade, tratando posse inválida como 404, não 403.
- [ ] Novos `ErrorCode` seguem a convenção de nomenclatura existente (`common/exceptions/error-code.enum.ts`); nunca reutilizar um código para um significado diferente.
- [ ] `import` sempre no topo do arquivo; sem barrel files dentro de um domínio.
- [ ] Busca, filtro e paginação reutilizam `SearchService`; validação de campo/tipo resolvida contra o metadata do repository, evitando duplicação manual por domínio.

## Baseline de segurança (não desativar por acidente)

- [ ] `helmet()`, `ValidationPipe` global (`whitelist`/`forbidNonWhitelisted`), validação de `aud` do JWT e CORS restrito por variável de ambiente permanecem ativos; nenhuma dessas proteções foi desabilitada ou contornada para viabilizar uma implementação ou teste.
- [ ] Swagger/OpenAPI só habilitado fora de `NODE_ENV=production`.
- [ ] Segredos, chaves, tokens e connection strings nunca são commitados em código, `.env` versionado ou migration — só via variável de ambiente/secret manager.
- [ ] Dados sensíveis nunca aparecem em `logger.log`/`warn`/`error` em texto claro (incluindo payloads de erro de validação) e não são expostos em `ResponseDto` sem necessidade real.

## Antes de considerar a mudança pronta

- [ ] `npm run lint` e `npx tsc --noEmit` executados sem erro.
- [ ] Testes relevantes executados (`npx jest <arquivo>`), não apenas compilados.
- [ ] Falhas conhecidas da infraestrutura de testes (Docker/Testcontainers, ambiente local) foram descartadas antes de concluir que existe um defeito na implementação.
- [ ] Toda migration nova foi revisada manualmente (ver checklist na skill); `down()` implementado de verdade, não um stub vazio.
- [ ] Nenhuma API depreciada de uma dependência (NestJS, TypeORM) foi adotada sem checar a versão realmente resolvida no `package-lock.json`.
- [ ] Checagens de nulo/vazio usam `StringUtils.isBlank`/`isNotBlank` (`common/util/string-utils.ts`), nunca a negação do oposto nem duas condições manuais. Para regra de negócio sem helper pronto, a condição foi extraída num método nomeado afirmativamente (ex. `isEditable()`) em vez de negação repetida nos pontos de uso.

O detalhamento completo de cada item (motivação, exceções válidas, decisões arquiteturais e
exemplos) está documentado na skill `nest-feature`. Este arquivo é apenas um checklist
operacional utilizado antes de considerar uma tarefa concluída.
