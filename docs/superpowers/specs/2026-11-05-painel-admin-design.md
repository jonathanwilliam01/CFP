# Painel administrativo do CFP — design

Data: 2026-11-05 · Base: v1.26.11.8 (`main`)

## Intenção

O CFP está virando um produto (SaaS). O dono (jonathan.willian@embras.net) precisa de um backoffice para acompanhar e manter o app: ver quem usa, desligar uma função quando ela tem bug ou está em refatoração, falar com todos os usuários e ver a saúde do app. Mais tarde o mesmo painel vai controlar as assinaturas, que **não** entram agora.

O padrão a seguir é o de um app financeiro profissional (LGPD): o admin vê dados da **conta** e **contagens** de uso, nunca o conteúdo financeiro.

## Objetivos

1. Ver usuários, carteiras e uso (só números).
2. Agir sobre contas: suspender/reativar, enviar redefinição de senha, excluir.
3. Ligar/desligar funções para todos (modo manutenção).
4. Métricas de crescimento, uso, retenção e saúde (erros, versões em uso, migrations).
5. Central de avisos: comunicados para todos os usuários, com agenda, expiração, tag, push opcional e aba própria no app.
6. Ler as notas de versão do código.
7. Registrar toda ação do admin (auditoria).

## Fora do escopo

- Assinaturas e cobrança. O item aparece no menu, desabilitado, com o selo "em breve".
- Liberar função por usuário ou por plano. A chave vale para todos.
- Ver gastos, valores, chat ou comprovantes de usuários. Também não haverá "entrar como o usuário" (impersonação).
- Editar notas de versão pelo painel. Elas continuam em `core/versao.ts`.
- Tela para gerenciar quem é admin. A tabela permite mais de um, mas o cadastro é por SQL.

## O que não pode acontecer (anti-objetivos)

- Chave `service_role` no navegador, ou qualquer dado de admin protegido só pela interface. O banco ou a Edge Function confere `is_admin()` em toda leitura e escrita.
- Usuário comum conseguir ler as tabelas ou RPCs do admin.
- Expor conteúdo financeiro no painel.
- O registro de erros ou de acessos deixar o app lento ou virar spam. Precisa de limite e de envio "dispara e esquece".

## Decisões do usuário

- Admin único hoje: jonathan.willian@embras.net.
- Painel com **menu lateral**. Itens: Visão geral, Usuários, Funções, Central de avisos, Erros e saúde, Notas de versão, Auditoria, Assinaturas (bloqueado, "em breve").
- Usuários: dados de conta + contagens. Ações: suspender/reativar, redefinição de senha por e-mail e excluir conta.
- Suspender corta o acesso na hora.
- Excluir conta de quem tem parceiro: lançamentos, chat e acertos ficam na carteira, com o autor aparecendo como "Conta excluída".
- Funções: chave global de manutenção, para casos de bug ou refatoração.
- Métricas: crescimento, uso, retenção, uso por função e saúde do app.
- Avisos: data de exibição, data de expiração, tag de assunto, viram notificação (push) e aparecem numa aba de avisos no app. Exemplos: Natal, nova versão.
- Tags de aviso: 5 iniciais (Nova versão, Manutenção, Datas comemorativas, Dica, Importante), e o admin pode criar novas.
- Notas de versão: as mesmas do código, só leitura.

Mockups aprovados na conversa: `.superpowers/brainstorm/1297044-1793883882/content/painel-layout.html` e `central-avisos.html`. Eles servem de referência de estrutura; os números são fictícios.

## Como funciona

### Identidade de admin
- Tabela `admins (user_id uuid pk references auth.users on delete cascade, criado_em)`. A migration insere o usuário do e-mail acima (`select id from auth.users where email = ...`; se ele não existir, não insere nada).
- `is_admin()` em SQL, `security definer` e `stable`: `exists (select 1 from admins where user_id = auth.uid())`.
- Sem policy de leitura em `admins` para usuário comum. O app descobre se é admin por `rpc('is_admin')`.

