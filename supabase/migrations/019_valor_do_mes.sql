-- Conta variável: valor do mês informado sem pagar (pago_em nulo).
alter table pagamentos alter column pago_em drop not null;

-- Contas e faturas não pagas vencendo hoje ou amanhã (horário de Brasília).
-- Conta variável usa o valor do mês informado, senão o cadastrado.
create or replace function avisos_vencimento() returns table (carteira_id uuid, ref_id uuid, titulo text, texto text)
language sql stable security definer set search_path = public as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date d),
  meses as (
    select distinct date_trunc('month', x)::date m, h.d from h, lateral (values (h.d), (h.d + 1)) v(x)
  ),
  contas as (
    select r.carteira_id, r.id ref_id, r.descricao,
      coalesce((select p.valor from pagamentos p where p.tipo = 'recorrencia' and p.ref_id = r.id and p.mes = ms.m), r.valor) valor,
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
      + coalesce((select sum(r.valor) from recorrencias r
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
