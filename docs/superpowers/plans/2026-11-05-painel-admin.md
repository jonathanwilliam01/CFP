# Painel administrativo do CFP — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o painel `/admin`, só para o dono, com usuários, chave de manutenção por função, métricas, central de comunicados, saúde, notas de versão e auditoria. No app do usuário entram manutenção, comunicados e suspensão.

**Architecture:** Tudo que é de admin fica protegido no banco:
- `is_admin()` em RPCs `security definer` e nas policies;
- uma Edge Function `admin` para as ações que exigem `service_role` (suspender, reativar, excluir).

No app, o Angular ganha serviços pequenos e independentes do `Store`: `Admin`, `Funcoes`, `Telemetria`, `Comunicados`. O painel é uma rota lazy fora do `Shell`, com layout de menu lateral próprio.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, OnPush), Supabase (Postgres 17, RLS, pg_cron, pg_net, Realtime, Edge Functions Deno), Vitest, Playwright, Docker (`postgres:17-alpine`) para testar migrations.

**Spec:** `docs/superpowers/specs/2026-11-05-painel-admin-design.md`

## Global Constraints

- Admin inicial: `jonathan.willian@embras.net`, inserido pela migration por e-mail. Se o usuário não existir, não insere nada.
- O painel nunca lê o conteúdo financeiro: descrição, valor, texto do chat, comprovante. Só contagens.
- Nenhuma chave `service_role` no navegador.
- Toda RPC `admin_*`:
  - é `security definer set search_path = public`;
  - tem como primeira instrução `if not is_admin() then raise exception 'acesso negado'; end if;`;
  - leva `revoke execute ... from public, anon` e `grant ... to authenticated`.
- Suspender corta o acesso na hora: `is_membro()` recusa quem está em `suspensos`.
- Excluir conta: o histórico da carteira fica. `carteiras.criado_por`, `mensagens.user_id`, `acertos.de` e `acertos.para` passam a aceitar null, com `on delete set null`. O app mostra "Conta excluída" quando o autor não está entre os membros.
- Nomes no banco e no código: `comunicados`, `comunicado_tags`, `comunicado_leituras` e `Comunicado`. Na interface o texto é "Avisos".
- Tags iniciais (nome → cor):
  - Nova versão `#1d5bd8`
  - Manutenção `#c98a06`
  - Datas comemorativas `#d6453d`
  - Dica `#138a4f`
  - Importante `#7c3aed`
- Erros: limite de 20 por usuário por hora, `detalhe` com até 2000 caracteres, retenção de 90 dias.
- Status "parado" = mais de 30 dias sem acesso.
- Cron de comunicados: `cfp-comunicados`, a cada 15 min (`*/15 * * * *`). Tipo de push: `comunicado`.
- Migrations novas: `039_admin_base.sql`, `040_telemetria.sql`, `041_funcoes_comunicados.sql`, `042_admin_rpcs.sql`. Cada uma ganha uma marca no JSON de marcas (Task 2). O Claude **não** aplica migration no Supabase real.
- Código com poucos comentários, curtos. Nomes em português, como no resto do projeto.
- Componentes: standalone, `ChangeDetectionStrategy.OnPush`, `export default class` nas páginas, ícones via `app-icon`, cores pelas variáveis de `src/styles.scss`, tema claro e escuro. Budget de CSS por componente: 10 kB de aviso, 16 kB de erro.
- Versão nova: `v1.26.11.9`, com nota no topo de `src/app/core/versao.ts` e no `CHANGELOG.md`.
- Commit local ao fim de cada task, sem push. Mensagem curta em português.
- Validação:
  - `npx ng build`;
  - `npm test`;
  - `npm run e2e` (porta 4310, conta real do casal: só navegar);
  - `bash scripts/testar-banco.sh` (Task 1).

## Review Focus

1. **Comunicado expira com a tela aberta.** O realtime não avisa quando `fim` passa. O usuário espera que o aviso suma sem precisar recarregar. Teste em Task 11: `noAr()` com `agora` depois de `fim` → vazio, e o serviço reavalia a cada minuto.
2. **Admin tenta suspender ou excluir a própria conta.** Ele espera ver uma recusa clara, nunca se trancar fora. Teste em Task 7: a Edge Function devolve 400 quando `user_id` é o do chamador, e a regra pura `podeAgir()` é testada.
3. **Usuário sem carteira (`/bem-vindo`) ou offline.** Telemetria, comunicados e checagem de suspensão funcionam sem carteira. Uma falha de rede no registro de erro ou de acesso não gera toast, não entra em loop e não lança exceção. Teste em Task 10: `ErroGlobal` engole a falha do próprio envio.
4. **Função desligada enquanto o usuário está na tela dela.** Ele espera ser levado para "Em manutenção" na hora. Teste em Task 9: `bloqueio()` para a URL atual, e o serviço navega quando o status muda.
5. **Exclusão do dono com parceiro.** O parceiro espera continuar com a carteira, como dono, e com o chat e os acertos. Teste SQL em Task 2.

---

### Task 1: Harness de teste do banco (Docker)

**Files:**
- Create: `supabase/teste/stubs.sql`, `supabase/teste/apoio.sql`, `scripts/testar-banco.sh`, `supabase/teste/base.test.sql`

