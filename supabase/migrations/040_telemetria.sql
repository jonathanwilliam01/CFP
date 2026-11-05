create table acessos (
  user_id uuid not null references auth.users on delete cascade,
  dia date not null,
  versao text,
  aparelho text,
  primary key (user_id, dia)
);

create table erros_app (
  id bigserial primary key,
  user_id uuid references auth.users on delete set null,
  criado_em timestamptz not null default now(),
  versao text,
  rota text,
  mensagem text not null,
  detalhe text,
  navegador text
);
create index erros_app_criado_em_idx on erros_app (criado_em);

alter table acessos enable row level security;
alter table erros_app enable row level security;
revoke insert, update, delete, truncate on acessos, erros_app from anon, authenticated;

create function registrar_acesso(p_versao text, p_aparelho text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into acessos (user_id, dia, versao, aparelho)
  values (auth.uid(), (now() at time zone 'America/Sao_Paulo')::date, left(p_versao, 40), left(p_aparelho, 60))
  on conflict (user_id, dia) do update
    set versao = excluded.versao, aparelho = excluded.aparelho;
end $$;

create function registrar_erro(p_versao text, p_rota text, p_mensagem text, p_detalhe text, p_navegador text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from erros_app
      where user_id = auth.uid() and criado_em > now() - interval '1 hour') >= 20 then
    return;
  end if;
  insert into erros_app (user_id, versao, rota, mensagem, detalhe, navegador)
  values (auth.uid(), left(p_versao, 40), left(p_rota, 200), left(coalesce(p_mensagem, ''), 500), left(p_detalhe, 2000),
          left(p_navegador, 200));
end $$;

revoke execute on function registrar_acesso(text, text) from public, anon;
revoke execute on function registrar_erro(text, text, text, text, text) from public, anon;
grant execute on function registrar_acesso(text, text) to authenticated;
grant execute on function registrar_erro(text, text, text, text, text) to authenticated;

select cron.schedule('cfp-erros-limpeza', '30 3 * * *',
  $$delete from public.erros_app where criado_em < now() - interval '90 days'$$);
