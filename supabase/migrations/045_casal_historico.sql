-- Dinheiro livre, metas com check-in, ritual do fechamento, sobra automática e histórico de atividades

-- Dinheiro livre: valor pessoal do mês por membro; gasto marcado aparece para o outro só no total
alter table carteira_membros add column if not exists livre numeric check (livre >= 0);
alter table gastos add column if not exists livre boolean not null default false;

create or replace function definir_livres(p_carteira uuid, p_valores jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_membro(p_carteira) then raise exception 'Sem acesso à carteira'; end if;
  update carteira_membros m set livre = nullif((p_valores ->> m.user_id::text)::numeric, 0)
  where m.carteira_id = p_carteira;
end $$;
revoke execute on function definir_livres(uuid, jsonb) from public, anon;
grant execute on function definir_livres(uuid, jsonb) to authenticated;

-- Metas do casal e check-ins
create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  valor numeric check (valor > 0),
  cofrinho_id uuid references cofrinhos on delete set null,
  prazo date,
  concluida_em date,
  criado_por uuid default auth.uid() references auth.users on delete set null,
  criado_em timestamptz not null default now()
);
create table if not exists meta_checkins (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  meta_id uuid not null references metas on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  humor smallint not null check (humor between 1 and 3),
  nota text check (length(nota) <= 500),
  criado_em timestamptz not null default now()
);
create index if not exists meta_checkins_meta on meta_checkins (meta_id, criado_em desc);