**Interfaces:**
- Produces:
  - `bash scripts/testar-banco.sh` sobe um `postgres:17-alpine` descartável e aplica, nesta ordem:
    1. `stubs.sql`;
    2. todas as `supabase/migrations/*.sql` em `sort -V`;
    3. `apoio.sql`;
    4. cada `supabase/teste/*.test.sql`, com `ON_ERROR_STOP=1`.
  - Sai com código 0 só se tudo passar. Sempre remove o container (`trap`).
  - `apoio.sql` define:
    - `teste_usuario(p_email text) returns uuid`: insere em `auth.users`;
    - `teste_como(p_uid uuid)`: `set role authenticated` e `set request.jwt.claim.sub`;
    - `teste_sistema()`: `reset role`.
  - Testes: cada arquivo é `begin; ... rollback;` com `do $$ begin assert <cond>, '<mensagem>'; end $$;`.

- [ ] **Step 1:** Escrever `stubs.sql` com o mínimo do Supabase que as migrations 001–038 referenciam:
  - roles `anon`, `authenticated`, `service_role` (`bypassrls`);
  - schema `auth` com `auth.users (id uuid pk default gen_random_uuid(), email text, created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz, raw_user_meta_data jsonb default '{}')`;
  - `auth.uid()` lendo `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`;
  - schema `extensions` com `pgcrypto`;
  - stubs em `cron` (`schedule`, `unschedule`), `net` (`http_post` devolvendo bigint) e `storage` (`buckets`, `objects`, `foldername`);
  - `create publication supabase_realtime`;
  - `grant usage on schema public` e grants padrão para `anon` e `authenticated`.
- [ ] **Step 2:** Escrever `base.test.sql` com `assert (select count(*) from pg_tables where schemaname = 'public') > 30`.
- [ ] **Step 3:** Rodar `bash scripts/testar-banco.sh`. Esperado: `✔ banco ok` e saída 0. Se alguma migration falhar por falta de objeto do Supabase, completar os stubs (não mexer nas migrations).
- [ ] **Step 4:** Commit `teste do banco em container`.

### Task 2: Migration 039 — admin, suspensão, auditoria e exclusão segura

**Files:**
- Create: `supabase/migrations/039_admin_base.sql`, `supabase/teste/admin_base.test.sql`, `scripts/marcas-banco.json`
- Modify: `scripts/checar-banco.mjs:13-20` (lê `MARCAS` do JSON)

**Interfaces:**
- Produces (SQL):
  - `admins(user_id pk)`, `is_admin() returns boolean`;
  - `suspensos(user_id pk references auth.users on delete cascade, desde timestamptz default now(), motivo text)`, `estou_suspenso() returns boolean`;
  - `is_membro(c)` passa a recusar suspensos;
  - `admin_log(id bigserial, admin_id uuid, acao text, alvo text, detalhe jsonb, criado_em timestamptz default now())`, `admin_registrar(p_acao text, p_alvo text, p_detalhe jsonb default null) returns void`;
  - `usuario_prefs(user_id pk references auth.users on delete cascade, push_comunicados boolean not null default true)`, com RLS: o dono lê e grava a própria linha;
  - trigger `carteira_membros_saida` (after delete): se a carteira ainda existe e ficou sem membros, apaga a carteira; se ficou sem dono, promove o membro mais antigo.
- Produces (JS): `scripts/marcas-banco.json` = o objeto `MARCAS` atual mais `"039": ["suspensos.user_id"]`.

- [ ] **Step 1: Testes que falham** em `admin_base.test.sql`:
  - `assert not is_admin()` como usuário comum; `assert is_admin()` como usuário inserido em `admins`;
  - com dono A e membro B na mesma carteira, `delete from auth.users where id = A`. Depois disso:
    - a carteira existe;
    - B tem `papel = 'dono'`;
    - as mensagens de A existem com `user_id is null`;
    - os acertos de A→B existem com `de is null`;
  - carteira só com A: depois de apagar A, a carteira não existe;
  - B em `suspensos` → `assert not is_membro(carteira)` como B, e `estou_suspenso()` verdadeiro;
  - como usuário comum:
    - `select count(*) from admin_log` devolve 0 linhas visíveis;
    - `admin_registrar('x', 'y')` lança `acesso negado` (testar com `begin ... exception when others then` e conferir a mensagem).
- [ ] **Step 2:** Rodar `bash scripts/testar-banco.sh`. Esperado: FAIL, porque `is_admin` não existe.
- [ ] **Step 3:** Escrever `039_admin_base.sql`:
  - tabelas e funções acima;
  - `alter` das FKs: drop not null e troca para `on delete set null` (`carteiras_criado_por_fkey`, `mensagens_user_id_fkey`, `acertos_de_fkey`, `acertos_para_fkey`; conferir os nomes com `\d`);
  - RLS ligada em `admins`, `suspensos` e `admin_log`. Policy de leitura só com `is_admin()`. Sem escrita direta: escrevem a Edge Function (`service_role`) e funções definer;
  - insert do admin por e-mail;
  - triggers de auditoria em `suspensos`, que gravam em `admin_log` com `acao` `suspender` ou `reativar`.
  - conferir se `membro_da_pasta` (migration 033, storage `comprovantes`) passa por `is_membro`; se não passar, incluir a checagem de `suspensos`.
- [ ] **Step 4:** Mover `MARCAS` para `scripts/marcas-banco.json` e fazer `checar-banco.mjs` ler com `JSON.parse(readFileSync(...))`. Adicionar a `039`.
- [ ] **Step 5:** Rodar `bash scripts/testar-banco.sh` (esperado: PASS) e `node scripts/checar-banco.mjs` (esperado: a 039 aparece como faltando no Supabase real, ou "pulando" sem `.env`).
- [ ] **Step 6:** Commit `migration 039: admin, suspensão e exclusão segura`.

### Task 3: Migration 040 — telemetria

