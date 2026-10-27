# CFP - Controle Financeiro Pessoal

App mobile first (PWA) para controle financeiro do casal. Angular 22 + Supabase, deploy na Vercel.

## Rodar local

```bash
cp .env.example .env   # preencher SUPABASE_URL e SUPABASE_ANON_KEY
npm install
npm start              # http://localhost:4200
```

`npm start`/`npm run build` geram `src/environments/environment.ts` a partir do `.env` ou das variáveis de ambiente.

## Supabase

1. Criar projeto em supabase.com.
2. Migrations pela CLI: `npx supabase@2.122.0 login`, `npx supabase@2.122.0 link --project-ref <ref>` e `npm run db:push`.
   Banco que já recebeu migrations pelo SQL Editor: marcar as já rodadas antes do primeiro push, ex.:
   `npx supabase@2.122.0 migration repair --status applied 001 002 003 004 005 006 007 008 009 010 011 012`.
3. Authentication → Providers → Email: para uso pessoal dá para desligar *Confirm email*.
4. Authentication → URL Configuration: colocar a URL da Vercel em *Site URL* e *Redirect URLs* (o link de "Esqueci minha senha" volta para ela e abre a tela de nova senha).
5. Project Settings → API: copiar *Project URL* e *anon public key*.
6. Tipos do banco (opcional): `npm run db:tipos` gera `src/app/core/banco.types.ts`.

## Avisos com o app fechado (Web Push)

Opcional; sem isso o app só avisa com ele aberto ou em segundo plano.

1. Gerar chaves: `npx web-push generate-vapid-keys`.
2. `VAPID_PUBLIC_KEY` no `.env` e na Vercel (vai para o app).
3. Segredos da função: `npx supabase@2.122.0 secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:voce@exemplo.com PUSH_SEGREDO=<texto aleatório>`.
4. `npm run fn:deploy` (Edge Function `supabase/functions/push`).
5. SQL Editor: `insert into push_config (url, segredo) values ('https://<ref>.supabase.co/functions/v1/push', '<mesmo PUSH_SEGREDO>');`
6. No app: Configurações → Notificações → *Avisos com o app fechado*.

Envia mensagem nova do chat (trigger em `mensagens`) e contas fixas/faturas não pagas que vencem hoje ou amanhã, todo dia às 8h (pg_cron `cfp-vencimentos`).

## Testes

`npm test` (Vitest): regras de `datas.ts`, `financas.ts` e `extrato.ts`.

## Vercel

1. Importar o repositório.
2. Environment Variables: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Build/output já definidos em `vercel.json`.

## Compartilhar com outra pessoa

Configurações → Carteira → código de convite. A outra pessoa cria conta e, na tela de boas-vindas, entra com o código. Tudo é sincronizado em tempo real.

O dono pode gerar novo código (o antigo para de funcionar), remover membros e excluir a carteira. Qualquer membro pode sair; o último a sair apaga a carteira e, se o dono sair, o membro mais antigo vira dono. Dez códigos errados em 15 minutos bloqueiam novas tentativas.

## Versionamento

`v1.AA.MM.N` — AA = ano, MM = mês, N = build publicado no mês (ex.: `v1.26.10.1`).
A cada build publicado na Vercel: nova nota no topo de `src/app/core/versao.ts` (aparece em Mais → Novidades) e no `CHANGELOG.md`.

## Regras de cálculo

- **Saídas do mês** = gastos à vista (Pix/débito/dinheiro) + faturas de cartão que vencem no mês + contas fixas.
- **Fatura**: compra no dia do fechamento ou depois cai na fatura seguinte; a fatura é do mês do vencimento.
- **Pagar com o salário do mês anterior** (opção do cartão): a fatura entra nas contas e saídas do mês anterior ao vencimento; o vencimento mostrado continua o real.
- **Conta fixa paga com o salário do mês anterior** (opção da conta fixa): entra nas contas e saídas do mês anterior ao vencimento (vence 07/11 → conta em outubro).
- **Conta fixa no cartão**: entra uma vez em cada fatura a partir da primeira (por padrão a fatura aberta no cadastro), vence com a fatura, não aparece como conta separada e fica paga quando a fatura é paga.
- **Conta variável**: valor previsto = média das últimas 12 contas (pagas ou incluídas no histórico), a partir de 3; antes disso usa o valor estimado.
- **Benefícios** (VR/VA): gastos e contas fixas pagos com benefício descontam do saldo dele e não entram nas saídas.
- **Por recebimento** (Contas): com entradas fixas em dois ou mais dias (ex.: vale dia 20 e salário dia 7), cada conta fica com o último recebimento até o vencimento; vencimento antes do primeiro recebimento do mês fica com o último (vence dia 3 → vale do dia 20). Contas pagas com benefício ficam de fora.
- **Registros**: controles avulsos (ex.: carro), não entram nas contas do mês.
- **Parcelamentos**: geram um gasto por parcela; no cartão, cada parcela cai numa fatura.
- **Importar fatura ou extrato** (Gastos/Cartões → Importar): CSV do Nubank, CSV de outros bancos (colunas de data, descrição e valor achadas pelo nome) ou OFX. Pagamentos, estornos e créditos ficam de fora. Lança no cartão escolhido ou como Pix/Débito; já lançado (mesmo valor na mesma fatura, ou no mesmo dia no débito) vem desmarcado. No cartão, parcela vira parcelamento com as próximas. Tudo entra numa transação. Descrição e categoria escolhidas ficam lembradas no aparelho.
- **Parcelado pelo valor total**: a última parcela leva a sobra dos centavos (100 em 3x = 33,33 + 33,33 + 33,34).
- **Chat**: mensagens entre os membros da carteira em tempo real. Aviso por toast com o app aberto e notificação do sistema com o app em segundo plano (precisa de permissão); com o app fechado, só com o Web Push configurado.
