create extension if not exists pgcrypto;

create table carteiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text not null unique default upper(substr(md5(random()::text), 1, 6)),
  criado_por uuid not null default auth.uid() references auth.users on delete cascade,
  criado_em timestamptz not null default now()
);

create table carteira_membros (
  carteira_id uuid not null references carteiras on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (carteira_id, user_id)
);

create or replace function is_membro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid());
$$;

create table categorias (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  icone text not null default '🏷️',
  cor text not null default '#64748b',
  tipo text not null default 'gasto' check (tipo in ('gasto', 'entrada')),
  ordem int not null default 0
);

create table cartoes (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  fechamento_dia int not null check (fechamento_dia between 1 and 31),
  vencimento_dia int not null check (vencimento_dia between 1 and 31),
  limite numeric(12,2),
  cor text not null default '#7c3aed',
  padrao boolean not null default false,
  ativo boolean not null default true
);

create table beneficios (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  valor_mensal numeric(12,2) not null default 0,
  dia_credito int not null default 1 check (dia_credito between 1 and 31),
  acumula boolean not null default true,
  inicio date not null default date_trunc('month', current_date),
  ativo boolean not null default true
);

create table parcelamentos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  categoria_id uuid references categorias on delete set null,
  cartao_id uuid references cartoes on delete set null,
  valor_parcela numeric(12,2) not null,
  num_parcelas int not null check (num_parcelas between 1 and 120),
  primeira_data date not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  categoria_id uuid references categorias on delete set null,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  forma text not null default 'debito' check (forma in ('debito', 'cartao', 'beneficio')),
  cartao_id uuid references cartoes on delete set null,
  beneficio_id uuid references beneficios on delete set null,
  fatura_mes date,
  parcelamento_id uuid references parcelamentos on delete cascade,
  parcela int,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index on gastos (carteira_id, data);
create index on gastos (carteira_id, fatura_mes);

-- Mês (dia 1) em que a fatura vence. Compra no dia do fechamento ou depois cai na fatura seguinte.
create or replace function calc_fatura(d date, fech int, venc int) returns date
language plpgsql immutable as $$
declare
  m date := date_trunc('month', d)::date;
begin
  if extract(day from d) >= fech then
    m := (m + interval '1 month')::date;
  end if;
  if venc <= fech then
    m := (m + interval '1 month')::date;
  end if;
  return m;
end $$;

create or replace function gastos_before() returns trigger
language plpgsql as $$
declare
  c cartoes;
begin
  if new.forma = 'cartao' and new.cartao_id is not null then
    select * into c from cartoes where id = new.cartao_id;
    new.fatura_mes := calc_fatura(new.data, c.fechamento_dia, c.vencimento_dia);
  else
    -- cartão excluído: a compra passa a contar como à vista
    if new.forma = 'cartao' then
      new.forma := 'debito';
    end if;
    new.fatura_mes := null;
    new.cartao_id := null;
  end if;
  if new.forma <> 'beneficio' then
    new.beneficio_id := null;
  end if;
  return new;
end $$;

create trigger gastos_before before insert or update on gastos
for each row execute function gastos_before();

create table entradas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  descricao text not null,
  categoria_id uuid references categorias on delete set null,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index on entradas (carteira_id, data);

-- Contas fixas (tipo conta) e entradas fixas como salário (tipo entrada)
create table recorrencias (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  tipo text not null check (tipo in ('conta', 'entrada')),
  descricao text not null,
  categoria_id uuid references categorias on delete set null,
  valor numeric(12,2) not null,
  dia int not null check (dia between 1 and 31),
  inicio date not null default date_trunc('month', current_date),
  fim date,
  ativo boolean not null default true
);

-- Baixa mensal de conta fixa, entrada fixa ou fatura de cartão
create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  tipo text not null check (tipo in ('recorrencia', 'fatura')),
  ref_id uuid not null,
  mes date not null,
  valor numeric(12,2) not null,
  pago_em date not null default current_date,
  criado_por uuid default auth.uid(),
  unique (tipo, ref_id, mes)
);

create table cofrinhos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  meta numeric(12,2) not null default 0,
  prazo date,
  icone text not null default '🐷',
  cor text not null default '#10b981',
  criado_em timestamptz not null default now()
);

create table cofrinho_movs (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  cofrinho_id uuid not null references cofrinhos on delete cascade,
  valor numeric(12,2) not null,
  data date not null default current_date,
  descricao text,
  criado_por uuid default auth.uid()
);

create table orcamentos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  categoria_id uuid references categorias on delete cascade,
  valor numeric(12,2) not null,
  alerta_pct int not null default 80 check (alerta_pct between 1 and 100),
  unique nulls not distinct (carteira_id, categoria_id)
);