**Files:**
- Create: `supabase/migrations/040_telemetria.sql`, `supabase/teste/telemetria.test.sql`
- Modify: `scripts/marcas-banco.json` (`"040": ["acessos.dia", "erros_app.id"]`)

**Interfaces:**
- Produces:
  - `acessos(user_id references auth.users on delete cascade, dia date, versao text, aparelho text, primary key (user_id, dia))`;
  - `registrar_acesso(p_versao text, p_aparelho text) returns void`, com upsert do dia de hoje no fuso `America/Sao_Paulo`;
  - `erros_app(id bigserial, user_id uuid references auth.users on delete set null, criado_em timestamptz default now(), versao text, rota text, mensagem text not null, detalhe text, navegador text)`;
  - `registrar_erro(p_versao text, p_rota text, p_mensagem text, p_detalhe text, p_navegador text) returns void`: ignora o erro se já houver 20 do mesmo usuário na última hora e corta `mensagem` em 500 caracteres e `detalhe` em 2000;
  - cron `cfp-erros-limpeza` diário, que apaga erros com mais de 90 dias;
  - as duas tabelas sem policy de leitura para usuário comum (RLS ligada, sem policy), e as RPCs definer só para `authenticated`.

- [ ] **Step 1: Testes que falham:**
  - `registrar_acesso` chamado duas vezes no mesmo dia → 1 linha, com a versão da segunda chamada;
  - 25 chamadas a `registrar_erro` → 20 linhas;
  - `detalhe` de 5000 caracteres → `length = 2000`;
  - como usuário comum, `select` em `acessos` e em `erros_app` → 0 linhas.
- [ ] **Step 2:** `bash scripts/testar-banco.sh` → FAIL.
- [ ] **Step 3:** Escrever a migration e a marca.
- [ ] **Step 4:** `bash scripts/testar-banco.sh` → PASS.
- [ ] **Step 5:** Commit `migration 040: telemetria de acesso e erros`.

### Task 4: Migration 041 — funções em manutenção e comunicados

**Files:**
- Create: `supabase/migrations/041_funcoes_comunicados.sql`, `supabase/teste/comunicados.test.sql`
- Modify: `scripts/marcas-banco.json` (`"041": ["funcoes_status.chave", "comunicados.id"]`)

**Interfaces:**
- Produces:
  - `funcoes_status(chave text pk, ativa boolean not null default true, mensagem text, desde timestamptz, por uuid)`. RLS: select para `authenticated`; insert, update e delete com `is_admin()`. Entra no realtime.
  - `comunicado_tags(id uuid pk, nome text unique not null, cor text not null, arquivada boolean default false)`, com as 5 tags de Global Constraints. RLS: select para `authenticated`; escrita com `is_admin()`.
  - `comunicados(id uuid pk, titulo text not null, texto text not null, tag_id uuid references comunicado_tags, inicio timestamptz not null, fim timestamptz not null check (fim > inicio), link text, push boolean default false, destaque boolean default false, publicado boolean default false, push_enviado_em timestamptz, criado_por uuid default auth.uid(), criado_em timestamptz default now(), atualizado_em timestamptz default now())`. RLS: select quando `is_admin() or (publicado and inicio <= now() and fim > now())`; escrita com `is_admin()`. Entra no realtime.
  - `comunicado_leituras(comunicado_id references comunicados on delete cascade, user_id uuid default auth.uid() references auth.users on delete cascade, lido_em timestamptz default now(), primary key (comunicado_id, user_id))`. RLS: insert e select com `user_id = auth.uid()`.
  - Triggers de auditoria em `funcoes_status`, `comunicados` e `comunicado_tags`, que gravam `admin_log(acao = '<tabela>.<insert|update|delete>', alvo = chave ou id, detalhe = to_jsonb(new) sem o texto longo)`.
  - `enviar_comunicados() returns int`: para cada comunicado `publicado and push and push_enviado_em is null and inicio <= now() and fim > now()`, chama `push_enviar(jsonb_build_object('tipo', 'comunicado', 'id', id))` e grava `push_enviado_em = now()`. Devolve quantos enviou. Fica agendado em `cfp-comunicados` `*/15 * * * *`.

- [ ] **Step 1: Testes que falham:**
  - como comum, enxerga só o comunicado no ar (não vê o rascunho, o agendado nem o expirado);
  - comum fazendo insert em `comunicados` → erro de RLS;
  - admin fazendo insert → ok, e `admin_log` ganha 1 linha;
  - comum lendo `comunicado_leituras` de outro usuário → 0 linhas;
  - `enviar_comunicados()` com 1 comunicado elegível → devolve 1 e preenche `push_enviado_em`; na segunda chamada devolve 0.
- [ ] **Step 2:** `bash scripts/testar-banco.sh` → FAIL.
- [ ] **Step 3:** Escrever a migration e a marca.
- [ ] **Step 4:** `bash scripts/testar-banco.sh` → PASS.
- [ ] **Step 5:** Commit `migration 041: funções em manutenção e comunicados`.

### Task 5: Migration 042 — RPCs de leitura do painel

**Files:**
- Create: `supabase/migrations/042_admin_rpcs.sql`, `supabase/teste/admin_rpcs.test.sql`
- Modify: `scripts/marcas-banco.json` (`"042": ["check:admin_log_acao_check:length"]`; a migration cria `alter table admin_log add constraint admin_log_acao_check check (length(acao) <= 60)` só para servir de marca), `src/app/core/models.ts` (tipos abaixo).

