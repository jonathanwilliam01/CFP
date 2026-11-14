-- Chat: lido vale em todos os aparelhos; quem está com o chat aberto não recebe push
alter table carteira_membros add column if not exists chat_lido timestamptz;
alter table carteira_membros add column if not exists chat_aberto_em timestamptz;
grant update (chat_lido, chat_aberto_em) on carteira_membros to authenticated;

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