-- Ritual do fechamento: decisão de cada membro sobre o mês
create table if not exists fechamentos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references carteiras on delete cascade,
  mes date not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  decisao text check (length(decisao) <= 500),
  criado_em timestamptz not null default now(),
  unique (carteira_id, mes, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['metas', 'meta_checkins', 'fechamentos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_rw', t);
    execute format('create policy %I on %I for all using (is_membro(carteira_id)) with check (is_membro(carteira_id))', t || '_rw', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Check-in e fechamento só em nome próprio
drop policy if exists meta_checkins_rw on meta_checkins;
drop policy if exists meta_checkins_sel on meta_checkins;
drop policy if exists meta_checkins_ins on meta_checkins;
drop policy if exists meta_checkins_del on meta_checkins;
create policy meta_checkins_sel on meta_checkins for select using (is_membro(carteira_id));
create policy meta_checkins_ins on meta_checkins for insert with check (is_membro(carteira_id) and user_id = auth.uid());
create policy meta_checkins_del on meta_checkins for delete using (is_membro(carteira_id) and user_id = auth.uid());
drop policy if exists fechamentos_rw on fechamentos;
drop policy if exists fechamentos_sel on fechamentos;
drop policy if exists fechamentos_ins on fechamentos;
drop policy if exists fechamentos_upd on fechamentos;
drop policy if exists fechamentos_del on fechamentos;
create policy fechamentos_sel on fechamentos for select using (is_membro(carteira_id));
create policy fechamentos_ins on fechamentos for insert with check (is_membro(carteira_id) and user_id = auth.uid());
create policy fechamentos_upd on fechamentos for update using (is_membro(carteira_id) and user_id = auth.uid()) with check (user_id = auth.uid());
create policy fechamentos_del on fechamentos for delete using (is_membro(carteira_id) and user_id = auth.uid());

-- Sobra automática: % da sobra do mês fechado vai para um cofrinho
alter table carteiras add column if not exists sobra_pct numeric check (sobra_pct > 0 and sobra_pct <= 100);
alter table carteiras add column if not exists sobra_cofrinho uuid references cofrinhos on delete set null;
alter table carteiras add column if not exists sobra_feita date;
grant update (nome, inicio, divisao, meta_sobra, sobra_pct, sobra_cofrinho, sobra_feita) on carteiras to authenticated;

-- Marca o mês uma vez só (dois aparelhos abrindo juntos) e deposita; devolve o id do depósito
create or replace function guardar_sobra(p_carteira uuid, p_mes date, p_valor numeric, p_descricao text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cof uuid;
  v_id uuid;
begin
  if not is_membro(p_carteira) then raise exception 'Sem acesso à carteira'; end if;
  update carteiras set sobra_feita = date_trunc('month', p_mes)::date
  where id = p_carteira and sobra_cofrinho is not null and (sobra_feita is null or sobra_feita < date_trunc('month', p_mes)::date)
  returning sobra_cofrinho into v_cof;
  if v_cof is null or p_valor <= 0 then return null; end if;
  insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, descricao)
  values (p_carteira, v_cof, round(p_valor, 2), current_date, left(p_descricao, 120))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function guardar_sobra(uuid, date, numeric, text) from public, anon;
grant execute on function guardar_sobra(uuid, date, numeric, text) to authenticated;

-- Histórico: uma linha por comando e por pessoa (importação de 40 gastos = 1 linha)
create table if not exists atividades (
  id bigint generated always as identity primary key,
  carteira_id uuid not null references carteiras on delete cascade,
  user_id uuid references auth.users on delete set null,
  tabela text not null,
  acao text not null check (acao in ('insert', 'update', 'delete')),
  qtd int not null default 1,
  valor numeric,
  descricao text,
  ref_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists atividades_carteira on atividades (carteira_id, criado_em desc);
alter table atividades enable row level security;
drop policy if exists atividades_sel on atividades;
create policy atividades_sel on atividades for select using (is_membro(carteira_id));

-- Campos que não contam como edição (conferência, cálculo de fatura, marcações)
create or replace function atividade_campos(j jsonb) returns jsonb language sql immutable as
  $$ select j - array['conferido', 'fatura_mes', 'nao_duplicado', 'atualizado_em', 'criado_em', 'comprovante'] $$;

create or replace function atividade_desc(t text, j jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case
    when t = 'gastos' and (j ->> 'livre')::boolean then null
    when t = 'pagamentos' then coalesce(
      (select descricao from recorrencias where id = (j ->> 'ref_id')::uuid),
      (select 'Fatura ' || nome from cartoes where id = (j ->> 'ref_id')::uuid),
      (select descricao from gastos where id = (j ->> 'ref_id')::uuid))
    when t = 'cofrinho_movs' then coalesce(j ->> 'descricao', (select nome from cofrinhos where id = (j ->> 'cofrinho_id')::uuid))
    else coalesce(j ->> 'descricao', j ->> 'nome', j ->> 'titulo', j ->> 'nota', j ->> 'decisao')
  end
$$;

create or replace function atividade_valor(t text, j jsonb) returns numeric language sql immutable as $$
  select case when t = 'parcelamentos' then (j ->> 'valor_parcela')::numeric * (j ->> 'num_parcelas')::int
    else nullif(j ->> 'valor', '')::numeric end
$$;

create or replace function registrar_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- só o que a pessoa fez; efeitos de outros triggers (fatura refeita, retirada do cofrinho) ficam fora
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'INSERT' then
    for r in select carteira_id, count(*) n, sum(atividade_valor(tg_table_name, to_jsonb(x))) v, min(atividade_desc(tg_table_name, to_jsonb(x))) d, min(id::text) ref
             from novos x where not (tg_table_name = 'gastos' and to_jsonb(x) ->> 'parcelamento_id' is not null) group by carteira_id loop
      insert into atividades (carteira_id, user_id, tabela, acao, qtd, valor, descricao, ref_id)
      values (r.carteira_id, auth.uid(), tg_table_name, 'insert', r.n, r.v, r.d, case when r.n = 1 then r.ref::uuid end);
    end loop;
  elsif tg_op = 'DELETE' then
    for r in select carteira_id, count(*) n, sum(atividade_valor(tg_table_name, to_jsonb(x))) v, min(atividade_desc(tg_table_name, to_jsonb(x))) d, min(id::text) ref
             from antigos x where exists (select 1 from carteiras c where c.id = x.carteira_id) group by carteira_id loop
      insert into atividades (carteira_id, user_id, tabela, acao, qtd, valor, descricao, ref_id)
      values (r.carteira_id, auth.uid(), tg_table_name, 'delete', r.n, r.v, r.d, case when r.n = 1 then r.ref::uuid end);
    end loop;
  else
    for r in select n.carteira_id, count(*) q, sum(atividade_valor(tg_table_name, to_jsonb(n))) v, min(atividade_desc(tg_table_name, to_jsonb(n))) d, min(n.id::text) ref
             from novos n join antigos o on o.id = n.id
             where atividade_campos(to_jsonb(n)) is distinct from atividade_campos(to_jsonb(o))
             group by n.carteira_id loop
      insert into atividades (carteira_id, user_id, tabela, acao, qtd, valor, descricao, ref_id)
      values (r.carteira_id, auth.uid(), tg_table_name, 'update', r.q, r.v, r.d, case when r.q = 1 then r.ref::uuid end);
    end loop;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['gastos', 'entradas', 'pagamentos', 'recorrencias', 'cofrinhos', 'cofrinho_movs', 'orcamentos', 'cartoes',
    'desejos', 'dividas', 'receber', 'acertos', 'metas', 'meta_checkins', 'fechamentos', 'parcelamentos'] loop
    execute format('drop trigger if exists %I on %I', t || '_ativ_i', t);
    execute format('drop trigger if exists %I on %I', t || '_ativ_u', t);
    execute format('drop trigger if exists %I on %I', t || '_ativ_d', t);
    execute format('create trigger %I after insert on %I referencing new table as novos for each statement execute function registrar_atividade()', t || '_ativ_i', t);
    execute format('create trigger %I after update on %I referencing new table as novos old table as antigos for each statement execute function registrar_atividade()', t || '_ativ_u', t);
    execute format('create trigger %I after delete on %I referencing old table as antigos for each statement execute function registrar_atividade()', t || '_ativ_d', t);
  end loop;
end $$;

-- Histórico guarda um ano
select cron.schedule('cfp-atividades-limpeza', '30 4 * * *', $$delete from atividades where criado_em < now() - interval '400 days'$$);