**Interfaces:**
- Produces (SQL, todas seguindo as regras de Global Constraints):
  - `admin_usuarios() returns setof jsonb`, uma por usuário, no formato `AdminUsuario`;
  - `admin_metricas(p_dias int) returns jsonb`, no formato `AdminMetricas`;
  - `admin_erros(p_dias int) returns jsonb`, no formato `AdminErros` (agrupar por `left(mensagem, 120)`);
  - `admin_comunicados() returns setof jsonb`: cada comunicado com `lidos` e `total_usuarios`;
  - `admin_log_lista(p_acao text default null, p_limite int default 200) returns setof admin_log`.
- Produces (TS, em `models.ts`):

```ts
export interface AdminUsuario { id: string; email: string; nome: string | null; criado_em: string; ultimo_uso: string | null; versao: string | null; aparelho: string | null;
  carteira: string | null; membros: number; papel: 'dono' | 'membro' | null; lancamentos: number; ultimo_lancamento: string | null; push: boolean; status: 'ativo' | 'suspenso' | 'parado' }
export interface Serie { dia: string; n: number }
export interface AdminMetricas { usuarios: number; carteiras: number; casais: number; novos: number; dau: number; wau: number; mau: number; parados: number; erros_24h: number;
  push_aparelhos: number; telemetria_desde: string | null; ativos_dia: Serie[]; lancamentos_dia: Serie[]; cadastros_semana: Serie[];
  retencao: { coorte: string; usuarios: number; m1: number | null; m2: number | null; m3: number | null }[]; uso_funcoes: { chave: string; carteiras: number }[]; versoes: { versao: string; n: number }[] }
export interface AdminErros { por_dia: Serie[]; frequentes: { mensagem: string; n: number; ultima: string; versoes: string[]; rotas: string[] }[] }
export interface FuncaoStatus { chave: string; ativa: boolean; mensagem: string | null; desde: string | null }
export interface ComunicadoTag { id: string; nome: string; cor: string; arquivada: boolean }
export interface Comunicado { id: string; titulo: string; texto: string; tag_id: string | null; inicio: string; fim: string; link: string | null; push: boolean;
  destaque: boolean; publicado: boolean; push_enviado_em: string | null; criado_em: string; lidos?: number; total_usuarios?: number }
export interface AdminLog { id: number; admin_id: string | null; acao: string; alvo: string | null; detalhe: unknown; criado_em: string }
```

- Regras dos campos:
  - `ultimo_uso` = `max(acessos.dia)`; se não houver acesso, usa `last_sign_in_at`.
  - `status`:
    - `suspenso` quando está em `suspensos`;
    - `parado` quando `ultimo_uso` tem mais de 30 dias, ou quando é nulo e o cadastro tem mais de 30 dias;
    - nos outros casos, `ativo`.
  - `lancamentos` = `count(gastos where criado_por = id)`.
  - `uso_funcoes`: só as funções com tabela própria, como `chat`→`mensagens`, `cofrinhos`→`cofrinho_movs`, `viagens`, `desejos`, `planejamento`→`planos`, `registros`→`registro_itens`, `receber`, `dividas`, `orcamentos`, `saldos`→`contas_bancarias`, `parcelamentos`, `desafios`. A chave segue `FUNCOES` (Task 9), e o critério é `count(distinct carteira_id)` com linha criada no período quando a tabela tem `criado_em`.
  - `retencao`: coortes = os 6 últimos meses de cadastro. `m1`, `m2` e `m3` = % de usuários da coorte com acesso no mês N depois do cadastro, ou `null` se esse mês ainda não terminou.

- [ ] **Step 1: Testes que falham:**
  - comum chamando cada `admin_*` → `acesso negado`;
  - com 2 usuários e 3 gastos fixados no teste, `admin_usuarios()` traz `lancamentos = 3` para o autor e `status = 'suspenso'` para quem está em `suspensos`;
  - `admin_metricas(30)->>'usuarios' = '2'`;
  - o JSON de `admin_usuarios` não tem as chaves `descricao` nem `valor`.
- [ ] **Step 2:** `bash scripts/testar-banco.sh` → FAIL.
- [ ] **Step 3:** Escrever a migration, a marca e os tipos.
- [ ] **Step 4:** `bash scripts/testar-banco.sh` → PASS, e `npx ng build` → ok.
- [ ] **Step 5:** Commit `migration 042: leituras do painel`.

### Task 6: Edge Function `push` — tipo `comunicado`

**Files:**
- Modify: `supabase/functions/push/index.ts`

**Interfaces:**
- Consumes: `push_enviar({tipo: 'comunicado', id})` (Task 4), `usuario_prefs`, `suspensos`.
- Produces: `comunicado(ev: { id: string }): Promise<Envio[]>`, que gera um envio com:
  - `usuarios` = todos os donos de `push_inscricoes`, menos quem tem `usuario_prefs.push_comunicados = false` e menos quem está em `suspensos`;
  - `titulo`, `texto` (cortado em 120 caracteres com `…`) e `tag: 'comunicado-' + id`;
  - `url = link ?? '/notificacoes?aba=app'`.
- Também: os demais tipos deixam de enviar para quem está em `suspensos` (filtro em `enviar()`).

- [ ] **Step 1:** Implementar `comunicado()` e incluir o tipo no despacho da linha 24.
- [ ] **Step 2:** Rodar `docker run --rm -v "$PWD/supabase/functions:/f" denoland/deno:2.5.6 check /f/push/index.ts`. Esperado: sem erros.
- [ ] **Step 3:** Commit `push: comunicados e sem envio a suspensos`.

### Task 7: Edge Function `admin`

**Files:**
- Create: `supabase/functions/admin/index.ts`, `supabase/functions/admin/regras.ts`, `supabase/functions/admin/regras.test.ts`
- Modify: `supabase/config.toml` (`[functions.admin] verify_jwt = true`), `package.json` (`fn:deploy` publica `push` e `admin`), `README.md` (deploy da `admin`)

