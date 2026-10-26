-- Última parcela pode ter valor próprio (sobra de centavos do arredondamento)
drop function criar_parcelamento(uuid, text, uuid, uuid, numeric, int, date, int);

create function criar_parcelamento(
  p_carteira uuid, p_descricao text, p_categoria uuid, p_cartao uuid,
  p_valor_parcela numeric, p_num int, p_primeira date, p_ini int default 1, p_valor_ultima numeric default null
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
      case when i = p_num and p_valor_ultima is not null then p_valor_ultima else p_valor_parcela end,
      (p_primeira + make_interval(months => i - p_ini))::date,
      case when p_cartao is null then 'debito' else 'cartao' end,
      p_cartao,
      pid,
      i
    );
  end loop;
  return pid;
end $$;

-- Importação inteira numa transação. Item: descricao, categoria_id, valor, data, forma, cartao_id, parcelar, parcela, parcelas
create or replace function importar_gastos(p_carteira uuid, p_itens jsonb) returns int
language plpgsql set search_path = public as $$
declare
  it jsonb;
  n int := 0;
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    if coalesce((it->>'parcelar')::boolean, false) then
      perform criar_parcelamento(p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'cartao_id')::uuid,
        (it->>'valor')::numeric, (it->>'parcelas')::int, (it->>'data')::date, (it->>'parcela')::int);
    else
      insert into gastos (carteira_id, descricao, categoria_id, valor, data, forma, cartao_id)
      values (p_carteira, it->>'descricao', (it->>'categoria_id')::uuid, (it->>'valor')::numeric, (it->>'data')::date,
        coalesce(it->>'forma', 'cartao'), (it->>'cartao_id')::uuid);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Um cartão padrão por carteira
update cartoes c set padrao = false
where padrao and exists (select 1 from cartoes x where x.carteira_id = c.carteira_id and x.padrao and x.id < c.id);
create unique index cartoes_um_padrao on cartoes (carteira_id) where padrao;

create or replace function definir_cartao_padrao(p_cartao uuid) returns void
language plpgsql set search_path = public as $$
declare
  cid uuid;
begin
  select carteira_id into cid from cartoes where id = p_cartao;
  if cid is null then
    raise exception 'Cartão não encontrado';
  end if;
  update cartoes set padrao = false where carteira_id = cid and padrao and id <> p_cartao;
  update cartoes set padrao = true where id = p_cartao;
end $$;

-- Excluída a última parcela restante, o parcelamento some junto
create or replace function gastos_parcela_excluida() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.parcelamento_id is not null
    and not exists (select 1 from gastos where parcelamento_id = old.parcelamento_id) then
    delete from parcelamentos where id = old.parcelamento_id;
  end if;
  return null;
end $$;

create trigger gastos_parcela_excluida after delete on gastos
for each row execute function gastos_parcela_excluida();

grant execute on function criar_parcelamento, importar_gastos, definir_cartao_padrao to authenticated;
