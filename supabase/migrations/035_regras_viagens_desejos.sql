-- Regras de categoria da carteira: texto contido na descrição → categoria (e nome, na importação)
create table if not exists regras (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  termo text not null,
  descricao text,
  categoria_id uuid references categorias on delete set null,
  criado_em timestamptz not null default now(),
  unique (carteira_id, termo)
);

-- Conferência da fatura item a item
alter table gastos add column if not exists conferido boolean not null default false;

-- Foto mensal do patrimônio (o saldo bancário não tem histórico)
create table if not exists patrimonio (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  mes date not null,
  bancos numeric(12,2) not null default 0,
  cofrinhos numeric(12,2) not null default 0,
  receber numeric(12,2) not null default 0,
  dividas numeric(12,2) not null default 0,
  parcelas numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (carteira_id, mes)
);

-- Modo viagem: gastos lançados com ela ativa ganham o marcador
create table if not exists viagens (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  tag text not null,
  inicio date not null default current_date,
  fim date,
  orcamento numeric(12,2),
  moeda text,
  cotacao numeric(12,4),
  iof numeric(5,2) not null default 3.5,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Lista de desejos (prioridade: 1 alta, 2 média, 3 baixa)
create table if not exists desejos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  prioridade int not null default 2 check (prioridade between 1 and 3),
  link text,
  cofrinho_id uuid references cofrinhos on delete set null,
  comprado_em date,
  criado_em timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['regras', 'patrimonio', 'viagens', 'desejos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_rw', t);
    execute format('create policy %I on %I for all using (is_membro(carteira_id)) with check (is_membro(carteira_id))', t || '_rw', t);
  end loop;
  foreach t in array array['regras', 'viagens', 'desejos'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Resumo do mês que fechou, por push no dia 1
alter table carteira_membros add column if not exists resumo_mensal boolean not null default true;
grant update (lembrete, push_gastos, resumo_mensal) on carteira_membros to authenticated;

create or replace function resumos_mensais() returns table (carteira_id uuid, mes date, total numeric, categoria text, valor_categoria numeric)
language sql stable security definer set search_path = public as $$
  with m as (select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date as ini),
  g as (
    select g.carteira_id, g.categoria_id, sum(g.valor) as v
    from gastos g, m
    where g.data >= m.ini and g.data < (m.ini + interval '1 month')::date
    group by g.carteira_id, g.categoria_id
  ),
  t as (select g.carteira_id, sum(g.v) as total from g group by g.carteira_id),
  top as (
    select distinct on (g.carteira_id) g.carteira_id, c.nome, g.v
    from g left join categorias c on c.id = g.categoria_id
    order by g.carteira_id, g.v desc
  )
  select t.carteira_id, (select ini from m), t.total, coalesce(top.nome, 'Sem categoria'), top.v
  from t join top on top.carteira_id = t.carteira_id
  where t.total > 0;
$$;
revoke execute on function resumos_mensais from public, anon, authenticated;

-- dia 1 às 9h de Brasília
select cron.schedule('cfp-resumo', '0 12 1 * *', $$select push_enviar('{"tipo":"resumo"}'::jsonb)$$);