**Interfaces:**
- Produces:
  - `POST /functions/v1/admin`, corpo `{ acao: 'suspender' | 'reativar' | 'excluir', user_id: string, motivo?: string }`. Resposta `200 {ok: true}`, `400 {erro}` (ação inválida ou alvo = chamador), `403 {erro: 'acesso negado'}`.
  - `regras.ts`: `podeAgir(chamador: string, alvo: string, acao: string): string | null` devolve a mensagem de erro, ou null quando a ação é permitida.
  - Fluxo:
    1. Cliente com o `Authorization` do chamador → `rpc('is_admin')`; se for falso, devolve 403.
    2. `podeAgir()`.
    3. Ações com o cliente `service_role`:
       - suspender: `updateUserById(id, { ban_duration: '876000h' })` + insert em `suspensos(user_id, motivo)`;
       - reativar: `ban_duration: 'none'` + delete em `suspensos`;
       - excluir: remove `avatares/<id>/` do storage, depois `deleteUser(id)` (o trigger da Task 2 cuida da carteira).
    4. Insert em `admin_log(admin_id = chamador, acao, alvo = user_id, detalhe = {motivo})` para excluir. Suspender e reativar já são registrados pelo trigger.
  - CORS: responder `OPTIONS` com os headers que o `supabase-js` usa.

- [ ] **Step 1: Teste que falha** em `regras.test.ts` (Deno test):
  - `podeAgir('a', 'a', 'excluir')` → `'Não é possível agir sobre a própria conta'`;
  - `podeAgir('a', 'b', 'apagar')` → `'Ação inválida'`;
  - `podeAgir('a', 'b', 'suspender')` → `null`.
