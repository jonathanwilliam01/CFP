-- Uso dos benefícios por mês, para o saldo sem carregar todos os gastos de benefício
create or replace function uso_beneficios(p_carteira uuid, p_ate date)
returns table (beneficio_id uuid, mes date, total numeric)
language sql stable set search_path = public as $$
  select beneficio_id, date_trunc('month', data)::date, sum(valor)
  from gastos
  where carteira_id = p_carteira and forma = 'beneficio' and beneficio_id is not null and data <= p_ate
  group by 1, 2;
$$;

grant execute on function uso_beneficios to authenticated;
