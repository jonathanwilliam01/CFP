-- Marcadores também no parcelado e na importação (requer 020).
drop function criar_parcelamento(uuid, text, uuid, uuid, numeric, int, date, int, numeric);

create function criar_parcelamento(
  p_carteira uuid, p_descricao text, p_categoria uuid, p_cartao uuid,
  p_valor_parcela numeric, p_num int, p_primeira date, p_ini int default 1, p_valor_ultima numeric default null,
  p_tags text[] default '{}'
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
    insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, parcelamento_id, parcela, tags)
    values (
      p_carteira,
      p_descricao || ' (' || i || '/' || p_num || ')',
      p_categoria,
      case when i = p_num and p_valor_ultima is not null then p_valor_ultima else p_valor_parcela end,
      (p_primeira + make_interval(months => i - p_ini))::date,
      case when p_cartao is null then 'debito' else 'cartao' end,
      p_cartao,
      pid,
      i,
      coalesce(p_tags, '{}')
    );
  end loop;
  return pid;
end $$;

-- Item ganha "tags" (array de texto)
create or replace function importar_gastos(p_carteira uuid, p_itens jsonb) returns int
language plpgsql set search_path = public as $$
declare
  it jsonb;
  n int := 0;
  t text[];
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    t := coalesce(array(select jsonb_array_elements_text(it->'tags')), '{}');
    if coalesce((it->>'parcelar')::boolean, false) then
      perform criar_parcelamento(p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'cartao_id')::uuid,
        (it->>'valor')::numeric, (it->>'parcelas')::int, (it->>'data')::date, (it->>'parcela')::int, null, t);
    else
      insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id, tags)
      values (p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'valor')::numeric, (it->>'data')::date,
        coalesce(it->>'forma', 'cartao'), (it->>'cartao_id')::uuid, t);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function criar_parcelamento, importar_gastos to authenticated;
