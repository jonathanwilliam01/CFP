-- Painel admin: leituras (usuários, métricas, erros, comunicados, auditoria). Só contagens e datas, nunca descrição ou valor.

alter table admin_log add constraint admin_log_acao_check check (length(acao) <= 60);

create or replace function admin_usuarios() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return query
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'nome', u.raw_user_meta_data->>'nome', 'criado_em', u.created_at,
    'ultimo_uso', x.ultimo_uso, 'versao', a.versao, 'aparelho', a.aparelho,
    'carteira', cm.nome, 'membros', coalesce(cm.membros, 0), 'papel', cm.papel,
    'lancamentos', g.n, 'ultimo_lancamento', g.ultimo,
    'push', exists (select 1 from push_inscricoes p where p.user_id = u.id),
    'status', case
      when s.user_id is not null then 'suspenso'
      when x.ultimo_uso < hoje - 30 or (x.ultimo_uso is null and u.created_at < now() - interval '30 days') then 'parado'
      else 'ativo' end)
  from auth.users u
  left join lateral (select dia, versao, aparelho from acessos where user_id = u.id order by dia desc limit 1) a on true
  cross join lateral (select coalesce(a.dia, (u.last_sign_in_at at time zone 'America/Sao_Paulo')::date) as ultimo_uso) x
  -- com mais de uma carteira, mostra a de mais membros
  left join lateral (
    select c.nome, m.papel, (select count(*) from carteira_membros o where o.carteira_id = m.carteira_id) as membros
    from carteira_membros m join carteiras c on c.id = m.carteira_id
    where m.user_id = u.id
    order by 3 desc, m.criado_em limit 1) cm on true
  cross join lateral (select count(*) as n, max(criado_em) as ultimo from gastos where criado_por = u.id) g
  left join suspensos s on s.user_id = u.id
  order by u.created_at desc;
end $$;

create or replace function admin_metricas(p_dias int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Sao_Paulo';
  hoje date := (now() at time zone tz)::date;
  ini date := hoje - (greatest(p_dias, 1) - 1);
  ini_ts timestamptz := ini::timestamp at time zone tz;
  mes date := date_trunc('month', hoje::timestamp)::date;
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from auth.users),
    'carteiras', (select count(*) from carteiras),
    'casais', (select count(*) from (select 1 from carteira_membros group by carteira_id having count(*) >= 2) c),
    'novos', (select count(*) from auth.users where created_at >= ini_ts),
    'dau', (select count(distinct user_id) from acessos where dia = hoje),
    'wau', (select count(distinct user_id) from acessos where dia > hoje - 7),
    'mau', (select count(distinct user_id) from acessos where dia > hoje - 30),
    'parados', (select count(*) from admin_usuarios() j where j->>'status' = 'parado'),
    'erros_24h', (select count(*) from erros_app where criado_em > now() - interval '24 hours'),
    'push_aparelhos', (select count(*) from push_inscricoes),
    'telemetria_desde', (select min(dia) from acessos),
    'ativos_dia', (
      select jsonb_agg(jsonb_build_object('dia', d::date, 'n',
        (select count(distinct user_id) from acessos where dia = d::date)) order by d)
      from generate_series(ini, hoje, interval '1 day') d),
    'lancamentos_dia', (
      select jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(g.n, 0)) order by d)
      from generate_series(ini, hoje, interval '1 day') d
      left join (select (criado_em at time zone tz)::date as dia, count(*) as n from gastos
        where criado_em >= ini_ts group by 1) g on g.dia = d::date),
    'cadastros_semana', (
      select jsonb_agg(jsonb_build_object('dia', w::date, 'n',
        (select count(*) from auth.users where (created_at at time zone tz)::date >= w::date
           and (created_at at time zone tz)::date < w::date + 7)) order by w)
      from generate_series(date_trunc('week', ini::timestamp), hoje, interval '1 week') w),
    'retencao', (
      select jsonb_agg(jsonb_build_object('coorte', c.coorte, 'usuarios', c.n) || r.m order by c.coorte)
      from (
        select g::date as coorte, (select count(*) from auth.users
          where date_trunc('month', created_at at time zone tz)::date = g::date) as n
        from generate_series(mes - interval '5 months', mes, interval '1 month') g
      ) c
      cross join lateral (
        -- mês N só conta depois de terminado
        select jsonb_object_agg('m' || k, case
          when c.n = 0 or (c.coorte + make_interval(months => k + 1))::date > hoje then null
          else round(100.0 * (
            select count(distinct a.user_id) from acessos a join auth.users u on u.id = a.user_id
            where date_trunc('month', u.created_at at time zone tz)::date = c.coorte
              and date_trunc('month', a.dia::timestamp)::date = (c.coorte + make_interval(months => k))::date
          ) / c.n) end) as m
        from generate_series(1, 3) k
      ) r),
    -- tabelas sem criado_em contam carteiras com qualquer linha
    'uso_funcoes', (
      select jsonb_agg(jsonb_build_object('chave', chave, 'carteiras', n) order by n desc, chave)
      from (
        select 'chat' as chave, count(distinct carteira_id) as n from mensagens where criado_em >= ini_ts
        union all select 'cofrinhos', count(distinct carteira_id) from cofrinho_movs
        union all select 'viagens', count(distinct carteira_id) from viagens where criado_em >= ini_ts
        union all select 'desejos', count(distinct carteira_id) from desejos where criado_em >= ini_ts
        union all select 'planejamento', count(distinct carteira_id) from planos
        union all select 'registros', count(distinct carteira_id) from registro_itens
        union all select 'receber', count(distinct carteira_id) from receber where criado_em >= ini_ts
        union all select 'dividas', count(distinct carteira_id) from dividas where criado_em >= ini_ts
        union all select 'orcamentos', count(distinct carteira_id) from orcamentos
        union all select 'saldos', count(distinct carteira_id) from contas_bancarias where criado_em >= ini_ts
        union all select 'parcelamentos', count(distinct carteira_id) from parcelamentos where criado_em >= ini_ts
        union all select 'desafios', count(distinct carteira_id) from desafios where criado_em >= ini_ts
      ) f),
    -- versão do acesso mais recente de cada usuário nos últimos 7 dias
    'versoes', coalesce((
      select jsonb_agg(jsonb_build_object('versao', versao, 'n', n) order by n desc, versao desc)
      from (
        select versao, count(*) as n
        from (select distinct on (user_id) versao from acessos where dia > hoje - 7 order by user_id, dia desc) a
        where versao is not null group by versao
      ) v), '[]'));