### Rota e layout
- Rota `/admin`, carregada com lazy load, **fora** do `Shell`. Ela tem layout próprio: menu lateral escuro e conteúdo à direita, como nos mockups. Não depende de carteira.
- `adminGuard` exige estar logado e `is_admin()` verdadeiro. Se não for admin, volta para `/`.
- Rotas filhas: `/admin` (visão geral), `/admin/usuarios`, `/admin/funcoes`, `/admin/avisos`, `/admin/saude`, `/admin/versoes`, `/admin/auditoria`.
- O link "Painel admin" aparece no menu lateral e no Mais do app **só** para admin.
- Celular: o menu lateral vira gaveta (ou só ícones). O uso principal é no desktop, mas tem que funcionar no celular.
- Arquivos em `pages/admin/` e `core/admin.ts`. Evitar o nome `painel`, que já existe (`core/painel.ts` cuida dos blocos do Início).

### Leitura de dados
- RPCs `admin_*` com `security definer` e `set search_path`. A primeira linha é `if not is_admin() then raise exception 'acesso negado'`. `revoke` de `public`/`anon`, `grant` para `authenticated`.
- `admin_usuarios()`: uma linha por usuário com id, e-mail, nome (`raw_user_meta_data`), `created_at`, último uso (de `acessos`), última versão e aparelho, carteira (nome e número de membros), papel, contagem de gastos criados por ele (`gastos.criado_por`), data do último lançamento, se tem push inscrito e status (ativo / suspenso via `banned_until` / parado = mais de 30 dias sem acesso).
- `admin_metricas(p_dias int)`: KPIs e séries. Total de usuários e carteiras, cadastros por semana, carteiras com 2 membros, DAU/WAU/MAU e série diária de ativos (de `acessos`), lançamentos por dia (contagem de `gastos.criado_em`), retenção por mês de cadastro (meses 1 a 3, a partir de `acessos`), contas paradas, uso por função (`count(distinct carteira_id)` no período em cada tabela da função), aparelhos com push, versões em uso nos últimos 7 dias e estado das migrations.
  - Estado das migrations: `colunas_faltando` só confere a lista que recebe, e essa lista (`MARCAS`) mora em `scripts/checar-banco.mjs`. Ela vai para um JSON único, lido pelo script e pelo app (*decisão minha*).
  - Histórico de antes da telemetria: quando não há registro em `acessos`, "último uso" usa `auth.users.last_sign_in_at`. Lançamentos por dia usam `gastos.criado_em` desde o começo. DAU e retenção mostram "dados desde dd/mm" (*decisão minha*).
- `admin_erros(p_dias)`: erros por dia, os mais frequentes (agrupados por mensagem), com versão e rota.

### Ações sobre contas
- Edge Function nova `admin` (Deno). Ela funciona diferente da `push`, que usa segredo compartilhado e `verify_jwt = false`:
  - `verify_jwt = true`. A função monta o cliente com o JWT de quem chamou, confere `rpc('is_admin')` e só depois usa `service_role` pela API oficial.
  - É preciso ajustar o `supabase/config.toml` e o script `fn:deploy`, que hoje publica só a `push`.
- Suspender **corta o acesso na hora** (decisão do usuário):
  - `auth.admin.updateUserById(id, { ban_duration: '876000h' })` e insert em `suspensos (user_id pk, desde, motivo)`.
  - `is_membro()` passa a exigir `not exists (select 1 from suspensos where user_id = auth.uid())`. Com isso, todo o RLS das carteiras e o realtime param no mesmo instante.
  - As policies que não usam `is_membro` (`push_inscricoes`, storage `avatares`/`comprovantes`) também precisam ganhar essa checagem.
  - No app: se vier erro de permissão, ou se `rpc('estou_suspenso')` disser que sim ao abrir, mostra a tela "Conta suspensa" e chama `sair()`.
- Reativar: `ban_duration: 'none'` e delete em `suspensos`.
- Redefinição de senha: pelo próprio app, com o mesmo padrão de `core/auth.ts` (`resetPasswordForEmail(email, { redirectTo: location.origin })` mais o evento `PASSWORD_RECOVERY`), e registro na auditoria.
- Excluir conta: `auth.admin.deleteUser(id)`. O histórico fica e o autor vira anônimo (decisão do usuário).
  - Se a pessoa é o único membro da carteira, a carteira vai junto (mesma limpeza do `excluir_carteira`).
  - Se há parceiro, a pessoa sai de `carteira_membros` e o parceiro vira dono se for preciso. Lançamentos, chat e acertos continuam, com o autor aparecendo como "Conta excluída".
  - FKs que a migration precisa corrigir:
    - `carteiras.criado_por` hoje é `on delete cascade`, o que apagaria a carteira do casal. Passa a `set null`.
    - `mensagens.user_id`, `acertos.de` e `acertos.para` hoje são `not null ... on delete cascade`. Passam a aceitar null, com `set null`.
    - `pago_por` já está como `set null`.
    - Antes de mexer, varrer todas as FKs para `auth.users`.
  - As colunas `criado_por` sem FK ficam com um uuid órfão. O app mostra "Conta excluída" quando o uuid não está entre os membros.
  - Some tudo o que é pessoal: login, e-mail, nome, foto (`avatares/<uid>/`), inscrições de push, `acessos` e `usuario_prefs`.