- [ ] **Step 2:** `docker run --rm -v "$PWD/supabase/functions:/f" denoland/deno:2.5.6 test /f/admin/regras.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `regras.ts` e `index.ts`.
- [ ] **Step 4:** O mesmo comando → PASS, e `deno check /f/admin/index.ts` → ok.
- [ ] **Step 5:** Commit `edge function admin`.

### Task 8: Admin no app (identidade, guard, suspensão, entrada no menu)

**Files:**
- Create: `src/app/core/admin.ts`, `src/app/core/admin.spec.ts`, `src/app/pages/suspensa.ts`
- Modify: `src/app/core/auth.ts` (checa a suspensão), `src/app/app.routes.ts` (rota `suspensa`), `src/app/layout/shell.ts` (link "Painel admin" acima de "Sair do app", só para admin), `src/app/pages/mais.ts` (card "Painel admin" no grupo App, só para admin)

**Interfaces:**
- Produces:
  - `class Admin`:
    - `eAdmin: Signal<boolean | null>`, recarregado quando `Auth.user()` muda, via `rpc('is_admin')`;
    - `usuarios(): Promise<AdminUsuario[]>`;
    - `metricas(dias: number): Promise<AdminMetricas>`;
    - `erros(dias: number): Promise<AdminErros>`;
    - `log(acao?: string): Promise<AdminLog[]>`;
    - `agir(acao: 'suspender' | 'reativar' | 'excluir', userId: string, motivo?: string): Promise<void>`, via `supabase.functions.invoke('admin', { body })`, que lança `Error(erro)`;
    - `redefinirSenha(email: string): Promise<void>`, com `resetPasswordForEmail(email, { redirectTo: location.origin })` + `rpc('admin_registrar', { p_acao: 'senha', p_alvo: email })`;
    - `salvarFuncao(chave: string, ativa: boolean, mensagem: string | null)`, um upsert com `desde = now` e `por = uid`;
    - `comunicados(): Promise<Comunicado[]>`;
    - `salvarComunicado(c: Partial<Comunicado>): Promise<Comunicado>`;
    - `excluirComunicado(id)`;
    - `tags(): Promise<ComunicadoTag[]>`;
    - `salvarTag(t: Partial<ComunicadoTag>)`.
  - `adminGuard: CanActivateFn`: logado e `is_admin` → `true`; caso contrário → `UrlTree('/')`.
  - `Auth.suspensa: Signal<boolean>`: depois de ter sessão, `rpc('estou_suspenso')`; se for verdadeiro → `router` para `/suspensa`. A página mostra "Conta suspensa. Fale com o suporte." e o botão Sair, que chama `auth.sair()`.

- [ ] **Step 1: Teste que falha** (`admin.spec.ts`): `adminGuard` com `Auth.user()` nulo devolve `UrlTree` para `/`; com `rpc` mockado devolvendo `false` → `/`; devolvendo `true` → `true`. Usar `TestBed.runInInjectionContext` e um `supabase.rpc` mockado com `vi.spyOn`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS, `npx ng build` → ok.
- [ ] **Step 5:** Commit `admin no app e conta suspensa`.

### Task 9: Funções em manutenção no app

**Files:**
- Create: `src/app/core/funcoes.ts`, `src/app/core/funcoes.spec.ts`, `src/app/pages/manutencao.ts`
- Modify: `src/app/app.routes.ts` (`canActivateChild: [funcaoGuard]` no Shell; rota `manutencao/:chave` filha do Shell), `src/app/layout/shell.ts` (faixa para o admin)

**Interfaces:**
- Consumes: `FuncaoStatus` (Task 5), `Admin.eAdmin: Signal<boolean | null>` (Task 8).
- Produces:
  - `export interface Funcao { chave: string; nome: string; rotas: string[] }`;
  - `export const FUNCOES: Funcao[]`. Chaves e rotas: importar `/importar`, chat `/chat`, cofrinhos `/cofrinhos`, viagens `/viagens`, desejos `/desejos`, planejamento `/planejamento`, relatorios `/relatorios`, resumo `/resumo`, retrospectiva `/retrospectiva`, imposto `/imposto`, calculadoras `/calculadoras`, inflacao `/inflacao`, desafios `/desafios`, registros `/registros`, receber `/receber`, dividas `/dividas`, orcamentos `/orcamentos`, saldos `/saldos`, parcelamentos `/parcelamentos`, beneficios `/beneficios`, calendario `/calendario`, fechamento `/fechamento`, assinaturas `/assinaturas`. `nome` = o rótulo do menu (`layout/menu.ts`);
  - `funcaoDaRota(url: string): Funcao | null`: compara o caminho sem query e sem hash; `/cofrinhos/123` → cofrinhos;
  - `bloqueio(url: string, status: Record<string, FuncaoStatus>, admin: boolean): FuncaoStatus | null`;
  - `@Injectable({providedIn: 'root'}) class Funcoes`, com `status: Signal<Record<string, FuncaoStatus>>`, carga inicial e realtime em `funcoes_status`. Um effect: se a URL atual ficar bloqueada, chama `router.navigate(['/manutencao', chave])`;
  - `funcaoGuard: CanActivateChildFn`, que espera a primeira carga e devolve `UrlTree('/manutencao/<chave>')` ou `true`;
  - `pages/manutencao.ts`: ícone `construction`, "<nome> em manutenção", a mensagem (ou "Volta em breve."), e o botão Voltar para `/`. Se a função voltar a ficar ativa, navega para a rota dela.

- [ ] **Step 1: Testes que falham** (`funcoes.spec.ts`):
  - `funcaoDaRota('/cofrinhos/abc?x=1')?.chave === 'cofrinhos'`;
  - `funcaoDaRota('/gastos') === null`;
  - `bloqueio('/importar', { importar: { chave: 'importar', ativa: false, mensagem: 'm', desde: null } }, false)?.mensagem === 'm'`;
  - a mesma chamada com `admin = true` → `null`;
  - sem linha de status → `null`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar `funcoes.ts`, a página, as rotas e a faixa "Em manutenção para os usuários" no Shell, que aparece quando `eAdmin` está ligado e a rota atual tem status `ativa = false`.
- [ ] **Step 4:** `npm test` → PASS, `npx ng build` → ok.
- [ ] **Step 5:** Commit `funções em manutenção`.

### Task 10: Telemetria no app (acesso diário, erros, Speed Insights)

**Files:**
- Create: `src/app/core/telemetria.ts`, `src/app/core/telemetria.spec.ts`
- Modify: `src/app/app.config.ts` (`{ provide: ErrorHandler, useClass: ErroGlobal }`), `src/main.ts` (`injectSpeedInsights()`), `package.json` (`@vercel/speed-insights`)

**Interfaces:**
- Produces:
  - `aparelho(ua: string, standalone: boolean): string`, que devolve `'celular'` ou `'desktop'`, mais `' · app'` quando instalado (PWA) ou `' · navegador'`;
  - `deveRegistrar(marca: string | null, uid: string, dia: string): boolean`, falso quando `marca === uid + ':' + dia`;
  - `resumoErro(e: unknown): { mensagem: string; detalhe: string }`: `mensagem` com até 500 caracteres, `detalhe` (stack) com até 2000;
  - `class Telemetria`: effect sobre `Auth.user()` → `registrar_acesso(VERSAO, aparelho(...))` uma vez por dia por aparelho, com a marca em `localStorage['cfp.acesso']` (try/catch);
  - `class ErroGlobal implements ErrorHandler`: `console.error`, e depois `registrar_erro` (dispara e esquece, `.then(undefined, () => {})`). Para não entrar em loop, um flag `enviando` ignora o erro que nasce do próprio envio. Também escuta `unhandledrejection`. Sem toast.
  - Instanciar `Telemetria` no `App` (injetar no construtor de `app.ts`).

- [ ] **Step 1: Testes que falham:**
  - `aparelho('...iPhone...', true) === 'celular · app'`;
  - `aparelho('Mozilla/5.0 (X11; Linux x86_64)', false) === 'desktop · navegador'`;
  - `deveRegistrar('u:2026-11-05', 'u', '2026-11-05') === false`;
  - `deveRegistrar(null, 'u', '2026-11-05') === true`;
  - `resumoErro(new Error('x'.repeat(900))).mensagem.length === 500`;
  - `ErroGlobal.handleError` com `supabase.rpc` mockado para rejeitar **não lança**.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar e instalar `@vercel/speed-insights` (`npm i @vercel/speed-insights`).
- [ ] **Step 4:** `npm test` → PASS, `npx ng build` → ok (sem estourar o budget do bundle inicial; se estourar, tirar o Speed Insights e registrar isso no commit).
- [ ] **Step 5:** Commit `telemetria de acesso e erros`.

### Task 11: Comunicados no app do usuário

**Files:**
- Create: `src/app/core/comunicados.ts`, `src/app/core/comunicados.spec.ts`, `src/app/shared/destaque.ts`
- Modify:
  - `src/app/pages/notificacoes.ts`: abas "Para você" e "Avisos do app", com `?aba=app` abrindo a segunda;
  - `src/app/layout/avisos.ts`: seção de comunicados no topo;
  - `src/app/layout/shell.ts`: o badge do sino e `badge('/notificacoes')` somam `comunicados.naoLidos().length`; `<app-destaque />`;
  - `src/app/pages/config.ts`: toggle "Avisos do app" → `usuario_prefs.push_comunicados` (upsert).
  - Autor "Conta excluída": no chat (`pages/chat.ts`), nos acertos e onde o nome do autor de um gasto aparece, usar `'Conta excluída'` quando `user_id`/`criado_por`/`de`/`para` é nulo ou não está em `Store.membros()`.

**Interfaces:**
- Consumes: `Comunicado`, `ComunicadoTag` (Task 5).
- Produces:
  - `statusComunicado(c: Comunicado, agora: Date): 'rascunho' | 'agendado' | 'no_ar' | 'expirado'`;
  - `noAr(l: Comunicado[], agora: Date): Comunicado[]`, ordenado por `inicio` decrescente;
  - `class Comunicados`:
    - `lista: Signal<(Comunicado & { tag: ComunicadoTag | null })[]>` (já filtrada por `noAr`, com `agora` atualizado a cada 60 s);
    - `naoLidos: Signal<Comunicado[]>`;
    - `destaque: Signal<Comunicado | null>`: o primeiro `destaque` não lido;
    - `marcarLidos(ids: string[]): Promise<void>`: upsert com `ignoreDuplicates`;
    - realtime em `comunicados` (qualquer evento → recarrega);
    - não depende de carteira.
  - `app-destaque`: modal com ícone, título, texto, "Depois" (marca como lido) e "Ver" (marca como lido e navega para o `link`; uma URL externa abre em `window.open`).
  - Comunicado **não** entra em `Insights.notificarSistema`.

- [ ] **Step 1: Testes que falham** (`comunicados.spec.ts`, com `agora = new Date('2026-12-25T12:00:00-03:00')`):
  - rascunho (`publicado: false`) → `'rascunho'`;
  - `inicio` 2026-12-26 → `'agendado'`;
  - `inicio` 2026-12-24 e `fim` 2026-12-26 → `'no_ar'`;
  - `fim` 2026-12-25T11:59 → `'expirado'`;
  - `noAr` com os quatro → só o no ar.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar o serviço, o modal e as mudanças de tela.
- [ ] **Step 4:** `npm test` → PASS, `npx ng build` → ok.
- [ ] **Step 5:** Commit `avisos do app para os usuários`.

### Task 12: Layout do painel e Visão geral

**Files:**
- Create: `src/app/pages/admin/layout.ts`, `src/app/pages/admin/visao.ts`, `e2e/admin.e2e.ts`
- Modify: `src/app/app.routes.ts` (`{ path: 'admin', canActivate: [logadoGuard, adminGuard], loadComponent: layout, children: [...] }` antes do Shell)

**Interfaces:**
- Consumes: `Admin` (Task 8), `Barras` e `Curvas` de `shared/graficos.ts` (conferir os inputs no arquivo), `AdminMetricas`.
- Produces:
  - `layout.ts`: menu lateral escuro, como no mockup `.superpowers/brainstorm/1297044-1793883882/content/painel-layout.html`. Itens:
    - Visão geral `monitoring` `/admin`
    - Usuários `group` `/admin/usuarios`
    - Funções `toggle_on` `/admin/funcoes`
    - Central de avisos `campaign` `/admin/avisos`
    - Erros e saúde `bug_report` `/admin/saude`
    - Notas de versão `new_releases` `/admin/versoes`
    - Auditoria `history` `/admin/auditoria`
    - Assinaturas `workspace_premium`, desabilitado, com selo "em breve"
    - No rodapé, "Voltar ao app" `/`.
    - Abaixo de 900px, o menu vira só ícones.
  - `visao.ts`:
    - período 7/30/90 dias;
    - alerta de migrations faltando (`colunas_faltando` com a lista de `scripts/marcas-banco.json`, importada pelo app com `resolveJsonModule`);
    - KPIs: usuários, carteiras (com casais), ativos hoje/mês com DAU/MAU, lançamentos/dia e erros em 24h;
    - gráfico de ativos por dia;
    - uso por função (barras horizontais);
    - tabela de retenção;
    - versões em uso;
    - link "Speed Insights ↗" para `https://vercel.com/dashboard`;
    - "dados desde dd/mm" com `telemetria_desde`.
