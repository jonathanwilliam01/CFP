-- Parcelamento a partir de uma parcela em andamento (importação de fatura).
-- p_primeira é a data da parcela p_ini; só ela e as seguintes viram gastos.
drop function criar_parcelamento(uuid, text, uuid, uuid, numeric, int, date);

create function criar_parcelamento(
  p_carteira uuid, p_descricao text, p_categoria uuid, p_cartao uuid,
  p_valor_parcela numeric, p_num int, p_primeira date, p_ini int default 1
) returns uuid
language plpgsql set search_path = public as $$
declare
  pid uuid;
  i int;
begin
  insert into parcelamentos (carteira_id, descricao, categoria_id, cartao_id, valor_parcela, num_parcelas, primeira_data)
  values (p_carteira, p_descricao, p_categoria, p_cartao, p_valor_parcela, p_num, (p_primeira - make_interval(months => p_ini - 1))::date)
  returning id into pid;

  for i in p_ini..p_num loop
    insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela)
    values (
      p_carteira,
      p_descricao || ' (' || i || '/' || p_num || ')',
      p_categoria,
      p_valor_parcela,
      (p_primeira + make_interval(months => i - p_ini))::date,
      case when p_cartao is null then 'debito' else 'cartao' end,
      p_cartao,
      pid,
      i
    );
  end loop;
  return pid;
end $$;

grant execute on function criar_parcelamento to authenticated;
