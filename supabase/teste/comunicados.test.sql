begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values
  ('comum', teste_usuario('comum@t')),
  ('outro', teste_usuario('outro@t')),
  ('admin', teste_usuario('admin@t'));
insert into admins select id from ids where chave = 'admin';

with c as (
  insert into comunicados (titulo, texto, inicio, fim, publicado, push)
  select v, 'texto', case v when 'agendado' then now() + interval '1 day' else now() - interval '2 day' end,
    case v when 'expirado' then now() - interval '1 day' else now() + interval '2 day' end,
    v <> 'rascunho', v = 'no_ar'
  from unnest(array['no_ar', 'rascunho', 'agendado', 'expirado']) v
  returning titulo, id
)
insert into ids select titulo, id from c;
insert into comunicado_leituras (comunicado_id, user_id)
  select (select id from ids where chave = 'no_ar'), id from ids where chave = 'outro';

do $$
declare
  v_comum uuid := (select id from ids where chave = 'comum');
  v_admin uuid := (select id from ids where chave = 'admin');
  estado text;
  antes int;
begin
  assert (select count(*) from comunicado_tags) = 5, 'tags iniciais';

  perform teste_como(v_comum);
  assert (select count(*) from comunicados) = 1, 'comum vê fora do ar';
  assert (select titulo from comunicados) = 'no_ar', 'comum não vê o no ar';
  assert (select count(*) from comunicado_leituras) = 0, 'comum vê leitura de outro';
  assert (select count(*) from funcoes_status) = 0, 'comum não lê funcoes_status';

  begin
    insert into comunicados (titulo, texto, inicio, fim) values ('x', 'x', now(), now() + interval '1 day');
    estado := 'sem erro';
  exception when others then
    estado := sqlstate;
  end;
  assert estado = '42501', 'comum insere comunicado: ' || estado;

  insert into comunicado_leituras (comunicado_id) select id from ids where chave = 'no_ar';
  assert (select count(*) from comunicado_leituras) = 1, 'comum não vê a própria leitura';

  perform teste_como(v_admin);
  assert (select count(*) from comunicados) = 4, 'admin não vê todos';
  antes := (select count(*) from admin_log);
  insert into comunicados (titulo, texto, inicio, fim, tag_id)
    values ('novo', 'texto longo', now(), now() + interval '1 day', (select id from comunicado_tags where nome = 'Dica'));
  assert (select count(*) from admin_log) = antes + 1, 'auditoria do insert';
  assert (select acao from admin_log order by id desc limit 1) = 'comunicados.insert', 'acao';
  assert (select admin_id from admin_log order by id desc limit 1) = v_admin, 'admin_id';
  assert not (select detalhe ? 'texto' from admin_log order by id desc limit 1), 'detalhe com texto';

  insert into funcoes_status (chave, ativa, mensagem) values ('chat', false, 'manutenção');
  assert (select alvo from admin_log order by id desc limit 1) = 'chat', 'alvo funcoes_status';
  perform teste_sistema();
end $$;

insert into push_config values (1, 'http://push', 'seg');
do $$ begin
  assert enviar_comunicados() = 1, 'primeiro envio';
  assert (select push_enviado_em is not null from comunicados where titulo = 'no_ar'), 'push_enviado_em';
  assert (select body from net._chamadas order by id desc limit 1)
    = jsonb_build_object('tipo', 'comunicado', 'id', (select id from ids where chave = 'no_ar')), 'payload';
  assert enviar_comunicados() = 0, 'segundo envio';
end $$;

rollback;
