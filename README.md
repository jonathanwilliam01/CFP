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
2. SQL Editor → rodar `supabase/migrations/001_schema.sql` (e as próximas migrations em ordem).
3. Authentication → Providers → Email: para uso pessoal dá para desligar *Confirm email*.
4. Authentication → URL Configuration: colocar a URL da Vercel em *Site URL* e *Redirect URLs*.
5. Project Settings → API: copiar *Project URL* e *anon public key*.

## Vercel

1. Importar o repositório.
2. Environment Variables: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Build/output já definidos em `vercel.json`.

## Compartilhar com outra pessoa

Configurações → Carteira → código de convite. A outra pessoa cria conta e, na tela de boas-vindas, entra com o código. Tudo é sincronizado em tempo real.

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
- **Benefícios** (VR/VA): gastos descontam do saldo do benefício e não entram nas saídas.
- **Registros**: controles avulsos (ex.: carro), não entram nas contas do mês.
- **Parcelamentos**: geram um gasto por parcela; no cartão, cada parcela cai numa fatura.
- **Importar fatura Nubank** (Gastos/Cartões → Importar Nubank): lê o CSV da fatura; pagamentos e estornos ficam de fora; gasto com mesmo valor na mesma fatura do cartão vem desmarcado; parcela vira parcelamento com as próximas; descrição e categoria escolhidas ficam lembradas no aparelho.
- **Chat**: mensagens entre os membros da carteira em tempo real. Aviso por toast com o app aberto e notificação do sistema com o app em segundo plano (precisa de permissão); com o app fechado não há aviso (exigiria Web Push).