- A confirmação de exclusão pede para digitar o e-mail da conta.
- Não se troca nem se define a senha do usuário pelo painel.

### Funções em manutenção
- Registro no código, `core/funcoes.ts`: lista `{ chave, nome, rotas[] }`. Ficam de fora as telas essenciais (Início, Gastos, Contas, Entradas, Cartões, Config, Notificações), porque desligá-las inutiliza o app (*decisão minha*). Candidatas: importar, chat, cofrinhos, viagens, desejos, planejamento, relatórios, resumo, retrospectiva, imposto, calculadoras, inflação, desafios, registros, receber, dívidas, orçamentos, saldos, parcelamentos, benefícios, calendário, fechamento, assinaturas (do usuário).
- Tabela `funcoes_status (chave text pk, ativa bool default true, mensagem text, desde timestamptz, por uuid)`. Sem linha = ativa. Leitura para `authenticated`; escrita só com `is_admin()` (policy). Entra no realtime.
- App: o Store carrega e escuta `funcoes_status`. Um `funcaoGuard` nas rotas registradas manda para uma tela "Em manutenção" com nome, mensagem e botão Voltar, como no mockup 3. Atalhos para a função (botão de importar etc.) mostram a mesma mensagem em vez de abrir.
- **Admin não é bloqueado**: entra normalmente e vê uma faixa "Em manutenção para os usuários", para testar a correção (*decisão minha*).
- É um bloqueio de **interface**, de propósito (manutenção). O RLS não muda. Quando as assinaturas chegarem, o bloqueio por plano vai precisar valer também no banco.

### Telemetria (base das métricas)
- `acessos (user_id, dia date, versao text, aparelho text, pk(user_id, dia))`. RPC `registrar_acesso(p_versao, p_aparelho)` com `insert ... on conflict (user_id, dia) do update set versao, aparelho`. O app chama uma vez por dia por aparelho, quando a sessão fica ativa em `Auth`. Não é no Store, para contar também quem está em `/bem-vindo` sem carteira (marca em localStorage, protegida com try/catch). `aparelho` = celular/desktop + PWA instalado ou navegador.
- `erros_app (id, user_id, criado_em, versao, rota, mensagem text, detalhe text até 2000 caracteres, navegador)`. RPC `registrar_erro(...)` com limite de 20 por usuário por hora (acima disso, ignora). No app: um `ErrorHandler` global mais `unhandledrejection`, dispara e esquece, sem toast e sem retry. Um cron apaga erros com mais de 90 dias.
- Nenhuma das duas tabelas pode ser lida por usuário comum.
- Tempo de carregamento: Vercel Speed Insights (`@vercel/speed-insights`, `injectSpeedInsights()` no `main.ts`) e um link para o painel da Vercel. É preciso ligar o Speed Insights no projeto da Vercel. Se o pacote não se der bem com o build, fica só o link (*decisão minha*).

### Central de avisos
- Nomes no banco e no código: `comunicados`, `comunicado_tags`, `comunicado_leituras` e `interface Comunicado`. O nome "aviso" já está em uso (`Insights.avisos`, `interface Aviso`, `layout/avisos.ts`, `avisos_vencimento`). Na interface o texto continua "Avisos" (*decisão minha*).
- `comunicado_tags (id, nome text unique, cor text, arquivada bool default false)`. A migration já cria as 5 iniciais.
- `comunicados (id, titulo, texto, tag_id fk, inicio timestamptz, fim timestamptz not null check fim > inicio, link text null, push bool, destaque bool, publicado bool default false, push_enviado_em timestamptz, criado_por, criado_em, atualizado_em)`.
  - Status calculado: rascunho (`not publicado`), agendado (`publicado` e `inicio > now`), no ar, expirado (`fim <= now`).
