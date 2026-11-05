-- Painel admin: admins, suspensão, auditoria, preferências e exclusão de conta sem levar a carteira do casal

create table admins (
  user_id uuid primary key references auth.users on delete cascade
);
create table suspensos (
  user_id uuid primary key references auth.users on delete cascade,
  desde timestamptz not null default now(),
  motivo text
);
create table admin_log (
  id bigserial primary key,
  admin_id uuid,
  acao text not null,
  alvo text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index on admin_log (criado_em desc);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function estou_suspenso() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from suspensos where user_id = auth.uid());
$$;

-- Escrita só por service_role (Edge Function) e funções definer
alter table admins enable row level security;
alter table suspensos enable row level security;
alter table admin_log enable row level security;
create policy admins_sel on admins for select using (is_admin());
create policy suspensos_sel on suspensos for select using (is_admin());
create policy admin_log_sel on admin_log for select using (is_admin());
revoke all on admins, suspensos, admin_log from anon;
revoke insert, update, delete, truncate on admins, suspensos, admin_log from authenticated;

revoke execute on function is_admin, estou_suspenso from public, anon;
grant execute on function is_admin, estou_suspenso to authenticated;

create or replace function admin_registrar(p_acao text, p_alvo text, p_detalhe jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acesso negado'; end if;
  insert into admin_log (admin_id, acao, alvo, detalhe) values (auth.uid(), p_acao, p_alvo, p_detalhe);
end $$;
revoke execute on function admin_registrar from public, anon;
grant execute on function admin_registrar to authenticated;

create or replace function suspensos_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into admin_log (admin_id, acao, alvo, detalhe)
    values (auth.uid(), 'reativar', old.user_id::text, jsonb_build_object('motivo', old.motivo, 'desde', old.desde));
    return old;
  end if;
  insert into admin_log (admin_id, acao, alvo, detalhe)
  values (auth.uid(), 'suspender', new.user_id::text, jsonb_build_object('motivo', new.motivo));
  return new;
end $$;
create trigger suspensos_log after insert or update or delete on suspensos
  for each row execute function suspensos_log();

-- Suspenso perde o acesso às carteiras na hora (RLS e realtime passam por is_membro)
create or replace function is_membro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid())
    and not exists (select 1 from suspensos where user_id = auth.uid());
$$;

create or replace function e_dono(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from carteira_membros where carteira_id = c and user_id = auth.uid() and papel = 'dono')
    and not exists (select 1 from suspensos where user_id = auth.uid());
$$;

create or replace function membro_da_pasta(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from carteira_membros m
    where m.carteira_id::text = (storage.foldername(p_nome))[1] and m.user_id = auth.uid()
  ) and not exists (select 1 from suspensos where user_id = auth.uid());
$$;

drop policy push_inscricoes_rw on push_inscricoes;
create policy push_inscricoes_rw on push_inscricoes for all
  using (user_id = auth.uid() and not estou_suspenso()) with check (user_id = auth.uid() and not estou_suspenso());

drop policy if exists avatares_inserir on storage.objects;
drop policy if exists avatares_atualizar on storage.objects;
drop policy if exists avatares_excluir on storage.objects;
create policy avatares_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text and not estou_suspenso());
create policy avatares_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text and not estou_suspenso());
create policy avatares_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text and not estou_suspenso());

-- Preferências por usuário (o comunicado é global, nem todo usuário tem carteira)
create table usuario_prefs (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  push_comunicados boolean not null default true
);
alter table usuario_prefs enable row level security;
create policy usuario_prefs_rw on usuario_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Conta excluída: o histórico fica na carteira, sem autor
alter table carteiras alter column criado_por drop not null,
  drop constraint carteiras_criado_por_fkey,
  add constraint carteiras_criado_por_fkey foreign key (criado_por) references auth.users on delete set null;
alter table mensagens alter column user_id drop not null,
  drop constraint mensagens_user_id_fkey,
  add constraint mensagens_user_id_fkey foreign key (user_id) references auth.users on delete set null;
alter table acertos alter column de drop not null, alter column para drop not null,
  drop constraint acertos_de_fkey,
  drop constraint acertos_para_fkey,
  add constraint acertos_de_fkey foreign key (de) references auth.users on delete set null,
  add constraint acertos_para_fkey foreign key (para) references auth.users on delete set null;

-- Saída de membro (conta excluída, sair, remover): carteira vazia some; sem dono, o mais antigo assume
create or replace function carteira_membros_saida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from carteiras where id = old.carteira_id) then
    return null;
  end if;
  if not exists (select 1 from carteira_membros where carteira_id = old.carteira_id) then
    delete from carteiras where id = old.carteira_id;
  elsif not exists (select 1 from carteira_membros where carteira_id = old.carteira_id and papel = 'dono') then
    update carteira_membros set papel = 'dono'
    where carteira_id = old.carteira_id
      and user_id = (select user_id from carteira_membros where carteira_id = old.carteira_id order by criado_em limit 1);
  end if;
  return null;
end $$;
create trigger carteira_membros_saida after delete on carteira_membros
  for each row execute function carteira_membros_saida();

insert into admins select id from auth.users where email = 'jonathan.willian@embras.net' on conflict do nothing;
