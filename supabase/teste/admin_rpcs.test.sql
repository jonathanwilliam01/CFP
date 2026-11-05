begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;

-- admin é o autor dos gastos; s está suspenso; comum é usuário sem acesso ao painel
insert into ids values ('admin', teste_usuario('admin@t')), ('s', teste_usuario('s@t')), ('c', gen_random_uuid());
insert into admins select id from ids where chave = 'admin';
insert into suspensos (user_id) select id from ids where chave = 's';
insert into carteiras (id, nome, criado_por) select (select id from ids where chave = 'c'), 'casa', (select id from ids where chave = 'admin');
insert into carteira_membros (carteira_id, user_id, nome, papel)
  select (select id from ids where chave = 'c'), (select id from ids where chave = u), u, p
  from (values ('admin', 'dono'), ('s', 'membro')) v(u, p);
insert into gastos (carteira_id, descricao, valor, criado_por)
  select (select id from ids where chave = 'c'), 'mercado', 10, (select id from ids where chave = 'admin')
  from generate_series(1, 3);
insert into erros_app (user_id, mensagem, versao, rota) select id, 'falhou', '1.0', '/x' from ids where chave = 's';
insert into comunicados (titulo, texto, inicio, fim, publicado) values ('t', 'x', now(), now() + interval '1 day', true);
insert into comunicado_leituras (comunicado_id, user_id) select c.id, i.id from comunicados c, ids i where i.chave = 's';
insert into admin_log (acao, alvo) values ('comunicados.insert', 'x'), ('comunicado_tags.insert', 'y');

do $$
declare
  cmd text;
  msg text;
begin
  perform teste_como(teste_usuario('comum@t'));
  foreach cmd in array array[
    'select admin_usuarios()', 'select admin_metricas(30)', 'select admin_erros(30)',
    'select admin_comunicados()', 'select admin_log_lista()'
  ] loop
    begin
      execute cmd;
      msg := 'sem erro';
    exception when others then
      msg := sqlerrm;
    end;
    assert msg = 'acesso negado', cmd || ' como comum: ' || msg;
  end loop;
  perform teste_sistema();
  delete from auth.users where email = 'comum@t';
end $$;

do $$
declare
  v_admin uuid := (select id from ids where chave = 'admin');
  v_s uuid := (select id from ids where chave = 's');
  u jsonb;
  m jsonb;
  e jsonb;
  c jsonb;
begin
  perform teste_como(v_admin);

  select j into u from admin_usuarios() j where j->>'id' = v_admin::text;
  assert (u->>'lancamentos')::int = 3, 'lancamentos: ' || u;
  assert u->>'status' = 'ativo', 'status admin: ' || u;
  assert u->>'papel' = 'dono' and (u->>'membros')::int = 2 and u->>'carteira' = 'casa', 'carteira: ' || u;
  assert u->>'ultimo_lancamento' is not null, 'ultimo_lancamento';
  assert not (u ? 'descricao') and not (u ? 'valor'), 'conteudo financeiro: ' || u;
  select j into u from admin_usuarios() j where j->>'id' = v_s::text;
  assert u->>'status' = 'suspenso', 'status suspenso: ' || u;
  assert (u->>'lancamentos')::int = 0, 'lancamentos s';
  assert (select count(*) from admin_usuarios()) = 2, 'linhas admin_usuarios';
  assert not exists (select 1 from admin_usuarios() j where j::text ~ 'mercado'), 'descricao vazou';

  m := admin_metricas(30);
  assert m->>'usuarios' = '2', 'usuarios: ' || (m->>'usuarios');
  assert (m->>'carteiras')::int = 1 and (m->>'casais')::int = 1, 'carteiras/casais';
  assert (m->>'erros_24h')::int = 1, 'erros_24h';
  assert jsonb_array_length(m->'ativos_dia') = 30, 'ativos_dia';
  assert (select sum((x->>'n')::int) from jsonb_array_elements(m->'lancamentos_dia') x) = 3, 'lancamentos_dia';
  assert jsonb_array_length(m->'retencao') = 6, 'retencao';
  assert (select (x->>'carteiras')::int from jsonb_array_elements(m->'uso_funcoes') x where x->>'chave' = 'chat') = 0, 'uso chat';
  assert m::text !~ 'mercado', 'metricas vazou descricao';

  e := admin_erros(7);
  assert (e->'frequentes'->0->>'n')::int = 1 and e->'frequentes'->0->>'mensagem' = 'falhou', 'erros: ' || e;
  assert jsonb_array_length(e->'por_dia') = 7, 'erros por_dia';

  select j into c from admin_comunicados() j;
  assert (c->>'lidos')::int = 1 and (c->>'total_usuarios')::int = 2, 'comunicados: ' || c;

  perform admin_registrar('senha', 'x@t');
  assert (select count(*) from admin_log_lista('senha')) = 1, 'log por acao';
  assert (select count(*) from admin_log_lista('comunicados')) = 1, 'log por tabela';
  assert (select count(*) from admin_log_lista(null, 1)) = 1, 'log limite';
  perform teste_sistema();
end $$;

do $$ begin
  assert colunas_faltando(array['check:admin_log_acao_check:length']) = '{}', 'marca 042';
end $$;

rollback;
