-- Funções públicas só para quem está logado (no Supabase, toda função nova nasce executável por anon)
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    if has_function_privilege('authenticated', f, 'execute') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Códigos antigos de 6 caracteres eram fáceis de adivinhar
update carteiras set codigo = gerar_codigo() where length(codigo) < 8;

-- Exige login e trava por usuário para chamadas em paralelo não passarem do limite
create or replace function entrar_carteira(p_codigo text, p_membro text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para usar o convite';
  end if;
  perform pg_advisory_xact_lock(hashtext('convite' || auth.uid()::text));
  if (select count(*) from convite_tentativas where user_id = auth.uid() and em > now() - interval '15 minutes') >= 10 then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.';
  end if;
  select id into cid from carteiras where codigo = upper(replace(trim(p_codigo), ' ', ''));
  if cid is null then
    insert into convite_tentativas default values;
    return null;
  end if;
  insert into carteira_membros (carteira_id, user_id, nome) values (cid, auth.uid(), p_membro)
  on conflict do nothing;
  return cid;
end $$;
revoke execute on function entrar_carteira from public, anon;
grant execute on function entrar_carteira to authenticated;

-- Avatares: URL pública continua valendo; sem listar a pasta de todos e só JPEG até 2 MB
drop policy if exists avatares_ler on storage.objects;
update storage.buckets set allowed_mime_types = '{image/jpeg}', file_size_limit = 2097152 where id = 'avatares';
