-- Sobra do orçamento desconsiderada no mês: a reserva do que faltava gastar deixa de contar nas saídas.
create table orcamento_fechados (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  orcamento_id uuid not null references orcamentos on delete cascade,
  mes date not null,
  criado_em timestamptz not null default now(),
  unique (orcamento_id, mes)
);

alter table orcamento_fechados enable row level security;
create policy orcamento_fechados_rw on orcamento_fechados for all
  using (is_membro(carteira_id)) with check (is_membro(carteira_id));
alter publication supabase_realtime add table orcamento_fechados;