create table planos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  valor numeric(12,2) not null,
  mes date not null
);

create table registros (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  nome text not null,
  icone text not null default '📒',
  cor text not null default '#0ea5e9',
  criado_em timestamptz not null default now()
);

create table registro_itens (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  registro_id uuid not null references registros on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  data date not null default current_date,
  obs text,
  criado_por uuid default auth.uid()
);

-- RLS
alter table carteiras enable row level security;
alter table carteira_membros enable row level security;

create policy carteiras_sel on carteiras for select using (is_membro(id));
create policy carteiras_upd on carteiras for update using (is_membro(id));
create policy membros_sel on carteira_membros for select using (is_membro(carteira_id));
create policy membros_upd on carteira_membros for update using (user_id = auth.uid());
create policy membros_del on carteira_membros for delete
  using (user_id = auth.uid() or exists (
    select 1 from carteira_membros m
    where m.carteira_id = carteira_membros.carteira_id and m.user_id = auth.uid() and m.papel = 'dono'));

do $$
declare t text;
begin
  foreach t in array array['categorias','cartoes','beneficios','parcelamentos','gastos','entradas',
    'recorrencias','pagamentos','cofrinhos','cofrinho_movs','orcamentos','planos','registros','registro_itens']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_membro(carteira_id)) with check (is_membro(carteira_id))', t || '_rw', t);
  end loop;
end $$;

-- RPCs
create or replace function criar_carteira(p_nome text, p_membro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  insert into carteiras (nome, criado_por) values (p_nome, auth.uid()) returning id into cid;
  insert into carteira_membros (carteira_id, user_id, nome, papel) values (cid, auth.uid(), p_membro, 'dono');
  insert into categorias (carteira_id, nome, icone, cor, tipo, ordem) values
    (cid, 'Mercado', '🛒', '#16a34a', 'gasto', 1),
    (cid, 'Alimentação', '🍔', '#f97316', 'gasto', 2),
    (cid, 'Transporte', '🚗', '#0ea5e9', 'gasto', 3),
    (cid, 'Casa', '🏠', '#8b5cf6', 'gasto', 4),
    (cid, 'Contas', '💡', '#eab308', 'gasto', 5),
    (cid, 'Saúde', '💊', '#ef4444', 'gasto', 6),
    (cid, 'Lazer', '🎉', '#ec4899', 'gasto', 7),
    (cid, 'Compras', '🛍️', '#14b8a6', 'gasto', 8),
    (cid, 'Educação', '📚', '#6366f1', 'gasto', 9),
    (cid, 'Pets', '🐶', '#a16207', 'gasto', 10),
    (cid, 'Assinaturas', '📺', '#475569', 'gasto', 11),
    (cid, 'Outros', '📦', '#64748b', 'gasto', 99),
    (cid, 'Salário', '💼', '#16a34a', 'entrada', 1),
    (cid, 'Extra', '💰', '#0ea5e9', 'entrada', 2),
    (cid, 'Outros', '📦', '#64748b', 'entrada', 99);
  return cid;
end $$;

create or replace function entrar_carteira(p_codigo text, p_membro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  select id into cid from carteiras where codigo = upper(trim(p_codigo));
  if cid is null then
    raise exception 'Código inválido';
  end if;
  insert into carteira_membros (carteira_id, user_id, nome) values (cid, auth.uid(), p_membro)
  on conflict do nothing;
  return cid;
end $$;

create or replace function criar_parcelamento(
  p_carteira uuid, p_descricao text, p_categoria uuid, p_cartao uuid,
  p_valor_parcela numeric, p_num int, p_primeira date
) returns uuid
language plpgsql set search_path = public as $$
declare
  pid uuid;
  i int;
begin
  insert into parcelamentos (carteira_id, descricao, categoria_id, cartao_id, valor_parcela, num_parcelas, primeira_data)
  values (p_carteira, p_descricao, p_categoria, p_cartao, p_valor_parcela, p_num, p_primeira)
  returning id into pid;

  for i in 1..p_num loop
    insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela)
    values (
      p_carteira,
      p_descricao || ' (' || i || '/' || p_num || ')',
      p_categoria,
      p_valor_parcela,
      (p_primeira + make_interval(months => i - 1))::date,
      case when p_cartao is null then 'debito' else 'cartao' end,
      p_cartao,
      pid,
      i
    );
  end loop;
  return pid;
end $$;

grant execute on function criar_carteira, entrar_carteira, criar_parcelamento to authenticated;

alter publication supabase_realtime add table gastos, entradas, pagamentos, recorrencias, cofrinho_movs, registro_itens;
