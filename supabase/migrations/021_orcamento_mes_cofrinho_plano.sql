-- Limite do orçamento por período: vale de mes até ate (null = daí em diante).
-- No mês vale o ajuste que começou por último; sem ajuste, orcamentos.valor.
create table orcamento_valores (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  orcamento_id uuid not null references orcamentos on delete cascade,
  mes date not null,
  ate date,
  valor numeric(12,2) not null check (valor > 0),
  criado_em timestamptz not null default now(),
  check (ate is null or ate >= mes)
);
create index on orcamento_valores (orcamento_id, mes);

alter table orcamento_valores enable row level security;
create policy orcamento_valores_rw on orcamento_valores for all
  using (is_membro(carteira_id)) with check (is_membro(carteira_id));
alter publication supabase_realtime add table orcamento_valores;

-- Plano de depósitos do cofrinho (ex.: 50 por semana)
alter table cofrinhos
  add column deposito numeric(12,2) check (deposito > 0),
  add column frequencia text check (frequencia in ('semana', 'quinzena', 'mes'));
