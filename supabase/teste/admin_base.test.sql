begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;

insert into ids values
  ('comum', teste_usuario('comum@t')),
  ('admin', teste_usuario('admin@t')),
  ('a', teste_usuario('a@t')),
  ('b', teste_usuario('b@t')),
  ('s', teste_usuario('s@t')),
  ('d', teste_usuario('d@t')),
  ('e', teste_usuario('e@t')),
  ('f', teste_usuario('f@t')),
  ('g', teste_usuario('g@t')),
  ('h', teste_usuario('h@t')),
  ('i', teste_usuario('i@t'));
insert into admins select id from ids where chave = 'admin';

-- carteira do casal: A dono, B membro
insert into ids values ('casal', gen_random_uuid()), ('sozinho', gen_random_uuid()), ('trio', gen_random_uuid()), ('sair', gen_random_uuid()), ('excluir', gen_random_uuid());
insert into carteiras (id, nome, criado_por)
  select (select id from ids where chave = c), c, (select id from ids where chave = d)
  from (values ('casal', 'a'), ('sozinho', 'a'), ('trio', 'g'), ('sair', 'd'), ('excluir', 'e')) v(c, d);
insert into carteira_membros (carteira_id, user_id, nome, papel, criado_em)
  select (select id from ids where chave = c), (select id from ids where chave = u), u, p, t::timestamptz
  from (values
    ('casal', 'a', 'dono', '2026-01-01'), ('casal', 'b', 'membro', '2026-01-02'),
    ('casal', 's', 'membro', '2026-01-03'),
    ('sozinho', 'a', 'dono', '2026-01-01'),
    ('trio', 'g', 'dono', '2026-01-01'), ('trio', 'h', 'membro', '2026-01-02'),
    ('trio', 'i', 'membro', '2026-01-03'),
    ('sair', 'd', 'dono', '2026-01-01'), ('sair', 'f', 'membro', '2026-01-02'),
    ('excluir', 'e', 'dono', '2026-01-01'), ('excluir', 'f', 'membro', '2026-01-02')
  ) v(c, u, p, t);
insert into mensagens (carteira_id, user_id, texto)
  select (select id from ids where chave = 'casal'), (select id from ids where chave = 'a'), 'oi';
insert into acertos (carteira_id, mes, de, para, valor)
  select (select id from ids where chave = 'casal'), '2026-11-01', (select id from ids where chave = 'a'), (select id from ids where chave = 'b'), 10;

do $$
declare
  v_comum uuid := (select id from ids where chave = 'comum');
  v_admin uuid := (select id from ids where chave = 'admin');
  msg text;
begin
  perform teste_como(v_comum);
  assert not is_admin(), 'comum é admin';
  assert not estou_suspenso(), 'comum suspenso';
  begin
    perform admin_registrar('x', 'y');
    msg := 'sem erro';
  exception when others then
    msg := sqlerrm;
  end;
  assert msg = 'acesso negado', 'admin_registrar como comum: ' || msg;

  perform teste_como(v_admin);
  assert is_admin(), 'admin não é admin';
  perform admin_registrar('senha', 'x@t', '{"k": 1}');
  assert (select count(*) from admin_log where acao = 'senha' and admin_id = v_admin) = 1, 'admin_registrar não gravou';

  perform teste_como(v_comum);
  assert (select count(*) from admin_log) = 0, 'comum vê admin_log';
  assert (select count(*) from admins) = 0, 'comum vê admins';
  perform teste_sistema();
end $$;

-- authenticated não escreve direto nem chama as funções do service_role
do $$
declare
  v_comum uuid := (select id from ids where chave = 'comum');
  cmd text;
  estado text;
begin
  perform teste_como(v_comum);
  foreach cmd in array array[
    format('insert into admins values (%L)', v_comum),
    format('insert into suspensos (user_id) values (%L)', v_comum),
    'insert into admin_log (acao) values (''x'')',
    format('select admin_suspender(%L, ''x'', %L)', v_comum, v_comum),
    format('select admin_reativar(%L, %L)', v_comum, v_comum)
  ] loop
    begin
      execute cmd;
      estado := 'sem erro';
    exception when others then
      estado := sqlstate;
    end;
    assert estado = '42501', cmd || ': ' || estado;
  end loop;
  perform teste_sistema();
end $$;

-- suspensão
do $$
declare
  v_s uuid := (select id from ids where chave = 's');
  v_admin uuid := (select id from ids where chave = 'admin');
  v_casal uuid := (select id from ids where chave = 'casal');
