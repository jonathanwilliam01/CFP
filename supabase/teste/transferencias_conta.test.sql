begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('a', teste_usuario('a@t')), ('b', teste_usuario('b@t')), ('c', gen_random_uuid()), ('c2', gen_random_uuid()), ('so', gen_random_uuid()),
  ('itau', gen_random_uuid()), ('nu', gen_random_uuid()), ('fora', gen_random_uuid()), ('cof', gen_random_uuid());
insert into carteiras (id, nome, criado_por) select id, chave, (select id from ids where chave = 'a') from ids where chave in ('c', 'c2', 'so');
insert into carteira_membros (carteira_id, user_id, nome, papel, criado_em) values
  ((select id from ids where chave = 'c'), (select id from ids where chave = 'a'), 'a', 'dono', now() - interval '2 days'),
  ((select id from ids where chave = 'c'), (select id from ids where chave = 'b'), 'b', 'membro', now() - interval '1 day'),
  ((select id from ids where chave = 'so'), (select id from ids where chave = 'a'), 'a', 'dono', now()),
  ((select id from ids where chave = 'c2'), (select id from ids where chave = 'b'), 'b', 'dono', now());
insert into contas_bancarias (id, carteira_id, nome, saldo) values
  ((select id from ids where chave = 'itau'), (select id from ids where chave = 'c'), 'Itaú', 1000),
  ((select id from ids where chave = 'nu'), (select id from ids where chave = 'c'), 'Nubank', 200),
  ((select id from ids where chave = 'fora'), (select id from ids where chave = 'c2'), 'Outra', 50);
insert into cofrinhos (id, carteira_id, nome, meta) values ((select id from ids where chave = 'cof'), (select id from ids where chave = 'c'), 'Reserva', 0);

do $$
declare
  c uuid := (select id from ids where chave = 'c');
  itau uuid := (select id from ids where chave = 'itau');
  nu uuid := (select id from ids where chave = 'nu');
  fora uuid := (select id from ids where chave = 'fora');
  cof uuid := (select id from ids where chave = 'cof');
  t uuid;
  mv uuid;
begin
  perform teste_como((select id from ids where chave = 'a'));

  insert into transferencias (carteira_id, de_id, para_id, valor) values (c, itau, nu, 300) returning id into t;
  assert (select saldo from contas_bancarias where id = itau) = 700 and (select saldo from contas_bancarias where id = nu) = 500, 'transferência não moveu o saldo';
  assert exists (select 1 from atividades where tabela = 'transferencias' and descricao = 'Itaú → Nubank'), 'histórico sem a transferência';

  delete from transferencias where id = t;
  assert (select saldo from contas_bancarias where id = itau) = 1000 and (select saldo from contas_bancarias where id = nu) = 200, 'excluir não desfez';

  begin
    insert into transferencias (carteira_id, de_id, para_id, valor) values (c, itau, fora, 10);
    assert false, 'aceitou conta de outra carteira';
  exception when raise_exception then null;
  end;
  begin
    insert into transferencias (carteira_id, de_id, para_id, valor) values (c, itau, itau, 10);
    assert false, 'aceitou a mesma conta';
  exception when raise_exception then null;
  end;

  insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, conta_id) values (c, cof, 100, current_date, itau) returning id into mv;
  assert (select saldo from contas_bancarias where id = itau) = 900, 'depósito não saiu da conta';
  update cofrinho_movs set valor = 150 where id = mv;
  assert (select saldo from contas_bancarias where id = itau) = 850, 'editar o depósito não acertou a conta';
  insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, conta_id) values (c, cof, -50, current_date, nu);
  assert (select saldo from contas_bancarias where id = nu) = 250, 'retirada não voltou para a conta';
  delete from cofrinho_movs where id = mv;
  assert (select saldo from contas_bancarias where id = itau) = 1000, 'excluir o depósito não devolveu';

  insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, rendimento_mes) values (c, cof, 5, '2026-10-31', '2026-10-01');
  begin
    insert into cofrinho_movs (carteira_id, cofrinho_id, valor, data, rendimento_mes) values (c, cof, 5, '2026-10-31', '2026-10-01');
    assert false, 'rendimento do mês duplicou';
  exception when unique_violation then null;
  end;

  -- 2 etapas: com fator verificado, sessão aal1 não vê a carteira; aal2 vê
  perform teste_sistema();
  insert into auth.mfa_factors (user_id, status) values ((select id from ids where chave = 'a'), 'verified');
  perform set_config('request.jwt.claims', '{"aal":"aal1"}', false);
  perform teste_como((select id from ids where chave = 'a'));
  assert not is_membro(c), 'aal1 passou com fator verificado';
  perform set_config('request.jwt.claims', '{"aal":"aal2"}', false);
  assert is_membro(c), 'aal2 barrado';
  perform teste_como((select id from ids where chave = 'b'));
  perform set_config('request.jwt.claims', '{"aal":"aal1"}', false);
  assert is_membro(c), 'sem fator, aal1 deve passar';
  perform set_config('request.jwt.claims', '', false);
  perform teste_sistema();
end $$;

-- Excluir conta: carteira só dela some, compartilhada passa o dono para b
select excluir_minha_conta((select id from ids where chave = 'a'));
do $$ begin
  assert not exists (select 1 from carteiras where id = (select id from ids where chave = 'so')), 'carteira só dela ficou';
  assert (select papel from carteira_membros where carteira_id = (select id from ids where chave = 'c') and user_id = (select id from ids where chave = 'b')) = 'dono', 'dono não passou para b';
  assert not exists (select 1 from carteira_membros where user_id = (select id from ids where chave = 'a')), 'ainda é membro';
end $$;

rollback;
