begin;

do $$
declare
  a uuid := teste_usuario('rec@t');
  c uuid := gen_random_uuid();
  k uuid := gen_random_uuid();
  e uuid;
  e2 uuid;
  conta uuid;
  conta2 uuid;
begin
  insert into carteiras (id, nome, criado_por) values (c, 'rec', a);
  assert (select modelo from carteiras where id = c) = 'mes', 'modelo padrão';
  insert into recorrencias (carteira_id, tipo, descricao, valor, dia, inicio) values (c, 'entrada', 'Adiantamento', 2000, 20, '2026-01-01') returning id into e;
  insert into recorrencias (carteira_id, tipo, descricao, valor, dia, inicio, recebimento_id) values (c, 'conta', 'Luz', 200, 10, '2026-01-01', e) returning id into conta;
  insert into cartoes (id, carteira_id, nome, fechamento_dia, vencimento_dia, recebimento_id) values (k, c, 'Nubank', 1, 7, e);

  -- entrada reajustada: conta e cartão passam para a versão nova
  e2 := reajustar_recorrencia(e, 2200, '2026-06-01');
  assert e2 <> e, 'reajuste criou outra versão';
  assert (select recebimento_id from recorrencias where id = conta) = e2, 'conta seguiu a entrada nova';
  assert (select recebimento_id from cartoes where id = k) = e2, 'cartão seguiu a entrada nova';

  -- conta reajustada leva o vínculo
  conta2 := reajustar_recorrencia(conta, 250, '2026-07-01');
  assert (select recebimento_id from recorrencias where id = conta2) = e2, 'conta nova manteve o vínculo';

  -- entrada excluída: vínculo volta para automático
  delete from recorrencias where id = e2;
  assert (select recebimento_id from recorrencias where id = conta2) is null, 'vínculo some com a entrada';
end $$;

rollback;