begin
  perform teste_como(v_s);
  assert is_membro(v_casal), 's deveria ser membro';
  perform teste_sistema();

  set role service_role;
  perform admin_suspender(v_s, 'primeiro', v_admin);
  perform admin_suspender(v_s, 'teste', v_admin);
  perform teste_sistema();
  assert (select motivo from suspensos where user_id = v_s) = 'teste', 'suspender não atualizou motivo';
  assert (select count(*) from admin_log where acao = 'suspender' and alvo = v_s::text and admin_id = v_admin
    and detalhe ->> 'motivo' = 'teste') = 1, 'sem log suspender';

  perform teste_como(v_s);
  assert not is_membro(v_casal), 'suspenso ainda é membro';
  assert estou_suspenso(), 'estou_suspenso falso';
  assert (select count(*) from mensagens) = 0, 'suspenso lê mensagens';
  perform teste_sistema();

  set role service_role;
  perform admin_reativar(v_s, v_admin);
  perform teste_sistema();
  assert not exists (select 1 from suspensos where user_id = v_s), 'reativar não apagou';
  assert (select count(*) from admin_log where acao = 'reativar' and alvo = v_s::text and admin_id = v_admin) = 1, 'sem log reativar';
  perform teste_como(v_s);
  assert is_membro(v_casal), 'reativado não é membro';
  perform teste_sistema();
end $$;

-- exclusão do dono com parceiro e da carteira só dele
do $$
declare
  v_a uuid := (select id from ids where chave = 'a');
  v_b uuid := (select id from ids where chave = 'b');
  v_casal uuid := (select id from ids where chave = 'casal');
begin
  delete from auth.users where id = v_a;
  assert exists (select 1 from carteiras where id = v_casal), 'carteira do casal sumiu';
  assert (select criado_por from carteiras where id = v_casal) is null, 'criado_por não ficou null';
  assert (select papel from carteira_membros where carteira_id = v_casal and user_id = v_b) = 'dono', 'B não virou dono';
  assert (select count(*) from carteira_membros where carteira_id = v_casal and papel = 'dono') = 1, 'mais de um dono';
  assert exists (select 1 from mensagens where carteira_id = v_casal and user_id is null and texto = 'oi'), 'mensagem de A sumiu';
  assert exists (select 1 from acertos where carteira_id = v_casal and de is null and para = v_b), 'acerto de A sumiu';
  assert not exists (select 1 from carteiras where id = (select id from ids where chave = 'sozinho')), 'carteira só de A ficou';

  delete from auth.users where id = v_b;
  assert exists (select 1 from acertos where carteira_id = v_casal and de is null and para is null), 'acerto sumiu ao apagar B';
end $$;

-- conta suspensa excluída não gera 'reativar'; promoção prefere quem não está suspenso
do $$
declare
  v_s uuid := (select id from ids where chave = 's');
  v_g uuid := (select id from ids where chave = 'g');
  v_h uuid := (select id from ids where chave = 'h');
  v_i uuid := (select id from ids where chave = 'i');
  v_admin uuid := (select id from ids where chave = 'admin');
  v_trio uuid := (select id from ids where chave = 'trio');
begin
  set role service_role;
  perform admin_suspender(v_s, 'x', v_admin);
  perform admin_suspender(v_h, 'x', v_admin);
  perform teste_sistema();
  delete from auth.users where id = v_s;
  assert (select count(*) from admin_log where acao = 'reativar' and alvo = v_s::text) = 1, 'exclusão gerou reativar';

  delete from auth.users where id = v_g;
  assert (select papel from carteira_membros where carteira_id = v_trio and user_id = v_i) = 'dono', 'I não virou dono';
  assert (select papel from carteira_membros where carteira_id = v_trio and user_id = v_h) = 'membro', 'suspenso virou dono';
end $$;

-- sair_carteira e excluir_carteira seguem funcionando com a trigger
do $$
declare
  v_d uuid := (select id from ids where chave = 'd');
  v_e uuid := (select id from ids where chave = 'e');
  v_sair uuid := (select id from ids where chave = 'sair');
  v_excluir uuid := (select id from ids where chave = 'excluir');
begin
  perform teste_como(v_d);
  perform sair_carteira(v_sair);
  perform teste_sistema();
  assert exists (select 1 from carteiras where id = v_sair), 'sair_carteira apagou carteira com membro';
  assert (select count(*) from carteira_membros where carteira_id = v_sair and papel = 'dono') = 1, 'sair_carteira sem dono';

  perform teste_como(v_e);
  perform excluir_carteira(v_excluir);
  perform teste_sistema();
  assert not exists (select 1 from carteiras where id = v_excluir), 'excluir_carteira falhou';
  assert not exists (select 1 from carteira_membros where carteira_id = v_excluir), 'membros ficaram';
end $$;

rollback;