end $$;

create or replace function admin_erros(p_dias int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Sao_Paulo';
  hoje date := (now() at time zone tz)::date;
  ini date := hoje - (greatest(p_dias, 1) - 1);
  ini_ts timestamptz := ini::timestamp at time zone tz;
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return jsonb_build_object(
    'por_dia', (
      select jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(e.n, 0)) order by d)
      from generate_series(ini, hoje, interval '1 day') d
      left join (select (criado_em at time zone tz)::date as dia, count(*) as n from erros_app
        where criado_em >= ini_ts group by 1) e on e.dia = d::date),
    'frequentes', coalesce((
      select jsonb_agg(f.j order by f.n desc, f.ultima desc)
      from (
        select count(*) as n, max(criado_em) as ultima, jsonb_build_object(
          'mensagem', left(mensagem, 120), 'n', count(*), 'ultima', max(criado_em),
          'versoes', coalesce(jsonb_agg(distinct versao) filter (where versao is not null), '[]'),
          'rotas', coalesce(jsonb_agg(distinct rota) filter (where rota is not null), '[]')) as j
        from erros_app where criado_em >= ini_ts
        group by left(mensagem, 120)
        order by count(*) desc, max(criado_em) desc limit 20
      ) f), '[]'));
end $$;

create or replace function admin_comunicados() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  total bigint := (select count(*) from auth.users);
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return query
  select to_jsonb(c) || jsonb_build_object(
    'lidos', (select count(*) from comunicado_leituras l where l.comunicado_id = c.id),
    'total_usuarios', total)
  from comunicados c
  order by c.inicio desc, c.criado_em desc;
end $$;

-- p_acao filtra pela ação exata ou pela tabela (ex.: 'comunicados' pega 'comunicados.insert')
create or replace function admin_log_lista(p_acao text default null, p_limite int default 200) returns setof admin_log
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  return query
  select * from admin_log
  where p_acao is null or acao = p_acao or split_part(acao, '.', 1) = p_acao
  order by criado_em desc, id desc
  limit p_limite;
end $$;

revoke execute on function admin_usuarios(), admin_metricas(int), admin_erros(int), admin_comunicados(),
  admin_log_lista(text, int) from public, anon;
grant execute on function admin_usuarios(), admin_metricas(int), admin_erros(int), admin_comunicados(),
  admin_log_lista(text, int) to authenticated;

-- exclusão de conta: solta os arquivos do usuário (storage.objects.owner pode ter FK para auth.users)
create or replace function admin_liberar_storage(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update storage.objects set owner = null, owner_id = null
  where owner = p_user or owner_id = p_user::text;
end $$;

revoke execute on function admin_liberar_storage(uuid) from public, anon, authenticated;
grant execute on function admin_liberar_storage(uuid) to service_role;