- `comunicado_leituras (comunicado_id fk on delete cascade, user_id, lido_em, pk(comunicado_id, user_id))`.
- RLS:
  - `comunicados`: usuário lê os que estão `publicado and inicio <= now() and fim > now()`; admin faz tudo.
  - `comunicado_tags`: leitura para todos os logados; escrita do admin.
  - `comunicado_leituras`: usuário insere e lê as próprias; admin lê contagens por RPC.
  - `comunicados` entra no realtime.
- Push:
  - cron `cfp-comunicados` a cada 15 min procura comunicados `publicado and push and push_enviado_em is null and inicio <= now() and fim > now()` e chama `push_enviar` com o tipo novo `comunicado`;
  - a Edge Function `push` envia para todas as `push_inscricoes` de quem não desligou;
  - marca `push_enviado_em`.
  - A preferência é **por usuário**, não por carteira, porque o comunicado é global e há quem não tenha carteira. Fica numa tabela `usuario_prefs (user_id pk, push_comunicados bool default true)`, com um toggle em Configurações (*decisão minha*).
- App do usuário:
  - `/notificacoes` ganha abas "Para você" (os avisos do `Insights` de hoje) e "Avisos do app" (comunicados no ar, com tag colorida, data, texto e link).
  - O sino (popover em `layout/avisos.ts`) também lista os comunicados, e o badge soma tudo. O comunicado **não** entra em `Insights.notificarSistema`: o push já cobre, e assim não chega aviso duplicado.
  - O comunicado conta como lido quando aparece no popover ou na aba (insert em `comunicado_leituras`).
  - Aviso `destaque` abre como janela uma única vez por usuário (até haver leitura).
  - `link` aceita rota interna (ex.: `/novidades`) ou URL externa.
- Painel:
  - lista com status, tag, período e "lido por X de Y";
  - editor com título, mensagem, tag (com "criar nova"), início, fim, link, push e destaque;
  - pré-visualização, salvar rascunho, agendar/publicar, duplicar e encerrar agora (`fim = now()`).
  - Gerenciar tags: criar, renomear, mudar cor, arquivar.

### Notas de versão
- `/admin/versoes` lista `NOTAS` de `core/versao.ts` (a mesma fonte de `/novidades`), mostra a versão atual e quantos usuários estão em cada versão (de `acessos`).
- Botão "Criar aviso desta versão": abre o editor preenchido com a tag Nova versão, título "Chegou a vX", resumo dos itens e link `/novidades` (*decisão minha*).

### Auditoria
- `admin_log (id, admin_id, acao text, alvo text, detalhe jsonb, criado_em)`. Só o admin lê; ninguém edita.
- O que é registrado:
  - triggers em `funcoes_status`, `comunicados`, `comunicado_tags` e `suspensos` (insert/update/delete, com o diff essencial);
  - a Edge Function `admin` (suspender/reativar/excluir);
  - a RPC `admin_registrar(acao, alvo)` para a redefinição de senha.
- `/admin/auditoria`: lista com filtro por ação.

## Convenções do projeto a seguir

- Migration `039_admin.sql` (ou várias, numeradas em sequência) + marca em `MARCAS` de `scripts/checar-banco.mjs` + tipos em `models.ts`. Aplicar com `npm run db:push`. O Claude não executa migration no banco real.
- Componentes standalone, signals, zoneless, `OnPush`, lazy `loadComponent` com `export default class`. Gráficos reaproveitam `shared/graficos.ts`. Ícones Material Symbols via `app-icon`. Cores pelas variáveis de `styles.scss`.
- Budget de CSS por componente (10/16 kB) no build de produção.
- Nova versão v1.26.11.9 (ou a próxima livre): nota no topo de `core/versao.ts` e no `CHANGELOG.md`.
- Validação:
  - `npx ng build`;
  - `npm test` (Vitest) para as funções puras (status de aviso, guard de função, montagem do aviso de versão);
  - `npm run e2e` (Playwright, porta 4310) com pelo menos um caso: usuário comum que abre `/admin` volta para `/`; função desligada mostra a tela de manutenção.
- A conta de teste tem dados reais do casal: só navegar.
- Edge Function `admin`: documentar o deploy no README, junto da `push`.

## Fica a critério do builder

- Divisão exata das migrations e nomes de colunas secundárias.
- Visual fino das telas, desde que siga os mockups e o tema do app (claro/escuro).
- Como agrupar os erros "mais frequentes" (mensagem normalizada).
- Tabelas de cada função para "uso por função".
- Paginação e busca na lista de usuários (o volume hoje é pequeno).
