-- Reajuste de conta/entrada fixa a partir de um mês, numa transação.
-- Encerra a recorrência no mês anterior, cria outra com o novo valor e move os pagamentos do mês em diante.
alter table recorrencias add column reajuste_de uuid references recorrencias on delete set null;

create or replace function reajustar_recorrencia(p_id uuid, p_valor numeric, p_mes date) returns uuid
language plpgsql set search_path = public as $$
declare
  r recorrencias;
  nova uuid;
  v_mes date := date_trunc('month', p_mes)::date;
begin
  select * into r from recorrencias where id = p_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;

  if v_mes <= date_trunc('month', r.inicio)::date then
    update recorrencias set valor = p_valor where id = p_id;
    return p_id;
  end if;
  if r.fim is not null and date_trunc('month', r.fim)::date < v_mes then
    raise exception 'Termina antes desse mês';
  end if;

  insert into recorrencias (carteira_id, tipo, descricao, categoria_id, valor, dia, inicio, fim, ativo,
    cartao_id, variavel, paga_mes_anterior, beneficio_id, reajuste_de)
  values (r.carteira_id, r.tipo, r.descricao, r.categoria_id, p_valor, r.dia, v_mes, r.fim, r.ativo,
    r.cartao_id, r.variavel, r.paga_mes_anterior, r.beneficio_id, r.id)
  returning id into nova;

  update pagamentos set ref_id = nova where tipo = 'recorrencia' and ref_id = p_id and mes >= v_mes;
  update recorrencias set fim = (v_mes - interval '1 month')::date where id = p_id;
  return nova;
end $$;
