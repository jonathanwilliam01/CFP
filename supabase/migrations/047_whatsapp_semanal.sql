-- Final do cartão (notificação do banco cita "final 1234")
alter table cartoes add column if not exists final text check (final ~ '^\d{4}$');

-- Chat: lido vale em todos os aparelhos; quem está com o chat aberto não recebe push
alter table carteira_membros add column if not exists chat_lido timestamptz;
alter table carteira_membros add column if not exists chat_aberto_em timestamptz;
grant update (chat_lido, chat_aberto_em) on carteira_membros to authenticated;

-- Resumo semanal por push (domingo), desligável por membro
alter table carteira_membros add column if not exists resumo_semanal boolean not null default true;
grant update (resumo_semanal) on carteira_membros to authenticated;

-- Domingo: semana (seg a dom) contra a anterior, categoria e membro que mais gastaram, contas dos próximos 7 dias.
-- Parcelas só contam a 1ª (as outras são compras antigas).
create or replace function resumos_semanais() returns table (
  carteira_id uuid, total numeric, anterior numeric, categoria text, valor_categoria numeric,
  quem text, valor_quem numeric, membros_gastaram int, contas_qtd int, contas_total numeric
)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  g as (
    select g.*, h.d from gastos g, h
    where g.data between h.d - 13 and h.d and g.valor > 0 and (g.parcelamento_id is null or g.parcela = 1)
  ),
  sem as (select * from g where data > d - 7),
  t as (
    select c.id carteira_id,
      coalesce((select sum(valor) from sem where sem.carteira_id = c.id), 0) total,
      coalesce((select sum(valor) from g where g.carteira_id = c.id and g.data <= g.d - 7), 0) anterior
    from carteiras c
  ),
  cat as (
    select distinct on (sem.carteira_id) sem.carteira_id, coalesce(ct.nome, 'Sem categoria') nome, sum(sem.valor) v
    from sem left join categorias ct on ct.id = sem.categoria_id
    group by sem.carteira_id, ct.nome order by sem.carteira_id, sum(sem.valor) desc
  ),
  pessoa as (
    select sem.carteira_id, coalesce(m.nome, 'Alguém') nome, sum(sem.valor) v,
      count(*) over (partition by sem.carteira_id) n,
      row_number() over (partition by sem.carteira_id order by sum(sem.valor) desc) o
    from sem left join carteira_membros m on m.carteira_id = sem.carteira_id and m.user_id = sem.criado_por
    group by sem.carteira_id, m.nome
  ),
  meses as (
    select distinct date_trunc('month', h.d + k)::date m, h.d from h, generate_series(1, 7) k
  ),
  vence as (
    select r.carteira_id, r.valor,
      ms.m + least(r.dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc, ms.d
    from recorrencias r, meses ms
    where r.tipo = 'conta' and r.ativo and r.cartao_id is null and r.beneficio_id is null
      and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)
      and not exists (select 1 from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m)
    union all
    select c.carteira_id,
      coalesce((select sum(x.valor) from gastos x where x.cartao_id = c.id and x.fatura_mes = ms.m), 0),
      ms.m + least(c.vencimento_dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1, ms.d
    from cartoes c, meses ms
    where c.ativo and not exists (select 1 from pagamentos p where p.tipo = 'fatura' and p.ref_id = c.id and p.mes = ms.m)
  ),
  contas as (
    select carteira_id, count(*)::int qtd, sum(valor) total from vence
    where venc between d + 1 and d + 7 and valor > 0 group by carteira_id
  )
  select t.carteira_id, t.total, t.anterior, cat.nome, cat.v, p.nome, p.v, coalesce(p.n, 0)::int,
    coalesce(ct.qtd, 0), coalesce(ct.total, 0)
  from t
  left join cat on cat.carteira_id = t.carteira_id
  left join pessoa p on p.carteira_id = t.carteira_id and p.o = 1
  left join contas ct on ct.carteira_id = t.carteira_id
  where t.total > 0 or ct.qtd > 0;
$$;
revoke execute on function resumos_semanais from public, anon, authenticated;

-- domingo às 19h de Brasília
select cron.schedule('cfp-semanal', '0 22 * * 0', $$select push_enviar('{"tipo":"semanal"}'::jsonb)$$);

-- WhatsApp: número do bot (preenchido pelo admin) e vínculo telefone → membro da carteira
create table if not exists whatsapp_config (
  id boolean primary key default true check (id),
  numero text
);
insert into whatsapp_config (id) values (true) on conflict do nothing;
alter table whatsapp_config enable row level security;
drop policy if exists whatsapp_config_sel on whatsapp_config;
create policy whatsapp_config_sel on whatsapp_config for select to authenticated using (true);

create table if not exists whatsapp_vinculos (
  user_id uuid primary key references auth.users on delete cascade,
  carteira_id uuid not null references carteiras on delete cascade,
  telefone text unique,
  codigo text,
  codigo_expira timestamptz,
  -- último lançamento pelo bot, para "desfazer"
  ultimo jsonb,
  criado_em timestamptz not null default now()
);
alter table whatsapp_vinculos enable row level security;
drop policy if exists whatsapp_vinculos_sel on whatsapp_vinculos;
create policy whatsapp_vinculos_sel on whatsapp_vinculos for select using (user_id = auth.uid());
drop policy if exists whatsapp_vinculos_del on whatsapp_vinculos;
create policy whatsapp_vinculos_del on whatsapp_vinculos for delete using (user_id = auth.uid());
grant select, delete on whatsapp_vinculos to authenticated;

-- mensagens já tratadas (a Meta reenvia o webhook)
create table if not exists whatsapp_msgs (id text primary key, criado_em timestamptz not null default now());
alter table whatsapp_msgs enable row level security;

-- Código de 6 dígitos (15 min) para mandar ao bot: "CFP 123456"
create or replace function whatsapp_codigo(p_carteira uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text := lpad(floor(random() * 1000000)::int::text, 6, '0');
begin
  if auth.uid() is null or not is_membro(p_carteira) then
    raise exception 'sem acesso';
  end if;
  insert into whatsapp_vinculos (user_id, carteira_id, codigo, codigo_expira)
  values (auth.uid(), p_carteira, c, now() + interval '15 minutes')
  on conflict (user_id) do update set carteira_id = excluded.carteira_id, codigo = excluded.codigo, codigo_expira = excluded.codigo_expira;
  return c;
end $$;
revoke execute on function whatsapp_codigo from public, anon;
grant execute on function whatsapp_codigo to authenticated;

-- Bot: confirma o código e liga o telefone (tira de outro vínculo se já estava)
create or replace function whatsapp_vincular(p_telefone text, p_codigo text) returns table (user_id uuid, carteira_id uuid, nome text)
language plpgsql security definer set search_path = public as $$
declare
  v whatsapp_vinculos;
begin
  select * into v from whatsapp_vinculos w where w.codigo = p_codigo and w.codigo_expira > now();
  if v.user_id is null then
    return;
  end if;
  update whatsapp_vinculos w set telefone = null where w.telefone = p_telefone and w.user_id <> v.user_id;
  update whatsapp_vinculos w set telefone = p_telefone, codigo = null, codigo_expira = null where w.user_id = v.user_id;
  return query select v.user_id, v.carteira_id, m.nome from carteira_membros m where m.carteira_id = v.carteira_id and m.user_id = v.user_id;
end $$;
revoke execute on function whatsapp_vincular from public, anon, authenticated;

-- Bot: lança como o próprio membro (auth.uid() nos defaults e no histórico). Parcelas ≥ 2 viram parcelamento.
create or replace function whatsapp_lancar(p_telefone text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v whatsapp_vinculos;
  novo uuid;
  cartao uuid := nullif(p->>'cartao_id', '')::uuid;
begin
  select * into v from whatsapp_vinculos w where w.telefone = p_telefone;
  if v.user_id is null then
    raise exception 'telefone sem vínculo';
  end if;
  perform set_config('request.jwt.claim.sub', v.user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v.user_id, 'role', 'authenticated')::text, true);
  if coalesce((p->>'parcelas')::int, 1) >= 2 then
    novo := criar_parcelamento(v.carteira_id, p->>'descricao', nullif(p->>'categoria_id', '')::uuid, cartao,
      round((p->>'valor')::numeric / (p->>'parcelas')::int, 2), (p->>'parcelas')::int, (p->>'data')::date);
    update parcelamentos set criado_por = v.user_id where id = novo and criado_por is null;
    update gastos set criado_por = v.user_id where parcelamento_id = novo and criado_por is null;
    update whatsapp_vinculos set ultimo = jsonb_build_object('tipo', 'parcelamento', 'id', novo, 'em', now()) where user_id = v.user_id;
  else
    insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, beneficio_id, tags, criado_por)
    values (v.carteira_id, p->>'descricao', nullif(p->>'categoria_id', '')::uuid, (p->>'valor')::numeric, (p->>'data')::date,
      p->>'forma', cartao, nullif(p->>'beneficio_id', '')::uuid,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'), v.user_id)
    returning id into novo;
    update whatsapp_vinculos set ultimo = jsonb_build_object('tipo', 'gasto', 'id', novo, 'em', now()) where user_id = v.user_id;
  end if;
  return novo;
end $$;
revoke execute on function whatsapp_lancar from public, anon, authenticated;

-- Bot: "desfazer" apaga o último lançamento pelo bot (até 1 hora depois)
create or replace function whatsapp_desfazer(p_telefone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v whatsapp_vinculos;
  d text;
begin
  select * into v from whatsapp_vinculos w where w.telefone = p_telefone;
  if v.ultimo is null or (v.ultimo->>'em')::timestamptz < now() - interval '1 hour' then
    return null;
  end if;
  perform set_config('request.jwt.claim.sub', v.user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v.user_id, 'role', 'authenticated')::text, true);
  if v.ultimo->>'tipo' = 'parcelamento' then
    delete from parcelamentos where id = (v.ultimo->>'id')::uuid and carteira_id = v.carteira_id returning descricao into d;
  else
    delete from gastos where id = (v.ultimo->>'id')::uuid and carteira_id = v.carteira_id returning descricao into d;
  end if;
  update whatsapp_vinculos set ultimo = null where user_id = v.user_id;
  return d;
end $$;
revoke execute on function whatsapp_desfazer from public, anon, authenticated;

-- Editar parcelamento: refaz descrição "(i/n)", valor, data e pagamento de todas as parcelas que existem.
-- Mais parcelas: cria da antiga última + 1 até a nova; menos: apaga as que passaram do novo total.
-- Antecipação (parcela null) só acompanha descrição, categoria e pagamento.
create or replace function editar_parcelamento(
  p_id uuid, p_descricao text, p_categoria uuid, p_cartao uuid, p_valor_parcela numeric, p_num int, p_primeira date
) returns void
language plpgsql set search_path = public as $$
declare
  pc parcelamentos;
  i int;
begin
  select * into pc from parcelamentos where id = p_id;
  if pc.id is null then raise exception 'Parcelamento não encontrado'; end if;
  if p_num < 1 or p_num > 120 or p_valor_parcela <= 0 or coalesce(trim(p_descricao), '') = '' then raise exception 'Dados inválidos'; end if;

  update parcelamentos set descricao = trim(p_descricao), categoria_id = p_categoria, cartao_id = p_cartao,
    valor_parcela = p_valor_parcela, num_parcelas = p_num, primeira_data = p_primeira
  where id = p_id;

  delete from gastos where parcelamento_id = p_id and parcela > p_num;

  update gastos set
    descricao = trim(p_descricao) || ' (' || parcela || '/' || p_num || ')',
    categoria_id = p_categoria, valor = p_valor_parcela,
    data = (p_primeira + make_interval(months => parcela - 1))::date,
    forma = case when p_cartao is null then 'debito' else 'cartao' end, cartao_id = p_cartao
  where parcelamento_id = p_id and parcela is not null;

  update gastos set
    descricao = trim(p_descricao) || coalesce(substring(descricao from ' \(antecipação.*$'), ''),
    categoria_id = p_categoria, forma = case when p_cartao is null then 'debito' else 'cartao' end, cartao_id = p_cartao
  where parcelamento_id = p_id and parcela is null;

  for i in pc.num_parcelas + 1 .. p_num loop
    insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela)
    values (pc.carteira_id, trim(p_descricao) || ' (' || i || '/' || p_num || ')', p_categoria, p_valor_parcela,
      (p_primeira + make_interval(months => i - 1))::date, case when p_cartao is null then 'debito' else 'cartao' end, p_cartao, p_id, i);
  end loop;
end $$;
revoke execute on function editar_parcelamento from public, anon;
grant execute on function editar_parcelamento to authenticated;