- e2e (`admin.e2e.ts`): abrir `/admin`. Com `process.env.CFP_ADMIN === '1'`, espera o texto "Visão geral" visível e nenhum erro de console. Sem essa variável, espera a URL voltar a `/`.

- [ ] **Step 1:** Escrever `admin.e2e.ts` e rodar `npm run e2e -- admin` → FAIL (a rota não existe e cai em `**`; só falha quando `CFP_ADMIN=1`).
- [ ] **Step 2:** Implementar o layout, a visão geral e as rotas filhas (as demais filhas com `loadComponent` das Tasks 13–15; até lá, criar páginas vazias com o título).
- [ ] **Step 3:** `CFP_ADMIN=1 npm run e2e -- admin` → PASS (a conta do e2e é a do admin); `npx ng build` → ok.
- [ ] **Step 4:** Commit `painel admin: layout e visão geral`.

### Task 13: Usuários e Funções (painel)

**Files:**
- Create: `src/app/pages/admin/usuarios.ts`, `src/app/pages/admin/funcoes.ts`

**Interfaces:**
- Consumes: `Admin.usuarios/agir/redefinirSenha/salvarFuncao`, `Funcoes.status`, `FUNCOES`.
- Produces:
  - `usuarios.ts`:
    - busca por e-mail ou nome;
    - tabela com usuário, carteira (membros), cadastro, último uso, lançamentos, versão e status (pill);
    - menu ⋮ com: Ver detalhes (painel lateral com todos os campos de `AdminUsuario`), Enviar redefinição de senha, Suspender/Reativar (pede o motivo) e Excluir conta (modal que só habilita o botão quando o e-mail digitado é igual ao da conta);
    - a linha do próprio admin não mostra Suspender nem Excluir;
    - depois de cada ação: toast e recarga da lista.
  - `funcoes.ts`:
    - uma linha por item de `FUNCOES`, com status, mensagem editável, "desde" e um switch;
    - ao desligar, pede a mensagem (sugestão "Volta em breve.");
    - um botão "Criar aviso de manutenção" abre `/admin/avisos?novo=manutencao&funcao=<chave>`.

