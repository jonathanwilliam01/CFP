-- Estorno ou crédito: gasto com valor negativo abate a fatura (ou o mês, no débito)
alter table gastos drop constraint if exists gastos_valor_check;
alter table gastos add constraint gastos_valor_check check (valor <> 0);

-- Pagamento parcial da fatura: o que ficou (com juros, se informados) entra na fatura seguinte
alter table pagamentos add column if not exists resto numeric(12,2) not null default 0;

-- Saldo real de cada conta bancária, informado pelo casal
create table if not exists contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  saldo numeric(12,2) not null default 0,
  atualizado_em date not null default current_date,
  cor text not null default '#0ea5e9',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table contas_bancarias enable row level security;
drop policy if exists contas_bancarias_rw on contas_bancarias;
create policy contas_bancarias_rw on contas_bancarias for all using (is_membro(carteira_id)) with check (is_membro(carteira_id));

do $$
begin
  alter publication supabase_realtime add table contas_bancarias;
exception when duplicate_object then null;
end $$;
