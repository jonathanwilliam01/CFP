begin;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('u', teste_usuario('u@t'));

select teste_como((select id from ids where chave = 'u'));

select registrar_acesso('1.0', 'cel');
select registrar_acesso('2.0', 'pc');
do $$ begin
  assert (select count(*) from public.acessos) = 0, 'usuario comum le acessos';
end $$;

select teste_sistema();
do $$ begin
  assert (select count(*) from acessos) = 1, 'acesso duplicado';
  assert (select versao from acessos) = '2.0', 'versao nao atualizou';
end $$;

select teste_como((select id from ids where chave = 'u'));
select registrar_erro('1', '/x', 'm', repeat('d', 5000), 'n') from generate_series(1, 25);
select registrar_erro('1', '/x', repeat('m', 900), null, 'n');
do $$ begin
  assert (select count(*) from erros_app) = 0, 'usuario comum le erros';
end $$;

select teste_sistema();
do $$ begin
  assert (select count(*) from erros_app) = 20, 'rate limit';
  assert (select max(length(detalhe)) from erros_app) = 2000, 'detalhe nao cortado';
end $$;

delete from erros_app;
select teste_como((select id from ids where chave = 'u'));
select registrar_erro(repeat('v', 99), repeat('r', 999), repeat('m', 900), null, repeat('n', 999));
select registrar_acesso(repeat('v', 99), repeat('a', 99));
select teste_sistema();
do $$ begin
  assert (select length(mensagem) from erros_app) = 500, 'mensagem nao cortada';
  assert (select (length(versao), length(rota), length(navegador)) = (40, 200, 200) from erros_app), 'erro sem limite';
  assert (select (length(versao), length(aparelho)) = (40, 60) from acessos), 'acesso sem limite';
end $$;

rollback;
