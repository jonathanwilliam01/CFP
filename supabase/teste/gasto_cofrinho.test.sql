begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('a', teste_usuario('a@t')), ('c', gen_random_uuid()), ('cof', gen_random_uuid()), ('cof2', gen_random_uuid()), ('g', gen_random_uuid());
insert into carteiras (id, nome, criado_por) select (select id from ids where chave = 'c'), 'casa', (select id from ids where chave = 'a');
insert into carteira_membros (carteira_id, user_id, nome, papel) select (select id from ids where chave = 'c'), (select id from ids where chave = 'a'), 'a', 'dono';
insert into cofrinhos (id, carteira_id, nome, meta)
  select (select id from ids where chave = k), (select id from ids where chave = 'c'), k, 1000 from (values ('cof'), ('cof2')) v(k);

do $$
declare
  c uuid := (select id from ids where chave = 'c');
  cof uuid := (select id from ids where chave = 'cof');
  cof2 uuid := (select id from ids where chave = 'cof2');
  g uuid := (select id from ids where chave = 'g');
  mv cofrinho_movs;
begin
  perform teste_como((select id from ids where chave = 'a'));

  insert into gastos (id, carteira_id, descricao, valor, data, forma, cofrinho_id) values (g, c, 'Presente', 50, '2026-11-05', 'debito', cof);
  select * into mv from cofrinho_movs where gasto_id = g;
  assert mv.valor = -50 and mv.cofrinho_id = cof and mv.data = '2026-11-05' and mv.descricao = 'Presente', 'retirada não criada';

  update gastos set valor = 80, cofrinho_id = cof2 where id = g;
  select * into mv from cofrinho_movs where gasto_id = g;
  assert mv.valor = -80 and mv.cofrinho_id = cof2, 'retirada não acompanhou a edição';
  assert (select count(*) from cofrinho_movs where gasto_id = g) = 1, 'duplicou a retirada';

  update gastos set forma = 'beneficio' where id = g;
  assert not exists (select 1 from cofrinho_movs where gasto_id = g), 'só Pix/débito tira do cofrinho';

  update gastos set forma = 'debito' where id = g;
  update gastos set cofrinho_id = null where id = g;
  assert not exists (select 1 from cofrinho_movs where gasto_id = g), 'desmarcar não tirou a retirada';

  update gastos set cofrinho_id = cof where id = g;
  delete from gastos where id = g;
  assert not exists (select 1 from cofrinho_movs where gasto_id = g), 'excluir o gasto não tirou a retirada';

  insert into gastos (id, carteira_id, descricao, valor, forma, cofrinho_id) values (g, c, 'x', 10, 'debito', cof);
  delete from cofrinhos where id = cof;
  assert (select cofrinho_id from gastos where id = g) is null, 'cofrinho excluído ficou no gasto';
  perform teste_sistema();
end $$;

rollback;
