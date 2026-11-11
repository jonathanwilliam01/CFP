begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('a', teste_usuario('a@h')), ('b', teste_usuario('b@h')), ('c', gen_random_uuid()), ('cof', gen_random_uuid()), ('cart', gen_random_uuid());
insert into carteiras (id, nome, criado_por) select (select id from ids where chave = 'c'), 'casa', (select id from ids where chave = 'a');
insert into carteira_membros (carteira_id, user_id, nome, papel)
  select (select id from ids where chave = 'c'), (select id from ids where chave = k), k, case k when 'a' then 'dono' else 'membro' end from (values ('a'), ('b')) v(k);
insert into cofrinhos (id, carteira_id, nome, meta) select (select id from ids where chave = 'cof'), (select id from ids where chave = 'c'), 'Reserva', 1000;
insert into cartoes (id, carteira_id, nome, fechamento_dia, vencimento_dia) select (select id from ids where chave = 'cart'), (select id from ids where chave = 'c'), 'Nu', 1, 8;
delete from atividades;

do $$
declare
  c uuid := (select id from ids where chave = 'c');
  a uuid := (select id from ids where chave = 'a');
  b uuid := (select id from ids where chave = 'b');
  cof uuid := (select id from ids where chave = 'cof');
  cart uuid := (select id from ids where chave = 'cart');
  g uuid;
  mov uuid;
  at atividades;
begin
  perform teste_como(a);

  -- histórico: um comando = uma linha, com quem fez
  insert into gastos (carteira_id, descricao, valor, data, forma) values (c, 'Mercado', 100, '2026-11-05', 'debito') returning id into g;
  select * into at from atividades where tabela = 'gastos' order by id desc limit 1;
  assert at.user_id = a and at.acao = 'insert' and at.qtd = 1 and at.valor = 100 and at.descricao = 'Mercado' and at.ref_id = g, 'insert não registrado';

  insert into gastos (carteira_id, descricao, valor, data, forma) select c, 'Item ' || i, 10, '2026-11-05', 'debito' from generate_series(1, 5) i;
  assert (select qtd from atividades where tabela = 'gastos' order by id desc limit 1) = 5, 'lote não virou uma linha';

  update gastos set conferido = true where id = g;
  assert (select count(*) from atividades where acao = 'update') = 0, 'conferir contou como edição';
  update gastos set valor = 120 where id = g;
  assert (select count(*) from atividades where acao = 'update' and valor = 120) = 1, 'edição não registrada';

  -- gasto no cartão: refazer a fatura pelo ciclo não entra
  insert into gastos (carteira_id, descricao, valor, data, forma, cartao_id) values (c, 'Loja', 50, '2026-11-05', 'cartao', cart);
  perform count(*) from atividades;
  update cartoes set fechamento_dia = 3 where id = cart;
  assert (select count(*) from atividades where tabela = 'gastos' and acao = 'update') = 1, 'fatura refeita pelo trigger entrou no histórico';

  -- livre: sem descrição no histórico
  insert into gastos (carteira_id, descricao, valor, data, forma, livre) values (c, 'Presente surpresa', 80, '2026-11-05', 'debito', true);
  select * into at from atividades where tabela = 'gastos' order by id desc limit 1;
  assert at.descricao is null and at.valor = 80, 'gasto livre mostrou a descrição';

  -- parcelado: só o parcelamento
  perform criar_parcelamento(c, 'TV', null, null, 100, 3, '2026-11-05'::date);
  assert (select count(*) from atividades where tabela = 'parcelamentos' and valor = 300) = 1, 'parcelamento não registrado';
  assert not exists (select 1 from atividades where tabela = 'gastos' and descricao like 'TV%'), 'parcelas entraram uma a uma';

  delete from gastos where id = g;
  assert exists (select 1 from atividades where acao = 'delete' and descricao = 'Mercado'), 'exclusão não registrada';

  -- dinheiro livre
  perform definir_livres(c, jsonb_build_object(a::text, 300, b::text, 0));
  assert (select livre from carteira_membros where user_id = a) = 300 and (select livre from carteira_membros where user_id = b) is null, 'livre não gravou';

  -- check-in e fechamento só em nome próprio
  insert into metas (carteira_id, titulo, valor) values (c, 'Viagem', 5000);
  insert into meta_checkins (carteira_id, meta_id, humor) select c, id, 3 from metas;
  begin
    insert into meta_checkins (carteira_id, meta_id, humor, user_id) select c, id, 1, b from metas;
    raise exception 'check-in em nome do outro passou';
  exception when insufficient_privilege then null;
  end;
  insert into fechamentos (carteira_id, mes, decisao) values (c, '2026-10-01', 'Cortar delivery');
  begin
    insert into fechamentos (carteira_id, mes, decisao) values (c, '2026-10-01', 'de novo');
    raise exception 'fechamento duplicado passou';
  exception when unique_violation then null;
  end;

  -- sobra automática: uma vez por mês
  update carteiras set sobra_pct = 50, sobra_cofrinho = cof where id = c;
  mov := guardar_sobra(c, '2026-10-01', 400, 'Sobra de outubro');
  assert (select valor from cofrinho_movs where id = mov) = 400, 'sobra não guardada';
  assert guardar_sobra(c, '2026-10-01', 400, 'Sobra de outubro') is null, 'sobra guardada duas vezes';
  assert guardar_sobra(c, '2026-11-01', -10, 'Sobra de novembro') is null, 'guardou sobra negativa';
  assert (select sobra_feita from carteiras where id = c) = '2026-11-01', 'mês sem sobra não foi marcado';
  perform teste_sistema();
end $$;

rollback;
