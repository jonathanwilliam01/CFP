-- Pagamento não fica órfão quando some o gasto da parcela ou a conta fixa
create or replace function pagamentos_orfaos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'gastos' then
    delete from pagamentos where tipo = 'parcela' and ref_id = old.id;
  else
    delete from pagamentos where tipo = 'recorrencia' and ref_id = old.id;
  end if;
  return null;
end $$;

drop trigger if exists gastos_pagamento_orfao on gastos;
create trigger gastos_pagamento_orfao after delete on gastos for each row execute function pagamentos_orfaos();
drop trigger if exists recorrencias_pagamento_orfao on recorrencias;
create trigger recorrencias_pagamento_orfao after delete on recorrencias for each row execute function pagamentos_orfaos();

delete from pagamentos p where p.tipo = 'parcela' and not exists (select 1 from gastos g where g.id = p.ref_id);
delete from pagamentos p where p.tipo = 'recorrencia' and not exists (select 1 from recorrencias r where r.id = p.ref_id);

-- Avisos por membro
alter table carteira_membros add column if not exists push_fatura boolean not null default true;
alter table carteira_membros add column if not exists lembrete_saldos boolean not null default true;
grant update (lembrete, push_gastos, resumo_mensal, push_fatura, lembrete_saldos) on carteira_membros to authenticated;

-- Fatura que fechou hoje: total (compras, fixas no cartão e resto da anterior) e vencimento
create or replace function faturas_fechadas() returns table (carteira_id uuid, cartao_id uuid, nome text, mes date, total numeric, vencimento date)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  f as (
    select c.*, calc_fatura(h.d - 1, c.fechamento_dia, c.vencimento_dia, c.fecha_dias) m, h.d
    from cartoes c, h
    where c.ativo
  )
  select f.carteira_id, f.id, f.nome, f.m,
    coalesce((select sum(g.valor) from gastos g where g.cartao_id = f.id and g.fatura_mes = f.m), 0)
    + coalesce((select sum(r.valor) from recorrencias r
        where r.cartao_id = f.id and r.tipo = 'conta' and r.ativo
          and date_trunc('month', r.inicio) <= f.m and (r.fim is null or date_trunc('month', r.fim) >= f.m)), 0)
    + coalesce((select p.resto from pagamentos p where p.tipo = 'fatura' and p.ref_id = f.id and p.mes = (f.m - interval '1 month')::date), 0),
    f.m + least(f.vencimento_dia, extract(day from f.m + interval '1 month - 1 day')::int) - 1
  from f
  where fechamento_fatura(f.m, f.fechamento_dia, f.vencimento_dia, f.fecha_dias) = f.d;
$$;
revoke execute on function faturas_fechadas from public, anon, authenticated;

-- Membros com conta bancária sem atualizar há mais de 7 dias
create or replace function saldos_desatualizados() returns table (user_id uuid, qtd bigint)
language sql stable security definer set search_path = public as $$
  select m.user_id, count(*)
  from carteira_membros m join contas_bancarias b on b.carteira_id = m.carteira_id
  where m.lembrete_saldos and b.ativo and b.atualizado_em < (now() at time zone 'America/Sao_Paulo')::date - 7
  group by m.user_id;
$$;
revoke execute on function saldos_desatualizados from public, anon, authenticated;

-- Parcela no boleto/débito também avisa quando vence
create or replace function avisos_vencimento() returns table (carteira_id uuid, ref_id uuid, titulo text, texto text)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  meses as (
    select distinct date_trunc('month', x)::date m, h.d from h, lateral (values (h.d), (h.d + 1)) v(x)
  ),
  contas as (
    select r.carteira_id, r.id ref_id, r.descricao, r.valor, ms.d,
      ms.m + least(r.dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from recorrencias r, meses ms
    where r.tipo = 'conta' and r.ativo and r.cartao_id is null and r.beneficio_id is null
      and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)
      and not exists (select 1 from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m)
  ),
  faturas as (
    select c.carteira_id, c.id ref_id, 'Fatura ' || c.nome descricao,
      coalesce((select sum(g.valor) from gastos g where g.cartao_id = c.id and g.fatura_mes = ms.m), 0)
      + coalesce((select sum(r.valor) from recorrencias r
          where r.cartao_id = c.id and r.tipo = 'conta' and r.ativo
            and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)), 0) valor,
      ms.d,
      ms.m + least(c.vencimento_dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from cartoes c, meses ms
    where c.ativo
      and not exists (select 1 from pagamentos p where p.tipo = 'fatura' and p.ref_id = c.id and p.mes = ms.m)
  ),
  parcelas as (
    select g.carteira_id, g.id ref_id, g.descricao, g.valor, h.d, g.data venc
    from gastos g, h
    where g.parcelamento_id is not null and g.parcela is not null and g.forma = 'debito' and g.data in (h.d, h.d + 1)
      and not exists (select 1 from pagamentos p where p.tipo = 'parcela' and p.ref_id = g.id)
  )
  select carteira_id, ref_id,
    descricao || case when venc = d then ' vence hoje' else ' vence amanhã' end,
    'Valor: R$ ' || replace(to_char(valor, 'FM999999990.00'), '.', ',')
  from (select * from contas union all select * from faturas union all select * from parcelas) t
  where venc in (d, d + 1) and valor > 0;
$$;
revoke execute on function avisos_vencimento from public, anon, authenticated;

-- fatura fechou: 10h de Brasília; saldos: domingo às 10h
select cron.schedule('cfp-fatura', '0 13 * * *', $$select push_enviar('{"tipo":"fatura"}'::jsonb)$$);
select cron.schedule('cfp-saldos', '0 13 * * 0', $$select push_enviar('{"tipo":"saldos"}'::jsonb)$$);

-- Checagem do build (scripts/checar-banco.mjs): devolve o que ainda falta entre "tabela.coluna" e "check:restricao:texto"
create or replace function colunas_faltando(p_itens text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(i), '{}') from unnest(p_itens) i
  where case when i like 'check:%' then not exists (
      select 1 from pg_constraint c where c.conname = split_part(i, ':', 2) and pg_get_constraintdef(c.oid) like '%' || split_part(i, ':', 3) || '%')
    else not exists (
      select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = split_part(i, '.', 1) and c.column_name = split_part(i, '.', 2))
    end;
$$;
grant execute on function colunas_faltando(text[]) to anon, authenticated;
