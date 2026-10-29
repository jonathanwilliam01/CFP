-- Conta variável sem valor do mês: aviso de vencimento usa a média das últimas 12 contas (mín. 3), como o app.
create or replace function media_variavel(p_ref uuid) returns numeric
language sql stable set search_path = public as $$
  select round(avg(valor), 2) from (
    select valor from pagamentos where tipo = 'recorrencia' and ref_id = p_ref order by mes desc limit 12
  ) u having count(*) >= 3;
$$;
revoke execute on function media_variavel from public, anon, authenticated;

create or replace function avisos_vencimento() returns table (carteira_id uuid, ref_id uuid, titulo text, texto text)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  meses as (
    select distinct date_trunc('month', x)::date m, h.d from h, lateral (values (h.d), (h.d + 1)) v(x)
  ),
  contas as (
    select r.carteira_id, r.id ref_id, r.descricao,
      coalesce((select p.valor from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m),
        case when r.variavel then media_variavel(r.id) end, r.valor) valor,
      ms.d,
      ms.m + least(r.dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from recorrencias r, meses ms
    where r.tipo = 'conta' and r.ativo and r.cartao_id is null and r.beneficio_id is null
      and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)
      and not exists (select 1 from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m and p.pago_em is not null)
  ),
  faturas as (
    select c.carteira_id, c.id ref_id, 'Fatura ' || c.nome descricao,
      coalesce((select sum(g.valor) from gastos g where g.cartao_id = c.id and g.fatura_mes = ms.m), 0)
      + coalesce((select sum(coalesce(case when r.variavel then media_variavel(r.id) end, r.valor)) from recorrencias r
          where r.cartao_id = c.id and r.tipo = 'conta' and r.ativo
            and date_trunc('month', r.inicio) <= ms.m and (r.fim is null or date_trunc('month', r.fim) >= ms.m)), 0) valor,
      ms.d,
      ms.m + least(c.vencimento_dia, extract(day from ms.m + interval '1 month - 1 day')::int) - 1 venc
    from cartoes c, meses ms
    where c.ativo
      and not exists (select 1 from pagamentos p where p.tipo = 'fatura' and p.ref_id = c.id and p.mes = ms.m)
  )
  select carteira_id, ref_id,
    descricao || case when venc = d then ' vence hoje' else ' vence amanhã' end,
    'Valor: R$ ' || replace(to_char(valor, 'FM999999990.00'), '.', ',')
  from (select * from contas union all select * from faturas) t
  where venc in (d, d + 1) and valor > 0;
$$;
revoke execute on function avisos_vencimento from public, anon, authenticated;