- [ ] **Step 1:** Implementar as duas páginas.
- [ ] **Step 2:** `npx ng build` → ok. Com `npm start`, abrir `/admin/usuarios` e `/admin/funcoes` com a conta admin **só navegando**: sem suspender, excluir nem desligar nada na conta real.
- [ ] **Step 3:** Commit `painel admin: usuários e funções`.

### Task 14: Central de avisos (painel)

**Files:**
- Create: `src/app/pages/admin/avisos.ts`, `src/app/pages/admin/aviso-form.ts`, `src/app/pages/admin/avisos.spec.ts`

**Interfaces:**
- Consumes: `Admin.comunicados/salvarComunicado/excluirComunicado/tags/salvarTag`, `statusComunicado` (Task 11), `NOTAS` (`core/versao.ts`).
- Produces:
  - `avisoDaVersao(n: Nota): Pick<Comunicado, 'titulo' | 'texto' | 'link'>`: `titulo = 'Chegou a ' + n.versao`, `texto` = os 3 primeiros itens separados por `' · '` e cortados em 280 caracteres com `…`, `link = '/novidades'`;
  - `avisos.ts`:
    - lista com tag (cor), título, período, status (pill) e "lido por X de Y";
    - ações: editar, duplicar, encerrar agora (`fim = now`, só quando está no ar), excluir (só rascunho);
    - aba "Tags": criar, renomear, mudar cor (`input type=color`) e arquivar;
    - query `?novo=versao&v=<versao>` ou `?novo=manutencao&funcao=<chave>` abre o form já preenchido.
  - `aviso-form.ts`: título, mensagem, tag (select com "+ Nova tag"), início e fim (`datetime-local`), link (interno ou URL), push, destaque, pré-visualização (o mesmo card da aba do usuário), "Salvar rascunho" (`publicado = false`) e "Publicar/Agendar" (`publicado = true`). Validação: título, texto, tag, início e fim são obrigatórios, com `fim > inicio`.

- [ ] **Step 1: Teste que falha** (`avisos.spec.ts`): `avisoDaVersao({ versao: 'v1.26.11.9', data: '2026-11-05', itens: ['a', 'b', 'c', 'd'] })` → `{ titulo: 'Chegou a v1.26.11.9', texto: 'a · b · c', link: '/novidades' }`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS, `npx ng build` → ok.
- [ ] **Step 5:** Commit `painel admin: central de avisos`.

### Task 15: Erros e saúde, Notas de versão, Auditoria

**Files:**
- Create: `src/app/pages/admin/saude.ts`, `src/app/pages/admin/versoes.ts`, `src/app/pages/admin/auditoria.ts`

**Interfaces:**
- Consumes: `Admin.erros/metricas/log`, `NOTAS`, `VERSAO`, `avisoDaVersao` (Task 14).
- Produces:
  - `saude.ts`:
    - erros por dia (gráfico);
    - os mais frequentes (mensagem, contagem, última vez, versões e rotas);
    - estado das migrations (a mesma checagem da visão geral, com a lista do que falta);
    - versões em uso.
  - `versoes.ts`:
    - os cards de `NOTAS`, como em `/novidades`, com o selo "Atual" em `VERSAO`;
    - por versão, quantos usuários ainda estão nela (de `metricas(7).versoes`);
    - botão "Criar aviso desta versão" → `/admin/avisos?novo=versao&v=<versao>`.
  - `auditoria.ts`: lista do `admin_log` (data, ação, alvo, detalhe resumido) com filtro por ação.

- [ ] **Step 1:** Implementar as três páginas.
- [ ] **Step 2:** `npx ng build` → ok; `CFP_ADMIN=1 npm run e2e -- admin` → PASS; navegar pelas três páginas sem erros de console.
- [ ] **Step 3:** Commit `painel admin: saúde, versões e auditoria`.

### Task 16: Versão, documentação e validação final

**Files:**
- Modify: `src/app/core/versao.ts`, `CHANGELOG.md`, `README.md` (painel admin, Edge Function `admin`, ligar o Speed Insights na Vercel, ordem de aplicação 039→042), `.gitignore` (`.superpowers/`), a memória do projeto (`banco-supabase.md`, `arquitetura.md`, `mapa-arquivos.md`, `controle-commit.md`)

- [ ] **Step 1:** Nota `v1.26.11.9` (data 2026-11-05), escrita para o usuário final e sem citar o painel admin. Itens: avisos do app nas Notificações, telas em manutenção, preferência de push de avisos.
- [ ] **Step 2:** Rodar `bash scripts/testar-banco.sh && npm test && npx ng build && npm run e2e`. Esperado: tudo verde, e os 79 e2e que já existiam continuam passando.
- [ ] **Step 3:** Commit `v1.26.11.9`.
- [ ] **Step 4:** Avisar o usuário do que ele precisa fazer à mão:
  - `npm run db:push` (039–042);
  - `npm run fn:deploy`;
  - ligar o Speed Insights na Vercel;
  - conferir se `jonathan.willian@embras.net` entrou em `admins`.
